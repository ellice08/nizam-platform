/**
 * One-off script: connect a test voice account so the Retell webhooks
 * have a tenant to route to before the V4 UI is built.
 *
 * Usage (run from backend/):
 *   ORG_ID=<uuid> RETELL_AGENT_ID=<agent_id> [BRANCH_ID=<uuid>] \
 *     [AGENT_NAME="Test Agent"] [PHONE_NUMBER="+2348..."] \
 *     npx tsx scripts/connectTestVoice.ts
 */

// dotenv is loaded transitively when voice.service imports env.ts,
// but we call it first so process.env is populated before any Zod validation.
import dotenv from 'dotenv';
dotenv.config();

import { voiceService } from '../src/services/voice.service.js';
import { AppError } from '../src/utils/errors.js';

const ORG_ID          = process.env['ORG_ID'];
const RETELL_AGENT_ID = process.env['RETELL_AGENT_ID'];
const BRANCH_ID       = process.env['BRANCH_ID'] || null;
const AGENT_NAME      = process.env['AGENT_NAME'] || undefined;
const PHONE_NUMBER    = process.env['PHONE_NUMBER'] || undefined;

if (!ORG_ID) {
  console.error('ERROR: ORG_ID env var is required (your organisation UUID from Supabase).');
  process.exit(1);
}

if (!RETELL_AGENT_ID) {
  console.error('ERROR: RETELL_AGENT_ID env var is required (from the Retell dashboard).');
  process.exit(1);
}

try {
  const account = await voiceService.connectAccount({
    organisationId: ORG_ID,
    branchId:       BRANCH_ID,
    retellAgentId:  RETELL_AGENT_ID,
    agentName:      AGENT_NAME,
    phoneNumber:    PHONE_NUMBER,
  });

  console.log('\nVoice account connected:\n', JSON.stringify(account, null, 2));
  console.log('\nNow wire the Retell agent and make a test call.');
  process.exit(0);

} catch (err) {
  if (err instanceof AppError && err.statusCode === 409) {
    console.warn('Already connected — delete the row in voice_accounts to re-connect.');
    process.exit(0);
  }
  console.error('ERROR:', (err as Error).message);
  process.exit(1);
}
