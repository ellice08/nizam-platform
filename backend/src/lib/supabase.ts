// SERVER-SIDE ONLY — uses service role key which bypasses RLS.
// Never import this module in browser/client code.
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default supabase;
