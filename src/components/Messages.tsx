// src/components/Messages.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { useBreakpoint } from '../hooks/useBreakpoint';
import {
  MessageCircle, Send, Lock, Eye, EyeOff,
  Settings, Check, X, Loader2, User, Users,
} from 'lucide-react';

interface MessagesProps {
  session: Session;
}

type Role = 'student' | 'parent';

interface Message {
  id: string;
  sender: string;       // 'consultant' | 'student' | 'parent'
  receiver_role: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// ── PIN 게이트 컴포넌트 ──────────────────────────────────────────────────────
function PinGateFull({ role, userId, hasPin, storedPin, onUnlock, onPinSaved }: {
  role: Role;
  userId: string;
  hasPin: boolean;
  storedPin: string;
  onUnlock: () => void;
  onPinSaved: (pin: string) => void;
}) {
  const { isMobile } = useBreakpoint();
  const [input, setInput]         = useState('');
  const [showInput, setShowInput] = useState(false);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const handleSubmit = async (pinVal?: any) => {
    const pin = typeof pinVal === 'string' ? pinVal : input;
    if (pin.length !== 4) { setError('4자리를 입력해 주세요'); return; }

    if (!hasPin) {
      // 최초 PIN 설정
      setSaving(true);
      const col = role === 'student' ? 'student_pin' : 'parent_pin';
      await supabase.from('message_pins').upsert({ user_id: userId, [col]: pin }, { onConflict: 'user_id' });
      onPinSaved(pin);
      setSaving(false);
      onUnlock();
    } else {
      // PIN 확인
      if (pin === storedPin) {
        onUnlock();
      } else {
        setError('PIN이 틀렸어요');
        setInput('');
        inputRef.current?.focus();
      }
    }
  };

  const label = role === 'student' ? '학생' : '부모님';
  const color = role === 'student' ? '#2563eb' : '#7c3aed';
  const bg    = role === 'student' ? '#eff6ff' : '#f5f3ff';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '0' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: isMobile ? '28px 20px' : '40px 48px', width: isMobile ? '100%' : '320px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

        <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Lock size={24} color={color} />
        </div>

        <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
          {label} 메세지함
        </h3>
        <p style={{ margin: '0 0 28px 0', fontSize: '13px', color: '#94a3b8' }}>
          {!hasPin ? `처음 사용이에요. ${label} PIN 4자리를 설정해 주세요.` : `${label} PIN 4자리를 입력해 주세요.`}
        </p>

        {/* PIN 입력 — 4칸 */}
        <div 
          onClick={() => inputRef.current?.focus()}
          style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px', cursor: 'pointer' }}
        >
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: isMobile ? '44px' : '52px', height: isMobile ? '44px' : '52px', borderRadius: '12px',
              border: `2px solid ${input.length > i ? color : '#e2e8f0'}`,
              backgroundColor: input.length > i ? bg : '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isMobile ? '18px' : '22px', fontWeight: '800', color,
              transition: 'all 0.15s',
            }}>
              {input.length > i ? (showInput ? input[i] : '●') : ''}
            </div>
          ))}
        </div>

        {/* 숨겨진 실제 input */}
        <input
          ref={inputRef}
          type="tel"
          maxLength={4}
          value={input}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
            setInput(v);
            setError('');
            if (v.length === 4) setTimeout(() => handleSubmit(v), 100);
          }}
          style={{ position: 'absolute', opacity: 0, left: '-9999px' }}
        />

        {/* 터치용 숫자패드 클릭 영역 */}
        <div onClick={() => inputRef.current?.focus()}
          style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '12px', fontSize: '13px', color: '#94a3b8' }}>
          탭해서 키보드 열기
        </div>

        {error && (
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#ef4444', fontWeight: '600' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowInput(!showInput)}
            style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            {showInput ? <EyeOff size={14} /> : <Eye size={14} />}
            {showInput ? '숨기기' : '보기'}
          </button>
          <button onClick={handleSubmit} disabled={input.length !== 4 || saving}
            style={{ flex: 2, padding: '11px', borderRadius: '10px', border: 'none', backgroundColor: input.length === 4 ? color : '#e2e8f0', color: input.length === 4 ? '#ffffff' : '#94a3b8', fontSize: '13px', fontWeight: '700', cursor: input.length === 4 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'all 0.15s' }}>
            {saving ? <Loader2 size={14} /> : <Check size={14} />}
            {!hasPin ? 'PIN 설정' : '입장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PIN 변경 모달 ───────────────────────────────────────────────────────────
function ChangePinModal({ role, userId, currentPin, onSaved, onClose }: {
  role: Role;
  userId: string;
  currentPin: string;
  onSaved: (newPin: string) => void;
  onClose: () => void;
}) {
  const { isMobile } = useBreakpoint();
  const [step, setStep]       = useState<'verify' | 'new'>('verify');
  const [input, setInput]     = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  const color = role === 'student' ? '#2563eb' : '#7c3aed';

  const handleVerify = () => {
    if (input === currentPin) { setStep('new'); setInput(''); setError(''); }
    else { setError('현재 PIN이 틀렸어요'); setInput(''); }
  };

  const handleSave = async () => {
    if (input.length !== 4) return;
    setSaving(true);
    const col = role === 'student' ? 'student_pin' : 'parent_pin';
    await supabase.from('message_pins').upsert({ user_id: userId, [col]: input }, { onConflict: 'user_id' });
    onSaved(input);
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: isMobile ? '20px 20px 0 0' : '20px', padding: '32px', width: isMobile ? '100%' : '320px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>PIN 변경</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
        </div>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
          {step === 'verify' ? '현재 PIN을 입력해 주세요' : '새 PIN 4자리를 입력해 주세요'}
        </p>
        <input
          type="password" inputMode="numeric" maxLength={4}
          value={input}
          onChange={e => { setInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
          placeholder="●●●●"
          style={{ width: '100%', padding: '14px', borderRadius: '10px', border: `1px solid ${error ? '#ef4444' : '#e2e8f0'}`, fontSize: '20px', textAlign: 'center', letterSpacing: '8px', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }}
          onKeyDown={e => { if (e.key === 'Enter') step === 'verify' ? handleVerify() : handleSave(); }}
          autoFocus
        />
        {error && <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#ef4444', fontWeight: '600' }}>{error}</p>}
        <button
          onClick={step === 'verify' ? handleVerify : handleSave}
          disabled={input.length !== 4 || saving}
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: input.length === 4 ? color : '#e2e8f0', color: input.length === 4 ? '#ffffff' : '#94a3b8', fontSize: '14px', fontWeight: '700', cursor: input.length === 4 ? 'pointer' : 'not-allowed', marginTop: '4px' }}>
          {saving ? '저장 중...' : step === 'verify' ? '확인' : '변경 완료'}
        </button>
      </div>
    </div>
  );
}

// ── 메세지 뷰 ────────────────────────────────────────────────────────────────
function MessageView({ role, userId, onLock }: {
  role: Role;
  userId: string;
  onLock: () => void;
}) {
  const { isMobile } = useBreakpoint();
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [showChangPin, setShowChangePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const color  = role === 'student' ? '#2563eb' : '#7c3aed';
  const label  = role === 'student' ? '학생' : '부모님';

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .or(`receiver_role.eq.${role},sender.eq.${role},sender.eq.consultant`)
      .order('created_at', { ascending: true });

    // 이 role에 해당하는 메세지만 필터
    const filtered = (data || []).filter(m =>
      m.sender === role ||
      m.sender === 'consultant' && m.receiver_role === role
    );
    setMessages(filtered);

    // 안 읽은 메세지 읽음 처리
    const unread = filtered.filter(m => m.sender === 'consultant' && !m.is_read).map(m => m.id);
    if (unread.length > 0) {
      await supabase.from('messages').update({ is_read: true }).in('id', unread);
    }
    setIsLoading(false);
  }, [userId, role]);

  useEffect(() => { load(); }, [load]);

  // 실시간 구독
  useEffect(() => {
    const channel = supabase.channel(`messages-${userId}-${role}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const m = payload.new as Message;
        if (m.sender === role || (m.sender === 'consultant' && m.receiver_role === role)) {
          setMessages(prev => {
            if (prev.find(msg => msg.id === m.id)) return prev;
            return [...prev, m];
          });
          if (m.sender === 'consultant') {
            supabase.from('messages').update({ is_read: true }).eq('id', m.id);
          }
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, role]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 현재 PIN 불러오기 (변경용)
  useEffect(() => {
    supabase.from('message_pins').select('student_pin, parent_pin').eq('user_id', userId).single()
      .then(({ data }) => {
        if (data) setCurrentPin(role === 'student' ? data.student_pin : data.parent_pin);
      });
  }, [userId, role]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const { data, error } = await supabase.from('messages').insert({
      user_id:       userId,
      sender:        role,
      receiver_role: role, // 학생/부모가 보내는 건 컨설턴트가 받음 (수신측은 어드민에서 처리)
      content:       input.trim(),
      is_read:       false,
    }).select().single();

    if (!error && data) {
      setMessages(prev => {
        if (prev.find(msg => msg.id === data.id)) return prev;
        return [...prev, data as Message];
      });
    }

    setInput('');
    setSending(false);
  };

  const formatTime = (d: string) => {
    const dt = new Date(d);
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  };
  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}년 ${dt.getMonth()+1}월 ${dt.getDate()}일`;
  };

  // 날짜 구분선 표시용
  const groupedMessages = messages.reduce((acc, msg, i) => {
    const date = msg.created_at.slice(0, 10);
    const prevDate = i > 0 ? messages[i-1].created_at.slice(0, 10) : null;
    if (date !== prevDate) acc.push({ type: 'date' as const, date, id: `date-${i}` });
    acc.push({ type: 'msg' as const, msg });
    return acc;
  }, [] as ({ type: 'date'; date: string; id: string } | { type: 'msg'; msg: Message })[]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 200px)' : 'calc(100vh - 280px)', minHeight: '500px' }}>

      {showChangPin && (
        <ChangePinModal
          role={role} userId={userId} currentPin={currentPin}
          onSaved={pin => setCurrentPin(pin)}
          onClose={() => setShowChangePin(false)}
        />
      )}

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '12px 14px' : '16px 20px', backgroundColor: '#ffffff', borderRadius: '14px 14px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: role === 'student' ? '#eff6ff' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {role === 'student' ? <User size={18} color={color} /> : <Users size={18} color={color} />}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{label} 메세지함</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>컨설턴트와 1:1 대화</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowChangePin(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            <Settings size={13} /> PIN 변경
          </button>
          <button onClick={onLock}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            <Lock size={13} /> 잠금
          </button>
        </div>
      </div>

      {/* 메세지 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none', borderBottom: 'none' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Loader2 size={24} color="#94a3b8" style={{ display: 'inline-block' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
            <MessageCircle size={36} strokeWidth={1.5} style={{ marginBottom: '12px' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>아직 메세지가 없어요</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>컨설턴트에게 먼저 말을 걸어보세요!</p>
          </div>
        ) : (
          groupedMessages.map(item => {
            if (item.type === 'date') {
              return (
                <div key={item.id} style={{ textAlign: 'center', margin: '16px 0 12px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontWeight: '600' }}>
                    {formatDate(item.date)}
                  </span>
                </div>
              );
            }
            const msg = item.msg;
            const isMe = msg.sender === role;
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                {!isMe && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', flexShrink: 0, alignSelf: 'flex-end' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>C</span>
                  </div>
                )}
                <div style={{ maxWidth: '68%' }}>
                  {!isMe && <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>컨설턴트</p>}
                  <div style={{
                    padding: '10px 14px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    backgroundColor: isMe ? color : '#ffffff',
                    color: isMe ? '#ffffff' : '#0f172a',
                    fontSize: '14px', lineHeight: 1.6, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    border: isMe ? 'none' : '1px solid #e2e8f0',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8', textAlign: isMe ? 'right' : 'left' }}>
                    {formatTime(msg.created_at)}
                    {isMe && <span style={{ marginLeft: '4px' }}>{msg.is_read ? '읽음' : ''}</span>}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={{ padding: '14px 16px', backgroundColor: '#ffffff', borderRadius: '0 0 14px 14px', border: '1px solid #e2e8f0', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!e.nativeEvent.isComposing) handleSend(); } }}
          placeholder="메세지를 입력하세요 (Enter로 전송)"
          rows={1}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: '100px', overflowY: 'auto' }}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 100) + 'px';
          }}
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}
          style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', backgroundColor: input.trim() ? color : '#e2e8f0', color: '#ffffff', cursor: input.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
          {sending ? <Loader2 size={16} /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

// ── 메인 Messages 컴포넌트 ────────────────────────────────────────────────────
export default function Messages({ session }: MessagesProps) {
  const { isMobile } = useBreakpoint();
  const [activeRole, setActiveRole]   = useState<Role>('student');
  const [pins, setPins]               = useState<{ student_pin: string; parent_pin: string } | null>(null);
  const [pinsLoading, setPinsLoading] = useState(true);
  const [unlocked, setUnlocked]       = useState<{ student: boolean; parent: boolean }>({ student: false, parent: false });

  // PIN 정보 로드
  const loadPins = useCallback(async () => {
    const { data } = await supabase
      .from('message_pins').select('student_pin, parent_pin')
      .eq('user_id', session.user.id).single();
    setPins(data ?? { student_pin: '', parent_pin: '' });
    setPinsLoading(false);
  }, [session.user.id]);

  useEffect(() => { loadPins(); }, [loadPins]);

  const unreadCount = (role: Role) => {
    // 실시간 배지는 생략 (메세지 뷰 진입 시 읽음 처리)
    return 0;
  };

  if (pinsLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Loader2 size={28} color="#94a3b8" style={{ display: 'inline-block' }} />
      </div>
    );
  }

  const currentPin = activeRole === 'student' ? (pins?.student_pin || '') : (pins?.parent_pin || '');
  const hasPin     = currentPin.length === 4;
  const isUnlocked = unlocked[activeRole];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

      {/* 탭 선택 */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        {(['student', 'parent'] as Role[]).map(role => {
          const isActive = activeRole === role;
          const color  = role === 'student' ? '#2563eb' : '#7c3aed';
          const bg     = role === 'student' ? '#eff6ff' : '#f5f3ff';
          const label  = role === 'student' ? '학생 메세지' : '부모님 메세지';
          const Icon   = role === 'student' ? User : Users;
          return (
            <button key={role} onClick={() => setActiveRole(role)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: isMobile ? '10px 14px' : '12px 20px', borderRadius: '12px', border: `2px solid ${isActive ? color : '#e2e8f0'}`,
              backgroundColor: isActive ? bg : '#ffffff',
              color: isActive ? color : '#64748b',
              fontSize: isMobile ? '13px' : '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <Icon size={16} />
              {label}
              {!unlocked[role] && (
                <Lock size={13} style={{ opacity: 0.5 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* PIN 게이트 or 메세지 뷰 */}
      {!isUnlocked ? (
        <PinGateFull
          role={activeRole}
          userId={session.user.id}
          hasPin={hasPin}
          storedPin={currentPin}
          onUnlock={() => setUnlocked(prev => ({ ...prev, [activeRole]: true }))}
          onPinSaved={pin => {
            setPins(prev => prev
              ? { ...prev, [`${activeRole}_pin`]: pin }
              : { student_pin: activeRole === 'student' ? pin : '', parent_pin: activeRole === 'parent' ? pin : '' }
            );
          }}
        />
      ) : (
        <MessageView
          role={activeRole}
          userId={session.user.id}
          onLock={() => setUnlocked(prev => ({ ...prev, [activeRole]: false }))}
        />
      )}
    </div>
  );
}