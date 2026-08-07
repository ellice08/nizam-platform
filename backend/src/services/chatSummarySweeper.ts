import { supabase } from '../lib/supabase.js';
import { claudeService, MAX_SWEEPER_REGENERATIONS } from './claude.service.js';
import logger from '../utils/logger.js';

// Inactivity trigger for the chat/WhatsApp system summary — refreshable: a
// conversation gets summarized after 3 minutes of quiet, and if it picks up
// new messages and goes quiet again, the summary is regenerated (replacing
// the existing system note in place, never appending a second one) up to
// MAX_SWEEPER_REGENERATIONS times. The resolve path (conversation.routes.ts)
// always gets one final regeneration beyond that cap. Voice is excluded — it
// already summarizes via Retell's call_analysis at call end.
const SWEEP_INTERVAL_MS = 60 * 1000;
const INACTIVITY_THRESHOLD_MS = 3 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function sweepOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString();

    // Broad prefilter: not voice, quiet long enough, and not permanently
    // capped (never-summarized rows always pass; already-summarized rows
    // only pass while under the regeneration cap). Whether there's actually
    // been activity since the last summary (summarized_at < updated_at) is a
    // column-to-column comparison PostgREST can't filter on directly — like
    // the empty-messages check, that refinement happens per-row below, same
    // broad-prefilter-then-per-row pattern escalationSweeper uses.
    const { data: rows, error } = await supabase
      .from('conversations')
      .select('id, messages, summarized_at, updated_at, summary_regenerations')
      .neq('channel', 'voice')
      .lt('updated_at', cutoff)
      .or(`summarized_at.is.null,summary_regenerations.lt.${MAX_SWEEPER_REGENERATIONS}`);

    if (error) {
      logger.error(`chatSummarySweeper: query failed: ${error.message}`);
      return;
    }
    if (!rows || rows.length === 0) return;

    for (const row of rows as Array<{
      id: string;
      messages: unknown;
      summarized_at: string | null;
      updated_at: string;
      summary_regenerations: number | null;
    }>) {
      if (!Array.isArray(row.messages) || row.messages.length === 0) continue;

      const neverSummarized = !row.summarized_at;
      const needsRefresh =
        !neverSummarized &&
        new Date(row.summarized_at as string) < new Date(row.updated_at) &&
        (row.summary_regenerations ?? 0) < MAX_SWEEPER_REGENERATIONS;

      if (!neverSummarized && !needsRefresh) continue; // up to date, or capped

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
  logger.info('chatSummarySweeper: started (1min interval, 3min inactivity threshold, max 2 regenerations)');
}
