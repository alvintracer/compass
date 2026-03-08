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
    -- 토큰 리셋 (AI 100, 컨설턴트 30)
    UPDATE profiles
    SET ai_tokens = 100, human_tokens = 30
    WHERE id = rec.user_id;
    
    -- 리셋 날짜 갱신
    UPDATE memberships
    SET token_reset_date = now()
    WHERE id = rec.membership_id;
    
    RAISE NOTICE 'Renewed tokens for user %', rec.user_id;
  END LOOP;
  
  -- 만료된 회원권 상태 업데이트
  UPDATE memberships
  SET status = 'expired'
  WHERE status = 'active' AND end_date <= now();
END;
$$;

-- pg_cron 설정 (Supabase 대시보드에서 Extensions > pg_cron 활성화 필요)
-- 매일 자정(UTC)에 실행
-- SELECT cron.schedule('renew-monthly-tokens', '0 0 * * *', 'SELECT renew_monthly_tokens()');

-- 수동 테스트용:
-- SELECT renew_monthly_tokens();
