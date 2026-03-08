// src/components/InterviewQnA.tsx
import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Sparkles, Plus, ChevronDown, ChevronUp, Save, UserCheck, MessageSquare, Loader2, Target, Trash2, PenLine, X } from 'lucide-react';
import { useBreakpoint } from '../hooks/useBreakpoint';

interface InterviewQnAProps {
  session: Session;
}

interface Path {
  id: string;
  title: string;
}

interface Question {
  id: string;
  question: string;
  answer_text: string;
  status: 'pending' | 'submitted' | 'completed';
  revised_answer: string;
  feedback_content: string;
}

// 기본 질문 10개 (대학 입학면접 공통 질문)
const DEFAULT_BASIC_QUESTIONS = [
  '간략한 자기소개를 해주세요.',
  '본인의 장점과 단점은 무엇이라고 생각하나요?',
  '가장 존경하는 인물은 누구이며, 그 이유는 무엇인가요?',
  '타인을 위해 희생하거나 봉사한 경험이 있다면 말씀해 주세요. 그때 느낀 점은 무엇인가요?',
  '살면서 가장 힘들었던 일과 그것을 극복한 방법은 무엇인가요?',
  '고등학교 생활 중 가장 의미 있었던 활동은 무엇이며, 무엇을 배웠나요?',
  '우리 대학(학교)에 지원한 이유는 무엇인가요?',
  '10년 후 자신의 모습을 어떻게 그리고 있나요?',
  '최근 사회적 이슈 중 가장 관심이 가는 것은 무엇이며, 본인의 생각은 어떤가요?',
  '팀 프로젝트나 단체 활동에서 갈등이 생겼을 때 어떻게 해결했나요?',
];

