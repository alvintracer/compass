// src/components/Payment.tsx
import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  ShoppingCart, Copy, Crown, Calendar,
  ArrowLeft, Loader2, Clock, CheckCircle2, XCircle, Sparkles, Shield,
} from 'lucide-react';

interface PaymentProps {
  session: Session;
  onBack: () => void;
}

interface PaymentOrder {
  id: string;
  user_id: string;
  items: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
}

interface Membership {
  id: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

const PLANS = [
  {
    id: '1month',
    label: '1개월',
    price: 200000,
    months: 1,
    perMonth: 200000,
    desc: '부담 없이 시작하기',
    color: '#2563eb',
    bg: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  {
    id: '3month',
    label: '3개월',
    price: 550000,
    months: 3,
    perMonth: Math.round(550000 / 3),
    desc: '가장 인기 있는 플랜',
    color: '#7c3aed',
    bg: '#f5f3ff',
    borderColor: '#c4b5fd',
    badge: '인기',
    discount: '8%',
  },
  {
    id: '6month',
    label: '6개월',
    price: 1000000,
    months: 6,
    perMonth: Math.round(1000000 / 6),
    desc: '최고의 가성비',
    color: '#0f172a',
    bg: '#f8fafc',
    borderColor: '#94a3b8',
    badge: 'BEST',
    discount: '17%',
  },
];

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

export default function Payment({ session, onBack }: PaymentProps) {
  const isMobile = useIsMobile();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);

  // 입금 확인 완료/실패 메시지 모달
  const [paymentResultModal, setPaymentResultModal] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [activeMembership, setActiveMembership] = useState<Membership | null>(null);

  const BANK_ACCOUNT = '3333215714526';
  const BANK_HOLDER = '한태우';
  const BANK_NAME = '카카오뱅크';

  useEffect(() => {
    const load = async () => {
      // 주문 내역
      const { data: orderData } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      setOrders((orderData as PaymentOrder[]) ?? []);

      // 활성 회원권
      const { data: memberData } = await supabase
        .from('memberships')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (memberData) setActiveMembership(memberData as Membership);

      setLoadingOrders(false);
    };
    load();
  }, [session.user.id]);

  const plan = PLANS.find(p => p.id === selectedPlan);
  const totalPrice = plan?.price ?? 0;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${BANK_NAME} ${BANK_ACCOUNT} ${BANK_HOLDER}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyWithAmount = async () => {
    const text = `${BANK_NAME} ${BANK_ACCOUNT} ${BANK_HOLDER} ${totalPrice.toLocaleString()}원`;
    await navigator.clipboard.writeText(text);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  const handleSubmitOrder = async () => {
    if (!plan) return alert('회원권을 선택해주세요.');
    setSubmitting(true);
    try {
      const { error } = await supabase.from('payment_orders').insert({
        user_id: session.user.id,
        items: `회원권 ${plan.label} (${plan.months}개월)`,
        total_amount: totalPrice,
        status: 'pending',
      });
      if (error) throw error;
      setPaymentResultModal({ 
        type: 'success', 
        message: '입금 확인 요청이 제출되었습니다!\n입금 후 관리자가 확인할 때까지 잠시 기다려주세요.\n(통상 24시간 이내 처리됩니다)' 
      });
      const { data } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      setOrders((data as PaymentOrder[]) ?? []);
      setSelectedPlan(null);
    } catch (err: any) {
      setPaymentResultModal({ type: 'error', message: '주문 실패: ' + err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const statusMap: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    pending:   { label: '입금 확인 대기', color: '#d97706', bg: '#fffbeb', icon: Clock },
    confirmed: { label: '입금 확인 완료', color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle2 },
    rejected:  { label: '입금 미확인',    color: '#dc2626', bg: '#fef2f2', icon: XCircle },
  };

  // 회원권 남은 일수
  const getRemainingDays = () => {
    if (!activeMembership) return 0;
    const end = new Date(activeMembership.end_date);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };
  const remainingDays = getRemainingDays();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '40px', height: '40px', borderRadius: '12px',
          border: '1px solid #e2e8f0', backgroundColor: '#ffffff',
          cursor: 'pointer',
        }}>
          <ArrowLeft size={18} color="#475569" />
        </button>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: isMobile ? '20px' : '24px', fontWeight: '800', color: '#0f172a' }}>
            회원권 구매
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            회원권을 구매하고 AI · 컨설턴트 서비스를 이용하세요
          </p>
        </div>
      </div>

      {/* 현재 회원권 상태 */}
      {activeMembership && (
        <div style={{
          padding: '20px 24px', borderRadius: '16px',
          background: remainingDays <= 5
            ? 'linear-gradient(135deg, #fef2f2, #fff1f2)'
            : 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
          border: `1px solid ${remainingDays <= 5 ? '#fecaca' : '#bfdbfe'}`,
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: remainingDays <= 5 ? '#dc2626' : 'linear-gradient(135deg, #2563eb, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Crown size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                회원권 이용 중
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {new Date(activeMembership.end_date).toLocaleDateString('ko-KR')}까지 · 남은 {remainingDays}일
              </div>
            </div>
          </div>
          {remainingDays <= 5 && (
            <div style={{
              padding: '8px 16px', borderRadius: '10px',
              backgroundColor: '#dc2626', color: '#ffffff',
              fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap',
            }}>
              ⚠️ {remainingDays}일 뒤 토큰 사용이 중지됩니다
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: '24px', alignItems: 'start' }}>

        {/* 좌측: 회원권 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 포함 혜택 안내 */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#7c3aed" /> 매월 제공되는 혜택
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#2563eb', marginBottom: '4px' }}>100개</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e40af' }}>AI 토큰</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>AI 첨삭 · 질문 생성 등</div>
              </div>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#ea580c', marginBottom: '4px' }}>30개</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#c2410c' }}>컨설턴트 토큰</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>전문 컨설턴트 심층 첨삭</div>
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Shield size={16} color="#16a34a" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#166534', marginBottom: '2px' }}>매월 자동 충전 &amp; 이월 (누적)</div>
                  <div style={{ fontSize: '12px', color: '#14532d', lineHeight: 1.5 }}>
                    3개월/6개월 플랜은 매월 결제일 기준 <strong style={{ color: '#065f46' }}>새로운 토큰이 기존 토큰에 추가로 누적(이월) 충전</strong>됩니다. (사용하지 않은 토큰은 소멸되지 않고 합산됩니다)
                  </div>
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>🧊</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e40af', marginBottom: '2px' }}>토큰 동결 및 100% 복구 정책</div>
                  <div style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.5 }}>
                    회원권이 만료되면 남은 토큰은 즉시 <strong style={{ color: '#172554' }}>동결(사용 중지)</strong> 처리됩니다.<br/>
                    단, 만료일 기준 <strong style={{ color: '#172554' }}>90일 이내에 재결제 시 동결된 기존 토큰이 모두 복구되어 새 토큰과 합산</strong>됩니다!
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 플랜 카드들 */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px',
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              회원권 선택
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {PLANS.map(p => {
                const isSelected = selectedPlan === p.id;
                return (
                  <div key={p.id} onClick={() => setSelectedPlan(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '20px', borderRadius: '16px', cursor: 'pointer',
                      border: `2px solid ${isSelected ? p.color : '#e2e8f0'}`,
                      backgroundColor: isSelected ? p.bg : '#ffffff',
                      transition: 'all 0.2s', position: 'relative',
                    }}>
                    {p.badge && (
                      <div style={{
                        position: 'absolute', top: '-1px', right: '16px',
                        padding: '3px 12px', borderRadius: '0 0 8px 8px',
                        backgroundColor: p.color, color: '#ffffff',
                        fontSize: '11px', fontWeight: '800',
                      }}>
                        {p.badge}
                      </div>
                    )}
                    {/* 라디오 */}
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      border: `2px solid ${isSelected ? p.color : '#cbd5e1'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s',
                    }}>
                      {isSelected && (
                        <div style={{
                          width: '12px', height: '12px', borderRadius: '50%',
                          backgroundColor: p.color,
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>{p.label}</span>
                        {p.discount && (
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#16a34a', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                            {p.discount} 할인
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{p.desc}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        월 {p.perMonth.toLocaleString()}원
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '18px', fontWeight: '900', color: p.color }}>
                        {p.price.toLocaleString()}원
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 대면 상담 정보 */}
            <h3 style={{ margin: '24px 0 16px 0', fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
              단기 컨설팅 예약
            </h3>
            <div style={{
              display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: '16px',
              padding: '20px', borderRadius: '16px',
              border: '2px solid #10b981', backgroundColor: '#ecfdf5',
              position: 'relative',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '17px', fontWeight: '800', color: '#047857' }}>대면 상담 (1회)</span>
                </div>
                <div style={{ fontSize: '13px', color: '#065f46', marginBottom: '2px' }}>70분 심층 컨설팅 · 당산역 인근 오프라인</div>
                <div style={{ fontSize: '12px', color: '#10b981', marginTop: '6px' }}>150,000원</div>
              </div>
              <div style={{ textAlign: isMobile ? 'left' : 'right', width: isMobile ? '100%' : 'auto' }}>
                <button
                  onClick={async () => {
                    if (!window.confirm('대면 상담(70분, 150,000원) 예약을 요청하시겠습니까?\n(어드민으로 알림이 전송되며, 입금이 확인되면 확정됩니다.)')) return;
                    try {
                      const { error } = await supabase.from('payment_orders').insert({
                        user_id: session.user.id,
                        items: '대면 상담 (70분)',
                        total_amount: 150000,
                        status: 'pending',
                      });
                      if (error) throw error;
                      await supabase.functions.invoke('send-notification', {
                        body: { action: 'admin_telegram', message: `🔔 <b>새 대면상담 요청 접수</b>\n\n결제 관리 탭에서 확인하세요.` }
                      });
                      alert('대면 상담 예약 요청이 접수되었습니다!\n입금 확인 후 컨설턴트가 일정 조율을 위해 연락드립니다.');
                      
                      // 결제내역 즉시 새로고침
                      const { data } = await supabase
                        .from('payment_orders')
                        .select('*')
                        .eq('user_id', session.user.id)
                        .order('created_at', { ascending: false });
                      if (data) setOrders(data as PaymentOrder[]);
                    } catch (err: any) {
                      alert('상담 예약 중 오류가 발생했습니다: ' + err.message);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    width: isMobile ? '100%' : 'auto', padding: '12px 20px', borderRadius: '10px',
                    backgroundColor: '#10b981', color: '#ffffff', border: 'none',
                    fontSize: '14px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#059669'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#10b981'}
                >
                  <Calendar size={16} /> 예약 요청
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 결제 정보 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: isMobile ? 'static' : 'sticky', top: '24px' }}>
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px',
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              결제 정보
            </h3>

            {/* 선택 요약 */}
            {!plan ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                회원권을 선택해주세요
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                  <span style={{ color: '#475569' }}>회원권 {plan.label}</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>{plan.price.toLocaleString()}원</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                  <span>기간</span>
                  <span>{plan.months}개월</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                  <span>월별 토큰</span>
                  <span>AI 100개 + 컨설턴트 30개</span>
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>총 결제 금액</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>{totalPrice.toLocaleString()}원</span>
                </div>
              </div>
            )}

            {/* 계좌 QR */}
            <div style={{
              marginTop: '16px', padding: '24px 20px', borderRadius: '14px',
              backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                입금 계좌 QR
              </div>

              <div style={{
                width: '180px', height: '180px', borderRadius: '16px',
                backgroundColor: '#ffffff', padding: '12px',
                border: '1px solid #e2e8f0', marginBottom: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`카카오뱅크 ${BANK_ACCOUNT} ${BANK_HOLDER}`)}&color=0f172a`}
                  alt="계좌 QR코드"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '16px' }}>
                QR을 스캔하면 계좌 정보를 확인할 수 있어요
              </div>

              {/* 복사 버튼 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <button onClick={handleCopy} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  width: '100%', padding: '11px', borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: copied ? '#16a34a' : '#ffffff',
                  color: copied ? '#ffffff' : '#475569',
                  fontSize: '13px', fontWeight: '700',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  {copied ? <><CheckCircle2 size={14} /> 복사 완료!</> : <><Copy size={14} /> 계좌번호 복사</>}
                </button>
                <button onClick={handleCopyWithAmount} disabled={!plan}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    width: '100%', padding: '11px', borderRadius: '10px',
                    border: 'none',
                    backgroundColor: copiedFull ? '#16a34a' : !plan ? '#e2e8f0' : '#0f172a',
                    color: !plan ? '#94a3b8' : '#ffffff',
                    fontSize: '13px', fontWeight: '700',
                    cursor: !plan ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}>
                  {copiedFull
                    ? <><CheckCircle2 size={14} /> 복사 완료!</>
                    : <><Copy size={14} /> 계좌번호 + 금액 복사{totalPrice > 0 ? ` (${totalPrice.toLocaleString()}원)` : ''}</>}
                </button>
              </div>
            </div>

            {/* 주문 제출 */}
            <button onClick={handleSubmitOrder} disabled={!plan || submitting}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '16px', borderRadius: '14px',
                border: 'none', marginTop: '16px',
                backgroundColor: !plan ? '#e2e8f0' : '#2563eb',
                color: !plan ? '#94a3b8' : '#ffffff',
                fontSize: '15px', fontWeight: '800', cursor: !plan ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1, transition: 'all 0.2s',
              }}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
              {submitting ? '처리 중...' : '입금 확인 요청하기'}
            </button>

            <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
              입금 후 버튼을 눌러주세요.<br />
              관리자 확인 후 회원권이 즉시 활성화됩니다.
            </p>
          </div>

          {/* 주문 내역 */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              주문 내역
            </h3>
            {loadingOrders ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                <Loader2 size={20} className="animate-spin" style={{ display: 'inline-block' }} />
              </div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '14px' }}>
                주문 내역이 없습니다
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {orders.map(o => {
                  const st = statusMap[o.status] ?? statusMap.pending;
                  const StIcon = st.icon;
                  return (
                    <div key={o.id} style={{
                      padding: '14px 16px', borderRadius: '12px',
                      border: '1px solid #f1f5f9', backgroundColor: '#fafafa',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{o.items}</span>
                        <span style={{
                          fontSize: '11px', fontWeight: '700', padding: '3px 8px',
                          borderRadius: '6px', backgroundColor: st.bg, color: st.color,
                          display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                          <StIcon size={12} /> {st.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                        <span>{new Date(o.created_at).toLocaleDateString('ko-KR')}</span>
                        <span style={{ fontWeight: '700', color: '#475569' }}>{o.total_amount.toLocaleString()}원</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 결제 요청 결과 모달 */}
      {paymentResultModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }} onClick={() => setPaymentResultModal(null)}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', maxWidth: '400px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: paymentResultModal.type === 'success' ? '#f0fdf4' : '#fef2f2', marginBottom: '16px' }}>
              {paymentResultModal.type === 'success' 
                ? <CheckCircle2 size={24} color="#16a34a" />
                : <XCircle size={24} color="#dc2626" />
              }
            </div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
              {paymentResultModal.type === 'success' ? '요청 완료' : '요청 실패'}
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '15px', color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {paymentResultModal.message}
            </p>
            <button onClick={() => setPaymentResultModal(null)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '15px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
