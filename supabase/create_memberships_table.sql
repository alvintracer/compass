-- =============================================
-- 회원권(멤버십) 시스템 테이블 생성
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. memberships 테이블
CREATE TABLE IF NOT EXISTS public.memberships (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type       TEXT NOT NULL CHECK (plan_type IN ('1month', '3month', '6month')),
  start_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date        TIMESTAMPTZ NOT NULL,
  token_reset_date TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 마지막 토큰 리셋 날짜
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON public.memberships(user_id, status);

-- RLS
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memberships"
  ON public.memberships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage memberships"
  ON public.memberships FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. profiles 테이블에 회원권 관련 컬럼 추가 (이미 있으면 무시)
-- membership_end_date: 현재 활성 회원권 만료일 (빠른 조회용)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_end_date TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_plan TEXT DEFAULT NULL;
