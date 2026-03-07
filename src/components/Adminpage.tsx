// src/components/AdminPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import ReactMarkdown from 'react-markdown';
import PromptManager from './PromptManager';
import AdmissionUploader from './AdmissionUploader';
import AdmissionViewer from './AdmissionViewer';
import {
  Compass, Loader2, Check, Inbox, Send, UserCheck, Mic,
  FileEdit, RefreshCw, ImagePlus, Users, ChevronRight,
  ChevronLeft, Pencil, Save, X, Image as ImageIcon,
  MessageCircle, User, Zap, Plus, Minus, DollarSign,
  Clock, CheckCircle2,
} from 'lucide-react';

interface AdminPageProps {
  session: Session;
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
interface StudentProfile { id: string; name: string; email: string; created_at: string; ai_tokens?: number; human_tokens?: number; }
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
  const [tab, setTab]             = useState<'identity' | 'interview' | 'schoolrecord' | 'messages' | 'progress' | 'tasks'>('identity');
  const [isLoading, setIsLoading] = useState(true);

  // 토큰
  const [aiTokens, setAiTokens]       = useState<number>(student.ai_tokens ?? 0);
  const [humanTokens, setHumanTokens] = useState<number>(student.human_tokens ?? 0);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenInput, setTokenInput]   = useState({ ai: '', human: '' });

  const adjustToken = async (type: 'ai' | 'human', delta: number) => {
    const current = type === 'ai' ? aiTokens : humanTokens;
    const next = Math.max(0, current + delta);
    setTokenSaving(true);
    const field = type === 'ai' ? 'ai_tokens' : 'human_tokens';
    await supabase.from('profiles').update({ [field]: next }).eq('id', student.id);
    if (type === 'ai') setAiTokens(next); else setHumanTokens(next);
    setTokenSaving(false);
  };

  const setTokenDirect = async (type: 'ai' | 'human') => {
    const val = parseInt(type === 'ai' ? tokenInput.ai : tokenInput.human, 10);
    if (isNaN(val) || val < 0) return;
    setTokenSaving(true);
    const field = type === 'ai' ? 'ai_tokens' : 'human_tokens';
    await supabase.from('profiles').update({ [field]: val }).eq('id', student.id);
    if (type === 'ai') { setAiTokens(val); setTokenInput(p => ({ ...p, ai: '' })); }
    else { setHumanTokens(val); setTokenInput(p => ({ ...p, human: '' })); }
    setTokenSaving(false);
  };

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

  // 성취도
  interface WeekGoal { id: string; week_start: string; qna_target: number; qna_done: number; research_target: number; research_done: number; mock_target: number; mock_done: number; }
  interface CTask { id: string; title: string; description: string | null; due_date: string | null; is_completed: boolean; created_at: string; }
  const [weeklyGoal, setWeeklyGoal] = useState<WeekGoal | null>(null);
  const [totalQna, setTotalQna] = useState(0);
  const [totalResearch, setTotalResearch] = useState(0);
  const [totalMock, setTotalMock] = useState(0);
  const [customTasks, setCustomTasks] = useState<CTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);

  useEffect(() => { loadAll(); }, [student.id]);

  // 메세지 탭 전환 시 로드
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

    // 성취도 데이터
    await loadProgressData();

    setIsLoading(false);
  };

  const loadProgressData = async () => {
    // Q&A 완성 수 (500자+)
    const { data: qnaData } = await supabase.from('interview_qnas').select('id, answer_text').eq('user_id', student.id);
    setTotalQna((qnaData || []).filter(q => (q.answer_text || '').length >= 500).length);

    // 탐구 과제 (1000자+)
    const { data: resData } = await supabase.from('research_tasks').select('id, content_text').eq('user_id', student.id);
    setTotalResearch((resData || []).filter(r => (r.content_text || '').length >= 1000).length);

    // 모의면접
    const { count: mockCnt } = await supabase.from('mock_interview_sessions').select('id', { count: 'exact', head: true }).eq('user_id', student.id);
    setTotalMock(mockCnt || 0);

    // 이번 주 목표
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diff);
    const weekStart = monday.toISOString().split('T')[0];
    const { data: wg } = await supabase.from('weekly_goals').select('*').eq('user_id', student.id).eq('week_start', weekStart).single();
    setWeeklyGoal(wg as WeekGoal | null);

    // 상시 과제
    const { data: ct } = await supabase.from('custom_tasks').select('*').eq('user_id', student.id).order('created_at', { ascending: false });
    setCustomTasks((ct as CTask[]) || []);
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return alert('과제 제목을 입력해주세요.');
    setTaskSaving(true);
    const { error } = await supabase.from('custom_tasks').insert({
      user_id: student.id,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || null,
      due_date: newTaskDue || null,
      assigned_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) alert('과제 저장 실패: ' + error.message);
    else {
      setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskDue('');
      await loadProgressData();
      alert('✅ 과제가 출제되었습니다!');
    }
    setTaskSaving(false);
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('이 과제를 삭제하시겠습니까?')) return;
    await supabase.from('custom_tasks').delete().eq('id', id);
    setCustomTasks(prev => prev.filter(t => t.id !== id));
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
    // 안 읽은 학생/부모 메세지 읽음 처리
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
    flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const,
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    backgroundColor: 'transparent', color: active ? '#2563eb' : '#94a3b8',
  });

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>

      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <ChevronLeft size={15} /> 목록으로
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{student.name || '이름 없음'}</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>{student.email}</p>
        </div>
      </div>

      {/* 토큰 관리 카드 */}
      <div style={{ marginBottom: '20px', padding: '18px 22px', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Zap size={15} color="#f59e0b" />
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>토큰 관리</span>
          {tokenSaving && <Loader2 size={13} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} />}
        </div>
        <div style={{ display: 'flex', gap: '12px', flex: 1, flexWrap: 'wrap' }}>

          {/* AI 토큰 */}
          <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#2563eb' }}>⚡ AI 토큰</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button onClick={() => adjustToken('ai', -1)} disabled={tokenSaving || aiTokens <= 0}
                  style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: aiTokens <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: aiTokens <= 0 ? 0.4 : 1 }}>
                  <Minus size={11} color="#475569" />
                </button>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#2563eb', minWidth: '32px', textAlign: 'center' }}>{aiTokens}</span>
                <button onClick={() => adjustToken('ai', 1)} disabled={tokenSaving}
                  style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={11} color="#475569" />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[5, 10, 30].map(n => (
                <button key={n} onClick={() => adjustToken('ai', n)} disabled={tokenSaving}
                  style={{ flex: 1, padding: '5px 0', borderRadius: '6px', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  +{n}
                </button>
              ))}
              <input type="number" value={tokenInput.ai} onChange={e => setTokenInput(p => ({ ...p, ai: e.target.value }))}
                placeholder="직접" min="0"
                style={{ width: '48px', padding: '5px 4px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', textAlign: 'center' }}
                onKeyDown={e => e.key === 'Enter' && setTokenDirect('ai')} />
              <button onClick={() => setTokenDirect('ai')} disabled={!tokenInput.ai || tokenSaving}
                style={{ padding: '5px 8px', borderRadius: '6px', border: 'none', backgroundColor: tokenInput.ai ? '#2563eb' : '#e2e8f0', color: '#fff', fontSize: '11px', fontWeight: '700', cursor: tokenInput.ai ? 'pointer' : 'not-allowed' }}>
                설정
              </button>
            </div>
          </div>

          <div style={{ width: '1px', backgroundColor: '#e2e8f0', alignSelf: 'stretch', display: 'block' }} />

          {/* 휴먼 토큰 */}
          <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#ea580c' }}>👤 휴먼 토큰</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button onClick={() => adjustToken('human', -1)} disabled={tokenSaving || humanTokens <= 0}
                  style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: humanTokens <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: humanTokens <= 0 ? 0.4 : 1 }}>
                  <Minus size={11} color="#475569" />
                </button>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#ea580c', minWidth: '32px', textAlign: 'center' }}>{humanTokens}</span>
                <button onClick={() => adjustToken('human', 1)} disabled={tokenSaving}
                  style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={11} color="#475569" />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 3, 5].map(n => (
                <button key={n} onClick={() => adjustToken('human', n)} disabled={tokenSaving}
                  style={{ flex: 1, padding: '5px 0', borderRadius: '6px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed', color: '#ea580c', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  +{n}
                </button>
              ))}
              <input type="number" value={tokenInput.human} onChange={e => setTokenInput(p => ({ ...p, human: e.target.value }))}
                placeholder="직접" min="0"
                style={{ width: '48px', padding: '5px 4px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', outline: 'none', textAlign: 'center' }}
                onKeyDown={e => e.key === 'Enter' && setTokenDirect('human')} />
              <button onClick={() => setTokenDirect('human')} disabled={!tokenInput.human || tokenSaving}
                style={{ padding: '5px 8px', borderRadius: '6px', border: 'none', backgroundColor: tokenInput.human ? '#ea580c' : '#e2e8f0', color: '#fff', fontSize: '11px', fontWeight: '700', cursor: tokenInput.human ? 'pointer' : 'not-allowed' }}>
                설정
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', backgroundColor: '#ffffff', borderRadius: '14px 14px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none', overflowX: 'auto' }}>
        <button style={TAB(tab === 'identity')}     onClick={() => setTab('identity')}>📋 정의서</button>
        <button style={TAB(tab === 'interview')}    onClick={() => setTab('interview')}>🎤 면접</button>
        <button style={TAB(tab === 'progress')}     onClick={() => { setTab('progress'); loadProgressData(); }}>📊 성취도</button>
        <button style={TAB(tab === 'tasks')}         onClick={() => { setTab('tasks'); loadProgressData(); }}>📋 과제</button>
        <button style={TAB(tab === 'schoolrecord')} onClick={() => setTab('schoolrecord')}>📚 생기부</button>
        <button style={TAB(tab === 'messages')}     onClick={() => setTab('messages')}>💬 메세지</button>
      </div>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '0 0 14px 14px', border: '1px solid #e2e8f0', borderTop: 'none', padding: '28px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Loader2 size={28} color="#94a3b8" style={{ display: 'inline-block' }} />
          </div>
        ) : tab === 'identity' ? (

          // ── 정의서 탭 ────────────────────────────────────────────────────
          !identityDoc ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: '14px' }}>정의서가 없어요</div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
                        {savingIdentity ? <Loader2 size={13} /> : <Save size={13} />} 저장
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
                  style={{ width: '100%', minHeight: '480px', padding: '20px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.8, color: '#334155' }} />
              ) : (
                <div style={{ backgroundColor: '#f8fafc', padding: '28px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.9, color: '#334155', border: '1px solid #f1f5f9' }}>
                  <div className="markdown-body"><ReactMarkdown>{identityDoc.content}</ReactMarkdown></div>
                </div>
              )}
              <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>마지막 수정: {formatDate(identityDoc.updated_at)}</p>
            </div>
          )

        ) : tab === 'interview' ? (

          // ── 면접 Q&A 탭 ─────────────────────────────────────────────────
          editingQna && selectedQna ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => setEditingQna(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  <ChevronLeft size={13} /> 목록
                </button>
                <button onClick={saveQna} disabled={savingQna}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: savingQna ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: savingQna ? 0.7 : 1 }}>
                  {savingQna ? <Loader2 size={13} /> : <Save size={13} />} 저장
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
                    style={{ padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {qna.path_title && (
                          <span style={{ fontSize: '11px', color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '5px', fontWeight: '600', marginBottom: '6px', display: 'inline-block' }}>{qna.path_title}</span>
                        )}
                        <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a', lineHeight: 1.5 }}>{qna.question}</p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5,
                          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                          {qna.answer_text}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
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

        ) : (

          // ── 생활기록부 탭 ────────────────────────────────────────────────
          tab === 'messages' ? (

          // ── 메세지 탭 ────────────────────────────────────────────────────
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 학생 / 부모 탭 */}
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
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  }}>
                    {role === 'student' ? <User size={14} /> : <Users size={14} />}
                    {role === 'student' ? '학생' : '부모님'}
                  </button>
                );
              })}
            </div>

            {/* 메세지 목록 */}
            <div style={{ height: '380px', overflowY: 'auto', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', padding: '48px' }}><Loader2 size={22} color="#94a3b8" style={{ display: 'inline-block' }} /></div>
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
                    <div style={{ maxWidth: '65%' }}>
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

            {/* 입력창 */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={`${msgRole === 'student' ? '학생' : '부모님'}에게 메세지 전송 (Enter로 전송)`}
                rows={2}
                style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <button onClick={sendMessage} disabled={!msgInput.trim() || msgSending}
                style={{ padding: '11px 18px', borderRadius: '10px', border: 'none', backgroundColor: msgInput.trim() ? '#0f172a' : '#e2e8f0', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: msgInput.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, transition: 'all 0.15s' }}>
                {msgSending ? <Loader2 size={15} /> : <Send size={15} />}
                전송
              </button>
            </div>
          </div>

        ) : tab === 'schoolrecord' ? (
          <>
            {previewImg && (
              <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setPreviewImg(null)}>
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <img src={previewImg} alt="생기부" style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain' }} />
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px' }}>
                  {srImages.map((img, idx) => (
                    <div key={img.id} onClick={() => setPreviewImg(img.public_url)}
                      style={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
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
        ) : tab === 'progress' ? (
          /* ── 성취도 탭 ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 전체 진척도 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                { label: '면접 Q&A', done: totalQna, target: 50, color: '#2563eb', unit: '개' },
                { label: '탐구 과제', done: totalResearch, target: 20, color: '#7c3aed', unit: '개' },
                { label: '모의면접', done: totalMock, target: 0, color: '#ea580c', unit: '회' },
              ].map(g => {
                const pct = g.target > 0 ? Math.min(g.done / g.target, 1) : 0;
                return (
                  <div key={g.label} style={{ padding: '16px', borderRadius: '14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px' }}>{g.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '24px', fontWeight: '800', color: g.color }}>{g.done}</span>
                      {g.target > 0 && <span style={{ fontSize: '13px', color: '#94a3b8' }}>/ {g.target}{g.unit}</span>}
                      {g.target === 0 && <span style={{ fontSize: '13px', color: '#94a3b8' }}>{g.unit}</span>}
                    </div>
                    {g.target > 0 && (
                      <div style={{ marginTop: '8px', height: '5px', borderRadius: '3px', backgroundColor: '#e2e8f0' }}>
                        <div style={{ height: '100%', borderRadius: '3px', backgroundColor: g.color, width: `${pct * 100}%`, transition: 'width 0.4s' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 이번 주 */}
            <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>📅 이번 주 할당량</h4>
              {weeklyGoal ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'Q&A', done: weeklyGoal.qna_done, target: weeklyGoal.qna_target, color: '#2563eb' },
                    { label: '탐구', done: weeklyGoal.research_done, target: weeklyGoal.research_target, color: '#7c3aed' },
                    { label: '모면', done: weeklyGoal.mock_done, target: weeklyGoal.mock_target, color: '#ea580c' },
                  ].map(w => {
                    const ok = w.done >= w.target;
                    return (
                      <div key={w.label} style={{
                        padding: '14px', borderRadius: '10px', textAlign: 'center',
                        border: `2px solid ${ok ? '#16a34a' : '#e2e8f0'}`,
                        backgroundColor: ok ? '#f0fdf4' : '#fafafa',
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '4px' }}>{w.label}</div>
                        <span style={{ fontSize: '20px', fontWeight: '800', color: ok ? '#16a34a' : w.color }}>{w.done}</span>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}> / {w.target}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>이번 주 목표가 아직 설정되지 않았습니다</p>
              )}
            </div>

            {/* 상시 과제 현황 */}
            <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>📋 상시 과제 현황</h4>
              {customTasks.length === 0 ? (
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>출제된 과제가 없습니다</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {customTasks.map(t => (
                    <div key={t.id} style={{
                      padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
                      backgroundColor: t.is_completed ? '#f0fdf4' : '#fffbeb',
                      border: `1px solid ${t.is_completed ? '#bbf7d0' : '#fde68a'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ color: t.is_completed ? '#16a34a' : '#92400e', fontWeight: '600', textDecoration: t.is_completed ? 'line-through' : 'none' }}>
                        {t.title}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: t.is_completed ? '#16a34a' : '#d97706' }}>
                        {t.is_completed ? '✅ 완료' : '⏳ 진행중'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        ) : tab === 'tasks' ? (
          /* ── 과제 출제 탭 ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 새 과제 출제 */}
            <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>✏️ 새 과제 출제</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="과제 제목 (필수)"
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit' }}
                />
                <textarea
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder="과제 설명 (선택)"
                  rows={3}
                  style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', whiteSpace: 'nowrap' }}>기한:</label>
                  <input
                    type="date"
                    value={newTaskDue}
                    onChange={e => setNewTaskDue(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <button onClick={handleAddTask} disabled={taskSaving || !newTaskTitle.trim()}
                  style={{
                    padding: '12px', borderRadius: '10px', border: 'none',
                    backgroundColor: !newTaskTitle.trim() ? '#e2e8f0' : '#0f172a',
                    color: !newTaskTitle.trim() ? '#94a3b8' : '#ffffff',
                    fontSize: '14px', fontWeight: '700', cursor: !newTaskTitle.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}>
                  {taskSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  과제 출제하기
                </button>
              </div>
            </div>

            {/* 기존 과제 목록 */}
            <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                출제된 과제 ({customTasks.length}개)
              </h4>
              {customTasks.length === 0 ? (
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '24px' }}>아직 출제한 과제가 없습니다</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {customTasks.map(t => (
                    <div key={t.id} style={{
                      padding: '14px 16px', borderRadius: '12px',
                      border: `1px solid ${t.is_completed ? '#bbf7d0' : '#fde68a'}`,
                      backgroundColor: t.is_completed ? '#f0fdf4' : '#fffbeb',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '2px', textDecoration: t.is_completed ? 'line-through' : 'none' }}>
                            {t.title}
                          </div>
                          {t.description && <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{t.description}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px',
                            backgroundColor: t.is_completed ? '#dcfce7' : '#fef3c7',
                            color: t.is_completed ? '#16a34a' : '#d97706',
                          }}>
                            {t.is_completed ? '완료' : '미완료'}
                          </span>
                          <button onClick={() => handleDeleteTask(t.id)}
                            style={{ backgroundColor: 'transparent', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '4px' }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                        <span>출제: {new Date(t.created_at).toLocaleDateString('ko-KR')}</span>
                        {t.due_date && <span>기한: {new Date(t.due_date).toLocaleDateString('ko-KR')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        ) : null)}
      </div>
    </div>
  );
}

// ── 메인 AdminPage ─────────────────────────────────────────────────────────
export default function AdminPage({ session }: AdminPageProps) {
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
  const [mainTab, setMainTab]               = useState<'requests' | 'students' | 'prompts' | 'admission' | 'admissionView' | 'payments'>('requests');
  const [students, setStudents]             = useState<StudentProfile[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  // 결제 관리
  interface PaymentOrderAdmin {
    id: string; user_id: string; items: string;
    total_amount: number; status: 'pending' | 'confirmed' | 'rejected';
    created_at: string; userEmail?: string; userName?: string;
  }
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrderAdmin[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'confirmed'>('pending');

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
      .from('profiles').select('id, name, email, created_at, role, ai_tokens, human_tokens')
      .or('role.eq.student,role.is.null')
      .order('created_at', { ascending: false });
    setStudents((data as StudentProfile[]) ?? []);
    setStudentsLoading(false);
  };

  useEffect(() => {
    if (isAuthorized) { fetchRequests(); fetchStudents(); fetchPayments(); }
  }, [isAuthorized]);

  const fetchPayments = async () => {
    setPaymentsLoading(true);
    const { data } = await supabase
      .from('payment_orders').select('*')
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((o: any) => o.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
      const nameMap: Record<string, { name: string; email: string }> = {};
      profiles?.forEach((p: any) => { nameMap[p.id] = { name: p.name || '', email: p.email || '' }; });
      setPaymentOrders(data.map((o: any) => ({
        ...o,
        userName: nameMap[o.user_id]?.name || '',
        userEmail: nameMap[o.user_id]?.email || o.user_id.substring(0, 8),
      })));
    } else {
      setPaymentOrders([]);
    }
    setPaymentsLoading(false);
  };

  const handleConfirmPayment = async (order: PaymentOrderAdmin) => {
    if (!confirm(`"${order.userName || order.userEmail}"의 ${order.total_amount.toLocaleString()}원 입금을 확인하시겠습니까?`)) return;
    // figure out what tokens to add based on order items
    let addAi = 0, addHuman = 0;
    const items = order.items;
    if (items.includes('특별 패키지')) { addAi += 200; addHuman += 30; }
    if (items.includes('AI 토큰 100개')) { addAi += 100; }
    if (items.includes('컨설턴트 토큰 10개')) { addHuman += 10; }

    // update order status
    const { error } = await supabase.from('payment_orders').update({ status: 'confirmed' }).eq('id', order.id);
    if (error) { alert('업데이트 실패: ' + error.message); return; }

    // add tokens to user profile
    if (addAi > 0 || addHuman > 0) {
      const { data: profile } = await supabase.from('profiles').select('ai_tokens, human_tokens').eq('id', order.user_id).single();
      if (profile) {
        await supabase.from('profiles').update({
          ai_tokens: (profile.ai_tokens || 0) + addAi,
          human_tokens: (profile.human_tokens || 0) + addHuman,
        }).eq('id', order.user_id);
      }
    }

    alert('✅ 입금 확인 완료! 토큰이 지급되었습니다.');
    fetchPayments();
  };

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
    } catch (err: any) { alert('오류: ' + err.message); }
    finally { setIsSubmitting(false); }
  };

  const filtered     = requests.filter(r => {
    const s = filter === 'all' ? true : filter === 'pending' ? r.status === 'submitted' : r.status === 'completed';
    const t = typeFilter === 'all' ? true : typeFilter === r.type;
    return s && t;
  });
  const pendingCount = requests.filter(r => r.status === 'submitted').length;
  const selectedReq  = requests.find(r => r.id === selectedId);

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
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f8fafc' }}>

      {/* ── 사이드바 ── */}
      <div style={{ width: '320px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>

        {/* 헤더 */}
        <div style={{ padding: '28px 24px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Compass size={24} color="#2563eb" strokeWidth={2.5} />
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>Compass Admin</span>
          </div>
          {/* 메인 탭 토글 — 2행 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
            </div>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
              <button onClick={() => setMainTab('prompts')} style={{
                flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                backgroundColor: mainTab === 'prompts' ? '#ffffff' : 'transparent',
                color: mainTab === 'prompts' ? '#0f172a' : '#94a3b8',
                boxShadow: mainTab === 'prompts' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
                ⚡ 프롬프트
              </button>
              <button onClick={() => { setMainTab('payments'); fetchPayments(); }} style={{
                flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                backgroundColor: mainTab === 'payments' ? '#ffffff' : 'transparent',
                color: mainTab === 'payments' ? '#0f172a' : '#94a3b8',
                boxShadow: mainTab === 'payments' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
                💰 결제관리
              </button>
            </div>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
              <button onClick={() => setMainTab('admission')} style={{
                flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                backgroundColor: mainTab === 'admission' ? '#ffffff' : 'transparent',
                color: mainTab === 'admission' ? '#0f172a' : '#94a3b8',
                boxShadow: mainTab === 'admission' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
                📤 입시업로드
              </button>
              <button onClick={() => setMainTab('admissionView')} style={{
                flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                backgroundColor: mainTab === 'admissionView' ? '#ffffff' : 'transparent',
                color: mainTab === 'admissionView' ? '#0f172a' : '#94a3b8',
                boxShadow: mainTab === 'admissionView' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
                📋 입시결과
              </button>
            </div>
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
                  backgroundColor: selectedId === req.id ? '#eff6ff' : '#ffffff',
                  borderLeft: selectedId === req.id ? '3px solid #2563eb' : '3px solid transparent',
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
          // 학생 목록
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
                backgroundColor: selectedStudent?.id === s.id ? '#eff6ff' : '#ffffff',
                borderLeft: selectedStudent?.id === s.id ? '3px solid #2563eb' : '3px solid transparent',
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

      {/* ── 메인 콘텐츠 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        {mainTab === 'admission' ? (
          <AdmissionUploader />
        ) : mainTab === 'admissionView' ? (
          <AdmissionViewer />
        ) : mainTab === 'prompts' ? (
          <PromptManager />
        ) : mainTab === 'payments' ? (
          /* ── 결제 관리 패널 ── */
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>결제 관리</h2>
                <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>학생들의 토큰 구매 요청을 확인하고 입금을 처리하세요</p>
              </div>
              <button onClick={fetchPayments} style={{
                padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff', color: '#64748b', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <RefreshCw size={14} /> 새로고침
              </button>
            </div>

            {/* 필터 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {(['all', 'pending', 'confirmed'] as const).map(f => {
                const labels: Record<string, string> = { all: '전체', pending: '입금 대기', confirmed: '확인 완료' };
                const counts: Record<string, number> = {
                  all: paymentOrders.length,
                  pending: paymentOrders.filter(o => o.status === 'pending').length,
                  confirmed: paymentOrders.filter(o => o.status === 'confirmed').length,
                };
                return (
                  <button key={f} onClick={() => setPaymentFilter(f)} style={{
                    padding: '8px 16px', borderRadius: '10px', border: 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                    backgroundColor: paymentFilter === f ? '#0f172a' : '#f1f5f9',
                    color: paymentFilter === f ? '#ffffff' : '#64748b',
                  }}>
                    {labels[f]} {counts[f] > 0 ? `(${counts[f]})` : ''}
                  </button>
                );
              })}
            </div>

            {paymentsLoading ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <Loader2 size={28} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} />
              </div>
            ) : paymentOrders.filter(o => paymentFilter === 'all' ? true : o.status === paymentFilter).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <DollarSign size={36} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '10px' }} />
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>결제 요청이 없습니다</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {paymentOrders
                  .filter(o => paymentFilter === 'all' ? true : o.status === paymentFilter)
                  .map(order => {
                    const isPending = order.status === 'pending';
                    return (
                      <div key={order.id} style={{
                        backgroundColor: '#ffffff', borderRadius: '16px', border: `1px solid ${isPending ? '#fbbf24' : '#e2e8f0'}`,
                        padding: '20px 24px', transition: 'all 0.2s',
                        borderLeft: isPending ? '4px solid #f59e0b' : '4px solid #16a34a',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{order.userName || '이름 없음'}</span>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{order.userEmail}</span>
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>{order.items}</div>
                          </div>
                          <span style={{
                            fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            backgroundColor: isPending ? '#fffbeb' : '#f0fdf4',
                            color: isPending ? '#d97706' : '#16a34a',
                          }}>
                            {isPending ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                            {isPending ? '입금 확인 대기' : '입금 확인 완료'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>{order.total_amount.toLocaleString()}원</span>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(order.created_at).toLocaleString('ko-KR')}</span>
                          </div>
                          {isPending && (
                            <button onClick={() => handleConfirmPayment(order)} style={{
                              padding: '10px 20px', borderRadius: '10px', border: 'none',
                              backgroundColor: '#16a34a', color: '#ffffff',
                              fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '6px',
                              transition: 'all 0.2s',
                            }}>
                              <Check size={15} /> 입금 확인
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
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

          // ── 기존 첨삭 요청 상세 (100% 원본 유지) ──────────────────────
          !selectedReq ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
              <Inbox size={48} strokeWidth={1.5} style={{ marginBottom: '16px' }} />
              <p style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>왼쪽에서 요청을 선택해 주세요</p>
            </div>
          ) : (
            <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              <div style={{ backgroundColor: '#ffffff', padding: '28px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
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
                    <span>{formatDate(selectedReq.created_at)}</span>
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

              <div style={{ backgroundColor: '#ffffff', padding: '28px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
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
                        <img src={uploadedImageUrl} alt="첨부" style={{ maxWidth: '300px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
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
                      : <><Send size={18} /> 첨삭 완료 — 학생에게 이메일 발송</>
                    }
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <Check size={18} color="#16a34a" />
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#166534' }}>첨삭 완료 — 학생에게 이메일이 발송됐습니다</span>
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