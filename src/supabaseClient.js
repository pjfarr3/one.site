// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url =
  process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = (url && anonKey) ? createClient(url, anonKey) : null;

export function supabaseStatus() {
  const missing = [];
  if (!url) missing.push('REACT_APP_SUPABASE_URL');
  if (!anonKey) missing.push('REACT_APP_SUPABASE_ANON_KEY');
  return { ok: !!(url && anonKey), missing };
}
