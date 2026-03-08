-- 1. 잘못 추가된 profiles 테이블의 컬럼 2개 삭제
ALTER TABLE profiles 
DROP COLUMN IF EXISTS frozen_ai_tokens,
DROP COLUMN IF EXISTS frozen_human_tokens;

-- 2. 잘못 생성된 함수 완전 삭제
DROP FUNCTION IF EXISTS renew_monthly_tokens();
