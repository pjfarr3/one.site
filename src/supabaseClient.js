import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL || '';
const anon = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

export const supabase = (url && anon) ? createClient(url, anon) : null;

if (!url || !anon) {
  // Don’t crash the app; just warn
  // You’ll still see a UI and our loader will show a banner with missing envs.
  console.warn('Supabase env vars missing; running without DB.');
}
