import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rnnpetwouincrauvsynh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJubnBldHdvdWluY3JhdXZzeW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMjMwOTIsImV4cCI6MjA4Nzg5OTA5Mn0.xTP8DoC_JtfyYrcQtptd_R9muICgZ3YmYQAu_OWiLbU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('user_profiles').select('*').limit(1);
  console.log('user_profiles:', { data, error });
  const { data: d2, error: e2 } = await supabase.from('target_universities').select('*').limit(1);
  console.log('target_universities:', { data: d2, error: e2 });
}
check();
