// src/components/AdminPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import ReactMarkdown from 'react-markdown';
import PromptManager from './PromptManager';
import {
  Compass, Loader2, Check, Inbox, Send, UserCheck, Mic,
  FileEdit, RefreshCw, ImagePlus, Users, ChevronRight,
  ChevronLeft, Pencil, Save, X, Image as ImageIcon,
  MessageCircle, User, Zap,
} from 'lucide-react';

interface AdminPageProps {
  session: Session;
}

// ── 공통 반응형 Hook ────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
}

// ── 기존 타입 ──────────────────────────────────────────────────────────────
interface RecordRequest {
  type: 'record';
  id: string; user_id: string; category: string;
  request_text: string; content_text: string | null; image_url: string | null;
  status: 'submitted' | 'completed'; feedback_result: string | null;
  created_at: string; userEmail?: string;
}
interface InterviewRequest {
  type: 'interview';
  id: string; user_id: string; question: string; answer_text: string;
  status: 'submitted' | 'completed'; feedback_content: string | null;
  revised_answer: string | null; created_at: string;
  pathTitle?: string; userEmail?: string;
}
type Request = RecordRequest | InterviewRequest;

// ── 학생관리 타입 ──────────────────────────────────────────────────────────
interface StudentProfile { id: string; name: string; email: string; created_at: string; }
interface IdentityDoc    { id: string; content: string; status: string; updated_at: string; }
interface InterviewQnA   {
  id: string; question: string; answer_text: string;
  feedback_content: string | null; revised_answer: string | null;
  status: string; created_at: string; path_title?: string;
}
interface SchoolRecordImg { id: string; file_name: string; public_url: string; created_at: string; }
interface AdminMessage    { id: string; sender: string; receiver_role: string; content: string; is_read: boolean; created_at: string; }

const formatDate = (d: string) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};

