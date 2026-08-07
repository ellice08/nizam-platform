import { supabase } from './supabase.js';

// Per-user "last viewed" timestamp for a nav section (conversations, support)
// — backs the self-clearing nav badges. Opening the section marks it viewed;
// badge counts then only include rows updated after that moment, so the
// badge clears on open and only reflects what's new since the last visit.
export async function getLastViewedAt(userId: string, section: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_section_views')
    .select('last_viewed_at')
    .eq('user_id', userId)
    .eq('section', section)
    .maybeSingle();
  return (data?.last_viewed_at as string | undefined) ?? null;
}
