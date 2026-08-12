import crypto from 'crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { supabase } from '../lib/supabase.js';
import { voiceService, isInAppTestCall, VOICE_TEST_LEAD_NAME } from '../services/voice.service.js';
import { claudeService } from '../services/claude.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ── Retell HMAC-SHA256 signature verification ─────────────────────────────────
// Header format: "v=<timestamp_ms>,d=<hex_digest>"
// Key = RETELL_API_KEY; payload = rawBody + timestamp_string.
// If key is not set, log a warning and pass (mirrors WhatsApp pattern for dev).

function verifyRetellSignature(req: Request): boolean {
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) {
    logger.warn('voice: RETELL_API_KEY not set — skipping signature verification');
    return true;
  }

  const header = req.headers['x-retell-signature'] as string | undefined;
  if (!header) return false;

  const match = header.match(/v=(\d+),d=(.*)/);
  if (!match) return false;

  const [, timestampStr, digest] = match;
  const timestamp = parseInt(timestampStr, 10);

  // Replay protection: reject if older than 5 minutes
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
    logger.warn('voice: Retell signature timestamp too old (replay protection)');
    return false;
  }

  const rawBody: Buffer =
    (req as unknown as Record<string, unknown>)['rawBody'] as Buffer
    ?? Buffer.from(JSON.stringify(req.body));

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody)
    .update(timestampStr)
    .digest('hex');

  const digestBuf   = Buffer.from(digest ?? '');
  const expectedBuf = Buffer.from(expected);

  return (
    digestBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(digestBuf, expectedBuf)
  );
}

// ── POST /api/voice/functions/agent-respond ───────────────────────────────────
// Retell custom-function webhook — no auth middleware; secured by HMAC.
// Retell calls this once per turn to get the agent's reply.
//
// Body fields read:
//   agentId   = body.call?.agent_id   ?? body.agent_id
//   callId    = body.call?.call_id    ?? body.call_id
//   utterance = body.args?.user_message ?? body.args?.message ?? body.args?.question
//
// Response shape: { result: <reply>, response: <reply> }
//   (both keys returned to be safe — Retell docs vary on which key it reads)

