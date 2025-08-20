// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Don't crash if missing — log and export a dummy client that will simply fail gracefully
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in Vercel.');
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : { from: () => ({ select: async () => ({ data: [], error: new Error('Missing Supabase env') }) }) };
