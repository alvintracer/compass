// src/components/Dashboard.tsx
import { useState, useEffect, useCallback } from 'react'
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
import Payment from './Payment'
import GoalsTracker from './GoalsTracker'
import ResearchTasks from './ResearchTasks'
import {
  Compass, Home, Mic, FileEdit, BarChart2, MonitorPlay,
  Bot, User, LogOut, Loader2, FolderOpen, MessageSquare, Menu, X, CreditCard,
  Target, BookOpen, Crown, AlertTriangle, Calendar,
} from 'lucide-react'

interface DashboardProps { session: Session }

interface MembershipInfo {
  endDate: string | null
  plan: string | null
  remainingDays: number
  isActive: boolean
  isFrozen: boolean
  isWarning: boolean
}

// TABS를 모듈 레벨로 분리 — 매 렌더마다 새로 생성되는 것 방지
const TABS = [
  { id: 'goals',     name: '과제/목표',     icon: Target        },
  { id: 'overview',  name: '나의 정의서',   icon: Home          },
  { id: 'qna',       name: '면접 Q&A 뱅크', icon: Mic           },
  { id: 'research',  name: '탐구 과제',     icon: BookOpen      },
  { id: 'mock',      name: '모의면접실',     icon: MonitorPlay   },
  { id: 'records',   name: '생기부 첨삭소',  icon: FileEdit      },
  { id: 'grades',    name: '나의 성적',      icon: BarChart2     },
  { id: 'vault',     name: '나의 파일',      icon: FolderOpen    },
  { id: 'messages',  name: '메세지',         icon: MessageSquare },
]

const PLAN_LABELS: Record<string, string> = {
  '1month': '1개월',
  '3month': '3개월',
  '6month': '6개월',
}

// ── SidebarContent — Dashboard 밖으로 분리해 불필요한 리마운트 방지 ──────────
interface SidebarProps {
  isMobile: boolean
  isTablet: boolean
  isOnboarded: boolean
  activeTab: string
  aiTokens: number
  humanTokens: number
  frozenAiTokens: number
  frozenHumanTokens: number
  membership: MembershipInfo
  userId: string
  onTabClick: (id: string) => void
  onClose?: () => void
  onLogout: () => void
}