export default function InterviewQnA({ session }: InterviewQnAProps) {
  const { isMobile } = useBreakpoint();
  const [identityData, setIdentityData] = useState<{ id: string, content: string } | null>(null);
  const [paths, setPaths] = useState<Path[]>([]);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPathLoading, setIsPathLoading] = useState(true);
  const isInsertingRef = useRef(false);

  // 직접 질문 추가용
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualQuestion, setManualQuestion] = useState('');

  // Path 삭제 확인
  const [deletingPathId, setDeletingPathId] = useState<string | null>(null);

  // 컨설턴트 첨삭 커스텀 컨펌 모달 상태
  const [pendingHumanFeedback, setPendingHumanFeedback] = useState<{ id: string, text: string } | null>(null);

  // 1. 초기 데이터 로드
  useEffect(() => {
    const fetchInitialData = async () => {
      const { data: idDoc } = await supabase
        .from('identity_documents')
        .select('id, content')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (idDoc) {
        setIdentityData(idDoc);

        const { data: pathData } = await supabase
          .from('career_paths')
          .select('id, title')
          .eq('identity_id', idDoc.id)
          .order('created_at', { ascending: true });

        if (pathData && pathData.length > 0) {
          // 중복 Path가 생성된 경우 (React 더블 렌더링으로 인해)
          if (pathData.length >= 2 && pathData[0].title === pathData[1].title && (pathData[0].title === '기본 진로 방향' || pathData[0].title === '기본 질문')) {
            const duplicateId = pathData[0].id;
            await supabase.from('career_paths').delete().eq('id', duplicateId);
            const cleanPaths = pathData.slice(1);
            setPaths(cleanPaths);
            setActivePathId(cleanPaths[0].id);
          } else {
            // '기본 진로 방향' → '기본 질문' 자동 마이그레이션
            const basicPath = pathData.find(p => p.title === '기본 진로 방향');
            if (basicPath) {
              await supabase.from('career_paths').update({ title: '기본 질문' }).eq('id', basicPath.id);
              basicPath.title = '기본 질문';
            }
            setPaths(pathData);
            setActivePathId(pathData[0].id);
          }
        } else {
          // Path가 없을 때만 새로 생성
          if (isInsertingRef.current) return;
          isInsertingRef.current = true;

          const { data: newPath } = await supabase
            .from('career_paths')
            .insert([{ user_id: session.user.id, identity_id: idDoc.id, title: '기본 질문' }])
            .select()
            .single();
            
          if (newPath) {
            setPaths([newPath]);
            setActivePathId(newPath.id);

            // 기본 질문 10개 자동 삽입
            const questionsToInsert = DEFAULT_BASIC_QUESTIONS.map(q => ({
              user_id: session.user.id,
              path_id: newPath.id,
              question: q,
              answer_text: '',
              status: 'pending',
            }));
            await supabase.from('interview_qnas').insert(questionsToInsert);
          }
          
          isInsertingRef.current = false;
        }
      }
      setIsPathLoading(false);
    };
    fetchInitialData();
  }, [session.user.id]);

  // 2. 활성화된 Path가 바뀔 때마다 질문 목록 새로 가져오기
  useEffect(() => {
    const fetchQuestions = async () => {
      if (!activePathId) return;
      
      setQuestions([]); 
      
      const { data: qData } = await supabase
        .from('interview_qnas')
        .select('id, question, answer_text, status, feedback_content, revised_answer')
        .eq('path_id', activePathId)
        .order('created_at', { ascending: true });
        
      if (qData) {
        setQuestions(qData as Question[]);
      }
    };
    fetchQuestions();
  }, [activePathId]);

  // 새로운 진로 Path 추가
  const handleAddPath = async () => {
    if (!identityData) return;
    if (paths.length >= 5) {
      alert('Path는 최대 5개까지 생성할 수 있어요.');
      return;
    }

    const newTitle = window.prompt('새로운 진로 방향(Path)의 이름을 입력해 주세요.\n(예: IT 프로덕트 매니저)');
    if (!newTitle || !newTitle.trim()) return;

    try {
      const { data: newPath, error } = await supabase
        .from('career_paths')
        .insert([{
          user_id: session.user.id,
          identity_id: identityData.id,
          title: newTitle.trim()
        }])
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (newPath) {
        setPaths([...paths, newPath]);
        setActivePathId(newPath.id);
      }
    } catch (err: any) {
      alert('Path 추가 중 오류가 발생했어요: ' + err.message);
    }
  };

  // Path 삭제 (하위 질문 모두 삭제)
  const handleDeletePath = async (pathId: string) => {
    try {
      // 하위 질문 모두 삭제
      await supabase.from('interview_qnas').delete().eq('path_id', pathId);
      // Path 삭제
      await supabase.from('career_paths').delete().eq('id', pathId);
      
      const updated = paths.filter(p => p.id !== pathId);
      setPaths(updated);
      setDeletingPathId(null);
      
      if (activePathId === pathId) {
        setActivePathId(updated.length > 0 ? updated[0].id : null);
      }
    } catch (err: any) {
      alert('삭제 중 오류: ' + err.message);
    }
  };

  // 개별 질문 삭제
  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm('이 질문과 답변을 삭제할까요?')) return;
    await supabase.from('interview_qnas').delete().eq('id', qId);
    setQuestions(prev => prev.filter(q => q.id !== qId));
  };

  // 3. AI 면접 질문 생성 (최초 생성 & 추가 생성 공통)
  const handleGenerateQuestions = async () => {
    if (!identityData || !activePathId) return;
    
    setIsGenerating(true);
    try {
      const { data: tokenRemaining, error: tokenError } = await supabase.rpc('decrement_ai_token', { target_user_id: session.user.id });
      if (tokenError) throw new Error('AI 토큰이 부족합니다.');

      const activePathTitle = paths.find(p => p.id === activePathId)?.title || '';
      const existingQuestions = questions.map(q => q.question);

      const { data, error } = await supabase.functions.invoke('process-interview', {
        body: {
          action: 'generate_questions',
          identityContent: identityData.content,
          pathName: activePathTitle,
          existingQuestions,
        }
      });

      if (error) throw new Error(error.message);

      const newQuestionsText: string[] = JSON.parse(data.result);
      
      const questionsToInsert = newQuestionsText.map(text => ({
        user_id: session.user.id, path_id: activePathId, question: text, answer_text: '', status: 'pending'
      }));

      const { data: insertedQs, error: insertError } = await supabase.from('interview_qnas').insert(questionsToInsert).select();

      if (insertError) throw new Error('질문 저장 중 오류가 발생했습니다.');

      if (insertedQs) {
        setQuestions(prev => [...prev, ...(insertedQs as Question[])]);
        setExpandedQ(insertedQs[0].id);
        alert(`✨ 질문 ${insertedQs.length}개가 추가되었습니다! (남은 AI 토큰: ${tokenRemaining}개)`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 직접 질문 추가
  const handleAddManualQuestion = async () => {
    if (!manualQuestion.trim() || !activePathId) return;
    try {
      const { data: inserted, error } = await supabase.from('interview_qnas').insert([{
        user_id: session.user.id,
        path_id: activePathId,
        question: manualQuestion.trim(),
        answer_text: '',
        status: 'pending',
      }]).select().single();

      if (error) throw new Error(error.message);
      if (inserted) {
        setQuestions(prev => [...prev, inserted as Question]);
        setManualQuestion('');
        setShowManualAdd(false);
        setExpandedQ(inserted.id);
      }
    } catch (err: any) {
      alert('질문 추가 중 오류: ' + err.message);
    }
  };

  const handleAnswerChange = (qId: string, value: string) => {
    setQuestions(questions.map(q => q.id === qId ? { ...q, answer_text: value } : q));
  };

  const handleSaveAnswer = async (qId: string) => {
    const q = questions.find(q => q.id === qId);
    if (!q) return;
    
    const { error } = await supabase.from('interview_qnas').update({ answer_text: q.answer_text }).eq('id', qId);
    if (error) alert('저장 중 오류가 발생했습니다.');
    else alert('✅ 답변이 임시저장 되었습니다.');
  };

  const handleRequestFeedback = async (qId: string, type: 'ai' | 'human') => {
    const q = questions.find(q => q.id === qId);
    if (!q || (q.answer_text?.length || 0) < 300) {
      alert('답변을 최소 300자 이상 작성해야 첨삭을 요청할 수 있어요.');
      return;
    }

    if (type === 'ai') {
      setIsEvaluating(true);
      try {
        const { data: tokenRemaining, error: tokenError } = await supabase.rpc('decrement_ai_token', { target_user_id: session.user.id });
        if (tokenError) throw new Error('AI 토큰이 부족합니다.');

        const { data, error } = await supabase.functions.invoke('process-interview', {
          body: { action: 'evaluate_answer', questionText: q.question, answerText: q.answer_text }
        });

        if (error) throw new Error(error.message);

        const resultText: string = data.result;
        const revisedMatch = resultText.match(/\[첨삭된 답변\]([\s\S]*?)(?=\[컨설턴트 코멘트\]|$)/);
        const commentMatch = resultText.match(/\[컨설턴트 코멘트\]([\s\S]*?)$/);

        const revisedAnswer = revisedMatch ? revisedMatch[1].trim() : '';
        const feedbackComment = commentMatch ? commentMatch[1].trim() : resultText;

        await supabase.from('interview_qnas').update({
          status: 'completed',
          revised_answer: revisedAnswer,
          feedback_content: feedbackComment,
          answer_text: q.answer_text
        }).eq('id', qId);

        setQuestions(questions.map(item =>
          item.id === qId
            ? { ...item, status: 'completed', revised_answer: revisedAnswer, feedback_content: feedbackComment }
            : item
        ));

        alert(`✨ AI 첨삭이 완료되었습니다! (남은 AI 토큰: ${tokenRemaining}개)`);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsEvaluating(false);
      }
    } else {
      setPendingHumanFeedback({ id: qId, text: q.question });
    }
  };

  const executeHumanFeedback = async () => {
    if (!pendingHumanFeedback) return;
    const qId = pendingHumanFeedback.id;
    const q = questions.find(item => item.id === qId);
    if (!q) { setPendingHumanFeedback(null); return; }

    try {
      const { error: tokenError } = await supabase.rpc('decrement_human_token', { target_user_id: session.user.id });
      if (tokenError) throw new Error('컨설턴트 토큰이 부족합니다.');

      await supabase.from('interview_qnas').update({ status: 'submitted', answer_text: q.answer_text }).eq('id', qId);
      setQuestions(questions.map(item => item.id === qId ? { ...item, status: 'submitted' } : item));

      await supabase.functions.invoke('process-interview', {
        body: { action: 'human_request', qnaId: qId }
      });

      alert('✅ 한태우 컨설턴트에게 첨삭 요청이 완료되었습니다!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPendingHumanFeedback(null);
    }
  };

  if (isPathLoading) {
    return <div style={{ padding: isMobile ? '20px' : '40px', textAlign: 'center' }}><Loader2 className="animate-spin" /> 데이터를 불러오는 중...</div>;
  }

  const activePathTitle = paths.find(p => p.id === activePathId)?.title || '';
  const isBasicPath = activePathTitle === '기본 질문';

  return (
    <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '40px', borderRadius: '20px', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>

      {/* AI 첨삭 로딩 오버레이 */}
      {isEvaluating && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '56px', height: '56px', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '20px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>AI가 답변을 분석하고 있어요</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>고품질 첨삭을 위해 20~30초 정도 소요됩니다...</p>
        </div>
      )}

      {/* AI 질문 생성 로딩 오버레이 */}
      {isGenerating && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '56px', height: '56px', border: '4px solid #e2e8f0', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '20px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>맞춤형 면접 질문을 생성하고 있어요</h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            {isBasicPath ? '대학 입학면접 공통 질문을 만들고 있습니다...' : '정의서를 분석해서 날카로운 질문을 만들고 있습니다...'}
          </p>
        </div>
      )}

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '24px' : '32px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '20px' : '22px', color: '#0f172a', fontWeight: '800' }}>면접 Q&A 뱅크</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '14px' : '15px' }}>정의서를 바탕으로 생성된 날카로운 맞춤형 질문에 답하며 실전을 준비하세요.</p>
        </div>
      </div>

      {/* Path 탭 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: isMobile ? '16px' : '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', overflowX: isMobile ? 'auto' : 'visible', flexWrap: isMobile ? 'nowrap' : 'wrap', alignItems: 'center' }}>
        {paths.map(path => (
          <div key={path.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setActivePathId(path.id)}
              style={{
                padding: '10px 20px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease',
                backgroundColor: activePathId === path.id ? '#0f172a' : '#f8fafc',
                color: activePathId === path.id ? '#ffffff' : '#64748b',
                border: activePathId === path.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
                paddingRight: activePathId === path.id ? '12px' : '20px',
              }}
            >
              <Target size={15} /> {path.title}
              {activePathId === path.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingPathId(path.id); }}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '4px', padding: 0 }}
                >
                  <Trash2 size={12} color="#ffffff" />
                </button>
              )}
            </button>
          </div>
        ))}
        {paths.length < 5 && (
          <button 
            onClick={handleAddPath}
            style={{ padding: '10px 20px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', color: '#2563eb', border: '1px dashed #bfdbfe', flexShrink: 0 }}
          >
            <Plus size={16} /> Path 추가
          </button>
        )}
      </div>

      {/* Path 삭제 확인 */}
      {deletingPathId && (
        <div style={{ marginBottom: '16px', padding: '16px 20px', backgroundColor: '#fef2f2', borderRadius: '14px', border: '1px solid #fecaca' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Trash2 size={18} color="#dc2626" />
            <div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>
                "{paths.find(p => p.id === deletingPathId)?.title}" Path를 삭제할까요?
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#b91c1c' }}>
                이 Path에 포함된 모든 질문과 답변이 영구 삭제됩니다.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setDeletingPathId(null)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              취소
            </button>
            <button onClick={() => handleDeletePath(deletingPathId)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
              삭제하기
            </button>
          </div>
        </div>
      )}

      {/* 질문 없을 때 */}
      {questions.length === 0 ? (
        <div style={{ padding: '64px 20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <MessageSquare size={48} color="#94a3b8" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
          <h4 style={{ margin: '0 0 12px 0', fontSize: isMobile ? '16px' : '18px', color: '#0f172a', fontWeight: '700' }}>아직 생성된 면접 질문이 없어요</h4>
          <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '15px' }}>
            {isBasicPath
              ? 'AI가 대학 입학면접 공통 질문을 생성해 드립니다.'
              : '학생의 본질 정의서를 바탕으로 AI가 최적의 예상 질문을 뽑아줍니다.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={handleGenerateQuestions} disabled={isGenerating || !identityData}
              style={{ padding: '14px 28px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: (isGenerating || !identityData) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', opacity: (isGenerating || !identityData) ? 0.7 : 1 }}
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {isGenerating ? 'AI가 질문을 생성 중입니다...' : 'AI 면접 질문 생성하기'}
            </button>
            <button
              onClick={() => setShowManualAdd(true)}
              style={{ padding: '14px 28px', backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px' }}
            >
              <PenLine size={18} /> 직접 질문 추가
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions.map((q, index) => (
            <div key={q.id} style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
              <div 
                onClick={() => setExpandedQ(expandedQ === q.id ? null : q.id)}
                style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: expandedQ === q.id ? '#f8fafc' : '#ffffff', transition: 'background-color 0.2s ease' }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: '#2563eb' }}>Q{index + 1}.</span>
                  <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: '600', lineHeight: '1.5', flex: 1 }}>{q.question}</h4>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
                  {q.status === 'pending' && <span style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>작성중</span>}
                  {q.status === 'submitted' && <span style={{ padding: '4px 10px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>컨설턴트 대기중</span>}
                  {q.status === 'completed' && <span style={{ padding: '4px 10px', backgroundColor: '#dcfce3', color: '#166534', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>첨삭 완료</span>}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', opacity: 0.4, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
                  >
                    <Trash2 size={15} color="#ef4444" />
                  </button>
                  {expandedQ === q.id ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                </div>
              </div>

              {expandedQ === q.id && (
                <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                  {q.feedback_content && (
                    <div style={{ marginBottom: '20px' }}>
                        
                        {/* 첨삭된 답변 */}
                        {q.revised_answer && (
                        <div style={{ marginBottom: '16px', padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#166534', fontWeight: '700', fontSize: '14px' }}>
                            <Sparkles size={16} /> ✏️ AI가 업그레이드한 답변
                            </div>
                            <p style={{ margin: 0, color: '#14532d', fontSize: '15px', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
                            {q.revised_answer}
                            </p>
                        </div>
                        )}

                        {/* 컨설턴트 코멘트 */}
                        <div style={{ padding: '20px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#1e3a8a', fontWeight: '700', fontSize: '14px' }}>
                            <MessageSquare size={16} /> 컨설턴트 코멘트
                        </div>
                        <p style={{ margin: 0, color: '#1e40af', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                            {q.feedback_content}
                        </p>
                        </div>

                    </div>
                    )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>나의 답변 작성 (300자 ~ 1000자)</label>
                    <span style={{ fontSize: '13px', color: (q.answer_text?.length || 0) < 300 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                      {q.answer_text?.length || 0} 자
                    </span>
                  </div>
                  
                  <textarea 
                    value={q.answer_text || ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="면접관 앞에서 이야기하듯 자연스럽게 작성해 보세요."
                    style={{ width: '100%', minHeight: '160px', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: '#f8fafc', marginBottom: '16px', color: '#0f172a' }}
                  />

                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '10px' : '0' }}>
                    <button onClick={() => handleSaveAnswer(q.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
                      <Save size={16} /> 임시저장
                    </button>

                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
                      <button onClick={() => handleRequestFeedback(q.id, 'ai')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s ease', width: isMobile ? '100%' : 'auto' }}>
                        <Sparkles size={16} /> AI 첨삭 
                      </button>
                      <button onClick={() => handleRequestFeedback(q.id, 'human')} disabled={q.status === 'submitted'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: q.status === 'submitted' ? 'not-allowed' : 'pointer', opacity: q.status === 'submitted' ? 0.6 : 1, transition: 'all 0.2s ease', width: isMobile ? '100%' : 'auto' }}>
                        <UserCheck size={16} /> 컨설턴트 첨삭 
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 하단 액션 버튼들 */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', paddingTop: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleGenerateQuestions}
              disabled={isGenerating || !identityData}
              style={{
                padding: '12px 24px',
                backgroundColor: isGenerating ? '#f8fafc' : '#ffffff',
                color: '#2563eb',
                border: '1px dashed #93c5fd',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: (isGenerating || !identityData) ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                opacity: (isGenerating || !identityData) ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isGenerating ? '질문 생성 중...' : `AI 질문 3개 추가 · 현재 ${questions.length}개`}
            </button>

            <button
              onClick={() => setShowManualAdd(!showManualAdd)}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ffffff',
                color: '#475569',
                border: '1px dashed #cbd5e1',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
            >
              <PenLine size={16} /> 직접 질문 추가
            </button>
          </div>
        </div>
      )}

      {/* 직접 질문 추가 입력창 */}
      {showManualAdd && (
        <div style={{ marginTop: '16px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PenLine size={16} color="#2563eb" /> 직접 질문 입력
            </label>
            <button onClick={() => { setShowManualAdd(false); setManualQuestion(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <X size={18} color="#94a3b8" />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
            <input
              value={manualQuestion}
              onChange={e => setManualQuestion(e.target.value)}
              placeholder="면접 예상 질문을 직접 입력하세요."
              onKeyDown={e => { if (e.key === 'Enter') handleAddManualQuestion(); }}
              style={{ flex: 1, padding: '12px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleAddManualQuestion}
              disabled={!manualQuestion.trim()}
              style={{
                padding: '12px 24px', borderRadius: '10px', border: 'none',
                backgroundColor: manualQuestion.trim() ? '#2563eb' : '#e2e8f0',
                color: manualQuestion.trim() ? '#ffffff' : '#94a3b8',
                fontSize: '14px', fontWeight: '700', cursor: manualQuestion.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: '6px',
                ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}),
              }}
            >
              <Plus size={16} /> 추가
            </button>
          </div>
        </div>
      )}

      {/* 컨설턴트 첨삭 요청 모달 */}
      {pendingHumanFeedback && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }} onClick={() => setPendingHumanFeedback(null)}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', maxWidth: '400px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <UserCheck size={20} color="#ea580c" />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>컨설턴트 첨삭 요청</h3>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>
              질문: <strong>"{pendingHumanFeedback.text}"</strong><br/><br/>
              이 답변에 대해 전문 컨설턴트의 1:1 맞춤 피드백을 요청하시겠습니까?
            </p>
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="#d97706" />
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#b45309' }}>1 컨설턴트 토큰이 사용됩니다.</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setPendingHumanFeedback(null)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>취소</button>
              <button onClick={executeHumanFeedback} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#ea580c', color: '#ffffff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}>
                <UserCheck size={16} /> 요청하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}