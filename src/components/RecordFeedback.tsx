// src/components/RecordFeedback.tsx
import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  Sparkles, UserCheck, CheckCircle2, UploadCloud,
  ChevronDown, ChevronUp, Loader2, FileEdit, ImagePlus,
  MessageSquare, X
} from 'lucide-react';
import { useBreakpoint } from '../hooks/useBreakpoint';

interface RecordFeedbackProps {
  session: Session;
}

interface RecordItem {
  id: string;
  category: string;
  request_text: string;
  content_text: string | null;
  image_url: string | null;
  advisor_type: 'ai' | 'human';
  status: 'pending' | 'submitted' | 'completed';
  feedback_result: string | null;
  created_at: string;
}

type CategoryType = 'task' | 'record';

const CATEGORIES = [
  { label: '세부능력특기사항',   type: 'record' as CategoryType },
  { label: '수행평가',          type: 'task'   as CategoryType },
  { label: '보고서',            type: 'task'   as CategoryType },
  { label: '독서활동',          type: 'record' as CategoryType },
  { label: '행동특성및종합의견', type: 'record' as CategoryType },
  { label: '자율/동아리/진로',  type: 'record' as CategoryType },
];

const getCategoryType = (cat: string): CategoryType =>
  CATEGORIES.find(c => c.label === cat)?.type ?? 'record';

const PLACEHOLDER: Record<CategoryType, { request: string; content: string }> = {
  task: {
    request: '어떤 과제인가요? 주제, 분량, 제출일 등 알고 있는 내용을 자유롭게 써주세요.\n예) 사회 수업 시사 이슈 보고서, A4 2장, 주제 자유',
    content: '공지사항, 이미 작성한 초안, 선생님 피드백 등 참고할 내용을 붙여넣어 주세요. (선택)',
  },
  record: {
    request: '어떤 내용을 생기부에 담고 싶으신가요? 활동, 탐구 주제, 느낀 점 등을 자유롭게 써주세요.\n예) 환경 동아리에서 플라스틱 줄이기 캠페인 기획함, 진로랑 연결하고 싶음',
    content: '활동 기록, 독서 메모, 선생님 코멘트 등 참고할 내용을 붙여넣어 주세요. (선택)',
  },
};