router.post('/functions/agent-respond', async (req: Request, res: Response): Promise<void> => {
  // 1. Signature verification
  if (!verifyRetellSignature(req)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // 2. Log full body shape once for debugging during first real call
  logger.info('voice agent-respond body', {
    bodyKeys: Object.keys(req.body ?? {}),
    callKeys: req.body?.call ? Object.keys(req.body.call) : null,
    argsKeys: req.body?.args ? Object.keys(req.body.args) : null,
    argsShape: req.body?.args,
  });

  const gracefulFallback = (reason: string): void => {
    logger.error(`voice agent-respond: ${reason}`);
    const reply = "I'm having a little trouble with that — let me have someone follow up.";
    res.json({ result: reply, response: reply });
  };

  try {
    // 3. Defensive body parsing
    const body = req.body as Record<string, unknown>;
    const call = body['call'] as Record<string, unknown> | undefined;
    const args = body['args'] as Record<string, unknown> | undefined;

    const agentId: string | undefined =
      (call?.['agent_id'] ?? body['agent_id']) as string | undefined;

    const callId: string | undefined =
      (call?.['call_id'] ?? body['call_id']) as string | undefined;

    const utterance: string =
      ((args?.['user_message'] ?? args?.['message'] ?? args?.['question']) as string | undefined)
      ?? '';

    if (!agentId) {
      res.status(400).json({ error: 'agent_id is required' });
      return;
    }

    // 4. Route to tenant
    const account = await voiceService.getByAgentId(agentId);
    if (!account) {
      res.status(404).json({ error: `No voice account found for agent_id: ${agentId}` });
      return;
    }

    const { branchId } = await voiceService.resolveAgentForAccount(account);

    // 5. Run the agent with latency logging
    const t0 = Date.now();
    const result = await claudeService.chat({
      branchId,
      message: utterance,
      sessionId: callId ?? agentId,
      channel: 'voice',
    });
    logger.info(`voice agent-respond latency: ${Date.now() - t0}ms (branch ${branchId})`);

    // 6. Respond — return both keys to be safe re: Retell's expected field name
    const reply = result.reply;
    logger.info('voice agent-respond replied', {
      agentId,
      callId,
      branchId,
      requiresHuman: result.requiresHuman,
      replyPreview: reply.slice(0, 80),
    });
    res.json({ result: reply, response: reply });

  } catch (err) {
    gracefulFallback((err as Error).message);
  }
});

// ── POST /api/voice/webhook — Retell call-event webhook ──────────────────────
// Receives call_started / call_ended / call_analyzed from Retell.
// Stores transcript, recording_url, sentiment, and call summary onto the
// conversation so completed calls appear in the inbox.
//
// call.* fields read:
//   agent_id, call_id, recording_url, transcript_object, call_analysis.user_sentiment,
//   call_analysis.call_summary
//
// Role mapping: transcript_object[].role 'agent' → 'assistant', anything else → 'user'

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Signature verification
    if (!verifyRetellSignature(req)) {
      res.sendStatus(401);
      return;
    }

    const body  = req.body as Record<string, unknown>;
    const event = body['event'] as string | undefined;
    const call  = body['call']  as Record<string, unknown> | undefined;

    // 2. Log event + call shape once to confirm field names against a real call
    logger.info('voice webhook event', {
      event,
      callKeys: call ? Object.keys(call) : null,
    });

    // 3. Extract routing keys
    if (!call) {
      res.sendStatus(200);
      return;
    }

    const agentId = call['agent_id'] as string | undefined;
    const callId  = call['call_id']  as string | undefined;

    if (!agentId || !callId) {
      res.sendStatus(200);
      return;
    }

    // 4. Route to tenant
    const account = await voiceService.getByAgentId(agentId);
    if (!account) {
      logger.warn(`voice webhook: no account for agent_id ${agentId}`);
      res.sendStatus(200);
      return;
    }

    const { branchId } = await voiceService.resolveAgentForAccount(account);

    // 5a. call_started — conversation created on first agent-respond turn; nothing to store
    if (event === 'call_started') {
      logger.info(`voice webhook: call_started callId=${callId} branchId=${branchId}`);
      res.sendStatus(200);
      return;
    }

    // 5b. call_ended / call_analyzed — enrich the conversation (idempotent)
    if (event === 'call_ended' || event === 'call_analyzed') {
      // Find conversation threaded by branch_id + call_id (mirrors getOrCreateConversation)
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('branch_id', branchId)
        .eq('call_id', callId)
        .maybeSingle();

      // If agent-respond never fired, create a stub so the call still lands in the inbox
      let conv = existing as Record<string, unknown> | null;
      if (!conv) {
        const { data: created, error: createErr } = await supabase
          .from('conversations')
          .insert({
            branch_id:      branchId,
            channel:        'voice',
            call_id:        callId,
            messages:       [],
            resolved:       false,
            requires_human: false,
            lead_name:      isInAppTestCall(call) ? VOICE_TEST_LEAD_NAME : null,
          })
          .select()
          .single();

        if (createErr || !created) {
          logger.error(`voice webhook: failed to create stub conversation: ${createErr?.message}`);
          res.sendStatus(200);
          return;
        }
        conv = created as Record<string, unknown>;
      }

      // Build update — only set fields present in this payload (idempotent partial enrichment)
      const updateObj: Record<string, unknown> = {};

      const recordingUrl = call['recording_url'] as string | undefined;
      if (recordingUrl) updateObj['recording_url'] = recordingUrl;

      // Backstop for the label the websocket sets at conversation creation:
      // covers a conversation created before this shipped, or one created by a
      // path that never saw call_details. Only fills a NULL — never overwrites
      // a real captured lead name, which is the whole point of the field.
      if (!conv['lead_name'] && isInAppTestCall(call)) {
        updateObj['lead_name'] = VOICE_TEST_LEAD_NAME;
      }

      // Prefer transcript_object (structured); ignore raw transcript string
      const transcriptObject = call['transcript_object'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(transcriptObject) && transcriptObject.length > 0) {
        updateObj['messages'] = transcriptObject.map(t => ({
          role:    t['role'] === 'agent' ? 'assistant' : 'user',
          content: (t['content'] as string) ?? '',
        }));
      }

      // call_analysis present on call_analyzed; may also appear on call_ended
      const analysis = call['call_analysis'] as Record<string, unknown> | undefined;
      if (analysis) {
        const sentiment = analysis['user_sentiment'] as string | undefined;
        if (sentiment) updateObj['sentiment'] = sentiment;

        const summary = analysis['call_summary'] as string | undefined;
        if (summary) {
          const summaryNote = {
            text:     `Call summary: ${summary}`,
            added_by: 'system',
            added_at: new Date().toISOString(),
          };
          const existingNotes = Array.isArray(conv['notes']) ? (conv['notes'] as unknown[]) : [];
          updateObj['notes'] = [...existingNotes, summaryNote];
        }
      }

      if (Object.keys(updateObj).length > 0) {
        const { error: updateErr } = await supabase
          .from('conversations')
          .update(updateObj)
          .eq('id', conv['id'] as string);

        if (updateErr) {
          logger.error(`voice webhook: failed to update conversation ${conv['id'] as string}: ${updateErr.message}`);
        } else {
          logger.info(`voice webhook: enriched conversation ${conv['id'] as string} on ${event}`, {
            fields: Object.keys(updateObj),
          });
        }
      }

      // Voice has a real end-of-conversation signal — use it instead of
      // waiting for the sweeper's 5-minute inactivity check. Consolidated
      // copy if a lead was captured during the call, no-contact fallback
      // otherwise; sendPendingEscalation is a no-op if nothing is pending.
      if (conv['escalation_pending_since']) {
        try {
          await claudeService.sendPendingEscalation(conv['id'] as string);
        } catch (err) {
          logger.error(`voice webhook: sendPendingEscalation failed for ${conv['id'] as string}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {
    logger.error(`voice webhook: unhandled error: ${(err as Error).message}`);
    res.sendStatus(200);
  }
});

// ── Account management (authenticated, org-scoped) ────────────────────────────

import { z } from 'zod';
import { validate } from '../middleware/validate.middleware.js';

const connectSchema = z.object({
  retellAgentId:  z.string().min(1),
  agentName:      z.string().optional(),
  phoneNumber:    z.string().optional(),
  webhookSecret:  z.string().optional(),
  branchId:       z.string().uuid().nullable().optional(),
});

// GET /api/voice/accounts
router.get('/accounts', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const accounts = await voiceService.listByOrg(req.tenant.organisation_id);
    res.json(ApiResponse.success(accounts));
  } catch (err) { next(err); }
});

// POST /api/voice/accounts
router.post('/accounts', authenticate, validate(connectSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as z.infer<typeof connectSchema>;
    const account = await voiceService.connectAccount({
      organisationId: req.tenant.organisation_id,
      branchId:       body.branchId ?? null,
      retellAgentId:  body.retellAgentId,
      agentName:      body.agentName,
      phoneNumber:    body.phoneNumber,
      webhookSecret:  body.webhookSecret,
    });
    res.status(201).json(ApiResponse.success(account, 'Voice account connected'));
  } catch (err) { next(err); }
});

// POST /api/voice/test-call
// Mints a short-lived Retell web-call token so the tenant can talk to their
// own voice agent from the dashboard — WebRTC in the browser, no phone
// number and no telephony leg. The call still lands on the SAME Custom LLM
// WebSocket brain (§5.2), so there is nothing voice-specific to change
// server-side; Retell dials our wss endpoint exactly as it does for a phone
// call, and the call-event webhook stores transcript/recording as usual.
//
// RETELL_API_KEY MUST NEVER REACH THE BROWSER. The key is used here only,
// server-side, and the response carries just the access token and call id.
// The token is short-lived by design (~30s to start the call), which is why
// the client fetches it on click rather than on page load.
router.post('/test-call', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { retellAgentId } = req.body as { retellAgentId?: string };
    if (!retellAgentId) throw new AppError('retellAgentId is required', 400);

    if (!env.RETELL_API_KEY) {
      throw new AppError('Voice is not configured on this server (missing RETELL_API_KEY)', 503);
    }

    // Ownership check — same shape as DELETE /accounts/:id: list the caller's
    // org accounts and require the requested agent to be among them, so a
    // tenant can never mint a call token for another tenant's voice agent.
    const accounts = await voiceService.listByOrg(req.tenant.organisation_id);
    const account = accounts.find(a => a.retell_agent_id === retellAgentId);
    if (!account) throw new AppError('Voice account not found', 404);

    const retellRes = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: retellAgentId,
        // Tags these calls so in-app tests are separable from real customer
        // calls later (analytics, billing questions, debugging).
        metadata: { source: 'in_app_test', organisation_id: req.tenant.organisation_id },
      }),
    });

    if (!retellRes.ok) {
      const detail = await retellRes.text();
      logger.error(`voice test-call: Retell create-web-call failed (${retellRes.status}): ${detail}`);
      throw new AppError(
        retellRes.status === 404
          ? 'Retell could not find this agent. Check the Agent ID on this account.'
          : 'Could not start a test call. Please try again.',
        502,
      );
    }

    const call = await retellRes.json() as { access_token?: string; call_id?: string };
    if (!call.access_token) {
      logger.error('voice test-call: Retell response had no access_token');
      throw new AppError('Could not start a test call. Please try again.', 502);
    }

    logger.info(`voice test-call: minted web-call token for agent ${retellAgentId} (call ${call.call_id ?? 'unknown'})`);

    // Deliberately narrow: token + call id only, never the API key or the
    // full Retell payload.
    res.json(ApiResponse.success({ accessToken: call.access_token, callId: call.call_id ?? null }));
  } catch (err) { next(err); }
});

// DELETE /api/voice/accounts/:id
router.delete('/accounts/:id', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const accounts = await voiceService.listByOrg(req.tenant.organisation_id);
    const owns = accounts.some(a => a.id === req.params['id']);
    if (!owns) throw new AppError('Account not found', 404);
    await voiceService.disconnect(req.params['id'] as string);
    res.json(ApiResponse.success({ ok: true }, 'Voice account disconnected'));
  } catch (err) { next(err); }
});

export default router;
