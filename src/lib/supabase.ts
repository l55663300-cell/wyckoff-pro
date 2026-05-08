import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string)
  || 'https://oijewqsmjmqbgcsvfkbf.supabase.co';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pamV3cXNtam1xYmdjc3Zma2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM5MzUsImV4cCI6MjA5MzIxOTkzNX0.aV7ivfmNXEWsFw0CRYQQD2Rea7d-IpVIiE_QvTqhmrY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export type { User, Session } from '@supabase/supabase-js';
