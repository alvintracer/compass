// src/components/Payment.tsx
import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  ShoppingCart, Copy, Check, Package, Zap, UserCheck,
  ArrowLeft, Loader2, Clock, CheckCircle2, XCircle,
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

const PRODUCTS = [
  {
    id: 'ai_100',
    category: 'individual',
    label: 'AI 토큰 100개',
    desc: 'AI 첨삭 · 면접 질문 생성 등에 사용',
    price: 100000,
    icon: Zap,
    color: '#2563eb',
    bg: '#eff6ff',
    tokens: { ai: 100, human: 0 },
  },
  {
    id: 'human_10',
    category: 'individual',
    label: '컨설턴트 토큰 10개',
    desc: '전문 컨설턴트의 심층 첨삭에 사용',
    price: 100000,
    icon: UserCheck,
    color: '#ea580c',
    bg: '#fff7ed',
    tokens: { ai: 0, human: 10 },
  },
  {
    id: 'package_special',
    category: 'package',
    label: '특별 패키지',
    desc: 'AI 토큰 200개 + 컨설턴트 토큰 30개',
    price: 300000,
    icon: Package,
    color: '#7c3aed',
    bg: '#f5f3ff',
    tokens: { ai: 200, human: 30 },
    badge: '인기',
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const BANK_ACCOUNT = '3333215714526';
  const BANK_HOLDER = '한태우';
  const BANK_NAME = '카카오뱅크';

  // 주문 내역 불러오기
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      setOrders((data as PaymentOrder[]) ?? []);
      setLoadingOrders(false);
    };
    load();
  }, [session.user.id]);

  const toggleProduct = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalPrice = PRODUCTS.filter(p => selected.has(p.id)).reduce((s, p) => s + p.price, 0);

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
    if (selected.size === 0) return alert('상품을 선택해주세요.');
    setSubmitting(true);
    try {
      const selectedItems = PRODUCTS.filter(p => selected.has(p.id));
      const itemsLabel = selectedItems.map(p => p.label).join(', ');
      const { error } = await supabase.from('payment_orders').insert({
        user_id: session.user.id,
        items: itemsLabel,
        total_amount: totalPrice,
        status: 'pending',
      });
      if (error) throw error;
      alert('입금 확인 요청이 제출되었습니다!\n입금 후 관리자 확인까지 잠시 기다려주세요.');
      // 주문 내역 새로고침
      const { data } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      setOrders((data as PaymentOrder[]) ?? []);
      setSelected(new Set());
    } catch (err: any) {
      alert('주문 실패: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusMap: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    pending:   { label: '입금 확인 대기', color: '#d97706', bg: '#fffbeb', icon: Clock },
    confirmed: { label: '입금 확인 완료', color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle2 },
    rejected:  { label: '입금 미확인',    color: '#dc2626', bg: '#fef2f2', icon: XCircle },
  };

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
            토큰 구매
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            원하는 상품을 선택하고 입금해주세요
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: '24px', alignItems: 'start' }}>

        {/* 좌측: 상품 선택 영역 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 개별 구매 */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px',
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              개별 구매
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {PRODUCTS.filter(p => p.category === 'individual').map(p => {
                const Icon = p.icon;
                const isChecked = selected.has(p.id);
                return (
                  <div key={p.id} onClick={() => toggleProduct(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '18px 20px', borderRadius: '14px', cursor: 'pointer',
                      border: `2px solid ${isChecked ? p.color : '#e2e8f0'}`,
                      backgroundColor: isChecked ? p.bg : '#ffffff',
                      transition: 'all 0.2s',
                    }}>
                    {/* 체크박스 */}
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '8px',
                      border: `2px solid ${isChecked ? p.color : '#cbd5e1'}`,
                      backgroundColor: isChecked ? p.color : '#ffffff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', flexShrink: 0,
                    }}>
                      {isChecked && <Check size={14} color="#fff" strokeWidth={3} />}
                    </div>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      backgroundColor: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={22} color={p.color} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>{p.label}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{p.desc}</div>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: p.color, whiteSpace: 'nowrap' }}>
                      {p.price.toLocaleString()}원
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 특별 패키지 */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '16px', right: '16px',
              padding: '4px 12px', borderRadius: '100px',
              backgroundColor: '#7c3aed', color: '#ffffff',
              fontSize: '11px', fontWeight: '8s00',
            }}>
              BEST
            </div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              특별 패키지
            </h3>
            {PRODUCTS.filter(p => p.category === 'package').map(p => {
              const Icon = p.icon;
              const isChecked = selected.has(p.id);
              return (
                <div key={p.id} onClick={() => toggleProduct(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '20px', borderRadius: '14px', cursor: 'pointer',
                    border: `2px solid ${isChecked ? p.color : '#e2e8f0'}`,
                    backgroundColor: isChecked ? p.bg : '#faf5ff',
                    transition: 'all 0.2s',
                  }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '8px',
                    border: `2px solid ${isChecked ? p.color : '#cbd5e1'}`,
                    backgroundColor: isChecked ? p.color : '#ffffff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s', flexShrink: 0,
                  }}>
                    {isChecked && <Check size={14} color="#fff" strokeWidth={3} />}
                  </div>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    backgroundColor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={22} color={p.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>{p.label}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{p.desc}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: '700' }}>AI 200개</span>
                      <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#fff7ed', color: '#ea580c', fontWeight: '700' }}>컨설턴트 30개</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: p.color }}>{p.price.toLocaleString()}원</div>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '700', marginTop: '2px' }}>40% 할인</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측: 결제 정보 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: isMobile ? 'static' : 'sticky', top: '24px' }}>
          {/* 결제 금액 */}
          <div style={{
            backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
            padding: isMobile ? '20px' : '28px',
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
              결제 정보
            </h3>

            {/* 선택 요약 */}
            {selected.size === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                상품을 선택해주세요
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {PRODUCTS.filter(p => selected.has(p.id)).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: '#475569' }}>{p.label}</span>
                    <span style={{ fontWeight: '700', color: '#0f172a' }}>{p.price.toLocaleString()}원</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>총 결제 금액</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>{totalPrice.toLocaleString()}원</span>
                </div>
              </div>
            )}

            {/* 계좌 QR + 복사 버튼 */}
            <div style={{
              marginTop: '16px', padding: '24px 20px', borderRadius: '14px',
              backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                입금 계좌 QR
              </div>

              {/* QR 코드 */}
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

              {/* 복사 버튼 2개 */}
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
                <button onClick={handleCopyWithAmount} disabled={selected.size === 0}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    width: '100%', padding: '11px', borderRadius: '10px',
                    border: 'none',
                    backgroundColor: copiedFull ? '#16a34a' : selected.size === 0 ? '#e2e8f0' : '#0f172a',
                    color: selected.size === 0 ? '#94a3b8' : '#ffffff',
                    fontSize: '13px', fontWeight: '700',
                    cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}>
                  {copiedFull
                    ? <><CheckCircle2 size={14} /> 복사 완료!</>
                    : <><Copy size={14} /> 계좌번호 + 금액 복사{totalPrice > 0 ? ` (${totalPrice.toLocaleString()}원)` : ''}</>}
                </button>
              </div>
            </div>

            {/* 주문 제출 */}
            <button onClick={handleSubmitOrder} disabled={selected.size === 0 || submitting}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '16px', borderRadius: '14px',
                border: 'none', marginTop: '16px',
                backgroundColor: selected.size === 0 ? '#e2e8f0' : '#2563eb',
                color: selected.size === 0 ? '#94a3b8' : '#ffffff',
                fontSize: '15px', fontWeight: '800', cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1, transition: 'all 0.2s',
              }}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
              {submitting ? '처리 중...' : '입금 확인 요청하기'}
            </button>

            <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
              입금 후 버튼을 눌러주세요.<br />
              관리자 확인까지 최대 24시간 소요될 수 있습니다.
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
    </div>
  );
}
