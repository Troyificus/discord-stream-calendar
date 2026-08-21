import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' })
  }
});
