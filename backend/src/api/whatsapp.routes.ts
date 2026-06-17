import crypto from 'crypto';
import express from 'express';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { supabase } from '../lib/supabase.js';
import { whatsAppService } from '../services/whatsapp.service.js';
import { claudeService } from '../services/claude.service.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ── Outbound send helper ───────────────────────────────────────────────────────

async function sendWhatsAppMessage(
  account: Record<string, unknown>,
  phoneNumberId: string,
  to: string,
  body: string,
): Promise<void> {
  const token = whatsAppService.getDecryptedToken(account);
  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    logger.error(`whatsapp: send failed ${resp.status}: ${errText}`);
    await whatsAppService.updateStatus(
      account['id'] as string,
      'error',
      `Send failed: ${resp.status}`,
    );
  } else {
    if (account['status'] !== 'connected') {
      await whatsAppService.updateStatus(account['id'] as string, 'connected');
    }
  }
}

// ── GET /api/whatsapp/webhook — Meta verification handshake (no auth) ─────────

router.get('/webhook', (req: Request, res: Response): void => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    env.WHATSAPP_VERIFY_TOKEN &&
    token === env.WHATSAPP_VERIFY_TOKEN
  ) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

// ── POST /api/whatsapp/webhook — inbound messages (no auth; secured by HMAC) ──

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  // 1. Signature verification
  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (env.WHATSAPP_APP_SECRET) {
    const rawBody: Buffer = (req as unknown as Record<string, unknown>)['rawBody'] as Buffer
      ?? Buffer.from(JSON.stringify(req.body));
    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', env.WHATSAPP_APP_SECRET)
        .update(rawBody)
        .digest('hex');

    const sigBuf      = Buffer.from(sig ?? '');
    const expectedBuf = Buffer.from(expected);
    const sigOk =
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf);

    if (!sig || !sigOk) {
      res.sendStatus(401);
      return;
    }
  } else {
    logger.warn('whatsapp: WHATSAPP_APP_SECRET not set — skipping signature verification');
  }

  // 2. Parse payload — guard every level; Meta sends many event shapes
  const entries: unknown[] = req.body?.entry ?? [];

  for (const entry of entries) {
    const changes: unknown[] = (entry as Record<string, unknown>)?.['changes'] as unknown[] ?? [];

    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.['value'] as Record<string, unknown> | undefined;
      if (!value) continue;

      // Ignore delivery/read status updates
      const statuses = value['statuses'];
      const messages = (value['messages'] as unknown[] | undefined) ?? [];
      if (!messages.length && statuses) continue;

      const phoneNumberId = (value['metadata'] as Record<string, unknown> | undefined)?.['phone_number_id'] as string | undefined;

      for (const msg of messages) {
        const m = msg as Record<string, unknown>;
        if (m['type'] !== 'text') {
          logger.info(`whatsapp: non-text message type "${m['type'] as string}" — skipping (v1 text only)`);
          continue;
        }

        const from      = m['from'] as string | undefined;
        const text      = (m['text'] as Record<string, unknown> | undefined)?.['body'] as string | undefined;
        const messageId = m['id'] as string | undefined;

        if (!phoneNumberId || !from || !text || !messageId) continue;

        // 3. Idempotency — atomic insert into dedup table; PK conflict = already processed
        const { error: dupErr } = await supabase
          .from('whatsapp_processed_messages')
          .insert({ message_id: messageId });

        if (dupErr) {
          logger.info(`whatsapp: duplicate/already-processed message ${messageId}, skipping`);
          continue;
        }

        // 4. Route to tenant by phone_number_id
        const account = await whatsAppService.getByPhoneNumberId(phoneNumberId);
        if (!account) {
          logger.warn(`whatsapp: no account found for phone_number_id ${phoneNumberId}`);
          continue;
        }

        // 5. Resolve branch — resolveAgentForAccount returns { branchId: string }
        let branchId: string;
        try {
          const resolved = await whatsAppService.resolveAgentForAccount(account);
          branchId = resolved.branchId;
        } catch (e) {
          logger.error(`whatsapp: could not resolve branch for account ${account['id'] as string}: ${(e as Error).message}`);
          continue;
        }

        // 6. Run the agent — sessionId = sender's number threads the conversation
        let result: Awaited<ReturnType<typeof claudeService.chat>>;
        try {
          result = await claudeService.chat({
            branchId,
            message: text,
            sessionId: from,
            channel: 'whatsapp',
          });
        } catch (e) {
          logger.error(`whatsapp: agent chat failed for ${from}: ${(e as Error).message}`);
          continue;
        }

        // 7. Send the reply via Meta Graph API
        await sendWhatsAppMessage(account, phoneNumberId, from, result.reply);
      }
    }
  }

  // Always 200 for valid webhook calls so Meta doesn't retry
  res.sendStatus(200);
});

export default router;
