// src/components/Auth.tsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoginView, setIsLoginView] = useState(true) // 로그인/회원가입 뷰 전환 상태

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
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '80vh',
      backgroundColor: '#f8fafc', // 부드럽고 세련된 회백색 배경
      fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif"
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '48px 40px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)', // 고급스러운 은은한 그림자
        textAlign: 'center',
        boxSizing: 'border-box'
      }}>
        <h2 style={{
          margin: '0 0 12px 0',
          fontSize: '28px',
          fontWeight: '700',
          color: '#0f172a',
          letterSpacing: '-0.5px'
        }}>
          Compass Consulting
        </h2>
        <p style={{
          margin: '0 0 32px 0',
          fontSize: '15px',
          color: '#64748b'
        }}>
          {isLoginView ? '학생의 본질을 파악하는 여정을 시작하세요.' : '새로운 여정을 위한 계정을 생성하세요.'}
        </p>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="email"
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              fontSize: '15px',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s ease',
              backgroundColor: '#f8fafc'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              fontSize: '15px',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s ease',
              backgroundColor: '#f8fafc'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
          />
          
          <button 
            type="submit" 
            disabled={loading}
            style={{
              marginTop: '12px',
              padding: '16px',
              backgroundColor: '#2563eb', // 전문성을 강조하는 신뢰의 블루
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s ease, opacity 0.2s ease',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? '처리 중...' : (isLoginView ? '로그인' : '회원가입')}
          </button>
        </form>

        <div style={{ marginTop: '28px', fontSize: '14px', color: '#64748b' }}>
          {isLoginView ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          <button 
            type="button"
            onClick={() => setIsLoginView(!isLoginView)}
            style={{
              marginLeft: '8px',
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontWeight: '600',
              cursor: 'pointer',
              padding: 0,
              fontSize: '14px'
            }}
          >
            {isLoginView ? '회원가입하기' : '로그인하기'}
          </button>
        </div>
      </div>
    </div>
  )
}