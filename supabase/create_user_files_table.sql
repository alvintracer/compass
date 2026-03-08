-- =============================================
-- user_files 테이블 생성
-- Supabase SQL Editor에서 실행하세요
-- =============================================

CREATE TABLE IF NOT EXISTS public.user_files (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_type   TEXT NOT NULL DEFAULT 'other'
              CHECK (file_type IN ('school_record', 'grade', 'essay', 'other')),
  file_name   TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 인덱스: user_id로 자주 조회하므로
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON public.user_files(user_id);

-- 인덱스: file_type 필터링용
CREATE INDEX IF NOT EXISTS idx_user_files_type ON public.user_files(user_id, file_type);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 파일만 조회
CREATE POLICY "Users can view own files"
  ON public.user_files
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 정책: 본인 파일만 삽입
CREATE POLICY "Users can insert own files"
  ON public.user_files
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 정책: 본인 파일만 삭제
CREATE POLICY "Users can delete own files"
  ON public.user_files
  FOR DELETE
  USING (auth.uid() = user_id);

-- (선택) Admin도 조회 가능하게 하려면 아래 정책 추가
-- service_role key로 접근 시 RLS를 우회하므로, 
-- admin 페이지에서 anon key로 접근한다면 아래 정책 필요:
-- CREATE POLICY "Admin can view all files"
--   ON public.user_files
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.profiles
--       WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
--     )
--   );
