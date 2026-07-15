import { supabase } from '../lib/supabase.js';
import { claudeService } from './claude.service.js';
import logger from '../utils/logger.js';

// Inactivity fallback for the deferred escalation email: if a conversation
// has been waiting on lead capture (escalation_pending_since set) and has
// gone quiet for 5 minutes, send the no-contact-captured email anyway so
// nothing is lost. Voice conversations don't need this — they clear pending
// on call_ended — but chat/whatsapp visitors can simply abandon the tab.
const SWEEP_INTERVAL_MS = 60 * 1000;
const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function sweepOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_MS).toISOString();

    const { data: rows, error } = await supabase
      .from('conversations')
      .select('id')
      .not('escalation_pending_since', 'is', null)
      .lt('updated_at', cutoff);

    if (error) {
      logger.error(`escalationSweeper: query failed: ${error.message}`);
      return;
    }
    if (!rows || rows.length === 0) return;

    for (const row of rows as Array<{ id: string }>) {
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
