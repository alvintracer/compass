// src/components/FileVault.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  Upload, Loader2, Trash2, Eye, X, Search,
  ChevronDown, ChevronLeft, ChevronRight, Image as ImageIcon, FileText, BookOpen, Grid3x3, List,
  Crop, Check, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';

interface FileVaultProps {
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

export interface UserFile {
  id: string;
  user_id: string;
  file_type: 'school_record' | 'grade' | 'essay' | 'other';
  file_name: string;
  storage_path: string;
  public_url: string;
  created_at: string;
}

const FILE_TYPE_META = {
  school_record: { label: '생활기록부',   color: '#2563eb', bg: '#eff6ff', icon: BookOpen },
  grade:         { label: '성적표',        color: '#7c3aed', bg: '#f5f3ff', icon: FileText },
  essay:         { label: '생기부 첨삭',   color: '#059669', bg: '#ecfdf5', icon: FileText },
  other:         { label: '기타',          color: '#64748b', bg: '#f8fafc', icon: ImageIcon },
};

type SortKey = 'newest' | 'oldest' | 'type' | 'name';

// ── 크롭 모달 ────────────────────────────────────────────────────────────────
interface CropModalProps {
  src: string;
  onDone: (cropped: Blob) => void;
  onClose: () => void;
}

function CropModal({ src, onDone, onClose }: CropModalProps) {
  const isMobile    = useIsMobile();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const [zoom, setZoom]     = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, w: 200, h: 200 }); // 모바일을 위해 초기 크기 축소
  const [resizing, setResizing] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // 모바일 화면 너비에 맞춰 크롭 영역 동적 계산
  const DISPLAY_W = isMobile ? Math.min(window.innerWidth - 40, 560) : 560;
  const DISPLAY_H = isMobile ? DISPLAY_W * 0.75 : 420;

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    
    // 크롭박스 모서리 리사이즈 핸들 체크 (15px 범위로 터치 대응)
    const handles = [
      { id: 'tl', x: cropBox.x, y: cropBox.y },
      { id: 'tr', x: cropBox.x + cropBox.w, y: cropBox.y },
      { id: 'bl', x: cropBox.x, y: cropBox.y + cropBox.h },
      { id: 'br', x: cropBox.x + cropBox.w, y: cropBox.y + cropBox.h },
    ];
    for (const h of handles) {
      if (Math.abs(mx - h.x) < 15 && Math.abs(my - h.y) < 15) {
        setResizing(h.id);
        return;
      }
    }
    // 크롭박스 내부 드래그
    if (mx > cropBox.x && mx < cropBox.x + cropBox.w && my > cropBox.y && my < cropBox.y + cropBox.h) {
      setDragging(true);
      setDragStart({ x: mx - cropBox.x, y: my - cropBox.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    
    if (dragging) {
      setCropBox(prev => ({
        ...prev,
        x: Math.max(0, Math.min(DISPLAY_W - prev.w, mx - dragStart.x)),
        y: Math.max(0, Math.min(DISPLAY_H - prev.h, my - dragStart.y)),
      }));
    } else if (resizing) {
      setCropBox(prev => {
        let { x, y, w, h } = prev;
        if (resizing === 'br') { w = Math.max(40, mx - x); h = Math.max(40, my - y); }
        if (resizing === 'bl') { w = Math.max(40, x + w - mx); x = Math.min(x + prev.w - 40, mx); h = Math.max(40, my - y); }
        if (resizing === 'tr') { w = Math.max(40, mx - x); h = Math.max(40, y + h - my); y = Math.min(y + prev.h - 40, my); }
        if (resizing === 'tl') {
          w = Math.max(40, x + w - mx); x = Math.min(x + prev.w - 40, mx);
          h = Math.max(40, y + h - my); y = Math.min(y + prev.h - 40, my);
        }
        return { x, y, w, h };
      });
    }
  };

  const handleMouseUp = () => { setDragging(false); setResizing(null); };

  const handleCrop = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const scaleX = img.naturalWidth  / DISPLAY_W;
    const scaleY = img.naturalHeight / DISPLAY_H;
    canvas.width  = cropBox.w * scaleX;
    canvas.height = cropBox.h * scaleY;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img,
      cropBox.x * scaleX, cropBox.y * scaleY, cropBox.w * scaleX, cropBox.h * scaleY,
      0, 0, canvas.width, canvas.height
    );
    canvas.toBlob(blob => { if (blob) onDone(blob); }, 'image/jpeg', 0.92);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '20px' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: isMobile ? '0' : '20px', width: isMobile ? '100%' : '620px', height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100vh' : '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>이미지 크롭</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>크롭 영역을 드래그해서 조정하세요</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#94a3b8" /></button>
        </div>

        <div style={{ padding: isMobile ? '16px 20px' : '20px', overflow: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{ position: 'relative', width: `${DISPLAY_W}px`, height: `${DISPLAY_H}px`, overflow: 'hidden', borderRadius: '10px', cursor: dragging ? 'grabbing' : 'default', border: '1px solid #e2e8f0', margin: '0 auto', touchAction: 'none' }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} onTouchCancel={handleMouseUp}
          >
            <img
              ref={imgRef}
              src={src}
              onLoad={() => setImgLoaded(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
              draggable={false}
            />
            {imgLoaded && (
              <>
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h,
                  border: '2px solid #ffffff',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                  cursor: 'grab',
                  pointerEvents: 'none',
                }}>
                  {[1,2].map(i => (
                    <div key={`v${i}`} style={{ position: 'absolute', left: `${i*33.3}%`, top: 0, bottom: 0, width: '1px', backgroundColor: 'rgba(255,255,255,0.4)' }} />
                  ))}
                  {[1,2].map(i => (
                    <div key={`h${i}`} style={{ position: 'absolute', top: `${i*33.3}%`, left: 0, right: 0, height: '1px', backgroundColor: 'rgba(255,255,255,0.4)' }} />
                  ))}
                  {[
                    { pos: 'tl', style: { top: -6, left: -6 } },
                    { pos: 'tr', style: { top: -6, right: -6 } },
                    { pos: 'bl', style: { bottom: -6, left: -6 } },
                    { pos: 'br', style: { bottom: -6, right: -6 } },
                  ].map(h => (
                    <div key={h.pos} style={{ position: 'absolute', width: '14px', height: '14px', backgroundColor: '#ffffff', borderRadius: '3px', cursor: 'nwse-resize', ...h.style, pointerEvents: 'auto' }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '12px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#475569', fontSize: '14px', fontWeight: '600', cursor: 'pointer', flex: isMobile ? 1 : 'none' }}>취소</button>
          <button onClick={handleCrop} style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: isMobile ? 1 : 'none' }}>
            <Crop size={15} /> 적용
          </button>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

// ── 파일 선택 모달 (불러오기) ─────────────────────────────────────────────────
interface FilePickerModalProps {
  files: UserFile[];
  onSelect: (file: UserFile) => void;
  onClose: () => void;
  filterType?: UserFile['file_type'][];
}

export function FilePickerModal({ files, onSelect, onClose, filterType }: FilePickerModalProps) {
  const isMobile = useIsMobile();
  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState<SortKey>('newest');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [preview, setPreview] = useState<UserFile | null>(null);
  const [cropTarget, setCropTarget] = useState<UserFile | null>(null);

  const filtered = files
    .filter(f => filterType ? filterType.includes(f.file_type) : true)
    .filter(f => typeFilter === 'all' || f.file_type === typeFilter)
    .filter(f => f.file_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === 'type')   return a.file_type.localeCompare(b.file_type);
      if (sort === 'name')   return a.file_name.localeCompare(b.file_name);
      return 0;
    });

  if (cropTarget) {
    return (
      <CropModal
        src={cropTarget.public_url}
        onDone={async (blob) => {
          const croppedFile = new File([blob], cropTarget.file_name, { type: 'image/jpeg' });
          const url = URL.createObjectURL(croppedFile);
          onSelect({ ...cropTarget, public_url: url });
          setCropTarget(null);
        }}
        onClose={() => setCropTarget(null)}
      />
    );
  }

  if (preview) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        onClick={() => setPreview(null)}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          <img src={preview.public_url} alt={preview.file_name} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', objectFit: 'contain' }} />
          <div style={{ position: 'absolute', bottom: isMobile ? '-56px' : 'auto', top: isMobile ? 'auto' : '-48px', right: isMobile ? 'auto' : 0, display: 'flex', gap: '8px', justifyContent: 'center', width: isMobile ? '100%' : 'auto' }}>
            <button onClick={() => { setCropTarget(preview); setPreview(null); }}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Crop size={14} /> 크롭 후 선택
            </button>
            <button onClick={() => onSelect(preview)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} /> 바로 선택
            </button>
            <button onClick={() => setPreview(null)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '20px' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: isMobile ? '0' : '20px', width: isMobile ? '100%' : '720px', height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100vh' : '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>파일 불러오기</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>이전에 업로드한 이미지를 선택하세요</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              placeholder="파일명 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', cursor: 'pointer', outline: 'none' }}>
              <option value="all">전체 유형</option>
              {Object.entries(FILE_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', cursor: 'pointer', outline: 'none' }}>
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="type">유형순</option>
              <option value="name">이름순</option>
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 20px' : '16px 24px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
              <ImageIcon size={36} strokeWidth={1.5} style={{ marginBottom: '12px' }} />
              <p style={{ margin: 0, fontSize: '14px' }}>파일이 없어요</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '130px' : '160px'}, 1fr))`, gap: '12px' }}>
              {filtered.map(f => {
                const meta = FILE_TYPE_META[f.file_type];
                return (
                  <div key={f.id}
                    style={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '3/4', backgroundColor: '#f8fafc', overflow: 'hidden' }}
                      onClick={() => setPreview(f)}>
                      <img src={f.public_url} alt={f.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {!isMobile && (
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0)', transition: 'background-color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.4)'; e.currentTarget.style.opacity = '1'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0)'; e.currentTarget.style.opacity = '0'; }}>
                          <Eye size={20} color="#ffffff" />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: meta.bg, color: meta.color, fontWeight: '600' }}>{meta.label}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={e => { e.stopPropagation(); setCropTarget(f); }}
                            style={{ padding: '4px 6px', borderRadius: '5px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Crop size={12} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); onSelect(f); }}
                            style={{ padding: '4px 8px', borderRadius: '5px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                            선택
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인: FileVault 페이지 ────────────────────────────────────────────────────
export default function FileVault({ session }: FileVaultProps) {
  const isMobile = useIsMobile();
  const [files, setFiles]         = useState<UserFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sort, setSort]           = useState<SortKey>('newest');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch]       = useState('');
  const [viewMode, setViewMode]   = useState<'grid' | 'list'>('grid');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [uploadType, setUploadType] = useState<UserFile['file_type']>('school_record');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('user_files')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setFiles((data as UserFile[]) ?? []);
    setIsLoading(false);
  }, [session.user.id]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const ext  = file.name.split('.').pop();
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('user-files').upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('user-files').getPublicUrl(path);
        await supabase.from('user_files').insert({
          user_id:      session.user.id,
          file_type:    uploadType,
          file_name:    file.name,
          storage_path: path,
          public_url:   urlData.publicUrl,
        });
      }
      await load();
    } catch (err: any) {
      alert('업로드 실패: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (f: UserFile) => {
    if (!confirm(`"${f.file_name}" 파일을 삭제할까요?`)) return;
    await supabase.storage.from('user-files').remove([f.storage_path]);
    await supabase.from('user_files').delete().eq('id', f.id);
    setFiles(prev => prev.filter(x => x.id !== f.id));
  };

  const filtered = files
    .filter(f => typeFilter === 'all' || f.file_type === typeFilter)
    .filter(f => f.file_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === 'type')   return a.file_type.localeCompare(b.file_type);
      if (sort === 'name')   return a.file_name.localeCompare(b.file_name);
      return 0;
    });

  const counts = Object.keys(FILE_TYPE_META).reduce((acc, k) => {
    acc[k] = files.filter(f => f.file_type === k).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px' }}>

      {/* 미리보기 모달 */}
      {previewIndex !== null && filtered[previewIndex] && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setPreviewIndex(null)}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '20px', width: '100%', maxWidth: '900px', height: '100%', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            
            <button 
              onClick={() => setPreviewIndex(prev => Math.max(0, (prev || 0) - 1))}
              disabled={previewIndex === 0}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: previewIndex === 0 ? 'not-allowed' : 'pointer', opacity: previewIndex === 0 ? 0.3 : 1, color: '#fff', flexShrink: 0 }}>
              <ChevronLeft size={24} />
            </button>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', borderRadius: '12px', overflow: 'hidden', height: '100%' }}>
              {/\.(jpg|jpeg|png|gif|webp)$/i.test(filtered[previewIndex].public_url || filtered[previewIndex].file_name) ? (
                <img src={filtered[previewIndex].public_url} alt={filtered[previewIndex].file_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ color: '#fff', fontSize: '15px', textAlign: 'center' }}>
                  지원하지 않는 형식입니다.<br/><br/>
                  <a href={filtered[previewIndex].public_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>직접 열기</a>
                </div>
              )}
            </div>

            <button 
              onClick={() => setPreviewIndex(prev => Math.min(filtered.length - 1, (prev || 0) + 1))}
              disabled={previewIndex === filtered.length - 1}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: previewIndex === filtered.length - 1 ? 'not-allowed' : 'pointer', opacity: previewIndex === filtered.length - 1 ? 0.3 : 1, color: '#fff', flexShrink: 0 }}>
              <ChevronRight size={24} />
            </button>

            <button onClick={() => setPreviewIndex(null)}
              style={{ position: 'absolute', top: isMobile ? 'auto' : '-40px', bottom: isMobile ? '-50px' : 'auto', right: isMobile ? 'auto' : 0, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '8px 20px', color: '#ffffff', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '32px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '24px', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '16px' : '0' }}>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: isMobile ? '20px' : '22px', fontWeight: '800', color: '#0f172a' }}>나의 파일</h3>
            <p style={{ margin: 0, fontSize: isMobile ? '13px' : '15px', color: '#64748b' }}>업로드한 모든 이미지를 한 곳에서 관리해요</p>
          </div>
          {/* 업로드 버튼 영역 */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
            <select value={uploadType} onChange={e => setUploadType(e.target.value as UserFile['file_type'])}
              style={{ flex: isMobile ? 1 : 'none', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', cursor: 'pointer', outline: 'none', fontWeight: '600' }}>
              {Object.entries(FILE_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ flex: isMobile ? 2 : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '14px', fontWeight: '700', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1, whiteSpace: 'nowrap' }}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? '업로드 중' : '이미지 업로드'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
          </div>
        </div>

        {/* 유형별 카운트 (스크롤 허용) */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', whiteSpace: 'nowrap' }}>
          <div
            onClick={() => setTypeFilter('all')}
            style={{ minWidth: '80px', flex: isMobile ? 'none' : 1, padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', border: `1px solid ${typeFilter === 'all' ? '#0f172a' : '#e2e8f0'}`, backgroundColor: typeFilter === 'all' ? '#0f172a' : '#f8fafc', display: 'inline-block' }}>
            <div style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '800', color: typeFilter === 'all' ? '#ffffff' : '#0f172a' }}>{files.length}</div>
            <div style={{ fontSize: '12px', color: typeFilter === 'all' ? '#94a3b8' : '#64748b', fontWeight: '600', marginTop: '2px' }}>전체</div>
          </div>
          {Object.entries(FILE_TYPE_META).map(([k, v]) => {
            const active = typeFilter === k;
            return (
              <div key={k} onClick={() => setTypeFilter(active ? 'all' : k)}
                style={{ minWidth: '90px', flex: isMobile ? 'none' : 1, padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', border: `1px solid ${active ? v.color : '#e2e8f0'}`, backgroundColor: active ? v.bg : '#f8fafc', display: 'inline-block' }}>
                <div style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '800', color: active ? v.color : '#0f172a' }}>{counts[k] ?? 0}</div>
                <div style={{ fontSize: '12px', color: active ? v.color : '#64748b', fontWeight: '600', marginTop: '2px' }}>{v.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 파일 목록 */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {/* 툴바 */}
        <div style={{ padding: isMobile ? '16px 20px' : '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 'auto', position: 'relative' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input placeholder="파일명 검색..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', width: isMobile ? '100%' : 'auto', justifyContent: 'flex-end' }}>
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#475569', cursor: 'pointer', outline: 'none' }}>
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="type">유형순</option>
              <option value="name">이름순</option>
            </select>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
              {([['grid', Grid3x3], ['list', List]] as const).map(([m, Icon]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', backgroundColor: viewMode === m ? '#ffffff' : 'transparent', color: viewMode === m ? '#0f172a' : '#94a3b8', display: 'flex', alignItems: 'center' }}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: isMobile ? '20px' : '24px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
              <Loader2 size={32} className="animate-spin" style={{ marginBottom: '12px', display: 'inline-block' }} />
              <p style={{ margin: 0 }}>불러오는 중...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
              <ImageIcon size={36} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '12px' }} />
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#475569', fontWeight: '600' }}>파일이 없어요</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>위에서 이미지를 업로드해 보세요</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '180px'}, 1fr))`, gap: '16px' }}>
              {filtered.map((f, idx) => {
                const meta = FILE_TYPE_META[f.file_type];
                return (
                  <div key={f.id} style={{ borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', transition: 'all 0.15s' }}>
                    <div style={{ position: 'relative', aspectRatio: '3/4', backgroundColor: '#f8fafc', cursor: 'pointer', overflow: 'hidden' }}
                      onClick={() => setPreviewIndex(idx)}>
                      <img src={f.public_url} alt={f.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', top: '8px', left: '8px', padding: '3px 8px', borderRadius: '5px', backgroundColor: meta.bg, color: meta.color, fontSize: '11px', fontWeight: '700' }}>{meta.label}</div>
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '6px' }}>{f.file_name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(f.created_at).toLocaleDateString('ko-KR')}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => setPreviewIndex(idx)}
                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Eye size={14} color="#475569" />
                          </button>
                          <button onClick={() => handleDelete(f)}
                            style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#fee2e2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={14} color="#ef4444" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // 리스트 뷰
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((f, idx) => {
                const meta = FILE_TYPE_META[f.file_type];
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '16px', padding: '12px 16px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                    <img src={f.public_url} alt={f.file_name} style={{ width: '48px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => setPreviewIndex(idx)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '5px', backgroundColor: meta.bg, color: meta.color, fontWeight: '600' }}>{meta.label}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(f.created_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexDirection: isMobile ? 'column' : 'row' }}>
                      <button onClick={() => setPreviewIndex(idx)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <Eye size={13} /> {isMobile ? '' : '보기'}
                      </button>
                      <button onClick={() => handleDelete(f)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#fee2e2', color: '#dc2626', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <Trash2 size={13} /> {isMobile ? '' : '삭제'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}