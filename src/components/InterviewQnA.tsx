// src/components/InterviewQnA.tsx
import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { Sparkles, Plus, ChevronDown, ChevronUp, Save, UserCheck, MessageSquare, Loader2, Target } from 'lucide-react';
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
  revised_answer: string;     // 🌟 추가
  feedback_content: string;
}

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
  // DB 중복 인서트 방지용 플래그
  const isInsertingRef = useRef(false);

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
          // 🌟 [수정됨] 중복 Path가 생성된 경우 (React Strict Mode 더블 렌더링으로 인해)
          // 첫 번째(가장 오래된) 중복 항목을 DB에서 삭제하고 두 번째 것을 사용
          if (pathData.length >= 2 && pathData[0].title === pathData[1].title && pathData[0].title === '기본 진로 방향') {
            const duplicateId = pathData[0].id;
            await supabase.from('career_paths').delete().eq('id', duplicateId);
            const cleanPaths = pathData.slice(1); // 첫 번째 중복 제거
            setPaths(cleanPaths);
            setActivePathId(cleanPaths[0].id);
          } else {
            setPaths(pathData);
            setActivePathId(pathData[0].id);
          }
        } else {
          // Path가 없을 때만 새로 생성 (더블 렌더링 방어)
          if (isInsertingRef.current) return;
          isInsertingRef.current = true;

          const { data: newPath } = await supabase
            .from('career_paths')
            .insert([{ user_id: session.user.id, identity_id: idDoc.id, title: '기본 진로 방향' }])
            .select()
            .single();
            
          if (newPath) {
            setPaths([newPath]);
            setActivePathId(newPath.id);
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
        .select('id, question, answer_text, status, feedback_content')
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
    if (paths.length >= 3) {
      alert('진로 Path는 최대 3개까지 생성할 수 있어요.');
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

  // 3. AI 면접 질문 생성 (최초 생성 & 추가 생성 공통)
  const handleGenerateQuestions = async () => {
    if (!identityData || !activePathId) return;
    
    setIsGenerating(true);
    try {
      const { data: tokenRemaining, error: tokenError } = await supabase.rpc('decrement_ai_token', { target_user_id: session.user.id });
      if (tokenError) throw new Error('AI 토큰이 부족합니다.');

      const activePathTitle = paths.find(p => p.id === activePathId)?.title || '';

      // 🌟 [수정됨] 기존 질문 목록을 함께 전달 → AI가 중복 없이 새 질문 생성
      const existingQuestions = questions.map(q => q.question);

      const { data, error } = await supabase.functions.invoke('process-interview', {
        body: {
          action: 'generate_questions',
          identityContent: identityData.content,
          pathName: activePathTitle,
          existingQuestions, // 기존 질문 전달 (중복 방지용)
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

    // 🌟 [수정됨] 첨삭 답변 / 코멘트 파싱
    const resultText: string = data.result;
    const revisedMatch = resultText.match(/\[첨삭된 답변\]([\s\S]*?)(?=\[컨설턴트 코멘트\]|$)/);
    const commentMatch = resultText.match(/\[컨설턴트 코멘트\]([\s\S]*?)$/);

    const revisedAnswer = revisedMatch ? revisedMatch[1].trim() : '';
    const feedbackComment = commentMatch ? commentMatch[1].trim() : resultText;

    await supabase.from('interview_qnas').update({
      status: 'completed',
      revised_answer: revisedAnswer,   // 첨삭된 답변
      feedback_content: feedbackComment, // 코멘트
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
      // 휴먼 컨설턴트 (한태우) - 100 휴먼 토큰 소모
      const confirm = window.confirm('컨설턴트 첨삭을 요청하시겠어요? (100 휴먼 토큰 소모)');
      if (confirm) {
        try {
          const { error: tokenError } = await supabase.rpc('decrement_human_token', { target_user_id: session.user.id });
          if (tokenError) throw new Error('휴먼 토큰이 부족합니다.');

          await supabase.from('interview_qnas').update({ status: 'submitted', answer_text: q.answer_text }).eq('id', qId);
          setQuestions(questions.map(item => item.id === qId ? { ...item, status: 'submitted' } : item));

          // 텔레그램 알림 트리거
          await supabase.functions.invoke('process-interview', {
            body: { action: 'human_request', qnaId: qId }
          });

          alert('✅ 한태우 컨설턴트에게 첨삭 요청이 완료되었습니다!');
        } catch (err: any) {
          alert(err.message);
        }
      }
    }
  };

  if (isPathLoading) {
    return <div style={{ padding: isMobile ? '20px' : '40px', textAlign: 'center' }}><Loader2 className="animate-spin" /> 데이터를 불러오는 중...</div>;
  }

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
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>정의서를 분석해서 날카로운 질문을 만들고 있습니다...</p>
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
      <div style={{ display: 'flex', gap: '12px', marginBottom: isMobile ? '16px' : '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', overflowX: isMobile ? 'auto' : 'visible', flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
        {paths.map(path => (
          <button
            key={path.id}
            onClick={() => setActivePathId(path.id)}
            style={{
              padding: '10px 20px', borderRadius: '20px', fontSize: '15px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease', flexShrink: 0,
              backgroundColor: activePathId === path.id ? '#0f172a' : '#f8fafc',
              color: activePathId === path.id ? '#ffffff' : '#64748b',
              border: activePathId === path.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
            }}
          >
            <Target size={16} /> {path.title}
          </button>
        ))}
        {paths.length < 3 && (
          <button 
            onClick={handleAddPath}
            style={{ padding: '10px 20px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', color: '#2563eb', border: '1px dashed #bfdbfe' }}
          >
            <Plus size={16} /> Path 추가
          </button>
        )}
      </div>

      {/* 질문 없을 때 */}
      {questions.length === 0 ? (
        <div style={{ padding: '64px 20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <MessageSquare size={48} color="#94a3b8" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
          <h4 style={{ margin: '0 0 12px 0', fontSize: isMobile ? '16px' : '18px', color: '#0f172a', fontWeight: '700' }}>아직 생성된 면접 질문이 없어요</h4>
          <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '15px' }}>학생의 본질 정의서를 바탕으로 AI가 최적의 예상 질문을 뽑아줍니다.</p>
          <button 
            onClick={handleGenerateQuestions} disabled={isGenerating || !identityData}
            style={{ padding: '14px 28px', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: (isGenerating || !identityData) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', opacity: (isGenerating || !identityData) ? 0.7 : 1 }}
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {isGenerating ? 'AI가 질문을 생성 중입니다...' : '면접 질문 생성하기 '}
          </button>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
                  {q.status === 'pending' && <span style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>작성중</span>}
                  {q.status === 'submitted' && <span style={{ padding: '4px 10px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>컨설턴트 대기중</span>}
                  {q.status === 'completed' && <span style={{ padding: '4px 10px', backgroundColor: '#dcfce3', color: '#166534', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>첨삭 완료</span>}
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

          {/* 🌟 [추가됨] 질문 추가 생성 버튼 - 질문 목록 하단에 항상 표시 */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
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
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {isGenerating ? '질문 생성 중...' : `질문 3개 더 추가하기  · 현재 ${questions.length}개`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}