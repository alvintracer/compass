// src/components/IdentityDocument.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import ReactMarkdown from 'react-markdown';
import {
  Edit3, Wand2, UserCheck, Loader2, CheckCircle2, Send,
  Camera, Plus, Trash2, Pencil, FolderOpen, Upload, BookOpen
} from 'lucide-react';
import { FilePickerModal, type UserFile } from './FileVault';
import { useBreakpoint } from '../hooks/useBreakpoint';

interface IdentityDocumentProps {
  session: Session;
}

interface SchoolRecordImage {
  id: string;
  file_name: string;
  public_url: string;
  storage_path: string;
  created_at: string;
}

export default function IdentityDocument({ session }: IdentityDocumentProps) {
  const { isMobile } = useBreakpoint();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [status, setStatus] = useState<'generating' | 'draft' | 'pending_human' | 'completed'>('draft');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isAILoading, setIsAILoading]   = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const [isEditing, setIsEditing]       = useState(false);

  // 생기부 이미지
  const [srImages, setSrImages]         = useState<SchoolRecordImage[]>([]);
  const [srUploading, setSrUploading]   = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [vaultFiles, setVaultFiles]     = useState<UserFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 정의서 불러오기 ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAndCheck = async () => {
      const { data: docData } = await supabase
        .from('identity_documents')
        .select('id, content, status')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (docData) {
        setDocumentId(docData.id);
        if (docData.status === 'generating') {
          setIsGenerating(true);
          generateInitialIdentity(docData.id);
        } else {
          setContent(docData.content);
          setStatus(docData.status as any);
        }
      }
    };
    fetchAndCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]);

  // ── 생기부 이미지 불러오기 ───────────────────────────────────────────────
  const loadSrImages = useCallback(async () => {
    const { data } = await supabase
      .from('user_files')
      .select('id, file_name, public_url, storage_path, created_at')
      .eq('user_id', session.user.id)
      .eq('file_type', 'school_record')
      .order('created_at', { ascending: true });
    setSrImages((data as SchoolRecordImage[]) ?? []);
  }, [session.user.id]);

  // FilePickerModal용 전체 파일 불러오기
  const loadVaultFiles = useCallback(async () => {
    const { data } = await supabase
      .from('user_files')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setVaultFiles((data as UserFile[]) ?? []);
  }, [session.user.id]);

  useEffect(() => {
    loadSrImages();
    loadVaultFiles();
  }, [loadSrImages, loadVaultFiles]);

  // ── 생기부 이미지 업로드 ─────────────────────────────────────────────────
  const handleSrUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSrUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext  = file.name.split('.').pop();
        const path = `${session.user.id}/school_record/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('user-files').upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('user-files').getPublicUrl(path);
        await supabase.from('user_files').insert({
          user_id:      session.user.id,
          file_type:    'school_record',
          file_name:    file.name,
          storage_path: path,
          public_url:   urlData.publicUrl,
        });
      }
      await loadSrImages();
      await loadVaultFiles();
    } catch (err: any) {
      alert('업로드 실패: ' + err.message);
    } finally {
      setSrUploading(false);
    }
  };

  // FileVault에서 이미 있는 파일 선택
  const handlePickFromVault = async (file: UserFile) => {
    setShowFilePicker(false);
    // 이미 school_record로 저장된 파일이면 그냥 목록 새로고침
    if (file.file_type === 'school_record') {
      await loadSrImages();
      return;
    }
    // 다른 유형이면 school_record로 복사 삽입
    await supabase.from('user_files').insert({
      user_id:      session.user.id,
      file_type:    'school_record',
      file_name:    file.file_name,
      storage_path: file.storage_path,
      public_url:   file.public_url,
    });
    await loadSrImages();
  };

  const handleSrDelete = async (img: SchoolRecordImage) => {
    if (!confirm(`"${img.file_name}" 을 삭제할까요?`)) return;
    await supabase.storage.from('user-files').remove([img.storage_path]);
    await supabase.from('user_files').delete().eq('id', img.id);
    setSrImages(prev => prev.filter(x => x.id !== img.id));
  };

  // ── 최초 자동 생성 ───────────────────────────────────────────────────────
  const generateInitialIdentity = async (docId: string) => {
    try {
      const { data: obData } = await supabase
        .from('onboarding_data')
        .select('dreams_and_hobbies, target_majors')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!obData) throw new Error('온보딩 데이터를 찾을 수 없습니다.');

      const onboardingText = `[희망 전공]\n${obData.target_majors.join(', ')}\n\n[나를 알아가는 질문 답변]\n${obData.dreams_and_hobbies}`;

      const { data, error } = await supabase.functions.invoke('generate-identity', {
        body: { action: 'initial', onboardingData: onboardingText },
      });
      if (error) throw new Error(error.message);

      const newContent = data.editedContent;
      await supabase
        .from('identity_documents')
        .update({ content: newContent, status: 'draft' })
        .eq('id', docId);

      setContent(newContent);
      setStatus('draft');
    } catch (err: any) {
      alert('초기 정의서 생성 중 오류: ' + err.message);
      setContent('생성 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setStatus('draft');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── AI 첨삭 ─────────────────────────────────────────────────────────────
  const handleAIEdit = async () => {
    if (!aiPromptText.trim()) { alert('AI에게 요청할 수정 방향을 입력해 주세요!'); return; }
    setShowAIPrompt(false);
    setIsAILoading(true);
    try {
      const { data: tokenRemaining, error: tokenError } = await supabase.rpc('decrement_ai_token', {
        target_user_id: session.user.id,
      });
      if (tokenError) throw new Error('AI 토큰이 부족하거나 차감 중 문제가 발생했습니다.');

      const { data, error } = await supabase.functions.invoke('generate-identity', {
        body: { action: 'edit', currentContent: content, userPrompt: aiPromptText },
      });
      if (error) throw new Error(error.message);

      if (data?.editedContent) {
        if (documentId) {
          await supabase.from('identity_documents').update({ content: data.editedContent }).eq('id', documentId);
        }
        setContent(data.editedContent);
        alert(`✨ AI 첨삭 완료! (남은 AI 토큰: ${tokenRemaining}개)`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsAILoading(false);
      setAiPromptText('');
    }
  };

  // ── 컨설턴트 첨삭 요청 ───────────────────────────────────────────────────
  const handleHumanEdit = async () => {
    if (!confirm('컨설턴트 첨삭을 요청하시겠어요? (100 휴먼 토큰 소모)')) return;
    if (documentId) {
      await supabase.from('identity_documents').update({ status: 'pending_human' }).eq('id', documentId);
    }
    setStatus('pending_human');
    alert('✅ 한태우 컨설턴트에게 첨삭 요청이 완료되었습니다!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── 나의 정의서 카드 ── */}
      <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '40px', borderRadius: '20px', border: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>

        {/* 최초 생성 로딩 */}
        {isGenerating && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <Loader2 className="animate-spin" size={56} color="#0f172a" style={{ marginBottom: '24px' }} />
            <h3 style={{ fontSize: '22px', color: '#0f172a', fontWeight: '800', marginBottom: '12px' }}>학생의 본질을 꿰뚫어보는 중...</h3>
            <p style={{ color: '#64748b', fontSize: '15px', textAlign: 'center', lineHeight: '1.6' }}>
              작성해주신 온보딩 데이터를 바탕으로<br />가장 완벽한 입시 나침반(정의서)을 생성하고 있어요. (최초 1회 무료)
            </p>
          </div>
        )}

        {/* AI 첨삭 로딩 */}
        {isAILoading && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <Loader2 className="animate-spin" size={48} color="#2563eb" style={{ marginBottom: '16px' }} />
            <h3 style={{ fontSize: '18px', color: '#0f172a', fontWeight: '700', marginBottom: '8px' }}>AI가 정의서를 고도화하고 있어요</h3>
            <p style={{ color: '#64748b', fontSize: '14px' }}>요청하신 프롬프트를 바탕으로 다듬는 중입니다...</p>
          </div>
        )}

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px', ...(isMobile ? { flexWrap: 'wrap' as const, gap: '12px' } : {}) }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? '18px' : '22px', color: '#0f172a', fontWeight: '800' }}>📋 나의 정의서</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {status === 'generating'     && <span style={{ padding: '6px 12px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>⏳ 생성중</span>}
            {status === 'draft'          && <span style={{ padding: '6px 12px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>📝 초안</span>}
            {status === 'pending_human'  && <span style={{ padding: '6px 12px', backgroundColor: '#fef3c7', color: '#d97706', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>⏳ 컨설턴트 확인중</span>}
            {status === 'completed'      && <span style={{ padding: '6px 12px', backgroundColor: '#dcfce3', color: '#166534', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}><CheckCircle2 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />최종 완성본</span>}
          </div>
        </div>

        {/* 에디터 */}
        <div style={{ backgroundColor: '#f8fafc', padding: isMobile ? '16px' : '32px', borderRadius: '16px', minHeight: '300px', fontSize: '15px', lineHeight: '1.8', color: '#334155', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
          {isEditing ? (
            <textarea value={content} onChange={e => setContent(e.target.value)}
              style={{ width: '100%', minHeight: '300px', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          ) : (
            <div className="markdown-body"><ReactMarkdown>{content}</ReactMarkdown></div>
          )}
        </div>

        {/* AI 프롬프트 입력창 */}
        {showAIPrompt && (
          <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600', color: '#1e3a8a', fontSize: '14px' }}>
              어떤 부분을 어떻게 수정할까요? (예: 리더십 부분을 좀 더 강조해서 전문적으로 써줘)
            </label>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
              <input type="text" value={aiPromptText} onChange={e => setAiPromptText(e.target.value)}
                placeholder="AI에게 지시할 내용을 입력하세요."
                style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #93c5fd', outline: 'none', fontSize: '15px' }}
                onKeyDown={e => { if (e.key === 'Enter') handleAIEdit(); }}
              />
              <button onClick={handleAIEdit}
                style={{ padding: '0 24px', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', ...(isMobile ? { width: '100%', justifyContent: 'center', padding: '12px 24px' } : {}) }}>
                <Send size={16} /> 적용하기
              </button>
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={async () => {
            if (isEditing && documentId) {
              await supabase.from('identity_documents').update({ content }).eq('id', documentId);
            }
            setIsEditing(!isEditing);
          }} style={{ padding: '12px 20px', backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}) }}>
            <Edit3 size={18} /> {isEditing ? '저장하기' : '직접 수정'}
          </button>
          <button onClick={() => setShowAIPrompt(!showAIPrompt)}
            style={{ padding: '12px 20px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}) }}>
            <Wand2 size={18} /> AI 첨삭 
          </button>
          <button onClick={handleHumanEdit}
            disabled={status === 'pending_human' || status === 'generating'}
            style={{ padding: '12px 20px', backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: (status === 'pending_human' || status === 'generating') ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (status === 'pending_human' || status === 'generating') ? 0.6 : 1, ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}) }}>
            <UserCheck size={18} /> 컨설턴트 첨삭 
          </button>
        </div>

        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>

      {/* ── 나의 생활기록부 카드 ── */}
      <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '32px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #f1f5f9', ...(isMobile ? { gap: '12px' } : {}) }}>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={20} color="#2563eb" /> 나의 생활기록부
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              생기부를 페이지별로 캡처해서 올려주세요. 컨설턴트가 직접 확인해요.
            </p>
          </div>
          {/* 업로드 버튼들 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { loadVaultFiles(); setShowFilePicker(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s', ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}) }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569'; }}
            >
              <FolderOpen size={15} /> 불러오기
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={srUploading}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: srUploading ? 'not-allowed' : 'pointer', opacity: srUploading ? 0.7 : 1, ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}) }}
            >
              {srUploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {srUploading ? '업로드 중...' : '새로 추가'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { handleSrUpload(e.target.files); e.target.value = ''; }} />
          </div>
        </div>

        {/* 이미지 그리드 */}
        {srImages.length === 0 ? (
          <div
            style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '14px', border: '2px dashed #cbd5e1', cursor: 'pointer' }}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
          >
            <Camera size={36} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '12px' }} />
            <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#475569', fontWeight: '600' }}>생기부 이미지를 추가해 주세요</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>페이지별로 캡처해서 올리면 돼요 · 여러 장 한번에 선택 가능</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '120px' : '160px'}, 1fr))`, gap: '14px' }}>
            {srImages.map((img, idx) => (
              <div key={img.id} style={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ position: 'relative', aspectRatio: '3/4', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
                  <img src={img.public_url} alt={img.file_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => window.open(img.public_url, '_blank')}
                  />
                  {/* 페이지 번호 */}
                  <div style={{ position: 'absolute', bottom: '8px', left: '8px', backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: '5px', padding: '2px 8px', fontSize: '12px', fontWeight: '700', color: '#ffffff' }}>
                    {idx + 1}p
                  </div>
                  {/* 삭제 버튼 */}
                  <button onClick={() => handleSrDelete(img)}
                    style={{ position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; }}>
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.file_name}</div>
                </div>
              </div>
            ))}

            {/* + 추가 슬롯 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ borderRadius: '12px', border: '2px dashed #e2e8f0', aspectRatio: '3/4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: '#fafafa' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; (e.currentTarget.children[0] as HTMLElement).style.color = '#2563eb'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; (e.currentTarget.children[0] as HTMLElement).style.color = '#cbd5e1'; }}>
              <Plus size={22} color="#cbd5e1" style={{ transition: 'color 0.15s' }} />
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>페이지 추가</span>
            </div>
          </div>
        )}

        {srImages.length > 0 && (
          <p style={{ margin: '16px 0 0 0', fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>
            총 {srImages.length}장 · 클릭하면 원본 크기로 볼 수 있어요
          </p>
        )}
      </div>

      {/* FilePickerModal */}
      {showFilePicker && (
        <FilePickerModal
          files={vaultFiles}
          onSelect={handlePickFromVault}
          onClose={() => setShowFilePicker(false)}
        />
      )}
    </div>
  );
}