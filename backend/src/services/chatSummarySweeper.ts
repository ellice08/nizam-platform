import { supabase } from '../lib/supabase.js';
import { claudeService } from './claude.service.js';
import logger from '../utils/logger.js';

// Inactivity fallback for the chat/WhatsApp system summary: if a
// conversation has messages, hasn't been summarized, and has gone quiet for
// 30+ minutes, generate the summary anyway so conversations that are never
// explicitly resolved still end up with one (parity with the resolve-path
// trigger in conversation.routes.ts). Voice is excluded — it already
// summarizes via Retell's call_analysis at call end.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function sweepOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString();

    // Broad prefilter (not yet summarized, not voice, quiet long enough);
    // the empty-messages check happens per-row below since PostgREST can't
    // filter on jsonb array length directly.
    const { data: rows, error } = await supabase
      .from('conversations')
      .select('id, messages')
      .is('summarized_at', null)
      .neq('channel', 'voice')
      .lt('updated_at', cutoff);

    if (error) {
      logger.error(`chatSummarySweeper: query failed: ${error.message}`);
      return;
    }
    if (!rows || rows.length === 0) return;

    for (const row of rows as Array<{ id: string; messages: unknown }>) {
      if (!Array.isArray(row.messages) || row.messages.length === 0) continue;

      try {
        await claudeService.summarizeConversation(row.id);
      } catch (err) {
        // One bad row must never block the rest of the sweep.
        logger.error(`chatSummarySweeper: failed for conversation ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logger.error(`chatSummarySweeper: sweep failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startChatSummarySweeper(): void {
  if (sweepTimer) return; // never double-start
  sweepTimer = setInterval(() => { void sweepOnce(); }, SWEEP_INTERVAL_MS);
  logger.info('chatSummarySweeper: started (5min interval, 30min inactivity threshold)');
}
