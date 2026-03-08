-- =============================================
-- 토큰 월별 리뉴얼 함수 (pg_cron으로 매일 실행)
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 매일 실행되어 토큰 리셋이 필요한 회원들을 처리
-- 3개월/6개월 플랜: token_reset_date로부터 30일이 지나면 토큰 리셋 + reset_date 갱신

CREATE OR REPLACE FUNCTION renew_monthly_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- 활성 회원권 중 토큰 리셋 주기(30일)가 지났고, 아직 end_date 전인 것들
  FOR rec IN
    SELECT m.id AS membership_id, m.user_id, m.plan_type, m.end_date, m.token_reset_date
    FROM memberships m
    WHERE m.status = 'active'
      AND m.end_date > now()
      AND m.token_reset_date + interval '30 days' <= now()
      AND m.plan_type IN ('3month', '6month')
  LOOP
    -- 토큰 이월 및 추가 (기존 토큰 유지 + AI 100, 컨설턴트 30 추가)
    UPDATE profiles
    SET ai_tokens = COALESCE(ai_tokens, 0) + 100,
        human_tokens = COALESCE(human_tokens, 0) + 30
    WHERE id = rec.user_id;
    
    -- 리셋 날짜 갱신
    UPDATE memberships
    SET token_reset_date = now()
    WHERE id = rec.membership_id;
    
    RAISE NOTICE 'Renewed tokens for user %', rec.user_id;
  END LOOP;
  
  -- 1. 만료된 회원권 대상: 남은 토큰을 동결 토큰으로 이전 및 0 초기화
  UPDATE profiles
  SET frozen_ai_tokens = COALESCE(frozen_ai_tokens, 0) + COALESCE(ai_tokens, 0),
      frozen_human_tokens = COALESCE(frozen_human_tokens, 0) + COALESCE(human_tokens, 0),
      ai_tokens = 0,
      human_tokens = 0
  WHERE id IN (
    SELECT user_id FROM memberships
    WHERE status = 'active' AND end_date <= now()
  );

  -- 2. 만료된 회원권 상태 업데이트
  UPDATE memberships
  SET status = 'expired'
  WHERE status = 'active' AND end_date <= now();

  -- 3. 90일 이내 재결제하지 않은 회원: 동결된 토큰 완전 소멸 처리
  UPDATE profiles
  SET frozen_ai_tokens = 0,
      frozen_human_tokens = 0
  WHERE (COALESCE(frozen_ai_tokens, 0) > 0 OR COALESCE(frozen_human_tokens, 0) > 0)
    AND NOT EXISTS (
      -- 최근 90일 이내의 만료건이거나 이미 활성 상태인 회원권이 있으면 면제
      SELECT 1 FROM memberships m 
      WHERE m.user_id = profiles.id 
        AND m.end_date > now() - interval '90 days'
    );
END;
$$;

-- pg_cron 설정 (Supabase 대시보드에서 Extensions > pg_cron 활성화 필요)
-- 매일 자정(UTC)에 실행
-- SELECT cron.schedule('renew-monthly-tokens', '0 0 * * *', 'SELECT renew_monthly_tokens()');

-- 수동 테스트용:
-- SELECT renew_monthly_tokens();
