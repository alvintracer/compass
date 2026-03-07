// src/components/ResearchTasks.tsx
import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { useBreakpoint } from '../hooks/useBreakpoint';
import {
  Sparkles, Plus, ChevronDown, ChevronUp, Save,
  UserCheck, Loader2, BookOpen, Target,
} from 'lucide-react';

interface ResearchTasksProps { session: Session }

interface Path {
  id: string;
  title: string;
}

interface Research {
  id: string;
  topic: string;
  content_text: string;
  status: 'pending' | 'submitted' | 'completed';
  feedback_content: string;
  revised_content: string;
}

export default function ResearchTasks({ session }: ResearchTasksProps) {
  const { isMobile } = useBreakpoint();
  const [identityData, setIdentityData] = useState<{ id: string; content: string } | null>(null);
  const [paths, setPaths] = useState<Path[]>([]);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Research[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isPathLoading, setIsPathLoading] = useState(true);

  // 초기 데이터 로드 — InterviewQnA와 동일한 구조
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
          setPaths(pathData);
          setActivePathId(pathData[0].id);
        }
      }
      setIsPathLoading(false);
    };
    fetchInitialData();
  }, [session.user.id]);

  // Path가 바뀔 때마다 과제 목록 가져오기
  useEffect(() => {
    const fetchTasks = async () => {
      if (!activePathId) return;
      setTasks([]);
      const { data } = await supabase
        .from('research_tasks')
        .select('id, topic, content_text, status, feedback_content, revised_content')
        .eq('path_id', activePathId)
        .order('created_at', { ascending: true });
      if (data) setTasks(data as Research[]);
    };
    fetchTasks();
  }, [activePathId]);

  // AI 탐구 과제 생성
  const handleGenerateTopics = async () => {
    if (!identityData || !activePathId) return;
    setIsGenerating(true);
    try {
      const { data: tokenRemaining, error: tokenError } = await supabase.rpc('decrement_ai_token', { target_user_id: session.user.id });
      if (tokenError) throw new Error('AI 토큰이 부족합니다.');

      const activePathTitle = paths.find(p => p.id === activePathId)?.title || '';
      const existingTopics = tasks.map(t => t.topic);

      const { data, error } = await supabase.functions.invoke('process-interview', {
        body: {
          action: 'generate_research_topics',
          identityContent: identityData.content,
          pathName: activePathTitle,
          existingTopics,
        }
      });

      if (error) throw new Error(error.message);

      const newTopics: string[] = JSON.parse(data.result);
      const toInsert = newTopics.map(topic => ({
        user_id: session.user.id,
        path_id: activePathId,
        topic,
        content_text: '',
        status: 'pending',
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('research_tasks')
        .insert(toInsert)
        .select();

      if (insertError) throw new Error('과제 저장 중 오류가 발생했습니다.');

      if (inserted) {
        setTasks(prev => [...prev, ...(inserted as Research[])]);
        setExpandedId(inserted[0].id);
        alert(`✨ 탐구 과제 ${inserted.length}개가 추가되었습니다! (남은 AI 토큰: ${tokenRemaining}개)`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContentChange = (id: string, value: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, content_text: value } : t));
  };

  const handleSave = async (id: string) => {
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    const { error } = await supabase.from('research_tasks').update({
      content_text: t.content_text,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) alert('저장 중 오류가 발생했습니다.');
    else alert('✅ 조사 내용이 임시저장 되었습니다.');
  };

  const handleRequestFeedback = async (id: string, type: 'ai' | 'human') => {
    const t = tasks.find(t => t.id === id);
    if (!t || (t.content_text?.length || 0) < 500) {
      alert('조사 내용을 최소 500자 이상 작성해야 첨삭을 요청할 수 있어요.');
      return;
    }

    if (type === 'ai') {
      setIsEvaluating(true);
      try {
        const { data: tokenRemaining, error: tokenError } = await supabase.rpc('decrement_ai_token', { target_user_id: session.user.id });
        if (tokenError) throw new Error('AI 토큰이 부족합니다.');

        const { data, error } = await supabase.functions.invoke('process-interview', {
          body: {
            action: 'evaluate_research',
            topic: t.topic,
            contentText: t.content_text,
          }
        });

        if (error) throw new Error(error.message);

        const resultText: string = data.result;
        const revisedMatch = resultText.match(/\[첨삭된 내용\]([\s\S]*?)(?=\[컨설턴트 코멘트\]|$)/);
        const commentMatch = resultText.match(/\[컨설턴트 코멘트\]([\s\S]*?)$/);

        const revisedContent = revisedMatch ? revisedMatch[1].trim() : '';
        const feedbackComment = commentMatch ? commentMatch[1].trim() : resultText;

        await supabase.from('research_tasks').update({
          status: 'completed',
          revised_content: revisedContent,
          feedback_content: feedbackComment,
          content_text: t.content_text,
          updated_at: new Date().toISOString(),
        }).eq('id', id);

        setTasks(tasks.map(item =>
          item.id === id
            ? { ...item, status: 'completed', revised_content: revisedContent, feedback_content: feedbackComment }
            : item
        ));

        alert(`✨ AI 첨삭이 완료되었습니다! (남은 AI 토큰: ${tokenRemaining}개)`);
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsEvaluating(false);
      }
    } else {
      const confirm = window.confirm('컨설턴트 첨삭을 요청하시겠어요?');
      if (confirm) {
        try {
          const { error: tokenError } = await supabase.rpc('decrement_human_token', { target_user_id: session.user.id });
          if (tokenError) throw new Error('컨설턴트 토큰이 부족합니다.');

          await supabase.from('research_tasks').update({
            status: 'submitted',
            content_text: t.content_text,
            advisor_type: 'human',
            updated_at: new Date().toISOString(),
          }).eq('id', id);

          setTasks(tasks.map(item => item.id === id ? { ...item, status: 'submitted' } : item));
          alert('✅ 컨설턴트에게 첨삭 요청이 완료되었습니다!');
        } catch (err: any) {
          alert(err.message);
        }
      }
    }
  };

  if (isPathLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' }}>
        <Loader2 size={32} color="#7c3aed" className="animate-spin" />
      </div>
    );
  }

  if (!identityData) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
        <Target size={48} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
        <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>먼저 나의 정의서를 작성해 주세요</p>
        <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>정의서를 기반으로 AI가 탐구 과제를 생성합니다.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Path 선택 + 과제 생성 */}
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
        padding: isMobile ? '20px' : '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookOpen size={20} color="#7c3aed" />
            <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '22px', fontWeight: '800', color: '#0f172a' }}>
              로드맵 탐구 과제
            </h2>
          </div>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '4px 12px', borderRadius: '8px' }}>
            {tasks.filter(t => (t.content_text || '').length >= 1000).length} / 20 완료
          </span>
        </div>

        {/* Path 탭 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto' }}>
          {paths.map(p => (
            <button key={p.id} onClick={() => setActivePathId(p.id)}
              style={{
                padding: '9px 18px', borderRadius: '10px',
                border: `2px solid ${activePathId === p.id ? '#7c3aed' : '#e2e8f0'}`,
                backgroundColor: activePathId === p.id ? '#f5f3ff' : '#ffffff',
                color: activePathId === p.id ? '#7c3aed' : '#64748b',
                fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}>
              {p.title}
            </button>
          ))}
        </div>

        {/* 과제가 없을 때 */}
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <BookOpen size={40} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
            <p style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
              아직 탐구 과제가 없어요
            </p>
            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#94a3b8' }}>
              AI가 진로와 관련된 탐구 주제를 생성해 드려요
            </p>
            <button
              onClick={handleGenerateTopics}
              disabled={isGenerating || !identityData}
              style={{ padding: '14px 28px', backgroundColor: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: (isGenerating || !identityData) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)', opacity: (isGenerating || !identityData) ? 0.7 : 1 }}
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {isGenerating ? 'AI가 과제를 생성 중입니다...' : '탐구 과제 생성하기'}
            </button>
          </div>
        ) : (
          <>
            {/* 과제 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tasks.map((t, idx) => {
                const isExpanded = expandedId === t.id;
                const charCount = (t.content_text || '').length;
                const isQualified = charCount >= 1000;

                return (
                  <div key={t.id} style={{
                    backgroundColor: '#ffffff', borderRadius: '14px',
                    border: `1px solid ${t.status === 'completed' ? '#bbf7d0' : t.status === 'submitted' ? '#fde68a' : '#e2e8f0'}`,
                    overflow: 'hidden', transition: 'all 0.2s',
                  }}>
                    {/* 헤더 */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '16px 20px', cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '800',
                        backgroundColor: t.status === 'completed' ? '#dcfce7' : '#f5f3ff',
                        color: t.status === 'completed' ? '#16a34a' : '#7c3aed',
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', lineHeight: 1.4 }}>
                          {t.topic}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: isQualified ? '#dcfce7' : '#f1f5f9',
                            color: isQualified ? '#16a34a' : '#94a3b8',
                          }}>
                            {charCount.toLocaleString()}자{isQualified ? ' ✓' : ' / 1,000자'}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: t.status === 'completed' ? '#dcfce7' : t.status === 'submitted' ? '#fef3c7' : '#f1f5f9',
                            color: t.status === 'completed' ? '#16a34a' : t.status === 'submitted' ? '#d97706' : '#94a3b8',
                          }}>
                            {t.status === 'completed' ? '첨삭 완료' : t.status === 'submitted' ? '첨삭 대기' : '작성중'}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                    </div>

                    {/* 펼침 영역 */}
                    {isExpanded && (
                      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* 내용 작성 */}
                        <div>
                          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                            조사 내용 (최소 1,000자)
                          </label>
                          <textarea
                            value={t.content_text || ''}
                            onChange={e => handleContentChange(t.id, e.target.value)}
                            placeholder="진로와 관련된 주제에 대해 깊이 있는 조사 내용을 작성해 주세요..."
                            rows={10}
                            style={{
                              width: '100%', padding: '16px', borderRadius: '12px',
                              border: '1px solid #cbd5e1', fontSize: '14px',
                              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                              boxSizing: 'border-box', lineHeight: 1.8, color: '#334155',
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                            <span style={{ fontSize: '12px', color: isQualified ? '#16a34a' : '#94a3b8', fontWeight: '600' }}>
                              {charCount.toLocaleString()}자 {isQualified ? '✓ 기준 충족' : `(${(1000 - charCount).toLocaleString()}자 더 필요)`}
                            </span>
                          </div>
                        </div>

                        {/* 첨삭 결과 */}
                        {t.feedback_content && (
                          <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>💬 첨삭 코멘트</p>
                            <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{t.feedback_content}</div>
                          </div>
                        )}
                        {t.revised_content && (
                          <div style={{ backgroundColor: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>📝 첨삭된 내용</p>
                            <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{t.revised_content}</div>
                          </div>
                        )}

                        {/* 버튼 영역 */}
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
                          <button onClick={() => handleSave(t.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
                            <Save size={16} /> 임시저장
                          </button>
                          <button onClick={() => handleRequestFeedback(t.id, 'ai')}
                            disabled={isEvaluating}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: isEvaluating ? 'not-allowed' : 'pointer', opacity: isEvaluating ? 0.6 : 1, width: isMobile ? '100%' : 'auto' }}>
                            {isEvaluating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} AI 첨삭
                          </button>
                          <button onClick={() => handleRequestFeedback(t.id, 'human')}
                            disabled={t.status === 'submitted'}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: t.status === 'submitted' ? 'not-allowed' : 'pointer', opacity: t.status === 'submitted' ? 0.6 : 1, width: isMobile ? '100%' : 'auto' }}>
                            <UserCheck size={16} /> 컨설턴트 첨삭
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 추가 생성 버튼 */}
            <button
              onClick={handleGenerateTopics}
              disabled={isGenerating}
              style={{
                marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '14px', borderRadius: '12px',
                border: '2px dashed #d8b4fe', backgroundColor: '#faf5ff',
                color: '#7c3aed', fontSize: '14px', fontWeight: '700',
                cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.6 : 1,
              }}
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {isGenerating ? '과제 생성 중...' : `과제 3개 더 추가하기 · 현재 ${tasks.length}개`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