function SidebarContent({
  isMobile, isTablet, isOnboarded, activeTab,
  aiTokens, humanTokens, frozenAiTokens, frozenHumanTokens, membership, userId, onTabClick, onClose, onLogout,
}: SidebarProps) {
  const compact = isTablet && !isMobile

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: compact ? '20px' : '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Compass size={compact ? 24 : 28} strokeWidth={2.5} color="#2563eb" />
          <h2 style={{ margin: 0, fontSize: compact ? '18px' : '22px', fontWeight: '800', letterSpacing: '-0.5px', color: '#0f172a' }}>
            Compass
          </h2>
        </div>
        {isMobile && onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}>
            <X size={24} color="#94a3b8" />
          </button>
        )}
      </div>

      <a
        href="/Tutorial.html"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: compact ? '8px 12px' : '10px 16px', marginBottom: compact ? '24px' : '32px',
          backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: '12px', textDecoration: 'none',
          fontSize: compact ? '12px' : '13px', fontWeight: '700', color: '#64748b',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = '#64748b'; }}
      >
        <BookOpen size={compact ? 16 : 18} /> 사용자 가이드 보기
      </a>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexGrow: 1 }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabClick(tab.id)}
              disabled={!isOnboarded}
              style={{
                display: 'flex', alignItems: 'center',
                gap: compact ? '8px' : '12px',
                padding: compact ? '11px 12px' : '14px 16px',
                borderRadius: '12px', border: 'none',
                cursor: !isOnboarded ? 'not-allowed' : 'pointer',
                fontSize: compact ? '13px' : '15px',
                transition: 'all 0.2s ease', textAlign: 'left',
                backgroundColor: isActive ? '#eff6ff' : 'transparent',
                color:           isActive ? '#2563eb' : '#64748b',
                fontWeight:      isActive ? '700'     : '600',
                opacity: !isOnboarded ? 0.5 : 1,
              }}
            >
              <Icon size={compact ? 18 : 20} strokeWidth={isActive ? 2.5 : 2} />
              {tab.name}
            </button>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
        {/* 회원권 상태 */}
        <div style={{
          marginBottom: '12px', padding: compact ? '12px' : '14px',
          borderRadius: '12px',
          background: membership.isActive
            ? (membership.isWarning ? 'linear-gradient(135deg, #fef2f2, #fff1f2)' : 'linear-gradient(135deg, #eff6ff, #f0fdf4)')
            : '#f8fafc',
          border: `1px solid ${membership.isActive ? (membership.isWarning ? '#fecaca' : '#bfdbfe') : '#e2e8f0'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Crown size={15} color={membership.isActive ? (membership.isWarning ? '#dc2626' : '#2563eb') : '#94a3b8'} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: membership.isActive ? '#0f172a' : '#94a3b8' }}>
              {membership.isActive 
                ? `회원권 ${PLAN_LABELS[membership.plan || ''] || ''}`
                : '회원권 없음'}
            </span>
          </div>
          {membership.isActive ? (
            <div style={{ fontSize: '11px', color: membership.isWarning ? '#dc2626' : '#64748b', fontWeight: membership.isWarning ? '700' : '500' }}>
              {membership.isWarning
                ? `⚠️ ${membership.remainingDays}일 뒤 토큰 사용 중지`
                : `${membership.remainingDays}일 남음 · ${new Date(membership.endDate!).toLocaleDateString('ko-KR')}까지`}
            </div>
          ) : membership.isFrozen ? (
            <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: '700' }}>
              🔒 토큰 사용 동결 중
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              회원권을 구매하여 서비스를 이용하세요
            </div>
          )}
        </div>

        {/* 토큰 충전 링크 */}
        <button
          onClick={() => onTabClick('payment')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', padding: compact ? '10px' : '12px', marginBottom: '12px',
            borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#ffffff',
            fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <CreditCard size={15} /> 회원권 구매
        </button>
        
        {/* 대면 상담 요청 링크 */}
        <button
          onClick={async () => {
            if (!window.confirm('대면 상담(70분, 150,000원)을 요청하시겠습니까? \n(어드민으로 알림이 전송됩니다)')) return;
            try {
              // payment_orders에 접수
              const { error } = await supabase.from('payment_orders').insert({
                user_id: userId,
                items: '대면 상담 (70분)',
                total_amount: 150000,
                status: 'pending',
              });
              if (error) throw error;
              // 텔레그램 푸시
              await supabase.functions.invoke('send-notification', {
                body: { action: 'admin_telegram', message: `🔔 <b>새 대면상담 요청 접수</b>\n\n결제 관리 탭에서 확인하세요.` }
              });
              alert('대면 상담 요청이 접수되었습니다! \n컨설턴트가 확인 후 연락드립니다.');
            } catch (err: any) {
              alert('상담 요청 중 오류가 발생했습니다: ' + err.message);
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', padding: compact ? '10px' : '12px', marginBottom: '16px',
            borderRadius: '10px', border: '1px solid #10b981',
            background: '#ecfdf5', color: '#047857',
            fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#d1fae5'}
          onMouseLeave={e => e.currentTarget.style.background = '#ecfdf5'}
        >
          <Calendar size={15} /> 대면 상담 요청
        </button>

        <div style={{
          marginBottom: '16px', padding: compact ? '12px' : '16px',
          backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0',
        }}>
          {membership.isFrozen && (frozenAiTokens > 0 || frozenHumanTokens > 0) ? (
            <>
              <div style={{ marginBottom: '10px', fontSize: '12px', fontWeight: '800', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🧊 동결된 토큰 <span style={{ fontWeight: '500', color: '#0284c7', fontSize: '11px' }}>(재결제 시 연장)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#475569', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bot size={16} /><span style={{ fontWeight: '600' }}>AI 토큰</span>
                </div>
                <span style={{ fontWeight: '800', color: '#0369a1' }}>{frozenAiTokens}개</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#475569', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={16} /><span style={{ fontWeight: '600' }}>컨설턴트 토큰</span>
                </div>
                <span style={{ fontWeight: '800', color: '#0369a1' }}>{frozenHumanTokens}개</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bot size={16} /><span style={{ fontWeight: '600' }}>AI 토큰</span>
                </div>
                <span style={{ fontWeight: '800', color: membership.isFrozen ? '#94a3b8' : '#2563eb' }}>
                  {membership.isFrozen ? '0개' : `${aiTokens}개`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={16} /><span style={{ fontWeight: '600' }}>컨설턴트 토큰</span>
                </div>
                <span style={{ fontWeight: '800', color: membership.isFrozen ? '#94a3b8' : '#ea580c' }}>
                  {membership.isFrozen ? '0개' : `${humanTokens}개`}
                </span>
              </div>
            </>
          )}
        </div>
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', width: '100%', padding: '14px',
            backgroundColor: '#ffffff', color: '#64748b',
            border: '1px solid #e2e8f0', borderRadius: '12px',
            fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
        >
          <LogOut size={16} /> 로그아웃
        </button>
      </div>
    </>
  )
}

// ── 메인 Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard({ session }: DashboardProps) {
  const [isChecking, setIsChecking]         = useState(true)
  const [isOnboarded, setIsOnboarded]       = useState(false)
  const [activeTab, setActiveTab]           = useState('overview')
  const [aiTokens, setAiTokens]             = useState(0)
  const [humanTokens, setHumanTokens]       = useState(0)
  const [frozenAiTokens, setFrozenAiTokens] = useState(0)
  const [frozenHumanTokens, setFrozenHumanTokens] = useState(0)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [membership, setMembership] = useState<MembershipInfo>({
    endDate: null, plan: null, remainingDays: 0,
    isActive: false, isFrozen: false, isWarning: false,
  })

  const { isMobile, isTablet } = useBreakpoint()

  // 회원권 정보 조회
  const refreshMembership = useCallback(async () => {
    const { data } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      const end = new Date(data.end_date)
      const now = new Date()
      const remaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      const isActive = remaining > 0
      
      // 만료된 경우 status를 expired로 업데이트
      if (!isActive && data.status === 'active') {
        await supabase.from('memberships').update({ status: 'expired' }).eq('id', data.id)
      }

      setMembership({
        endDate: data.end_date,
        plan: data.plan_type,
        remainingDays: remaining,
        isActive,
        isFrozen: !isActive,
        isWarning: isActive && remaining <= 5,
      })
    } else {
      // 만료된 회원권이 있었는지 체크
      const { data: expiredData } = await supabase
        .from('memberships')
        .select('id')
        .eq('user_id', session.user.id)
        .limit(1)
      
      setMembership({
        endDate: null, plan: null, remainingDays: 0,
        isActive: false,
        isFrozen: !!(expiredData && expiredData.length > 0), // 이전에 회원권이 있었으면 frozen
        isWarning: false,
      })
    }
  }, [session.user.id])

  // 토큰 명시적 조회 — Realtime이 안 올 때 fallback으로 사용
  const refreshTokens = useCallback(async () => {
    const { data } = await supabase
      .from('profiles').select('ai_tokens, human_tokens, frozen_ai_tokens, frozen_human_tokens')
      .eq('id', session.user.id).single()
    if (data) {
      setAiTokens(data.ai_tokens)
      setHumanTokens(data.human_tokens)
      setFrozenAiTokens(data.frozen_ai_tokens || 0)
      setFrozenHumanTokens(data.frozen_human_tokens || 0)
    }
  }, [session.user.id])

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: profile } = await supabase
        .from('profiles').select('ai_tokens, human_tokens, frozen_ai_tokens, frozen_human_tokens')
        .eq('id', session.user.id).single()
      if (profile) {
        setAiTokens(profile.ai_tokens)
        setHumanTokens(profile.human_tokens)
        setFrozenAiTokens(profile.frozen_ai_tokens || 0)
        setFrozenHumanTokens(profile.frozen_human_tokens || 0)
      }

      const { data: onboarding } = await supabase
        .from('onboarding_data').select('id').eq('user_id', session.user.id).limit(1)
      if (onboarding && onboarding.length > 0) setIsOnboarded(true)

      await refreshMembership()
      setIsChecking(false)
    }
    fetchUserData()

    // Realtime 구독
    // ※ 동작 안 하면 Supabase 대시보드에서 실행:
    //   ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    const channel = supabase.channel('profile-token-changes')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${session.user.id}`,
      }, (payload) => {
        setAiTokens(payload.new.ai_tokens)
        setHumanTokens(payload.new.human_tokens)
        setFrozenAiTokens(payload.new.frozen_ai_tokens || 0)
        setFrozenHumanTokens(payload.new.frozen_human_tokens || 0)
      }).subscribe()

    // Realtime 미동작 대비 30초 폴링 fallback
    const poll = setInterval(() => {
      refreshTokens()
      refreshMembership()
    }, 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [session.user.id, refreshTokens, refreshMembership])

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) alert('로그아웃 중 에러가 발생했어요: ' + error.message)
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    setIsMobileMenuOpen(false)
    // 탭 이동 시 토큰 즉시 갱신 — AI 기능 쓰고 탭 이동하면 바로 반영
    refreshTokens()
    refreshMembership()
  }

  if (isChecking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
        <Loader2 className="animate-spin" size={40} color="#2563eb" />
      </div>
    )
  }

  const sidebarProps: SidebarProps = {
    isMobile, isTablet, isOnboarded, activeTab,
    aiTokens, humanTokens, frozenAiTokens, frozenHumanTokens, membership, userId: session.user.id,
    onTabClick: handleTabClick,
    onLogout: handleLogout,
  }

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', backgroundColor: '#f8fafc' }}>

      {/* 모바일 상단 헤더 */}
      {isMobile && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex' }}>
              <Menu size={24} color="#0f172a" />
            </button>
            <span style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>Compass</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {membership.isFrozen && (frozenAiTokens > 0 || frozenHumanTokens > 0) ? (
              <span style={{ fontSize: '11px', fontWeight: '800', color: '#0369a1', backgroundColor: '#e0f2fe', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🧊 동결 ({frozenAiTokens + frozenHumanTokens})
              </span>
            ) : membership.isFrozen ? (
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', backgroundColor: '#fef2f2', padding: '3px 8px', borderRadius: '6px' }}>🔒 만료됨</span>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Bot size={14} color="#2563eb" />
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#2563eb' }}>{aiTokens}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={14} color="#ea580c" />
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#ea580c' }}>{humanTokens}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 모바일 드로어 */}
      {isMobile && (
        <>
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              backgroundColor: 'rgba(15,23,42,0.4)',
              opacity: isMobileMenuOpen ? 1 : 0,
              pointerEvents: isMobileMenuOpen ? 'auto' : 'none',
              transition: 'opacity 0.3s ease',
            }}
          />
          <div style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 60,
            width: '280px', backgroundColor: '#ffffff',
            padding: '24px', display: 'flex', flexDirection: 'column',
            transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isMobileMenuOpen ? '4px 0 24px rgba(0,0,0,0.1)' : 'none',
            overflowY: 'auto',
          }}>
            <SidebarContent {...sidebarProps} onClose={() => setIsMobileMenuOpen(false)} />
          </div>
        </>
      )}

      {/* 데스크탑/태블릿 사이드바 */}
      {!isMobile && (
        <div style={{
          width: isTablet ? '220px' : '280px',
          backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0',
          padding: isTablet ? '24px 16px' : '32px 24px',
          display: 'flex', flexDirection: 'column',
          position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
          overflowY: 'auto',
        }}>
          <SidebarContent {...sidebarProps} />
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <div style={{
        flexGrow: 1,
        padding: isMobile ? '24px 16px 40px' : isTablet ? '32px' : '56px',
        maxWidth: '1200px', margin: '0 auto', width: '100%',
        boxSizing: 'border-box',
      }}>
        {/* 만료 경고 배너 */}
        {membership.isWarning && (
          <div style={{
            marginBottom: '20px', padding: '16px 20px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
            border: '1px solid #fecaca',
            display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '12px', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={20} color="#dc2626" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#991b1b' }}>
                  ⚠️ {membership.remainingDays}일 뒤 토큰 사용이 중지됩니다
                </div>
                <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                  회원권 재구매가 필요합니다. 다른 기능은 계속 이용 가능합니다.
                </div>
              </div>
            </div>
            <button onClick={() => handleTabClick('payment')} style={{
              padding: '8px 20px', borderRadius: '10px', border: 'none',
              backgroundColor: '#dc2626', color: '#ffffff',
              fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              회원권 구매하기
            </button>
          </div>
        )}

        {/* 동결 상태 배너 */}
        {membership.isFrozen && !membership.isActive && (
          <div style={{
            marginBottom: '20px', padding: '16px 20px', borderRadius: '14px',
            backgroundColor: '#f0f9ff', border: '1px solid #bae6fd',
            display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '12px', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '24px' }}>🧊</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#0369a1' }}>
                  회원권 만료로 {frozenAiTokens > 0 || frozenHumanTokens > 0 ? '남은 토큰이 동결되었습니다' : '서비스 이용이 제한됩니다'}
                </div>
                <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '4px' }}>
                  {frozenAiTokens > 0 || frozenHumanTokens > 0 
                   ? '잠들어 있는 토큰을 깨워주세요! 30일 이내에 회원권을 갱신하면 기존 토큰(AI: '+frozenAiTokens+'개, 컨설턴트: '+frozenHumanTokens+'개)과 신규 토큰을 모두 사용할 수 있습니다.'
                   : '회원권을 구매하면 매월 서비스 토큰이 지급됩니다. 다른 기능은 정상 이용 가능합니다.'}
                </div>
              </div>
            </div>
            <button onClick={() => handleTabClick('payment')} style={{
              padding: '8px 20px', borderRadius: '10px', border: 'none',
              background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff',
              fontSize: '13px', fontWeight: '700', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              회원권 구매하기
            </button>
          </div>
        )}

        <div style={{ marginBottom: isMobile ? '24px' : '40px' }}>
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: isMobile ? '22px' : '30px',
            color: '#0f172a', fontWeight: '800', letterSpacing: '-0.5px',
          }}>
            환영해요, {session.user.email?.split('@')[0]}님!
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '14px' : '16px' }}>
            오늘도 목표를 향해 나침반을 맞춰보세요.
          </p>
        </div>

        {!isOnboarded ? (
          <Onboarding session={session} onComplete={() => setIsOnboarded(true)} />
        ) : isRegenerating ? (
          <Onboarding
            session={session}
            mode="regenerate"
            onComplete={() => {
              setIsRegenerating(false)
              setActiveTab('overview')
            }}
            onCancel={() => setIsRegenerating(false)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {activeTab === 'goals'    && <GoalsTracker    session={session} />}
            {activeTab === 'overview' && <IdentityDocument session={session} onRegenerate={() => setIsRegenerating(true)} />}
            {activeTab === 'qna'      && <InterviewQnA     session={session} />}
            {activeTab === 'research' && <ResearchTasks    session={session} />}
            {activeTab === 'mock'     && <MockInterview     session={session} />}
            {activeTab === 'records'  && <RecordFeedback   session={session} />}
            {activeTab === 'grades'   && <GradeManager     session={session} />}
            {activeTab === 'vault'    && <FileVault         session={session} />}
            {activeTab === 'messages' && <Messages          session={session} />}
            {activeTab === 'payment' && <Payment session={session} onBack={() => handleTabClick('overview')} />}
          </div>
        )}
      </div>
    </div>
  )
}