CREATE TABLE public.target_universities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    priority integer NOT NULL,
    school text DEFAULT '',
    department text DEFAULT '',
    admission_type text DEFAULT '',
    grade_30 text DEFAULT '',
    grade_50 text DEFAULT '',
    grade_70 text DEFAULT '',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.target_universities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own target_universities"
    ON public.target_universities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own target_universities"
    ON public.target_universities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own target_universities"
    ON public.target_universities FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own target_universities"
    ON public.target_universities FOR DELETE
    USING (auth.uid() = user_id);