export default function RecordFeedback({ session }: RecordFeedbackProps) {
  const { isMobile } = useBreakpoint();
  const [category, setCategory]         = useState('세부능력특기사항');
  const [requestText, setRequestText]   = useState('');
  const [contentText, setContentText]   = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview]   = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading]   = useState(false);

  const [records, setRecords]         = useState<RecordItem[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedR, setExpandedR]     = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const catType = getCategoryType(category);

  // 1. 첨삭 기록 로드
  useEffect(() => {
    const fetchRecords = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('record_feedbacks')
        .select('id, category, request_text, content_text, image_url, advisor_type, status, feedback_result, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (!error && data) setRecords(data as RecordItem[]);
      setIsLoading(false);
    };
    fetchRecords();
  }, [session.user.id]);

  // 카테고리 변경 시 입력 초기화
  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setRequestText('');
    setContentText('');
    setSelectedImage(null);
    setImagePreview(null);
  };

  // 2. 이미지 선택 → GPT-4o Vision으로 텍스트 추출
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
    setIsOcrLoading(true);

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const { data: fnData, error: fnError } = await supabase.functions.invoke('process-record', {
        body: { action: 'extract_text', imageBase64: base64, mimeType: file.type },
      });

      if (fnError) throw new Error(fnError.message);

      setContentText(prev =>
        prev
          ? prev + '\n\n[이미지에서 추출된 텍스트]\n' + fnData.result
          : '[이미지에서 추출된 텍스트]\n' + fnData.result
      );
    } catch (err: any) {
      alert('이미지 텍스트 추출 실패: ' + err.message);
    } finally {
      setIsOcrLoading(false);
    }
  };

  // 3. 이미지 Storage 업로드
  const uploadImage = async (file: File): Promise<string | null> => {
    const ext      = file.name.split('.').pop();
    const fileName = `${session.user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('record-images').upload(fileName, file);
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from('record-images').getPublicUrl(fileName);
    return publicUrl;
  };

  // 4. 첨삭 요청 제출
  const handleSubmit = async (advisorType: 'ai' | 'human') => {
    if (!requestText.trim()) {
      alert('무엇을 도와줄지 먼저 입력해 주세요!');
      return;
    }
    if (advisorType === 'human') {
      if (!window.confirm('전문 컨설턴트에게 심층 첨삭을 요청하시겠어요? (1 컨설턴트 토큰 사용)')) return;
    }

    setIsSubmitting(true);
    try {
      const rpcName = advisorType === 'ai' ? 'decrement_ai_token' : 'decrement_human_token';
      const { error: tokenError } = await supabase.rpc(rpcName, { target_user_id: session.user.id });
      if (tokenError) throw new Error(advisorType === 'ai' ? 'AI 토큰이 부족합니다.' : '컨설턴트 토큰이 부족합니다.');

      let imageUrl: string | null = null;
      if (selectedImage) imageUrl = await uploadImage(selectedImage);

      const { data: newRecord, error: insertError } = await supabase
        .from('record_feedbacks')
        .insert([{
          user_id:      session.user.id,
          category,
          request_text: requestText.trim(),
          content_text: contentText.trim() || null,
          image_url:    imageUrl,
          advisor_type: advisorType,
          status:       'pending',
        }])
        .select()
        .single();

      if (insertError || !newRecord) throw new Error('요청 저장 중 오류가 발생했습니다.');

      setRecords(prev => [newRecord as RecordItem, ...prev]);
      setExpandedR(newRecord.id);
      setRequestText('');
      setContentText('');
      setSelectedImage(null);
      setImagePreview(null);

      if (advisorType === 'ai') alert('🤖 AI가 작업을 시작했어요! 잠시 기다려 주세요...');

      const { data: fnData, error: fnError } = await supabase.functions.invoke('process-record', {
        body: {
          action:       advisorType === 'ai' ? 'ai_feedback' : 'human_request',
          recordId:     newRecord.id,
          requestText:  requestText.trim(),
          contentText:  contentText.trim() || '',
          category,
          categoryType: catType,
        },
      });

      if (fnError) throw new Error(fnError.message);

      if (advisorType === 'ai') {
        setRecords(prev =>
          prev.map(r => r.id === newRecord.id
            ? { ...r, status: 'completed', feedback_result: fnData.result }
            : r
          )
        );
        alert('✨ 완료되었습니다!');
      } else {
        setRecords(prev =>
          prev.map(r => r.id === newRecord.id ? { ...r, status: 'submitted' } : r)
        );
        alert('✅ 한태우 컨설턴트에게 요청이 완료되었습니다!\n보통 24시간 내로 결과가 도착해요.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '20px' : '32px' }}>

      {/* ── 작성 폼 ── */}
      <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '24px 20px' : '40px', borderRadius: '20px', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>

        {/* AI 처리 로딩 오버레이 */}
        {isSubmitting && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <div style={{ width: '56px', height: '56px', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '20px' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a', fontWeight: '700' }}>AI가 결과물을 만들고 있어요</h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>고품질 첨삭을 위해 20~40초 정도 소요됩니다...</p>
          </div>
        )}
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>

        <div style={{ marginBottom: isMobile ? '24px' : '32px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '20px' : '22px', color: '#0f172a', fontWeight: '800' }}>상시 생기부 첨삭소</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '13px' : '15px' }}>수행평가, 세특 등 다듬고 싶은 내용을 올리면 완벽한 결과물로 만들어 드려요.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '20px' : '28px' }}>

          {/* STEP 1 · 카테고리 */}
          <div>
            <label style={{ display: 'block', marginBottom: '12px', fontWeight: '700', color: '#0f172a', fontSize: isMobile ? '13px' : '14px' }}>STEP 1 · 카테고리 선택</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.label}
                  onClick={() => handleCategoryChange(cat.label)}
                  style={{
                    padding: isMobile ? '8px 12px' : '10px 16px', borderRadius: '12px', fontSize: isMobile ? '13px' : '14px', fontWeight: '600',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    backgroundColor: category === cat.label ? (cat.type === 'task' ? '#fef3c7' : '#eff6ff') : '#f8fafc',
                    color:           category === cat.label ? (cat.type === 'task' ? '#92400e' : '#2563eb') : '#64748b',
                    border:          category === cat.label ? (cat.type === 'task' ? '1px solid #fde68a' : '1px solid #bfdbfe') : '1px solid #e2e8f0',
                  }}
                >
                  {cat.type === 'task' ? '📋 ' : '📄 '}{cat.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', backgroundColor: catType === 'task' ? '#fffbeb' : '#eff6ff', border: `1px solid ${catType === 'task' ? '#fde68a' : '#bfdbfe'}` }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: catType === 'task' ? '#92400e' : '#1e40af' }}>
                {catType === 'task'
                  ? '📋 과제류 — 방향성 제시 및 초안 작성/수정'
                  : '📄 생기부류 — 생활기록부에 들어갈 완성형 문장 작성'}
              </span>
            </div>
          </div>

          {/* STEP 2 · Q1: 무엇을 도와줄까요 */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '700', color: '#0f172a', fontSize: isMobile ? '13px' : '14px' }}>
              STEP 2 · 무엇을 도와줄까요?
            </label>
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748b' }}>
              {catType === 'task'
                ? '과제 주제, 요구사항, 분량 등 알고 있는 내용을 자유롭게 알려주세요.'
                : '생기부에 담고 싶은 활동이나 탐구 내용을 자유롭게 써주세요.'}
            </p>
            <textarea
              value={requestText}
              onChange={e => setRequestText(e.target.value)}
              placeholder={PLACEHOLDER[catType].request}
              style={{
                width: '100%', minHeight: isMobile ? '120px' : '100px', padding: isMobile ? '14px' : '16px', borderRadius: '12px',
                border: '1px solid #cbd5e1', fontSize: isMobile ? '14px' : '15px', outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: '#f8fafc',
                color: '#0f172a', lineHeight: '1.6'
              }}
            />
          </div>

          {/* STEP 3 · Q2: 관련 내용 업로드 */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '700', color: '#0f172a', fontSize: isMobile ? '13px' : '14px' }}>
              STEP 3 · 관련 내용 업로드 <span style={{ fontWeight: '500', color: '#94a3b8', fontSize: '12px' }}>(선택)</span>
            </label>
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748b' }}>
              {catType === 'task'
                ? '공지사항, 초안, 참고 자료 등을 텍스트로 붙여넣거나 사진으로 올려주세요.'
                : '활동 기록, 독서 메모, 선생님 코멘트 등을 텍스트로 붙여넣거나 사진으로 올려주세요.'}
            </p>

            <textarea
              value={contentText}
              onChange={e => setContentText(e.target.value)}
              placeholder={PLACEHOLDER[catType].content}
              style={{
                width: '100%', minHeight: '80px', padding: isMobile ? '14px' : '16px', borderRadius: '12px',
                border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: '#f8fafc',
                color: '#0f172a', lineHeight: '1.6', marginBottom: '12px'
              }}
            />

            {/* 이미지 업로드 */}
            <div
              onClick={() => !isOcrLoading && fileInputRef.current?.click()}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px',
                padding: isMobile ? '20px' : '24px', border: '2px dashed #cbd5e1', borderRadius: '12px',
                backgroundColor: selectedImage ? '#f0fdf4' : '#ffffff', textAlign: 'center',
                cursor: isOcrLoading ? 'default' : 'pointer', transition: 'all 0.2s ease'
              }}
            >
              <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" style={{ display: 'none' }} />

              {isOcrLoading ? (
                <>
                  <Loader2 size={28} className="animate-spin" color="#2563eb" />
                  <span style={{ fontSize: '13px', color: '#2563eb', fontWeight: '600' }}>이미지에서 텍스트를 추출하고 있어요...</span>
                </>
              ) : selectedImage ? (
                <>
                  <CheckCircle2 size={28} color="#16a34a" />
                  <span style={{ fontSize: '13px', color: '#166534', fontWeight: '600' }}>{selectedImage.name} — 텍스트 추출 완료</span>
                  {imagePreview && (
                    <img src={imagePreview} alt="미리보기" style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #bbf7d0', marginTop: '8px' }} />
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedImage(null); setImagePreview(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' }}
                  >
                    <X size={14} /> 이미지 삭제
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud size={28} color="#94a3b8" strokeWidth={1.5} />
                  <span style={{ fontSize: '14px', color: '#475569', fontWeight: '600' }}>공지사항, 초안, 참고자료 사진 업로드</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>AI가 자동으로 텍스트를 읽어드려요</span>
                </>
              )}
            </div>
          </div>

          {/* 제출 버튼 */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'flex-end', gap: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={() => handleSubmit('ai')}
              disabled={isSubmitting || isOcrLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px 24px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: (isSubmitting || isOcrLoading) ? 'not-allowed' : 'pointer', opacity: (isSubmitting || isOcrLoading) ? 0.6 : 1, width: isMobile ? '100%' : 'auto' }}
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              AI 첨삭 
            </button>
            <button
              onClick={() => handleSubmit('human')}
              disabled={isSubmitting || isOcrLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px 24px', backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: (isSubmitting || isOcrLoading) ? 'not-allowed' : 'pointer', opacity: (isSubmitting || isOcrLoading) ? 0.6 : 1, width: isMobile ? '100%' : 'auto' }}
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
              컨설턴트 심층 첨삭 
            </button>
          </div>
        </div>
      </div>

      {/* ── 나의 첨삭 기록 ── */}
      <div>
        <h4 style={{ margin: '0 0 16px 0', fontSize: isMobile ? '18px' : '20px', color: '#0f172a', fontWeight: '800' }}>나의 첨삭 기록</h4>

        {isLoading ? (
          <div style={{ padding: isMobile ? '32px' : '40px', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <Loader2 className="animate-spin" color="#94a3b8" style={{ display: 'inline-block' }} />
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: isMobile ? '32px' : '40px', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
            <FileEdit size={36} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '12px' }} />
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>아직 요청한 첨삭 기록이 없어요.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {records.map(record => (
              <div key={record.id} style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                
                {/* 리스트 헤더 (모바일/PC 분기) */}
                <div
                  onClick={() => setExpandedR(expandedR === record.id ? null : record.id)}
                  style={{ padding: isMobile ? '16px' : '20px', cursor: 'pointer', backgroundColor: expandedR === record.id ? '#f8fafc' : '#ffffff', transition: 'background-color 0.15s' }}
                >
                  {isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', color: '#475569', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>{record.category}</span>
                        {expandedR === record.id ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '700', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {record.request_text || '요청 내용이 없습니다.'}
                        </span>
                        {record.image_url && <ImagePlus size={14} color="#94a3b8" style={{ flexShrink: 0 }} />}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{formatDate(record.created_at)}</span>
                        {record.status === 'pending'   && <span style={{ padding: '3px 8px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: '12px', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><Loader2 size={10} className="animate-spin" />{record.advisor_type === 'ai' ? 'AI 작업중' : '처리중'}</span>}
                        {record.status === 'submitted' && <span style={{ padding: '3px 8px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>컨설턴트 대기중</span>}
                        {record.status === 'completed' && <span style={{ padding: '3px 8px', backgroundColor: '#dcfce3', color: '#166534', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>완료</span>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, marginRight: '16px' }}>
                        <span style={{ padding: '6px 12px', backgroundColor: '#f1f5f9', color: '#475569', borderRadius: '8px', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>{record.category}</span>
                        <span style={{ fontSize: '15px', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {record.request_text}
                        </span>
                        {record.image_url && <ImagePlus size={16} color="#94a3b8" style={{ flexShrink: 0 }} />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{formatDate(record.created_at)}</span>
                        {record.status === 'pending'   && <span style={{ padding: '4px 10px', backgroundColor: '#eff6ff', color: '#2563eb', borderRadius: '12px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><Loader2 size={12} className="animate-spin" />{record.advisor_type === 'ai' ? 'AI 작업중' : '처리중'}</span>}
                        {record.status === 'submitted' && <span style={{ padding: '4px 10px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>컨설턴트 대기중</span>}
                        {record.status === 'completed' && <span style={{ padding: '4px 10px', backgroundColor: '#dcfce3', color: '#166534', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>완료</span>}
                        {expandedR === record.id ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                      </div>
                    </div>
                  )}
                </div>

                {/* 상세 내용 영역 */}
                {expandedR === record.id && (
                  <div style={{ padding: isMobile ? '20px 16px' : '24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>요청 내용</h5>
                      <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '8px', color: '#334155', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{record.request_text}</div>
                    </div>
                    {record.content_text && (
                      <div style={{ marginBottom: '16px' }}>
                        <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>참고 자료</h5>
                        <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '8px', color: '#334155', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{record.content_text}</div>
                      </div>
                    )}
                    {record.image_url && <img src={record.image_url} alt="첨부" style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }} />}
                    
                    <div>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: record.advisor_type === 'ai' ? '#2563eb' : '#ea580c', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {record.advisor_type === 'ai' ? <Sparkles size={14} /> : <UserCheck size={14} />}
                        {record.advisor_type === 'ai' ? 'AI 결과물' : '한태우 컨설턴트 결과물'}
                      </h5>
                      <div style={{ padding: isMobile ? '16px' : '20px', backgroundColor: record.advisor_type === 'ai' ? '#eff6ff' : '#fff7ed', borderRadius: '12px', color: '#0f172a', fontSize: isMobile ? '14px' : '15px', lineHeight: '1.8', border: `1px solid ${record.advisor_type === 'ai' ? '#bfdbfe' : '#fed7aa'}`, whiteSpace: 'pre-wrap' }}>
                        {(record.status === 'pending' || record.status === 'submitted') ? (
                          <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                            {record.status === 'submitted' ? <MessageSquare size={16} /> : <Loader2 size={16} className="animate-spin" />}
                            {record.status === 'submitted' ? '컨설턴트가 검토 중이에요. (통상 24시간 소요)' : '결과를 작성하고 있어요...'}
                          </span>
                        ) : (record.feedback_result || '결과를 불러오는 중...')}
                      </div>
                    </div>
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