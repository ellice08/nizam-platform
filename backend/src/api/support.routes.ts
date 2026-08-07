import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { supabase } from '../lib/supabase.js';
import { notificationService } from '../services/notification.service.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

const router = Router();

const DEFAULT_SUPPORT_EMAIL = env.SUPPORT_DEFAULT_EMAIL;
const DEFAULT_SUPPORT_PHONE = env.SUPPORT_DEFAULT_PHONE;

const VIEWER_ROLES = ['org_viewer', 'branch_viewer'];

const createTicketSchema = z.object({
  subject: z.string().min(2),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  message: z.string().min(2),
});

const replySchema = z.object({
  body: z.string().min(1),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

const contactSchema = z.object({
  organisation_id: z.string().uuid(),
  support_email: z.string().email().optional().or(z.literal('')),
  support_phone: z.string().optional(),
});

async function getUserInfo(userId: string): Promise<{ email: string | null; name: string | null }> {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return {
      email: data?.user?.email ?? null,
      name: (data?.user?.user_metadata?.['full_name'] as string) ?? null,
    };
  } catch {
    return { email: null, name: null };
  }
}

// GET /api/support/contact
router.get('/contact', authenticate, async (req, res, next) => {
  try {
    const orgId = req.tenant.organisation_id;
    let email = DEFAULT_SUPPORT_EMAIL;
    let phone = DEFAULT_SUPPORT_PHONE;
    if (orgId) {
      const { data } = await supabase
        .from('support_contacts')
        .select('support_email, support_phone')
        .eq('organisation_id', orgId)
        .maybeSingle();
      if (data) {
        if (data.support_email) email = data.support_email as string;
        if (data.support_phone) phone = data.support_phone as string;
      }
    }
    res.json(ApiResponse.success({ support_email: email, support_phone: phone }));
  } catch (err) { next(err); }
});

// PUT /api/support/contact — super admin only
router.put('/contact', authenticate, validate(contactSchema), async (req, res, next) => {
  try {
    if (req.tenant.role !== 'super_admin') throw new AppError('Forbidden', 403);
    const { organisation_id, support_email, support_phone } = req.body as {
      organisation_id: string; support_email?: string; support_phone?: string;
    };
    const { error } = await supabase
      .from('support_contacts')
      .upsert({
        organisation_id,
        support_email: support_email || null,
        support_phone: support_phone || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organisation_id' });
    if (error) throw new AppError(error.message, 500);
    res.json(ApiResponse.success({ ok: true }, 'Support contact updated'));
  } catch (err) { next(err); }
});

// GET /api/support/tickets
router.get('/tickets', authenticate, async (req, res, next) => {
  try {
    const isSuperAdmin = req.tenant.role === 'super_admin';
    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!isSuperAdmin) {
      query = query.eq('organisation_id', req.tenant.organisation_id);
    } else if (req.tenant.organisation_id) {
      query = query.eq('organisation_id', req.tenant.organisation_id);
    }

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);

    const tickets = data ?? [];
    const orgIds = [...new Set(tickets.map(t => t.organisation_id as string))];
    let orgMap: Record<string, string> = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organisations')
        .select('id, name')
        .in('id', orgIds);
      orgMap = Object.fromEntries((orgs ?? []).map(o => [o.id as string, o.name as string]));
    }
    const enriched = tickets.map(t => ({
      ...t,
      organisation_name: orgMap[t.organisation_id as string] ?? null,
    }));
    res.json(ApiResponse.success(enriched));
  } catch (err) { next(err); }
});

// GET /api/support/tickets/open-count — for the Support nav badge. Must be
// registered before /tickets/:id so it isn't shadowed by that param route.
// "Open" = not yet resolved/closed (status is the only tenant-facing signal
// support_tickets tracks — there's no per-ticket read/unread state).
router.get('/tickets/open-count', authenticate, async (req, res, next) => {
  try {
    const orgId = req.tenant.organisation_id;
    if (!orgId) {
      res.json(ApiResponse.success({ count: 0 }));
      return;
    }

    const { count, error } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .in('status', ['open', 'in_progress']);

    if (error) throw new AppError(error.message, 500);
    res.json(ApiResponse.success({ count: count ?? 0 }));
  } catch (err) { next(err); }
});

// GET /api/support/tickets/:id
router.get('/tickets/:id', authenticate, async (req, res, next) => {
  try {
    const ticketId = req.params['id'] as string;
    const { data: ticket, error: tErr } = await supabase
      .from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
    if (tErr) throw new AppError(tErr.message, 500);
    if (!ticket) throw new AppError('Ticket not found', 404);

    if (req.tenant.role !== 'super_admin' &&
        ticket.organisation_id !== req.tenant.organisation_id) {
      throw new AppError('Forbidden', 403);
    }

    const { data: messages, error: mErr } = await supabase
      .from('support_messages').select('*').eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (mErr) throw new AppError(mErr.message, 500);

    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', ticket.organisation_id)
      .maybeSingle();

    res.json(ApiResponse.success({
      ticket: { ...ticket, organisation_name: (org?.name as string) ?? null },
      messages: messages ?? [],
    }));
  } catch (err) { next(err); }
});

