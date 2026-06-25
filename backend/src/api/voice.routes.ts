import crypto from 'crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { voiceService } from '../services/voice.service.js';
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
