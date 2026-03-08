-- profiles 테이블에 동결 토큰 컬럼 추가
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS frozen_ai_tokens INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS frozen_human_tokens INT DEFAULT 0;