// POST /api/support/tickets
router.post('/tickets', authenticate, validate(createTicketSchema), async (req, res, next) => {
  try {
    if (VIEWER_ROLES.includes(req.tenant.role)) {
      throw new AppError('Viewers cannot raise support tickets', 403);
    }
    const orgId = req.tenant.organisation_id;
    if (!orgId) throw new AppError('No organisation context', 400);

    const { subject, priority, message } = req.body as {
      subject: string; priority: string; message: string;
    };
    const info = await getUserInfo(req.user.id);

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        organisation_id: orgId,
        created_by: req.user.id,
        created_by_email: info.email,
        created_by_name: info.name,
        created_by_role: req.tenant.role,
        subject,
        priority,
        status: 'open',
      })
      .select()
      .single();
    if (error || !ticket) throw new AppError(error?.message ?? 'Failed', 500);

    await supabase.from('support_messages').insert({
      ticket_id: ticket.id,
      author_role: 'client',
      author_name: info.name ?? info.email,
      body: message,
    });

    const { data: org } = await supabase
      .from('organisations').select('name').eq('id', orgId).maybeSingle();
    void notificationService.sendSupportTicketAlert({
      to: env.SUPPORT_DEFAULT_EMAIL,
      ticketSubject: subject,
      clientName: info.name ?? info.email ?? 'A client',
      organisationName: (org?.name as string) ?? 'Unknown',
      priority,
      message,
    });
    void notificationService.createNotification({
      organisationId: orgId,
      branchId: req.tenant.branch_id ?? null,
      type: 'support_ticket', title: 'New support ticket',
      body: `${subject} — ${(org?.name as string) ?? 'Unknown'}`,
      link: `/admin/support?t=${ticket.id as string}`,
      entityType: 'support_ticket', entityId: ticket.id as string, minRole: null,
      audience: 'operator',
    });

    res.status(201).json(ApiResponse.success(ticket, 'Ticket created'));
  } catch (err) { next(err); }
});

// POST /api/support/tickets/:id/messages
router.post('/tickets/:id/messages', authenticate, validate(replySchema), async (req, res, next) => {
  try {
    const ticketId = req.params['id'] as string;
    const { body } = req.body as { body: string };

    const { data: ticket } = await supabase
      .from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
    if (!ticket) throw new AppError('Ticket not found', 404);

    const isSuperAdmin = req.tenant.role === 'super_admin';
    if (!isSuperAdmin && ticket.organisation_id !== req.tenant.organisation_id) {
      throw new AppError('Forbidden', 403);
    }
    if (!isSuperAdmin && VIEWER_ROLES.includes(req.tenant.role)) {
      throw new AppError('Viewers cannot reply', 403);
    }

    const info = await getUserInfo(req.user.id);
    const authorRole = isSuperAdmin ? 'support' : 'client';

    await supabase.from('support_messages').insert({
      ticket_id: ticketId,
      author_role: authorRole,
      author_name: isSuperAdmin ? 'Nizam Support' : (info.name ?? info.email),
      body,
    });

    await supabase.from('support_tickets')
      .update({
        updated_at: new Date().toISOString(),
        ...(isSuperAdmin && ticket.status === 'open' ? { status: 'in_progress' } : {}),
      })
      .eq('id', ticketId);

    if (isSuperAdmin && ticket.created_by_email) {
      void notificationService.sendSupportReply({
        to: ticket.created_by_email as string,
        ticketSubject: ticket.subject as string,
        replyBody: body,
      });
    }
    if (isSuperAdmin) {
      // Ellice replied -> notify the tenant
      void notificationService.createNotification({
        organisationId: ticket.organisation_id as string,
        branchId: null,
        type: 'support_reply', title: 'New reply on your support ticket',
        body: ticket.subject as string, link: `/dashboard/support?t=${ticketId}`,
        entityType: 'support_ticket', entityId: ticketId, minRole: null,
        audience: 'tenant',
      });
    } else {
      // Tenant replied -> notify Ellice (operator)
      void notificationService.createNotification({
        organisationId: ticket.organisation_id as string,
        branchId: null,
        type: 'support_reply', title: 'New reply on a support ticket',
        body: ticket.subject as string, link: `/admin/support?t=${ticketId}`,
        entityType: 'support_ticket', entityId: ticketId, minRole: null,
        audience: 'operator',
      });
    }

    res.status(201).json(ApiResponse.success({ ok: true }, 'Reply added'));
  } catch (err) { next(err); }
});

// PATCH /api/support/tickets/:id/status
router.patch('/tickets/:id/status', authenticate, validate(updateStatusSchema), async (req, res, next) => {
  try {
    const ticketId = req.params['id'] as string;
    const { status } = req.body as { status: string };

    const { data: ticket } = await supabase
      .from('support_tickets').select('organisation_id, subject').eq('id', ticketId).maybeSingle();
    if (!ticket) throw new AppError('Ticket not found', 404);

    if (req.tenant.role !== 'super_admin' &&
        ticket.organisation_id !== req.tenant.organisation_id) {
      throw new AppError('Forbidden', 403);
    }

    const { error } = await supabase.from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    if (error) throw new AppError(error.message, 500);

    if (status === 'resolved' || status === 'closed') {
      void notificationService.createNotification({
        organisationId: ticket.organisation_id as string,
        audience: 'tenant',
        type: 'support_reply',
        title: status === 'resolved' ? 'Support ticket resolved' : 'Support ticket closed',
        body: ticket.subject as string,
        link: `/dashboard/support?t=${ticketId}`,
        entityType: 'support_ticket', entityId: ticketId, minRole: null,
      });
    }

    res.json(ApiResponse.success({ ok: true }, 'Status updated'));
  } catch (err) { next(err); }
});

export default router;
