import { supabase } from './supabase.js';

export async function testConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('tenants').select('count', { count: 'exact', head: true });
    if (error) {
      console.error('Supabase connection failed:', error.message);
      return { connected: false, error: error.message };
    }
    console.log('Supabase connection successful');
    return { connected: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Supabase connection failed:', message);
    return { connected: false, error: message };
  }
}
