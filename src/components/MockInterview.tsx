// src/components/MockInterview.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  Mic, ChevronRight, RotateCcw, Check, Loader2,
  Play, Pencil, BookOpen, Volume2, History,
  ChevronDown, ChevronUp, Trash2
} from 'lucide-react';

interface MockInterviewProps {
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

interface QnAQuestion {
  id: string;
  question: string;
  answer_text: string;
  path_id: string;
  pathTitle?: string;
}

interface AnswerRecord {
  questionId: string;
  question: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  transcribedText: string;
  editedText: string;
  existingAnswer: string;
  isTranscribing: boolean;
  dbAnswerId?: string;
}

interface PastSession {
  id: string;
  total_count: number;
  created_at: string;
  answers?: PastAnswer[];
  isExpanded?: boolean;
}

interface PastAnswer {
  id: string;
  question: string;
  transcribed_text: string | null;
  edited_text: string | null;
  existing_answer: string | null;
  sort_order: number;
}

type Phase = 'setup' | 'interview' | 'review';
type VoiceType = 'browser' | 'onyx' | 'nova';

const VOICE_OPTIONS: { id: VoiceType; label: string; desc: string; color: string }[] = [
  { id: 'browser', label: '기본',          desc: '브라우저 내장 TTS · 무료',      color: '#64748b' },
  { id: 'onyx',    label: '남자 면접관',   desc: 'OpenAI onyx · 묵직하고 깊은 목소리', color: '#0f172a' },
  { id: 'nova',    label: '여자 면접관',   desc: 'OpenAI nova · 자연스럽고 또렷한 목소리', color: '#7c3aed' },
];

const countdownColor = (n: number) => n >= 4 ? '#16a34a' : n >= 2 ? '#d97706' : '#dc2626';
const formatDate = (d: string) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};

