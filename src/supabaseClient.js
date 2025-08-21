// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL || '';
const anon = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

let supabase = null;
try {
  if (!url || !anon) {
    console.warn(
      'Supabase env vars missing. REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY is empty.'
    );
  } else {
    supabase = createClient(url, anon);
  }
} catch (e) {
  console.error('Supabase init failed:', e);
  supabase = null; // keep app running
}

export { supabase };
