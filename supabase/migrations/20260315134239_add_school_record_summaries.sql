CREATE TABLE IF NOT EXISTS public.school_record_summaries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text default '',
  status text default 'draft',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.school_record_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own summary"
  ON public.school_record_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own summary"
  ON public.school_record_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own summary"
  ON public.school_record_summaries FOR UPDATE
  USING (auth.uid() = user_id);
