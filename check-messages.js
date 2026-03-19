import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [key, val] = line.split('=');
  if (key && val) acc[key] = val;
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await supabase.from('messages').select('*').limit(1);
  if (error) console.error(error);
  console.log('Columns messages:', data && data.length ? Object.keys(data[0]) : 'no data');
  process.exit(0);
})();
