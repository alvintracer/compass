// src/components/Auth.tsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const [loading, setLoading]       = useState(false)
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [isLoginView, setIsLoginView] = useState(true)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (isLoginView) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) alert(error.message)
      else alert('로그인 성공! 환영합니다.')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) alert(error.message)
      else alert('회원가입 성공! 이메일을 확인해주세요.')
    }

    setLoading(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', backgroundColor: '#f8fafc',
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
      padding: '24px',
    }}>

      {/* 서비스 소개 배너 */}
      <a
        href="/landing.html"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginBottom: '24px', padding: '10px 20px',
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: '100px', textDecoration: 'none',
          fontSize: '13px', fontWeight: '600', color: '#2563eb',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#dbeafe'; e.currentTarget.style.borderColor = '#93c5fd'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
      >
        <span style={{ fontSize: '15px' }}>🧭</span>
        Compass가 처음이신가요? 서비스 소개 보기
        <span style={{ fontSize: '15px' }}>→</span>
      </a>

      {/* 로그인 카드 */}
      <div style={{
        width: '100%', maxWidth: '420px',
        padding: '48px 40px', backgroundColor: '#ffffff',
        borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        textAlign: 'center', boxSizing: 'border-box',
      }}>

        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="#2563eb" strokeWidth="2"/>
            <circle cx="14" cy="14" r="3" fill="#2563eb"/>
            <line x1="14" y1="2" x2="14" y2="8" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/>
            <line x1="14" y1="20" x2="14" y2="26" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
            <line x1="2" y1="14" x2="8" y2="14" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
            <line x1="20" y1="14" x2="26" y2="14" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
          </svg>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '20px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.3px' }}>
            Compass
          </span>
        </div>

        <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.5px' }}>
          {isLoginView ? '다시 만나서 반가워요' : '함께 시작해요'}
        </h2>
        <p style={{ margin: '0 0 32px 0', fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
          {isLoginView
            ? '학생의 본질을 파악하는 여정을 시작하세요.'
            : '새로운 여정을 위한 계정을 생성하세요.'}
        </p>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email" placeholder="이메일 주소"
            value={email} onChange={e => setEmail(e.target.value)} required
            style={{
              width: '100%', padding: '15px 16px', borderRadius: '10px',
              border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none',
              boxSizing: 'border-box', backgroundColor: '#f8fafc', transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#2563eb'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          <input
            type="password" placeholder="비밀번호"
            value={password} onChange={e => setPassword(e.target.value)} required
            style={{
              width: '100%', padding: '15px 16px', borderRadius: '10px',
              border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none',
              boxSizing: 'border-box', backgroundColor: '#f8fafc', transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = '#2563eb'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '8px', padding: '15px', backgroundColor: '#0f172a',
              color: '#ffffff', border: 'none', borderRadius: '10px',
              fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#2563eb'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; }}
          >
            {loading ? '처리 중...' : isLoginView ? '로그인' : '회원가입'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '14px', color: '#64748b' }}>
          {isLoginView ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          <button
            type="button" onClick={() => setIsLoginView(!isLoginView)}
            style={{
              marginLeft: '6px', background: 'none', border: 'none',
              color: '#2563eb', fontWeight: '700', cursor: 'pointer',
              padding: 0, fontSize: '14px',
            }}
          >
            {isLoginView ? '회원가입하기' : '로그인하기'}
          </button>
        </div>
      </div>

      {/* 하단 서비스 소개 링크 (모바일용 추가) */}
      <p style={{ marginTop: '20px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>
        Compass가 무엇인지 궁금하다면?{' '}
        <a href="/landing.html" style={{ color: '#2563eb', fontWeight: '600', textDecoration: 'none' }}>
          서비스 소개 →
        </a>
      </p>
    </div>
  )
}