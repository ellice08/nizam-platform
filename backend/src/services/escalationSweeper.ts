import { supabase } from '../lib/supabase.js';
import { claudeService } from './claude.service.js';
import logger from '../utils/logger.js';

// Inactivity fallback for the deferred escalation email: if a conversation
// has been waiting on lead capture (escalation_pending_since set) and has
// gone quiet, send the no-contact-captured email anyway so nothing is lost.
const SWEEP_INTERVAL_MS = 60 * 1000;
const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;
// Voice normally consolidates at call_ended, not here — but a long call can
// legitimately go 5+ minutes between turns without having ended, and
// updated_at keeps refreshing on every turn regardless. Give voice rows a
// longer, pending-duration-based window (not updated_at) before the sweeper
// treats them as abandoned, so it can't race a still-ongoing call.
const VOICE_INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function sweepOnce(): Promise<void> {
  try {
    const now = Date.now();
    const chatCutoff = new Date(now - INACTIVITY_THRESHOLD_MS).toISOString();
    const voiceCutoff = new Date(now - VOICE_INACTIVITY_THRESHOLD_MS).toISOString();

    // Broad 5min prefilter catches everything worth a second look; the
    // per-row check below applies voice's stricter 15min-since-pending rule.
    const { data: rows, error } = await supabase
      .from('conversations')
      .select('id, channel, escalation_pending_since')
      .not('escalation_pending_since', 'is', null)
      .lt('updated_at', chatCutoff);

    if (error) {
      logger.error(`escalationSweeper: query failed: ${error.message}`);
      return;
    }
    if (!rows || rows.length === 0) return;

    for (const row of rows as Array<{ id: string; channel: string | null; escalation_pending_since: string | null }>) {
      if (row.channel === 'voice') {
        // Not yet pending long enough — leave it for call_ended to
        // consolidate normally; skip so the sweeper can't race a live call.
        if (!row.escalation_pending_since || row.escalation_pending_since >= voiceCutoff) continue;
      }

      try {
        await claudeService.sendPendingEscalation(row.id);
        logger.info(`escalationSweeper: sent fallback escalation email for conversation ${row.id}`);
      } catch (err) {
        // One bad row must never block the rest of the sweep.
        logger.error(`escalationSweeper: failed for conversation ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logger.error(`escalationSweeper: sweep failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function startEscalationSweeper(): void {
  if (sweepTimer) return; // never double-start
  sweepTimer = setInterval(() => { void sweepOnce(); }, SWEEP_INTERVAL_MS);
  logger.info('escalationSweeper: started (60s interval, 5min inactivity threshold)');
}