export default function MockInterview({ session }: MockInterviewProps) {
  const isMobile = useIsMobile(); // 커스텀 반응형 훅 적용
  const [phase, setPhase]                   = useState<Phase>('setup');
  const [allQuestions, setAllQuestions]     = useState<QnAQuestion[]>([]);
  const [paths, setPaths]                   = useState<{ id: string; title: string }[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string>('all');
  const [questionCount, setQuestionCount]   = useState(5);
  const [voiceType, setVoiceType]           = useState<VoiceType>('onyx');
  const [isLoading, setIsLoading]           = useState(true);

  const [sessionQuestions, setSessionQuestions] = useState<QnAQuestion[]>([]);
  const [currentIdx, setCurrentIdx]     = useState(0);
  const [answers, setAnswers]           = useState<AnswerRecord[]>([]);
  const [countdown, setCountdown]       = useState<number | null>(null);
  const [isRecording, setIsRecording]   = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [pastSessions, setPastSessions]   = useState<PastSession[]>([]);
  const [isPastLoading, setIsPastLoading] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef         = useRef<MediaStream | null>(null);
  const ttsAudioRef       = useRef<HTMLAudioElement | null>(null);

  // ── 초기 로드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [{ data: pathData }, { data: qnaData }] = await Promise.all([
        supabase.from('career_paths').select('id, title').eq('user_id', session.user.id),
        supabase.from('interview_qnas').select('id, question, answer_text, path_id')
          .eq('user_id', session.user.id).not('answer_text', 'is', null),
      ]);
      if (pathData) setPaths(pathData);
      if (qnaData && pathData) {
        const m: Record<string, string> = {};
        pathData.forEach(p => { m[p.id] = p.title; });
        setAllQuestions(qnaData.map(q => ({ ...q, pathTitle: m[q.path_id] || '기타' })));
      }
      setIsLoading(false);
    };
    load();
    loadPastSessions();
  }, [session.user.id]);

  const loadPastSessions = async () => {
    setIsPastLoading(true);
    const { data } = await supabase
      .from('mock_interview_sessions')
      .select('id, total_count, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setPastSessions((data || []).map(s => ({ ...s, isExpanded: false })));
    setIsPastLoading(false);
  };

  const loadSessionAnswers = async (sessionId: string): Promise<PastAnswer[]> => {
    const { data } = await supabase
      .from('mock_interview_answers')
      .select('id, question, transcribed_text, edited_text, existing_answer, sort_order')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true });
    return (data || []) as PastAnswer[];
  };

  const toggleExpandSession = async (sessionId: string) => {
    const target = pastSessions.find(s => s.id === sessionId);
    if (!target) return;

    if (target.isExpanded) {
      setPastSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isExpanded: false } : s));
      return;
    }

    if (!target.answers) {
      const loaded = await loadSessionAnswers(sessionId);
      setPastSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, answers: loaded, isExpanded: true } : s
      ));
    } else {
      setPastSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isExpanded: true } : s));
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('이 면접 기록을 삭제할까요?')) return;
    setDeletingId(sessionId);
    await supabase.from('mock_interview_sessions').delete().eq('id', sessionId);
    setPastSessions(prev => prev.filter(s => s.id !== sessionId));
    setDeletingId(null);
  };

  const filteredQuestions = selectedPathId === 'all'
    ? allQuestions : allQuestions.filter(q => q.path_id === selectedPathId);
  const maxCount = Math.min(filteredQuestions.length, 10);
  useEffect(() => {
    setQuestionCount(prev => Math.min(prev, maxCount || 1));
  }, [selectedPathId, maxCount]);

  // ── TTS ──────────────────────────────────────────────────────────────────
  const speakQuestion = useCallback(async (text: string, voice: VoiceType) => {
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }

    if (voice === 'browser') {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang  = 'ko-KR';
      utter.rate  = 0.92;
      utter.onstart = () => setIsTTSPlaying(true);
      utter.onend   = () => { setIsTTSPlaying(false); startCountdown(); };
      utter.onerror = () => { setIsTTSPlaying(false); startCountdown(); };
      setIsTTSPlaying(true);
      window.speechSynthesis.speak(utter);
      return;
    }

    setIsTTSLoading(true);
    setIsTTSPlaying(false);
    try {
      const { data, error } = await supabase.functions.invoke('process-mock-interview', {
        body: { action: 'tts', text, voice: voice === 'onyx' ? 'onyx' : 'nova' },
      });
      if (error) throw error;

      const bin   = atob(data.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url   = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      setIsTTSLoading(false);
      setIsTTSPlaying(true);
      audio.onended = () => { setIsTTSPlaying(false); URL.revokeObjectURL(url); startCountdown(); };
      audio.onerror = () => { setIsTTSPlaying(false); startCountdown(); };
      await audio.play();
    } catch {
      setIsTTSLoading(false);
      setIsTTSPlaying(false);
      startCountdown();
    }
  }, []);

  // ── 카운트다운 ───────────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    let count = 5;
    setCountdown(count);
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) { clearInterval(countdownTimerRef.current!); setCountdown(null); startRecording(); }
      else setCountdown(count);
    }, 1000);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current  = stream;
      chunksRef.current  = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      alert('마이크 접근 권한이 필요해요.');
    }
  };

  const stopRecording = (): Promise<Blob> => new Promise(resolve => {
    const mr = mediaRecorderRef.current;
    if (!mr) { resolve(new Blob()); return; }
    mr.onstop = () => resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
    mr.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsRecording(false);
  });

  // ── DB 저장 헬퍼 ─────────────────────────────────────────────────────────
  const createSession = async (count: number): Promise<string | null> => {
    const { data, error } = await supabase
      .from('mock_interview_sessions')
      .insert({ user_id: session.user.id, total_count: count })
      .select('id')
      .single();
    if (error) { console.error('세션 생성 실패:', error.message); return null; }
    return data.id;
  };

  const saveAnswerToDB = async (
    sessionId: string, ans: AnswerRecord, idx: number
  ): Promise<string | null> => {
    const { data, error } = await supabase
      .from('mock_interview_answers')
      .insert({
        session_id:       sessionId,
        question_id:      ans.questionId,
        question:         ans.question,
        transcribed_text: ans.transcribedText || null,
        edited_text:      ans.editedText      || null,
        existing_answer:  ans.existingAnswer  || null,
        sort_order:       idx,
      })
      .select('id')
      .single();
    if (error) { console.error('답변 저장 실패:', error.message); return null; }
    return data.id;
  };

  const updateAnswerInDB = async (answerId: string, editedText: string) => {
    const { error } = await supabase
      .from('mock_interview_answers')
      .update({ edited_text: editedText })
      .eq('id', answerId);
    if (error) console.error('답변 업데이트 실패:', error.message);
  };

  // ── 면접 시작 ────────────────────────────────────────────────────────────
  const handleStart = async () => {
    const shuffled = [...filteredQuestions].sort(() => Math.random() - 0.5).slice(0, questionCount);
    const sessionId = await createSession(shuffled.length);
    if (!sessionId) { alert('세션 생성에 실패했어요. 다시 시도해 주세요.'); return; }

    setCurrentSessionId(sessionId);
    setSessionQuestions(shuffled);
    setAnswers(shuffled.map(q => ({
      questionId: q.id, question: q.question,
      audioBlob: null, audioUrl: null,
      transcribedText: '', editedText: '',
      existingAnswer: q.answer_text || '',
      isTranscribing: false,
    })));
    setCurrentIdx(0);
    setPhase('interview');
    setTimeout(() => speakQuestion(shuffled[0].question, voiceType), 400);
  };

  // ── 다음 질문 ────────────────────────────────────────────────────────────
  const handleNext = async () => {
    clearInterval(countdownTimerRef.current!);
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    window.speechSynthesis.cancel();
    setCountdown(null);
    setIsTTSPlaying(false);
    setIsTTSLoading(false);

    let audioBlob: Blob | null = null;
    let audioUrl:  string | null = null;
    if (isRecording) { audioBlob = await stopRecording(); audioUrl = URL.createObjectURL(audioBlob); }

    const savedIdx = currentIdx;
    const savedSessionId = currentSessionId;

    const updatedAnswers = answers.map((a, i) =>
      i === savedIdx ? { ...a, audioBlob, audioUrl, isTranscribing: !!audioBlob } : a
    );
    setAnswers(updatedAnswers);

    if (savedSessionId) {
      const currentAns = updatedAnswers[savedIdx];
      if (audioBlob) {
        transcribeAndSave(audioBlob, savedIdx, currentAns, savedSessionId);
      } else {
        saveAnswerToDB(savedSessionId, currentAns, savedIdx).then(id => {
          if (id) setAnswers(prev => prev.map((a, i) => i === savedIdx ? { ...a, dbAnswerId: id } : a));
        });
      }
    }

    if (savedIdx < sessionQuestions.length - 1) {
      const next = savedIdx + 1;
      setCurrentIdx(next);
      setTimeout(() => speakQuestion(sessionQuestions[next].question, voiceType), 300);
    } else {
      setPhase('review');
      loadPastSessions();
    }
  };

  // ── STT 변환 + DB 저장 ───────────────────────────────────────────────────
  const transcribeAndSave = async (
    blob: Blob, idx: number, ans: AnswerRecord, sessionId: string
  ) => {
    let transcribedText = '';
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res((r.result as string).split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const { data, error } = await supabase.functions.invoke('process-mock-interview', {
        body: { action: 'transcribe', audioBase64: base64, mimeType: 'audio/webm' },
      });
      if (!error && data?.text) transcribedText = data.text;
    } catch (e) {
      console.error('STT 실패:', e);
    }

    setAnswers(prev => prev.map((a, i) =>
      i === idx ? { ...a, transcribedText, editedText: transcribedText, isTranscribing: false } : a
    ));

    const updatedAns = { ...ans, transcribedText, editedText: transcribedText };
    const id = await saveAnswerToDB(sessionId, updatedAns, idx);
    if (id) setAnswers(prev => prev.map((a, i) => i === idx ? { ...a, dbAnswerId: id } : a));
  };

  // ── 리뷰 편집 ────────────────────────────────────────────────────────────
  const startEdit  = (qId: string, text: string) => { setEditingId(qId); setEditValue(text); };
  const commitEdit = async (qId: string) => {
    const ans = answers.find(a => a.questionId === qId);
    setAnswers(prev => prev.map(a => a.questionId === qId ? { ...a, editedText: editValue } : a));
    setEditingId(null);
    if (ans?.dbAnswerId) await updateAnswerInDB(ans.dbAnswerId, editValue);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ── 설정 화면 ─────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px' }}>
        <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '24px 20px' : '40px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '20px' : '22px', color: '#0f172a', fontWeight: '800' }}>모의면접실</h3>
          <p style={{ margin: isMobile ? '0 0 24px 0' : '0 0 36px 0', color: '#64748b', fontSize: isMobile ? '13px' : '15px' }}>
            면접관 AI가 질문을 읽어주면 실제 면접처럼 말로 답변해 보세요.
          </p>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 className="animate-spin" size={28} color="#2563eb" style={{ display: 'inline-block' }} />
            </div>
          ) : allQuestions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
              <BookOpen size={36} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '12px' }} />
              <p style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#475569', fontWeight: '600' }}>아직 면접 Q&A가 없어요</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>면접 Q&A 뱅크 탭에서 먼저 질문과 답변을 준비해 주세요.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '20px' : '28px' }}>

              {/* Path 선택 */}
              <div>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>진로 Path 선택</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button onClick={() => setSelectedPathId('all')} style={{ padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', border: 'none', cursor: 'pointer', backgroundColor: selectedPathId === 'all' ? '#0f172a' : '#f1f5f9', color: selectedPathId === 'all' ? '#ffffff' : '#64748b' }}>
                    전체 ({allQuestions.length}개)
                  </button>
                  {paths.map(p => {
                    const cnt = allQuestions.filter(q => q.path_id === p.id).length;
                    if (cnt === 0) return null;
                    return (
                      <button key={p.id} onClick={() => setSelectedPathId(p.id)} style={{ padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', border: 'none', cursor: 'pointer', backgroundColor: selectedPathId === p.id ? '#2563eb' : '#f1f5f9', color: selectedPathId === p.id ? '#ffffff' : '#64748b' }}>
                        {p.title} ({cnt}개)
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 질문 개수 */}
              <div>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>
                  질문 개수 — <span style={{ color: '#2563eb', fontSize: '20px', fontWeight: '800' }}>{questionCount}</span>개
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>1</span>
                  <input type="range" min={1} max={maxCount} value={questionCount}
                    onChange={e => setQuestionCount(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }} />
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>{maxCount}</span>
                </div>
              </div>

              {/* 면접관 목소리 선택 (모바일 1열, PC 3열) */}
              <div>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>면접관 목소리</label>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                  {VOICE_OPTIONS.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVoiceType(v.id)}
                      style={{
                        padding: '16px', borderRadius: '14px', border: `2px solid ${voiceType === v.id ? v.color : '#e2e8f0'}`,
                        backgroundColor: voiceType === v.id ? v.color + '0d' : '#ffffff',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Volume2 size={15} color={voiceType === v.id ? v.color : '#94a3b8'} />
                        <span style={{ fontSize: '14px', fontWeight: '700', color: voiceType === v.id ? v.color : '#0f172a' }}>{v.label}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>{v.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleStart} style={{ padding: isMobile ? '16px' : '18px', borderRadius: '14px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '16px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <Play size={20} fill="#ffffff" strokeWidth={0} />
                모의면접 시작하기
              </button>
            </div>
          )}
        </div>

        {/* 지난 기록 */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <button onClick={() => setShowHistory(p => !p)} style={{ width: '100%', padding: isMobile ? '20px' : '24px 28px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <History size={18} color="#475569" />
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>지난 면접 기록</span>
              {pastSessions.length > 0 && (
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '20px' }}>{pastSessions.length}회</span>
              )}
            </div>
            {showHistory ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
          </button>

          {showHistory && (
            <div style={{ borderTop: '1px solid #e2e8f0' }}>
              {isPastLoading ? (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <Loader2 className="animate-spin" size={22} color="#94a3b8" style={{ display: 'inline-block' }} />
                </div>
              ) : pastSessions.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>아직 진행한 면접이 없어요</div>
              ) : pastSessions.map(s => (
                <div key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ padding: isMobile ? '16px 20px' : '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={() => toggleExpandSession(s.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Mic size={16} color="#475569" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>모의면접 {s.total_count}문항</p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>{formatDate(s.created_at)}</p>
                      </div>
                      {s.isExpanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                    </button>
                    <button onClick={() => deleteSession(s.id)} disabled={deletingId === s.id} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', backgroundColor: '#fee2e2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: '12px' }}>
                      {deletingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  {s.isExpanded && s.answers && (
                    <div style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                      {s.answers.map((ans, i) => (
                        <div key={ans.id} style={{ padding: isMobile ? '16px 20px' : '20px 28px', borderBottom: i < s.answers!.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <p style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <span style={{ minWidth: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', flexShrink: 0, marginTop: '1px' }}>{i + 1}</span>
                            {ans.question}
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '30px' }}>
                            <div>
                              <p style={{ margin: '0 0 5px 0', fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>내 답변</p>
                              <div style={{ padding: '12px 14px', backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '13px', color: ans.edited_text || ans.transcribed_text ? '#334155' : '#94a3b8', lineHeight: 1.6, border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                                {ans.edited_text || ans.transcribed_text || '(답변 없음)'}
                              </div>
                            </div>
                            {ans.existing_answer && (
                              <div>
                                <p style={{ margin: '0 0 5px 0', fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>준비 답변</p>
                                <div style={{ padding: '12px 14px', backgroundColor: '#eff6ff', borderRadius: '8px', fontSize: '13px', color: '#1e3a8a', lineHeight: 1.6, border: '1px solid #bfdbfe', whiteSpace: 'pre-wrap' }}>{ans.existing_answer}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 면접 진행 화면 ──────────────────────────────────────────────────────────
  if (phase === 'interview') {
    const q = sessionQuestions[currentIdx];
    const progress = (currentIdx / sessionQuestions.length) * 100;
    const voiceInfo = VOICE_OPTIONS.find(v => v.id === voiceType)!;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: isMobile ? '80vh' : '70vh', justifyContent: 'center', padding: isMobile ? '20px 0' : '40px 0' }}>
        <div style={{ width: '100%', maxWidth: '640px', marginBottom: isMobile ? '24px' : '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>{currentIdx + 1} / {sessionQuestions.length}</span>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>{q.pathTitle}</span>
          </div>
          <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, backgroundColor: '#2563eb', borderRadius: '4px', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: '640px', backgroundColor: '#ffffff', borderRadius: '24px', border: '1px solid #e2e8f0', padding: isMobile ? '32px 20px' : '48px', boxShadow: '0 4px 32px rgba(0,0,0,0.06)', marginBottom: '32px', textAlign: 'center', boxSizing: 'border-box' }}>
          <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isTTSLoading ? '#fef3c7' : isTTSPlaying ? '#eff6ff' : '#f8fafc', border: `2px solid ${isTTSLoading ? '#fde68a' : isTTSPlaying ? '#2563eb' : '#e2e8f0'}`, transition: 'all 0.3s ease' }}>
              {isTTSLoading
                ? <Loader2 size={24} color="#d97706" className="animate-spin" />
                : <Volume2 size={24} color={isTTSPlaying ? '#2563eb' : '#94a3b8'} style={{ animation: isTTSPlaying ? 'volumePulse 1.2s ease-in-out infinite' : 'none' }} />
              }
            </div>
          </div>
          <p style={{ margin: '0 0 6px 0', fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            면접 질문 · {voiceInfo.label}
          </p>
          <p style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: '#0f172a', lineHeight: 1.65 }}>{q.question}</p>
        </div>

        <div style={{ marginBottom: '32px', minHeight: '88px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {isTTSLoading && <p style={{ margin: 0, fontSize: '14px', color: '#d97706', fontWeight: '600' }}>면접관이 질문을 준비하고 있어요...</p>}
          {isTTSPlaying && !isTTSLoading && <p style={{ margin: 0, fontSize: '14px', color: '#2563eb', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}><Volume2 size={16} /> 면접관이 질문을 읽고 있어요</p>}
          {countdown !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '76px', height: '76px', borderRadius: '50%', border: `4px solid ${countdownColor(countdown)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 8px ${countdownColor(countdown)}18`, transition: 'border-color 0.3s' }}>
                <span style={{ fontSize: '34px', fontWeight: '900', color: countdownColor(countdown), lineHeight: 1 }}>{countdown}</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: '600' }}>초 후 녹음 시작</p>
            </div>
          )}
          {isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 28px', backgroundColor: '#fef2f2', borderRadius: '40px', border: '1px solid #fecaca' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#dc2626', animation: 'recBlink 1s ease-in-out infinite' }} />
                <Mic size={16} color="#dc2626" />
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#dc2626' }}>녹음 중</span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>답변이 끝나면 아래 버튼을 눌러주세요</p>
            </div>
          )}
        </div>

        <button onClick={handleNext} disabled={isTTSLoading || isTTSPlaying} style={{ width: isMobile ? '100%' : 'auto', maxWidth: '300px', padding: '16px 44px', borderRadius: '14px', border: 'none', backgroundColor: (isTTSLoading || isTTSPlaying) ? '#f1f5f9' : '#0f172a', color: (isTTSLoading || isTTSPlaying) ? '#94a3b8' : '#ffffff', fontSize: '15px', fontWeight: '700', cursor: (isTTSLoading || isTTSPlaying) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s ease' }}>
          {currentIdx < sessionQuestions.length - 1 ? <><ChevronRight size={18} /> 다음 질문</> : <><Check size={18} /> 면접 완료</>}
        </button>

        <style>{`
          @keyframes volumePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.88)} }
          @keyframes recBlink { 0%,100%{opacity:1} 50%{opacity:.3} }
        `}</style>
      </div>
    );
  }

  // ── 결과 리뷰 화면 ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px' }}>
      <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '24px 20px' : '32px 40px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '16px' : '0', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '20px' : '22px', color: '#0f172a', fontWeight: '800' }}>모의면접 결과</h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>총 {sessionQuestions.length}개 완료 · 텍스트 클릭으로 수정 · 자동 저장됨</p>
        </div>
        <button onClick={() => { setPhase('setup'); loadPastSessions(); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
          <RotateCcw size={14} /> 다시 하기
        </button>
      </div>

      {answers.map((ans, i) => (
        <div key={ans.questionId} style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: isMobile ? '20px 20px' : '24px 28px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <span style={{ minWidth: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', marginTop: '2px', flexShrink: 0 }}>{i + 1}</span>
            <p style={{ margin: 0, fontSize: isMobile ? '15px' : '16px', fontWeight: '700', color: '#0f172a', lineHeight: 1.5 }}>{ans.question}</p>
          </div>
          <div style={{ padding: isMobile ? '20px' : '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '10px', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>내 답변 (녹음 변환)</span>
                </div>
                {ans.audioUrl && <audio controls src={ans.audioUrl} style={{ height: '36px', width: isMobile ? '100%' : '260px', outline: 'none' }} />}
              </div>
              {ans.isTranscribing ? (
                <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '14px' }}>
                  <Loader2 size={16} className="animate-spin" color="#2563eb" />
                  음성을 텍스트로 변환하고 있어요...
                </div>
              ) : editingId === ans.questionId ? (
                <div>
                  <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    style={{ width: '100%', minHeight: '120px', padding: '16px', borderRadius: '10px', border: '1px solid #2563eb', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6, color: '#0f172a' }} />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>취소</button>
                    <button onClick={() => commitEdit(ans.questionId)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={14} /> 저장
                    </button>
                  </div>
                </div>
              ) : (
                <div onClick={() => startEdit(ans.questionId, ans.editedText || ans.transcribedText)}
                  style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '10px', fontSize: '14px', color: ans.editedText || ans.transcribedText ? '#0f172a' : '#94a3b8', lineHeight: 1.7, cursor: 'pointer', position: 'relative', whiteSpace: 'pre-wrap', transition: 'background-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                >
                  {ans.editedText || ans.transcribedText || '(녹음된 답변 없음 — 클릭해서 직접 입력)'}
                  <Pencil size={13} color="#94a3b8" style={{ position: 'absolute', top: '14px', right: '14px' }} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', letterSpacing: '1px' }}>VS 기존 준비 답변</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Q&A 뱅크 준비 답변</span>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '10px', fontSize: '14px', color: '#1e3a8a', lineHeight: 1.7, border: '1px solid #bfdbfe', whiteSpace: 'pre-wrap' }}>
                {ans.existingAnswer || <span style={{ color: '#94a3b8' }}>준비된 답변 없음</span>}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '20px' }}>
        <button onClick={() => { setPhase('setup'); loadPastSessions(); }} style={{ width: isMobile ? '100%' : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 32px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
          <RotateCcw size={16} /> 모의면접 다시 하기
        </button>
      </div>
    </div>
  );
}