// ── 학생 상세 패널 ─────────────────────────────────────────────────────────
function StudentDetailPanel({ student, onBack }: { student: StudentProfile; onBack: () => void }) {
  const isMobile = useIsMobile();
  const [tab, setTab]             = useState<'identity' | 'interview' | 'schoolrecord' | 'messages'>('identity');
  const [isLoading, setIsLoading] = useState(true);

  // 정의서
  const [identityDoc, setIdentityDoc]         = useState<IdentityDoc | null>(null);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft]     = useState('');
  const [savingIdentity, setSavingIdentity]   = useState(false);

  // 면접 Q&A
  const [qnas, setQnas]           = useState<InterviewQnA[]>([]);
  const [selectedQna, setSelectedQna] = useState<InterviewQnA | null>(null);
  const [editingQna, setEditingQna]   = useState(false);
  const [qnaDraft, setQnaDraft]       = useState({ question: '', answer_text: '', revised_answer: '', feedback_content: '' });
  const [savingQna, setSavingQna]     = useState(false);

  // 생활기록부
  const [srImages, setSrImages]   = useState<SchoolRecordImg[]>([]);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // 메세지
  const [msgRole, setMsgRole]         = useState<'student' | 'parent'>('student');
  const [messages, setMessages]       = useState<AdminMessage[]>([]);
  const [msgInput, setMsgInput]       = useState('');
  const [msgSending, setMsgSending]   = useState(false);
  const [msgLoading, setMsgLoading]   = useState(false);
  const bottomMsgRef                  = React.useRef<HTMLDivElement>(null);

  useEffect(() => { loadAll(); }, [student.id]);

  useEffect(() => {
    if (tab === 'messages') loadMessages(msgRole);
  }, [tab, msgRole]);

  const loadAll = async () => {
    setIsLoading(true);
    // 정의서
    const { data: doc } = await supabase
      .from('identity_documents').select('id, content, status, updated_at')
      .eq('user_id', student.id).order('created_at', { ascending: false }).limit(1).single();
    if (doc) { setIdentityDoc(doc as IdentityDoc); setIdentityDraft(doc.content); }

    // 면접 Q&A
    const { data: qnaData } = await supabase
      .from('interview_qnas')
      .select('id, question, answer_text, feedback_content, revised_answer, status, created_at, path_id')
      .eq('user_id', student.id).order('created_at', { ascending: false });
    const pathIds = [...new Set((qnaData?.map((q: any) => q.path_id).filter(Boolean) || []))];
    const pathMap: Record<string, string> = {};
    if (pathIds.length > 0) {
      const { data: paths } = await supabase.from('career_paths').select('id, title').in('id', pathIds);
      paths?.forEach((p: any) => { pathMap[p.id] = p.title; });
    }
    setQnas((qnaData || []).map((q: any) => ({ ...q, path_title: pathMap[q.path_id] || '' })));

    // 생활기록부
    const { data: imgs } = await supabase
      .from('user_files').select('id, file_name, public_url, created_at')
      .eq('user_id', student.id).eq('file_type', 'school_record')
      .order('created_at', { ascending: true });
    setSrImages((imgs as SchoolRecordImg[]) ?? []);

    setIsLoading(false);
  };

  const saveIdentity = async () => {
    if (!identityDoc) return;
    setSavingIdentity(true);
    await supabase.from('identity_documents')
      .update({ content: identityDraft, updated_at: new Date().toISOString() })
      .eq('id', identityDoc.id);
    setIdentityDoc(prev => prev ? { ...prev, content: identityDraft } : prev);
    setEditingIdentity(false);
    setSavingIdentity(false);
  };

  const startEditQna = (qna: InterviewQnA) => {
    setSelectedQna(qna);
    setQnaDraft({ question: qna.question, answer_text: qna.answer_text, revised_answer: qna.revised_answer || '', feedback_content: qna.feedback_content || '' });
    setEditingQna(true);
  };

  const saveQna = async () => {
    if (!selectedQna) return;
    setSavingQna(true);
    await supabase.from('interview_qnas').update({
      question: qnaDraft.question, answer_text: qnaDraft.answer_text,
      revised_answer: qnaDraft.revised_answer || null, feedback_content: qnaDraft.feedback_content || null,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedQna.id);
    setQnas(prev => prev.map(q => q.id === selectedQna.id ? { ...q, ...qnaDraft } : q));
    setEditingQna(false);
    setSavingQna(false);
  };

  const loadMessages = async (role: 'student' | 'parent') => {
    setMsgLoading(true);
    const { data } = await supabase
      .from('messages').select('*')
      .eq('user_id', student.id)
      .or(`receiver_role.eq.${role},sender.eq.consultant`)
      .order('created_at', { ascending: true });
    const filtered = (data || []).filter((m: AdminMessage) =>
      m.sender === role || (m.sender === 'consultant' && m.receiver_role === role)
    );
    setMessages(filtered);
    const unread = filtered.filter((m: AdminMessage) => m.sender === role && !m.is_read).map((m: AdminMessage) => m.id);
    if (unread.length > 0) await supabase.from('messages').update({ is_read: true }).in('id', unread);
    setMsgLoading(false);
  };

  const sendMessage = async () => {
    if (!msgInput.trim()) return;
    setMsgSending(true);
    await supabase.from('messages').insert({
      user_id:       student.id,
      sender:        'consultant',
      receiver_role: msgRole,
      content:       msgInput.trim(),
      is_read:       false,
    });
    setMsgInput('');
    await loadMessages(msgRole);
    setMsgSending(false);
    setTimeout(() => bottomMsgRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const TAB = (active: boolean) => ({
    flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer', fontSize: isMobile ? '12px' : '13px', fontWeight: '700' as const,
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    backgroundColor: 'transparent', color: active ? '#2563eb' : '#94a3b8',
    whiteSpace: 'nowrap' as const, minWidth: isMobile ? '80px' : 'auto'
  });

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: isMobile ? '16px' : '24px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <ChevronLeft size={15} /> 목록
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: '800', color: '#0f172a' }}>{student.name || '이름 없음'}</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>{student.email}</p>
        </div>
      </div>

      {/* 탭 (모바일에서는 가로 스크롤 허용) */}
      <div style={{ display: 'flex', overflowX: 'auto', backgroundColor: '#ffffff', borderRadius: '14px 14px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
        <button style={TAB(tab === 'identity')}     onClick={() => setTab('identity')}>📋 정의서</button>
        <button style={TAB(tab === 'interview')}    onClick={() => setTab('interview')}>🎤 면접 Q&A</button>
        <button style={TAB(tab === 'schoolrecord')} onClick={() => setTab('schoolrecord')}>📚 생활기록부</button>
        <button style={TAB(tab === 'messages')}     onClick={() => setTab('messages')}>💬 메세지</button>
      </div>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '0 0 14px 14px', border: '1px solid #e2e8f0', borderTop: 'none', padding: isMobile ? '16px' : '28px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Loader2 size={28} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} />
          </div>
        ) : tab === 'identity' ? (
          /* ── 정의서 탭 ── */
          !identityDoc ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: '14px' }}>정의서가 없어요</div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>나의 정의서</span>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: '600' }}>{identityDoc.status}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {editingIdentity ? (
                    <>
                      <button onClick={() => setEditingIdentity(false)}
                        style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <X size={13} /> 취소
                      </button>
                      <button onClick={saveIdentity} disabled={savingIdentity}
                        style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: savingIdentity ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px', opacity: savingIdentity ? 0.7 : 1 }}>
                        {savingIdentity ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 저장
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditingIdentity(true)}
                      style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Pencil size={13} /> 편집
                    </button>
                  )}
                </div>
              </div>
              {editingIdentity ? (
                <textarea value={identityDraft} onChange={e => setIdentityDraft(e.target.value)}
                  style={{ width: '100%', minHeight: isMobile ? '300px' : '480px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.8, color: '#334155' }} />
              ) : (
                <div style={{ backgroundColor: '#f8fafc', padding: isMobile ? '16px' : '28px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.9, color: '#334155', border: '1px solid #f1f5f9', overflowX: 'auto' }}>
                  <div className="markdown-body"><ReactMarkdown>{identityDoc.content}</ReactMarkdown></div>
                </div>
              )}
              <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>마지막 수정: {formatDate(identityDoc.updated_at)}</p>
            </div>
          )

        ) : tab === 'interview' ? (
          /* ── 면접 Q&A 탭 ── */
          editingQna && selectedQna ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => setEditingQna(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  <ChevronLeft size={13} /> 목록
                </button>
                <button onClick={saveQna} disabled={savingQna}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: savingQna ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: savingQna ? 0.7 : 1 }}>
                  {savingQna ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 저장
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {([
                  { label: '면접 질문',      key: 'question',         placeholder: '질문을 입력하세요',  rows: 2 },
                  { label: '학생 답변',      key: 'answer_text',      placeholder: '학생 답변',          rows: 5 },
                  { label: '컨설턴트 코멘트', key: 'feedback_content', placeholder: '코멘트 (선택)',      rows: 4 },
                  { label: '업그레이드 답변', key: 'revised_answer',   placeholder: '개선된 답변 (선택)', rows: 5 },
                ] as const).map(({ label, key, placeholder, rows }) => (
                  <div key={key}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#475569' }}>{label}</label>
                    <textarea value={(qnaDraft as any)[key]} onChange={e => setQnaDraft(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder} rows={rows}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.7, color: '#334155' }} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            qnas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: '14px' }}>면접 Q&A가 없어요</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {qnas.map(qna => (
                  <div key={qna.id}
                    style={{ padding: isMobile ? '14px' : '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
                      <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                        {qna.path_title && (
                          <span style={{ fontSize: '11px', color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '5px', fontWeight: '600', marginBottom: '6px', display: 'inline-block' }}>{qna.path_title}</span>
                        )}
                        <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a', lineHeight: 1.5 }}>{qna.question}</p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5,
                          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                          {qna.answer_text}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center', alignSelf: isMobile ? 'flex-end' : 'flex-start' }}>
                        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: '700',
                          backgroundColor: qna.status === 'completed' ? '#dcfce7' : '#fef3c7',
                          color: qna.status === 'completed' ? '#16a34a' : '#d97706' }}>
                          {qna.status === 'completed' ? '완료' : '대기'}
                        </span>
                        <button onClick={() => startEditQna(qna)}
                          style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Pencil size={11} /> 편집
                        </button>
                      </div>
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>{formatDate(qna.created_at)}</p>
                  </div>
                ))}
              </div>
            )
          )

        ) : tab === 'messages' ? (
          /* ── 메세지 탭 ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['student', 'parent'] as const).map(role => {
                const isActive = msgRole === role;
                const color  = role === 'student' ? '#2563eb' : '#7c3aed';
                const bg     = role === 'student' ? '#eff6ff' : '#f5f3ff';
                return (
                  <button key={role} onClick={() => setMsgRole(role)} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '9px 18px', borderRadius: '10px',
                    border: `2px solid ${isActive ? color : '#e2e8f0'}`,
                    backgroundColor: isActive ? bg : '#ffffff',
                    color: isActive ? color : '#64748b',
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer', flex: isMobile ? 1 : 'none', justifyContent: 'center'
                  }}>
                    {role === 'student' ? <User size={14} /> : <Users size={14} />}
                    {role === 'student' ? '학생' : '부모님'}
                  </button>
                );
              })}
            </div>

            <div style={{ height: '380px', overflowY: 'auto', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', padding: '48px' }}><Loader2 size={22} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                  <MessageCircle size={32} strokeWidth={1.5} style={{ marginBottom: '10px' }} />
                  <p style={{ margin: 0, fontSize: '13px' }}>메세지가 없어요</p>
                </div>
              ) : messages.map(msg => {
                const isConsultant = msg.sender === 'consultant';
                const roleColor = msgRole === 'student' ? '#2563eb' : '#7c3aed';
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isConsultant ? 'flex-end' : 'flex-start' }}>
                    {!isConsultant && (
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: msgRole === 'student' ? '#eff6ff' : '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', flexShrink: 0, alignSelf: 'flex-end' }}>
                        {msgRole === 'student' ? <User size={13} color={roleColor} /> : <Users size={13} color={roleColor} />}
                      </div>
                    )}
                    <div style={{ maxWidth: isMobile ? '85%' : '65%' }}>
                      {!isConsultant && <p style={{ margin: '0 0 3px 0', fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{msgRole === 'student' ? '학생' : '부모님'}</p>}
                      <div style={{
                        padding: '9px 13px',
                        borderRadius: isConsultant ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        backgroundColor: isConsultant ? '#0f172a' : '#ffffff',
                        color: isConsultant ? '#ffffff' : '#0f172a',
                        fontSize: '14px', lineHeight: 1.6, wordBreak: 'break-word',
                        border: isConsultant ? 'none' : '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}>
                        {msg.content}
                      </div>
                      <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#94a3b8', textAlign: isConsultant ? 'right' : 'left' }}>
                        {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        {!isConsultant && !msg.is_read && <span style={{ marginLeft: '4px', color: '#f59e0b', fontWeight: '600' }}>· 미확인</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomMsgRef} />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={`${msgRole === 'student' ? '학생' : '부모님'}에게 메세지 전송`}
                rows={2}
                style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <button onClick={sendMessage} disabled={!msgInput.trim() || msgSending}
                style={{ padding: '11px 18px', borderRadius: '10px', border: 'none', backgroundColor: msgInput.trim() ? '#0f172a' : '#e2e8f0', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: msgInput.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, height: '44px' }}>
                {msgSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {isMobile ? '' : '전송'}
              </button>
            </div>
          </div>

        ) : tab === 'schoolrecord' ? (
          /* ── 생활기록부 탭 ── */
          <>
            {previewImg && (
              <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                onClick={() => setPreviewImg(null)}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <img src={previewImg} alt="생기부" style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain' }} />
                  <button onClick={() => setPreviewImg(null)}
                    style={{ position: 'absolute', top: '-40px', right: 0, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '6px 14px', color: '#ffffff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>닫기</button>
                </div>
              </div>
            )}
            {srImages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px dashed #cbd5e1' }}>
                <ImageIcon size={36} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '12px' }} />
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>학생이 아직 생기부를 업로드하지 않았어요</p>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>총 {srImages.length}장 · 클릭하면 크게 볼 수 있어요</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '120px' : '160px'}, 1fr))`, gap: '14px' }}>
                  {srImages.map((img, idx) => (
                    <div key={img.id} onClick={() => setPreviewImg(img.public_url)}
                      style={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer' }}>
                      <div style={{ position: 'relative', aspectRatio: '3/4', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
                        <img src={img.public_url} alt={img.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', bottom: '8px', left: '8px', backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: '5px', padding: '2px 8px', fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>{idx + 1}p</div>
                      </div>
                      <div style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.file_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── 메인 AdminPage ─────────────────────────────────────────────────────────
export default function AdminPage({ session }: AdminPageProps) {
  const isMobile = useIsMobile();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [requests, setRequests]         = useState<Request[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [filter, setFilter]             = useState<'all' | 'pending' | 'completed'>('pending');
  const [typeFilter, setTypeFilter]     = useState<'all' | 'record' | 'interview'>('all');

  const [feedbackText, setFeedbackText]         = useState('');
  const [revisedText, setRevisedText]           = useState('');
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [notifyStatus, setNotifyStatus]         = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  // 학생관리
  const [mainTab, setMainTab]               = useState<'requests' | 'students' | 'prompts'>('requests');
  const [students, setStudents]             = useState<StudentProfile[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('role').eq('id', session.user.id).single()
      .then(({ data }) => setIsAuthorized(data?.role === 'admin'));
  }, [session.user.id]);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const { data: records } = await supabase
        .from('record_feedbacks')
        .select('id, user_id, category, request_text, content_text, image_url, status, feedback_result, created_at')
        .in('status', ['submitted', 'completed'])
        .eq('advisor_type', 'human')
        .order('created_at', { ascending: false });

      const { data: interviews } = await supabase
        .from('interview_qnas')
        .select('id, user_id, question, answer_text, status, feedback_content, revised_answer, created_at, path_id')
        .in('status', ['submitted', 'completed'])
        .order('created_at', { ascending: false });

      const userIds = [...new Set([...(records?.map(r => r.user_id)||[]), ...(interviews?.map(i => i.user_id)||[])])];
      const nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', userIds);
        profiles?.forEach(p => { nameMap[p.id] = p.name || p.id.substring(0, 8); });
      }
      const pathIds = [...new Set((interviews?.map(i => i.path_id).filter(Boolean)||[]))];
      const pathMap: Record<string, string> = {};
      if (pathIds.length > 0) {
        const { data: paths } = await supabase.from('career_paths').select('id, title').in('id', pathIds);
        paths?.forEach(p => { pathMap[p.id] = p.title; });
      }

      const all: Request[] = [
        ...(records||[]).map(r => ({ ...r, type: 'record' as const, status: r.status as 'submitted'|'completed', userEmail: nameMap[r.user_id] })),
        ...(interviews||[]).map(i => ({ ...i, type: 'interview' as const, status: i.status as 'submitted'|'completed', pathTitle: pathMap[i.path_id], userEmail: nameMap[i.user_id] })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRequests(all);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStudents = async () => {
    setStudentsLoading(true);
    const { data } = await supabase
      .from('profiles').select('id, name, email, created_at, role')
      .or('role.eq.student,role.is.null')
      .order('created_at', { ascending: false });
    setStudents((data as StudentProfile[]) ?? []);
    setStudentsLoading(false);
  };

  useEffect(() => {
    if (isAuthorized) { fetchRequests(); fetchStudents(); }
  }, [isAuthorized]);

  const handleSelect = (req: Request) => {
    setSelectedId(req.id);
    setUploadedImageUrl(null);
    setNotifyStatus('idle');
    if (req.type === 'record') { setFeedbackText(req.feedback_result || ''); setRevisedText(''); }
    else { setRevisedText(req.revised_answer || ''); setFeedbackText(req.feedback_content || ''); }
  };

  const handleImageUpload = async (file: File) => {
    setIsImageUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `admin/${Date.now()}.${ext}`;
      await supabase.storage.from('record-images').upload(fileName, file);
      const { data: { publicUrl } } = supabase.storage.from('record-images').getPublicUrl(fileName);
      setUploadedImageUrl(publicUrl);
    } catch (err: any) { alert('이미지 업로드 실패: ' + err.message); }
    finally { setIsImageUploading(false); }
  };

  const handleSubmitFeedback = async () => {
    if (!selectedId) return;
    const req = requests.find(r => r.id === selectedId);
    if (!req) return;
    if (!feedbackText.trim() && !revisedText.trim()) { alert('첨삭 내용을 입력해 주세요.'); return; }

    setIsSubmitting(true);
    try {
      if (req.type === 'record') {
        const result = uploadedImageUrl ? feedbackText + `\n\n[첨삭 이미지]\n${uploadedImageUrl}` : feedbackText;
        const { error } = await supabase.from('record_feedbacks')
          .update({ feedback_result: result, status: 'completed', updated_at: new Date().toISOString() }).eq('id', selectedId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('interview_qnas')
          .update({ revised_answer: revisedText.trim()||null, feedback_content: feedbackText.trim()||null, status: 'completed', updated_at: new Date().toISOString() }).eq('id', selectedId);
        if (error) throw new Error(error.message);
      }
      setNotifyStatus('sending');
      const { error: notifyError } = await supabase.functions.invoke('send-notification', {
        body: req.type === 'record'
          ? { action: 'record_completed',    recordId: selectedId }
          : { action: 'interview_completed', qnaId:    selectedId },
      });
      setNotifyStatus(notifyError ? 'failed' : 'sent');
      setRequests(prev => prev.map(r =>
        r.id !== selectedId ? r :
        req.type === 'record'
          ? { ...r, status: 'completed' as const, feedback_result: feedbackText } as RecordRequest
          : { ...r, status: 'completed' as const, revised_answer: revisedText, feedback_content: feedbackText } as InterviewRequest
      ));
      alert(notifyError
        ? '✅ 첨삭 완료! (이메일 발송 실패 — Resend 설정을 확인해 주세요)'
        : '✅ 첨삭 완료! 학생에게 이메일이 발송됐어요.');
      if (isMobile) setSelectedId(null); // 모바일에서 전송 완료 후 목록으로
    } catch (err: any) { alert('오류: ' + err.message); }
    finally { setIsSubmitting(false); }
  };

  const filtered = requests.filter(r => {
    const s = filter === 'all' ? true : filter === 'pending' ? r.status === 'submitted' : r.status === 'completed';
    const t = typeFilter === 'all' ? true : typeFilter === r.type;
    return s && t;
  });
  const pendingCount = requests.filter(r => r.status === 'submitted').length;
  const selectedReq  = requests.find(r => r.id === selectedId);

  // 모바일 UI 분기 조건
  const showSidebar = !isMobile || (isMobile && !selectedId && !selectedStudent && mainTab !== 'prompts');
  const showContent = !isMobile || (isMobile && (selectedId || selectedStudent || mainTab === 'prompts'));

  if (isAuthorized === null) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Loader2 className="animate-spin" size={36} color="#2563eb" />
    </div>
  );
  if (!isAuthorized) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '18px', color: '#0f172a', fontWeight: '700', marginBottom: '8px' }}>접근 권한이 없습니다</p>
        <p style={{ fontSize: '14px', color: '#64748b' }}>어드민 계정으로 로그인해 주세요.</p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: '100vh', backgroundColor: '#f8fafc' }}>
      
      {/* ── 사이드바 (목록) ── */}
      <div style={{ 
        width: isMobile ? '100%' : '320px', 
        backgroundColor: '#ffffff', 
        borderRight: isMobile ? 'none' : '1px solid #e2e8f0', 
        display: showSidebar ? 'flex' : 'none', 
        flexDirection: 'column',
        height: isMobile ? '100vh' : 'auto'
      }}>
        {/* 헤더 */}
        <div style={{ padding: '28px 24px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Compass size={24} color="#2563eb" strokeWidth={2.5} />
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>Compass Admin</span>
          </div>
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
            <button onClick={() => setMainTab('requests')} style={{
              flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
              backgroundColor: mainTab === 'requests' ? '#ffffff' : 'transparent',
              color: mainTab === 'requests' ? '#0f172a' : '#94a3b8',
              boxShadow: mainTab === 'requests' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              📬 첨삭요청{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
            <button onClick={() => { setMainTab('students'); setSelectedStudent(null); }} style={{
              flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
              backgroundColor: mainTab === 'students' ? '#ffffff' : 'transparent',
              color: mainTab === 'students' ? '#0f172a' : '#94a3b8',
              boxShadow: mainTab === 'students' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              👤 학생관리
            </button>
            <button onClick={() => setMainTab('prompts')} style={{
              flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
              backgroundColor: mainTab === 'prompts' ? '#ffffff' : 'transparent',
              color: mainTab === 'prompts' ? '#0f172a' : '#94a3b8',
              boxShadow: mainTab === 'prompts' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              ⚡ 프롬프트
            </button>
          </div>
        </div>

        {mainTab === 'requests' ? (
          <>
            {/* 필터 */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {(['all', 'pending', 'completed'] as const).map(val => (
                  <button key={val} onClick={() => setFilter(val)} style={{
                    flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    backgroundColor: filter === val ? '#0f172a' : '#f1f5f9',
                    color: filter === val ? '#ffffff' : '#64748b',
                  }}>
                    {val === 'all' ? '전체' : val === 'pending' ? `대기중${pendingCount > 0 ? ` (${pendingCount})` : ''}` : '완료'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['all', 'record', 'interview'] as const).map(val => (
                  <button key={val} onClick={() => setTypeFilter(val)} style={{
                    flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    backgroundColor: typeFilter === val ? '#2563eb' : '#f1f5f9',
                    color: typeFilter === val ? '#ffffff' : '#64748b',
                  }}>
                    {val === 'all' ? '전체' : val === 'record' ? '생기부' : '면접'}
                  </button>
                ))}
              </div>
            </div>

            {/* 요청 목록 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <Loader2 className="animate-spin" size={24} color="#94a3b8" style={{ display: 'inline-block' }} />
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <Inbox size={32} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '10px' }} />
                  <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>요청이 없어요</p>
                </div>
              ) : filtered.map(req => (
                <div key={req.id} onClick={() => handleSelect(req)} style={{
                  padding: '16px 20px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  backgroundColor: selectedId === req.id && !isMobile ? '#eff6ff' : '#ffffff',
                  borderLeft: selectedId === req.id && !isMobile ? '3px solid #2563eb' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {req.type === 'record' ? <FileEdit size={14} color="#7c3aed" /> : <Mic size={14} color="#2563eb" />}
                      <span style={{ fontSize: '12px', fontWeight: '700', color: req.type === 'record' ? '#7c3aed' : '#2563eb' }}>
                        {req.type === 'record' ? req.category : '면접 Q&A'}
                      </span>
                    </div>
                    {req.status === 'submitted'
                      ? <span style={{ fontSize: '11px', fontWeight: '700', color: '#d97706', backgroundColor: '#fef3c7', padding: '2px 7px', borderRadius: '6px' }}>대기중</span>
                      : <span style={{ fontSize: '11px', fontWeight: '700', color: '#16a34a', backgroundColor: '#dcfce7', padding: '2px 7px', borderRadius: '6px' }}>완료</span>
                    }
                  </div>
                  <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#0f172a', fontWeight: '600', lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {req.type === 'record' ? req.request_text : req.question}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{req.userEmail}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatDate(req.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={fetchRequests} style={{
                width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff', color: '#64748b', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {studentsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Loader2 className="animate-spin" size={24} color="#94a3b8" style={{ display: 'inline-block' }} />
              </div>
            ) : students.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Users size={32} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '10px' }} />
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>학생이 없어요</p>
              </div>
            ) : students.map(s => (
              <div key={s.id} onClick={() => setSelectedStudent(s)} style={{
                padding: '14px 20px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: selectedStudent?.id === s.id && !isMobile ? '#eff6ff' : '#ffffff',
                borderLeft: selectedStudent?.id === s.id && !isMobile ? '3px solid #2563eb' : '3px solid transparent',
                transition: 'all 0.15s',
              }}>
                <div>
                  <p style={{ margin: '0 0 3px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{s.name || '이름 없음'}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{s.email}</p>
                </div>
                <ChevronRight size={15} color="#cbd5e1" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 메인 콘텐츠 (상세) ── */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: isMobile ? '20px' : '40px',
        display: showContent ? 'block' : 'none',
        height: isMobile ? '100vh' : 'auto',
        boxSizing: 'border-box'
      }}>
        {mainTab === 'prompts' ? (
          <>
            {isMobile && (
              <button onClick={() => setMainTab('requests')} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginBottom: '16px' }}>
                <ChevronLeft size={15} /> 목록으로
              </button>
            )}
            <PromptManager />
          </>
        ) : mainTab === 'students' ? (
          !selectedStudent ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
              <Users size={48} strokeWidth={1.5} style={{ marginBottom: '16px' }} />
              <p style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '600' }}>학생을 선택해 주세요</p>
              <p style={{ margin: 0, fontSize: '13px' }}>정의서, 면접 Q&A, 생기부를 직접 확인·수정할 수 있어요</p>
            </div>
          ) : (
            <StudentDetailPanel student={selectedStudent} onBack={() => setSelectedStudent(null)} />
          )
        ) : (
          !selectedReq ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
              <Inbox size={48} strokeWidth={1.5} style={{ marginBottom: '16px' }} />
              <p style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>왼쪽에서 요청을 선택해 주세요</p>
            </div>
          ) : (
            <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px' }}>
              
              {isMobile && (
                <button onClick={() => setSelectedId(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer', width: 'fit-content' }}>
                  <ChevronLeft size={15} /> 목록으로
                </button>
              )}

              <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '28px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedReq.type === 'record'
                      ? <><FileEdit size={18} color="#7c3aed" /><span style={{ fontSize: '16px', fontWeight: '800', color: '#7c3aed' }}>생기부 첨삭</span><span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>— {selectedReq.category}</span></>
                      : <><Mic size={18} color="#2563eb" /><span style={{ fontSize: '16px', fontWeight: '800', color: '#2563eb' }}>면접 Q&A 첨삭</span>{selectedReq.pathTitle && <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>— {selectedReq.pathTitle}</span>}</>
                    }
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                    <UserCheck size={14} />
                    <span>{selectedReq.userEmail}</span>
                    <span style={{ color: '#cbd5e1' }}>·</span>
                    <span>{formatDate(selectedReq.created_at).split(' ')[0]}</span>
                  </div>
                </div>

                {selectedReq.type === 'record' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>요청 내용</p>
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', fontSize: '14px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedReq.request_text}</div>
                    </div>
                    {selectedReq.content_text && (
                      <div>
                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>참고 자료</p>
                        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', fontSize: '14px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedReq.content_text}</div>
                      </div>
                    )}
                    {selectedReq.image_url && (
                      <div>
                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>첨부 이미지</p>
                        <img src={selectedReq.image_url} alt="첨부" style={{ maxWidth: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>면접 질문</p>
                      <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '10px', fontSize: '15px', color: '#1e3a8a', fontWeight: '600', lineHeight: 1.6 }}>{selectedReq.question}</div>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>학생 답변</p>
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', fontSize: '14px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedReq.answer_text}</div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '28px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                  {selectedReq.status === 'completed' ? '작성된 첨삭 내용' : '첨삭 작성'}
                </p>

                {selectedReq.type === 'interview' && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                      업그레이드 답변 <span style={{ color: '#94a3b8', fontWeight: '500' }}>(선택)</span>
                    </label>
                    <textarea value={revisedText} onChange={e => setRevisedText(e.target.value)}
                      placeholder="학생 답변을 개선한 완성형 버전을 작성해 주세요."
                      readOnly={selectedReq.status === 'completed'}
                      style={{ width: '100%', minHeight: '140px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.7, backgroundColor: selectedReq.status === 'completed' ? '#f8fafc' : '#ffffff', color: '#0f172a' }} />
                  </div>
                )}

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                    {selectedReq.type === 'record' ? '첨삭 결과' : '컨설턴트 코멘트'}
                  </label>
                  <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                    placeholder={selectedReq.type === 'record' ? '[첨삭된 문장]\n\n[개선 포인트]\n' : '잘한 점, 개선할 점, 추가 조언을 작성해 주세요.'}
                    readOnly={selectedReq.status === 'completed'}
                    style={{ width: '100%', minHeight: '220px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.7, backgroundColor: selectedReq.status === 'completed' ? '#f8fafc' : '#ffffff', color: '#0f172a' }} />
                </div>

                {selectedReq.type === 'record' && selectedReq.status !== 'completed' && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                      이미지 첨부 <span style={{ color: '#94a3b8', fontWeight: '500' }}>(선택)</span>
                    </label>
                    {uploadedImageUrl ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={uploadedImageUrl} alt="첨부" style={{ maxWidth: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                        <button onClick={() => setUploadedImageUrl(null)} style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(0,0,0,0.5)', color: '#ffffff', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
                      </div>
                    ) : (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>
                        {isImageUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                        {isImageUploading ? '업로드 중...' : '이미지 첨부'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                      </label>
                    )}
                  </div>
                )}

                {selectedReq.status !== 'completed' ? (
                  <button onClick={handleSubmitFeedback} disabled={isSubmitting}
                    style={{ width: '100%', padding: '16px', borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '15px', fontWeight: '700', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    {isSubmitting
                      ? <><Loader2 size={18} className="animate-spin" />{notifyStatus === 'sending' ? ' 이메일 발송 중...' : ' 처리 중...'}</>
                      : <><Send size={18} /> {isMobile ? '첨삭 완료 및 발송' : '첨삭 완료 — 학생에게 이메일 발송'}</>
                    }
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <Check size={18} color="#16a34a" />
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#166534' }}>첨삭 완료 — 이메일 발송됨</span>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}