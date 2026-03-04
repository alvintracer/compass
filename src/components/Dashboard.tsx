// src/components/Dashboard.tsx
import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { useBreakpoint } from '../hooks/useBreakpoint'
import Onboarding from './Onboarding'
import IdentityDocument from './IdentityDocument'
import InterviewQnA from './InterviewQnA'
import RecordFeedback from './RecordFeedback'
import GradeManager from './GradeManager'
import MockInterview from './MockInterview'
import FileVault from './FileVault'
import Messages from './Messages'
import { Compass, Home, Mic, FileEdit, BarChart2, MonitorPlay, Bot, User, LogOut, Loader2, FolderOpen, MessageSquare, Menu, X } from 'lucide-react'

interface DashboardProps {
  session: Session
}

export default function Dashboard({ session }: DashboardProps) {
  const [isChecking, setIsChecking]   = useState(true)
  const [isOnboarded, setIsOnboarded] = useState(false)
  const [activeTab, setActiveTab]     = useState('overview')
  const [aiTokens, setAiTokens]       = useState(0)
  const [humanTokens, setHumanTokens] = useState(0)
  
  // 모바일 사이드바 토글 상태
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  
  const { isMobile, isTablet } = useBreakpoint()

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: profile } = await supabase
        .from('profiles').select('ai_tokens, human_tokens').eq('id', session.user.id).single()
      if (profile) { setAiTokens(profile.ai_tokens); setHumanTokens(profile.human_tokens) }

      const { data: onboarding } = await supabase
        .from('onboarding_data').select('id').eq('user_id', session.user.id).limit(1)
      if (onboarding && onboarding.length > 0) setIsOnboarded(true)

      setIsChecking(false)
    }
    fetchUserData()

    const channel = supabase.channel('profile-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, (payload) => {
        setAiTokens(payload.new.ai_tokens)
        setHumanTokens(payload.new.human_tokens)
      }).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session.user.id])

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) alert('로그아웃 중 에러가 발생했어요: ' + error.message)
  }

  // 탭 이동 시 모바일 메뉴 자동 닫기
  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    setIsMobileMenuOpen(false)
  }

  if (isChecking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <Loader2 className="animate-spin" size={40} color="#2563eb" />
      </div>
    )
  }

  const TABS = [
    { id: 'overview',  name: '나의 정의서',   icon: Home        },
    { id: 'qna',       name: '면접 Q&A 뱅크', icon: Mic         },
    { id: 'mock',      name: '모의면접실',     icon: MonitorPlay },
    { id: 'records',   name: '생기부 첨삭소',  icon: FileEdit    },
    { id: 'grades',    name: '나의 성적',      icon: BarChart2   },
    { id: 'vault',     name: '나의 파일',      icon: FolderOpen  },
    { id: 'messages',  name: '메세지',         icon: MessageSquare },
  ]

  // 공통 사이드바 콘텐츠 컴포넌트 (PC, 모바일 재사용)
  const SidebarContent = () => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? '32px' : (isTablet ? '32px' : '48px'), color: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Compass size={isTablet && !isMobile ? 24 : 28} strokeWidth={2.5} color="#2563eb" />
          <h2 style={{ margin: 0, fontSize: isTablet && !isMobile ? '18px' : '22px', fontWeight: '800', letterSpacing: '-0.5px' }}>Compass</h2>
        </div>
        {isMobile && (
          <button onClick={() => setIsMobileMenuOpen(false)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}>
            <X size={24} color="#94a3b8" />
          </button>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexGrow: 1 }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              disabled={!isOnboarded}
              style={{
                display: 'flex', alignItems: 'center', gap: isTablet && !isMobile ? '8px' : '12px',
                padding: isTablet && !isMobile ? '11px 12px' : '14px 16px',
                borderRadius: '12px', border: 'none',
                cursor: !isOnboarded ? 'not-allowed' : 'pointer',
                fontSize: isTablet && !isMobile ? '13px' : '15px', transition: 'all 0.2s ease',
                backgroundColor: activeTab === tab.id ? '#eff6ff' : 'transparent',
                color:           activeTab === tab.id ? '#2563eb'  : '#64748b',
                fontWeight:      activeTab === tab.id ? '700'      : '600',
                opacity: !isOnboarded ? 0.5 : 1,
              }}
            >
              <Icon size={isTablet && !isMobile ? 18 : 20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
              {tab.name}
            </button>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
        <div style={{ marginBottom: '16px', padding: isTablet && !isMobile ? '12px' : '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', color: '#475569' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={16} /><span style={{ fontWeight: '600' }}>AI 토큰</span>
            </div>
            <span style={{ fontWeight: '800', color: '#2563eb' }}>{aiTokens}개</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={16} /><span style={{ fontWeight: '600' }}>휴먼 토큰</span>
            </div>
            <span style={{ fontWeight: '800', color: '#ea580c' }}>{humanTokens}개</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px', backgroundColor: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'background-color 0.2s ease' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
        >
          <LogOut size={16} /> 로그아웃
        </button>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', backgroundColor: '#f8fafc' }}>

      {/* 모바일 상단 헤더 (햄버거 메뉴 포함) */}
      {isMobile && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Menu size={24} color="#0f172a" />
            </button>
            <span style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>Compass</span>
          </div>
          
          {/* 상단 우측 미니 토큰 표시 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#475569' }}>
              <Bot size={14} color="#2563eb" />
              <span style={{ fontWeight: '700', color: '#2563eb' }}>{aiTokens}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#475569' }}>
              <User size={14} color="#ea580c" />
              <span style={{ fontWeight: '700', color: '#ea580c' }}>{humanTokens}</span>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 슬라이드 드로어 (사이드바) */}
      {isMobile && (
        <>
          {/* 오버레이 (어두운 배경) */}
          <div 
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              opacity: isMobileMenuOpen ? 1 : 0,
              pointerEvents: isMobileMenuOpen ? 'auto' : 'none',
              transition: 'opacity 0.3s ease'
            }}
          />
          {/* 실제 드로어 메뉴 */}
          <div style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 60,
            width: '280px', backgroundColor: '#ffffff',
            padding: '24px', display: 'flex', flexDirection: 'column',
            transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isMobileMenuOpen ? '4px 0 24px rgba(0,0,0,0.1)' : 'none',
          }}>
            <SidebarContent />
          </div>
        </>
      )}

      {/* 데스크탑/태블릿 고정 사이드바 */}
      {!isMobile && (
        <div style={{
          width: isTablet ? '220px' : '280px',
          backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0',
          padding: isTablet ? '24px 16px' : '32px 24px',
          display: 'flex', flexDirection: 'column',
          position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
        }}>
          <SidebarContent />
        </div>
      )}

      {/* 메인 콘텐츠 영역 */}
      <div style={{
        flexGrow: 1,
        padding: isMobile ? '24px 16px 40px' : isTablet ? '32px' : '56px',
        maxWidth: '1200px', margin: '0 auto', width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ marginBottom: isMobile ? '24px' : '40px' }}>
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: isMobile ? '22px' : '30px',
            color: '#0f172a', fontWeight: '800', letterSpacing: '-0.5px',
          }}>
            환영해요, {session.user.email?.split('@')[0]}님!
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '14px' : '16px' }}>오늘도 목표를 향해 나침반을 맞춰보세요.</p>
        </div>

        {!isOnboarded ? (
          <Onboarding session={session} onComplete={() => setIsOnboarded(true)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {activeTab === 'overview' && <IdentityDocument session={session} />}
            {activeTab === 'qna'      && <InterviewQnA     session={session} />}
            {activeTab === 'mock'     && <MockInterview     session={session} />}
            {activeTab === 'records'  && <RecordFeedback   session={session} />}
            {activeTab === 'grades'   && <GradeManager     session={session} />}
            {activeTab === 'vault'    && <FileVault         session={session} />}
            {activeTab === 'messages' && <Messages          session={session} />}
          </div>
        )}
      </div>
    </div>
  )
}