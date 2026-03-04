// src/components/GradeManager.tsx
import { useState, useRef, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  Upload, Loader2, Pencil, Check, X,
  ChevronDown, ChevronUp, AlertCircle, Camera,
  Plus, Trash2, Save, PenLine
} from 'lucide-react';

interface GradeManagerProps {
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

interface Subject {
  id: string;
  name: string;
  category?: string | null; 
  credit: number;
  grade: number | null;
  isExcluded: boolean;
}

interface SemesterData {
  key: string;
  label: string;
  subjects: Subject[];
}

interface YearData {
  isLoading:    boolean;
  isAnalyzed:   boolean;
  isSaving:     boolean;
  images:       (File | null)[];
  imagePreviews:(string | null)[];
  semesters:    SemesterData[];
  inputMode:    'image' | 'manual';
}

const EXCLUDED_KEYWORDS = ['음악', '미술', '체육', '탐구실험', '논술'];
const isExcludedSubject = (name: string) =>
  EXCLUDED_KEYWORDS.some(kw => name.includes(kw));

const SUBJECT_CATEGORIES = ['국어', '수학', '영어', '사회', '과학', '기술가정/제2외국어/한문/교양', '예체능'];
const EXCLUDED_CATEGORIES = ['예체능', '기술가정/제2외국어/한문/교양'];

const SUBJECT_MAP: Record<string, string> = {
  국어: '국어', 문학: '국어', 독서: '국어', 화법: '국어', 언어: '국어', 매체: '국어',
  수학: '수학', '수학Ⅰ': '수학', '수학Ⅱ': '수학', 미적분: '수학', 확률: '수학', 기하: '수학',
  영어: '영어', '영어Ⅰ': '영어', '영어Ⅱ': '영어', '영어독해': '영어', '영어회화': '영어',
  한국사: '사회', 사회: '사회', 통합사회: '사회', 생활과윤리: '사회', 윤리: '사회',
  정치: '사회', 법과정치: '사회', 경제: '사회', 세계사: '사회', 한국지리: '사회', 세계지리: '사회',
  과학: '과학', 통합과학: '과학', 물리: '과학', 화학: '과학', 생명과학: '과학', 지구과학: '과학',
};

const getSubjectCategory = (sub: Pick<Subject, 'name' | 'category'>): string | null => {
  if (sub.category) return sub.category;
  for (const [keyword, category] of Object.entries(SUBJECT_MAP)) {
    if (sub.name.includes(keyword)) return category;
  }
  return null;
};

const calcAvg = (subjects: Subject[]): number | null => {
  const valid = subjects.filter(s => !s.isExcluded && s.grade !== null && s.grade >= 1 && s.grade <= 9);
  if (valid.length === 0) return null;
  const totalCredit = valid.reduce((a, s) => a + s.credit, 0);
  if (totalCredit === 0) return null;
  return valid.reduce((a, s) => a + s.credit * s.grade!, 0) / totalCredit;
};

const calcAvgByCategories = (subjects: Subject[], cats: string[]): number | null => {
  const filtered = subjects.filter(s => {
    if (s.isExcluded || s.grade === null) return false;
    return cats.includes(getSubjectCategory(s) ?? '');
  });
  if (filtered.length === 0) return null;
  return calcAvg(filtered.map(s => ({ ...s, isExcluded: false })));
};

const getGradeColor = (g: number | null) => {
  if (g === null) return '#94a3b8';
  if (g <= 1.5) return '#16a34a';
  if (g <= 2.5) return '#2563eb';
  if (g <= 3.5) return '#7c3aed';
  if (g <= 4.5) return '#d97706';
  return '#dc2626';
};
const getGradeBg = (g: number | null) => {
  if (g === null) return '#f8fafc';
  if (g <= 1.5) return '#f0fdf4';
  if (g <= 2.5) return '#eff6ff';
  if (g <= 3.5) return '#f5f3ff';
  if (g <= 4.5) return '#fffbeb';
  return '#fef2f2';
};

const YEARS = [
  { year: 1, label: '1학년', semKeys: ['1-1', '1-2'] },
  { year: 2, label: '2학년', semKeys: ['2-1', '2-2'] },
  { year: 3, label: '3학년', semKeys: ['3-1', '3-2'] },
];

const makeSemLabel = (key: string) => {
  const [y, s] = key.split('-');
  return `${y}학년 ${s}학기`;
};

const makeEmptyYear = (): YearData => ({
  isLoading:    false,
  isAnalyzed:   false,
  isSaving:     false,
  images:       [null, null, null, null],
  imagePreviews:[null, null, null, null],
  semesters:    [],
  inputMode:    'image',
});

export default function GradeManager({ session }: GradeManagerProps) {
  const isMobile = useIsMobile();
  const [studentType, setStudentType] = useState<'현역' | '재수'>('현역');
  const [activeYear, setActiveYear]   = useState<1 | 2 | 3>(1);
  const [yearData, setYearData]       = useState<Record<number, YearData>>({
    1: makeEmptyYear(), 2: makeEmptyYear(), 3: makeEmptyYear(),
  });
  const [expandedSem, setExpandedSem] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ semKey: string; subId: string; field: 'grade' | 'credit' } | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [newRow, setNewRow]           = useState<{ semKey: string; category: string; name: string; credit: string; grade: string } | null>(null);
  const [manualSem, setManualSem]     = useState<Record<number, string>>({ 1: '1-1', 2: '2-1', 3: '3-1' });

  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    const loadSaved = async () => {
      const { data } = await supabase
        .from('grade_semesters')
        .select('sem_key, subjects')
        .eq('user_id', session.user.id);
      if (!data || data.length === 0) return;

      setYearData(prev => {
        const next = { ...prev };
        [1, 2, 3].forEach(yr => {
          const semKeys = [`${yr}-1`, `${yr}-2`];
          const matched = data.filter(d => semKeys.includes(d.sem_key));
          if (matched.length === 0) return;
          const semesters: SemesterData[] = matched.map(d => ({
            key:      d.sem_key,
            label:    makeSemLabel(d.sem_key),
            subjects: d.subjects as Subject[],
          }));
          next[yr] = { ...next[yr], isAnalyzed: true, semesters };
        });
        return next;
      });
    };
    loadSaved();
  }, [session.user.id]);

  const activeSemKeys = (year: number) => {
    if (year < 3) return [`${year}-1`, `${year}-2`];
    return studentType === '현역' ? ['3-1'] : ['3-1', '3-2'];
  };

  const addImageSlot = (year: number) => {
    setYearData(prev => {
      const yd = { ...prev[year] };
      if (yd.images.length >= 4) return prev;
      yd.images = [...yd.images, null];
      yd.imagePreviews = [...yd.imagePreviews, null];
      return { ...prev, [year]: yd };
    });
  };

  const removeImage = (year: number, idx: number) => {
    setYearData(prev => {
      const yd = { ...prev[year] };
      const imgs = [...yd.images]; const prevs = [...yd.imagePreviews];
      imgs[idx] = null; prevs[idx] = null;
      const nonEmpty = imgs.map((img, i) => ({ img, prev: prevs[i] })).filter(x => x.img !== null);
      const slots = nonEmpty.length > 0 ? nonEmpty : [{ img: null, prev: null }];
      yd.images = slots.map(x => x.img);
      yd.imagePreviews = slots.map(x => x.prev);
      return { ...prev, [year]: yd };
    });
  };

  const handleImageSelect = (year: number, idx: number, file: File) => {
    const preview = URL.createObjectURL(file);
    setYearData(prev => {
      const yd = { ...prev[year] };
      const imgs = [...yd.images]; const prevs = [...yd.imagePreviews];
      imgs[idx] = file; prevs[idx] = preview;
      return { ...prev, [year]: { ...yd, images: imgs, imagePreviews: prevs, isAnalyzed: false } };
    });
  };

  const handleAnalyzeYear = async (year: number) => {
    const yd = yearData[year];
    const validImages = yd.images.filter((img): img is File => img !== null);
    if (validImages.length === 0) { alert('이미지를 최소 1장 업로드해 주세요.'); return; }

    setYearData(prev => ({ ...prev, [year]: { ...prev[year], isLoading: true } }));
    try {
      const base64Images = await Promise.all(
        validImages.map(file => new Promise<{ base64: string; mimeType: string }>((res, rej) => {
          const reader = new FileReader();
          reader.onload  = () => res({ base64: (reader.result as string).split(',')[1], mimeType: file.type });
          reader.onerror = rej;
          reader.readAsDataURL(file);
        }))
      );

      const { data: fnData, error: fnError } = await supabase.functions.invoke('process-grades', {
        body: { action: 'extract_grades', images: base64Images, year },
      });
      if (fnError) throw new Error(fnError.message);

      const extracted: { semKey: string; subjects: { name: string; credit: number; grade: number | null }[] }[] =
        JSON.parse(fnData.result);

      const semesters: SemesterData[] = extracted
        .filter(sem => activeSemKeys(year).includes(sem.semKey))
        .map(sem => ({
          key:   sem.semKey,
          label: makeSemLabel(sem.semKey),
          subjects: sem.subjects.map((s, i) => ({
            id:         `${sem.semKey}-${i}`,
            name:       s.name,
            category:   null,
            credit:     s.credit,
            grade:      s.grade,
            isExcluded: isExcludedSubject(s.name) || s.grade === null,
          })),
        }));

      setYearData(prev => ({
        ...prev,
        [year]: { ...prev[year], isLoading: false, isAnalyzed: true, semesters },
      }));
      if (semesters.length > 0) setExpandedSem(semesters[0].key);
    } catch (err: any) {
      alert('분석 실패: ' + err.message);
      setYearData(prev => ({ ...prev, [year]: { ...prev[year], isLoading: false } }));
    }
  };

  const handleSave = async (year: number) => {
    const yd = yearData[year];
    if (yd.semesters.length === 0) return;

    setYearData(prev => ({ ...prev, [year]: { ...prev[year], isSaving: true } }));
    try {
      const upserts = yd.semesters.map(sem => ({
        user_id:    session.user.id,
        sem_key:    sem.key,
        subjects:   sem.subjects,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('grade_semesters')
        .upsert(upserts, { onConflict: 'user_id,sem_key' });
      if (error) throw new Error(error.message);
      alert('✅ 저장됐어요!');
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    } finally {
      setYearData(prev => ({ ...prev, [year]: { ...prev[year], isSaving: false } }));
    }
  };

  const startEdit = (semKey: string, subId: string, field: 'grade' | 'credit', val: any) => {
    setEditingCell({ semKey, subId, field });
    setEditValue(val?.toString() ?? '');
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { semKey, subId, field } = editingCell;
    const num  = parseFloat(editValue);
    const year = parseInt(semKey.split('-')[0]);
    setYearData(prev => {
      const yd = { ...prev[year] };
      yd.semesters = yd.semesters.map(sem => {
        if (sem.key !== semKey) return sem;
        return {
          ...sem,
          subjects: sem.subjects.map(s => {
            if (s.id !== subId) return s;
            if (field === 'grade')  return { ...s, grade: isNaN(num) ? null : Math.min(9, Math.max(1, Math.round(num))) };
            if (field === 'credit') return { ...s, credit: isNaN(num) ? s.credit : Math.max(1, Math.round(num)) };
            return s;
          }),
        };
      });
      return { ...prev, [year]: yd };
    });
    setEditingCell(null);
  };

  const toggleExclude = (semKey: string, subId: string) => {
    const year = parseInt(semKey.split('-')[0]);
    setYearData(prev => {
      const yd = { ...prev[year] };
      yd.semesters = yd.semesters.map(sem => {
        if (sem.key !== semKey) return sem;
        return { ...sem, subjects: sem.subjects.map(s => s.id === subId ? { ...s, isExcluded: !s.isExcluded } : s) };
      });
      return { ...prev, [year]: yd };
    });
  };

  const deleteSubject = (semKey: string, subId: string) => {
    const year = parseInt(semKey.split('-')[0]);
    setYearData(prev => {
      const yd = { ...prev[year] };
      yd.semesters = yd.semesters.map(sem => {
        if (sem.key !== semKey) return sem;
        return { ...sem, subjects: sem.subjects.filter(s => s.id !== subId) };
      });
      return { ...prev, [year]: yd };
    });
  };

  const startNewRow = (semKey: string) => {
    setNewRow({ semKey, category: '', name: '', credit: '2', grade: '' });
    setExpandedSem(semKey);
  };

  const commitNewRow = () => {
    if (!newRow || !newRow.name.trim()) { setNewRow(null); return; }
    const year   = parseInt(newRow.semKey.split('-')[0]);
    const grade  = parseInt(newRow.grade);
    const credit = parseInt(newRow.credit) || 2;
    const cat = newRow.category || null;
    const subject: Subject = {
      id:         `${newRow.semKey}-manual-${Date.now()}`,
      name:       newRow.name.trim(),
      category:   cat,
      credit:     Math.max(1, credit),
      grade:      isNaN(grade) || grade < 1 || grade > 9 ? null : grade,
      isExcluded: cat ? EXCLUDED_CATEGORIES.includes(cat) : isExcludedSubject(newRow.name.trim()),
    };

    setYearData(prev => {
      const yd = { ...prev[year] };
      const semExists = yd.semesters.find(s => s.key === newRow.semKey);
      if (semExists) {
        yd.semesters = yd.semesters.map(s =>
          s.key === newRow.semKey ? { ...s, subjects: [...s.subjects, subject] } : s
        );
      } else {
        yd.semesters = [
          ...yd.semesters,
          { key: newRow.semKey, label: makeSemLabel(newRow.semKey), subjects: [subject] },
        ].sort((a, b) => a.key.localeCompare(b.key));
      }
      return { ...prev, [year]: { ...yd, isAnalyzed: true } };
    });
    setNewRow(null);
  };

  const getYearAvg = (yr: number, cats: string[] | null): number | null => {
    const semKeys = activeSemKeys(yr);
    const subjects: Subject[] = [];
    yearData[yr].semesters
      .filter(sem => semKeys.includes(sem.key))
      .forEach(sem => subjects.push(...sem.subjects));
    if (cats === null) return calcAvg(subjects);
    return calcAvgByCategories(subjects, cats);
  };

  const weightedYearAvg = (cats: string[] | null, weights: [number, number, number]): number | null => {
    const avgs = [1, 2, 3].map(yr => getYearAvg(yr, cats));
    const pairs = avgs.map((a, i) => [a, weights[i]] as [number | null, number]);
    const valid = pairs.filter(([a]) => a !== null) as [number, number][];
    if (valid.length === 0) return null;
    const tw = valid.reduce((s, [, w]) => s + w, 0);
    return valid.reduce((s, [a, w]) => s + a * (w / tw), 0);
  };

  const CASES = [
    { label: '학종 대표 성적', desc: '전과목(예체능 제외) 학년별 33:33:33', highlight: true,
      getValue: () => weightedYearAvg(null, [1,1,1]) },
    { label: '교과 국영수사과 33:33:33', desc: '주요 5교과 학년별 동일 비중', highlight: true,
      getValue: () => weightedYearAvg(['국어','영어','수학','사회','과학'], [1,1,1]) },
    { label: '교과 국영수사 33:33:33', desc: '국어·영어·수학·사회',
      getValue: () => weightedYearAvg(['국어','영어','수학','사회'], [1,1,1]) },
    { label: '교과 국영수과 33:33:33', desc: '국어·영어·수학·과학',
      getValue: () => weightedYearAvg(['국어','영어','수학','과학'], [1,1,1]) },
    { label: '교과 국영수사과 20:40:40', desc: '1학년 20% / 2·3학년 40%씩',
      getValue: () => weightedYearAvg(['국어','영어','수학','사회','과학'], [0.2,0.4,0.4]) },
    { label: '교과 국영수사과 20:20:60', desc: '1·2학년 20%씩 / 3학년 60%',
      getValue: () => weightedYearAvg(['국어','영어','수학','사회','과학'], [0.2,0.2,0.6]) },
  ];

  const yd = yearData[activeYear];
  const activeYearInfo = YEARS.find(y => y.year === activeYear)!;
  const hasData = yd.isAnalyzed && yd.semesters.length > 0;
  const currentManualSem = manualSem[activeYear];

  // ── 렌더링 ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '20px' : '32px' }}>

      {/* 성적 산출 결과 */}
      <div style={{ backgroundColor: '#ffffff', padding: isMobile ? '20px' : '40px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '24px', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '16px' : '0' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '20px' : '22px', color: '#0f172a', fontWeight: '800' }}>나의 성적</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '13px' : '15px' }}>학년별로 성적표 사진을 올리거나 직접 입력하면 전형별 평균 등급을 자동 계산해드려요.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '4px', alignSelf: isMobile ? 'stretch' : 'auto' }}>
            {(['현역','재수'] as const).map(t => (
              <button key={t} onClick={() => setStudentType(t)} style={{
                flex: isMobile ? 1 : 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '700',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                backgroundColor: studentType === t ? '#0f172a' : 'transparent',
                color: studentType === t ? '#ffffff' : '#64748b',
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '150px' : '260px'}, 1fr))`, gap: '12px' }}>
          {CASES.map((c, i) => {
            const val = c.getValue();
            return (
              <div key={i} style={{ padding: '20px', borderRadius: '16px', backgroundColor: c.highlight ? getGradeBg(val) : '#f8fafc', border: `1px solid ${c.highlight && val ? getGradeColor(val) + '40' : '#e2e8f0'}` }}>
                <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>{c.label}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>{c.desc}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: c.highlight ? '32px' : '26px', fontWeight: '800', color: val ? getGradeColor(val) : '#cbd5e1', lineHeight: 1 }}>
                    {val !== null ? val.toFixed(2) : '--'}
                  </span>
                  {val !== null && <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>등급</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 학년별 입력 */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

        {/* 학년 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {YEARS.map(yr => {
            const ydYr = yearData[yr.year];
            const isActive = activeYear === yr.year;
            return (
              <button key={yr.year} onClick={() => setActiveYear(yr.year as 1|2|3)} style={{
                flex: isMobile ? 'none' : 1, minWidth: isMobile ? '33.3%' : 'auto', padding: isMobile ? '16px' : '20px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '700',
                transition: 'all 0.2s ease',
                backgroundColor: isActive ? '#ffffff' : '#f8fafc',
                color: isActive ? '#0f172a' : '#94a3b8',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
                {yr.label}
                {ydYr.isAnalyzed && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />}
              </button>
            );
          })}
        </div>

        <div style={{ padding: isMobile ? '20px' : '32px' }}>

          {/* 입력 모드 토글 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
            {([['image', <Camera size={14} />, '이미지 분석'], ['manual', <PenLine size={14} />, '직접 입력']] as const).map(([mode, icon, label]) => (
              <button key={mode}
                onClick={() => setYearData(prev => ({ ...prev, [activeYear]: { ...prev[activeYear], inputMode: mode } }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', border: 'none',
                  fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s',
                  backgroundColor: yd.inputMode === mode ? '#ffffff' : 'transparent',
                  color: yd.inputMode === mode ? '#0f172a' : '#94a3b8',
                  boxShadow: yd.inputMode === mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >{icon}{label}</button>
            ))}
          </div>

          {/* ── 이미지 모드 ── */}
          {yd.inputMode === 'image' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 4px 0', fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>{activeYearInfo.label} 성적표 업로드</p>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>성적표가 여러 장이라면 모두 올려주세요. 1학기·2학기 자동으로 구분해요. (최대 4장)</p>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '130px' : '180px'}, 1fr))`, gap: '12px' }}>
                  {yd.images.map((img, idx) => (
                    <div key={idx}
                      style={{ position: 'relative', aspectRatio: '3/4', border: `2px dashed ${img ? '#bbf7d0' : '#cbd5e1'}`, borderRadius: '12px', overflow: 'hidden', backgroundColor: img ? '#f0fdf4' : '#f8fafc', cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onClick={() => !img && fileInputRefs.current.get(`${activeYear}-${idx}`)?.click()}
                    >
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        ref={el => { if (el) fileInputRefs.current.set(`${activeYear}-${idx}`, el); }}
                        onChange={e => { const file = e.target.files?.[0]; if (file) handleImageSelect(activeYear, idx, file); e.target.value = ''; }}
                      />
                      {img && yd.imagePreviews[idx] ? (
                        <>
                          <img src={yd.imagePreviews[idx]!} alt={`성적표 ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                            <button onClick={e => { e.stopPropagation(); fileInputRefs.current.get(`${activeYear}-${idx}`)?.click(); }} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={12} color="#475569" /></button>
                            <button onClick={e => { e.stopPropagation(); removeImage(activeYear, idx); }} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} color="#ef4444" /></button>
                          </div>
                          <div style={{ position: 'absolute', bottom: '8px', left: '8px', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: '600', color: '#166534' }}>{idx + 1}장</div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px' }}>
                          <Camera size={24} color="#cbd5e1" strokeWidth={1.5} />
                          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500', textAlign: 'center', padding: '0 8px' }}>{idx === 0 ? '클릭해서 업로드' : `${idx + 1}번째 사진`}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {yd.images.filter(Boolean).length > 0 && yd.images.length < 4 && (
                    <div onClick={() => addImageSlot(activeYear)}
                      style={{ aspectRatio: '3/4', border: '2px dashed #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', backgroundColor: '#ffffff' }}
                    >
                      <Plus size={20} color="#cbd5e1" />
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>사진 추가</span>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => handleAnalyzeYear(activeYear)}
                disabled={yd.isLoading || yd.images.filter(Boolean).length === 0}
                style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: (yd.isLoading || yd.images.filter(Boolean).length === 0) ? 'not-allowed' : 'pointer', backgroundColor: yd.images.filter(Boolean).length === 0 ? '#f1f5f9' : '#0f172a', color: yd.images.filter(Boolean).length === 0 ? '#94a3b8' : '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', opacity: yd.isLoading ? 0.7 : 1, marginBottom: '16px' }}>
                {yd.isLoading
                  ? <><Loader2 size={18} className="animate-spin" /> AI가 성적을 분석하고 있어요...</>
                  : <><Camera size={18} /> {activeYearInfo.label} 성적 {yd.isAnalyzed ? '재' : ''}분석하기</>
                }
              </button>
            </>
          )}

          {/* ── 직접 입력 모드 ── */}
          {yd.inputMode === 'manual' && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>학기 선택 후 과목 추가</p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {activeSemKeys(activeYear).map(k => (
                  <button key={k}
                    onClick={() => setManualSem(prev => ({ ...prev, [activeYear]: k }))}
                    style={{ padding: '9px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: currentManualSem === k ? '#0f172a' : '#f1f5f9', color: currentManualSem === k ? '#ffffff' : '#64748b' }}>
                    {makeSemLabel(k)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => startNewRow(currentManualSem)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: '1px dashed #cbd5e1', backgroundColor: '#f8fafc', color: '#475569', fontSize: '14px', fontWeight: '600', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
              >
                <Plus size={16} /> {makeSemLabel(currentManualSem)}에 과목 추가
              </button>
            </div>
          )}

          {/* ── 저장 버튼 ── */}
          {hasData && (
            <button onClick={() => handleSave(activeYear)} disabled={yd.isSaving}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #16a34a', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '14px', fontWeight: '700', cursor: yd.isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px', transition: 'all 0.15s', opacity: yd.isSaving ? 0.7 : 1 }}
            >
              {yd.isSaving ? <><Loader2 size={16} className="animate-spin" /> 저장 중...</> : <><Save size={16} /> {activeYearInfo.label} 성적 저장하기</>}
            </button>
          )}

          {/* ── 데이터 없을 때 직접 입력 모달형태(모바일/데스크탑) ── */}
          {!hasData && newRow && yd.inputMode === 'manual' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', marginBottom: '12px', backgroundColor: '#eff6ff', padding: '16px' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{makeSemLabel(newRow.semKey)} 새 과목 추가</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <select value={newRow.category} onChange={e => setNewRow(r => r ? { ...r, category: e.target.value } : r)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '14px', outline: 'none' }}>
                  <option value="">교과 선택</option>
                  {SUBJECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input autoFocus placeholder="과목명 (예: 수학Ⅰ)" value={newRow.name} onChange={e => setNewRow(r => r ? { ...r, name: e.target.value } : r)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input placeholder="단위수 (예: 2)" value={newRow.credit} onChange={e => setNewRow(r => r ? { ...r, credit: e.target.value } : r)}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '14px', outline: 'none' }} />
                  <input placeholder="등급 (1~9)" value={newRow.grade} onChange={e => setNewRow(r => r ? { ...r, grade: e.target.value } : r)}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '14px', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button onClick={() => setNewRow(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>취소</button>
                  <button onClick={commitNewRow} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: '700' }}>추가 완료</button>
                </div>
              </div>
            </div>
          )}

          {/* ── 과목 테이블 / 리스트 (반응형) ── */}
          {hasData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <AlertCircle size={14} color="#d97706" />
                <span style={{ fontSize: '12px', color: '#92400e', fontWeight: '600' }}>등급·단위수를 클릭하면 수정할 수 있어요.</span>
              </div>
              
              {yd.semesters.map(sem => {
                const isExpanded = expandedSem === sem.key;
                const semAvg     = calcAvg(sem.subjects);
                return (
                  <div key={sem.key} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
                    <div onClick={() => setExpandedSem(isExpanded ? null : sem.key)}
                      style={{ padding: isMobile ? '14px 16px' : '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: isExpanded ? '#f8fafc' : '#ffffff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                        <span style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '700', color: '#0f172a' }}>{sem.label}</span>
                        {semAvg !== null && (
                          <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: getGradeBg(semAvg), color: getGradeColor(semAvg), border: `1px solid ${getGradeColor(semAvg)}30` }}>
                            {semAvg.toFixed(2)}등급
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{sem.subjects.filter(s => !s.isExcluded && s.grade !== null).length}과목</span>
                        {isExpanded ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #e2e8f0' }}>
                        {/* 모바일 뷰: 카드형 리스트 */}
                        {isMobile ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {sem.subjects.map(sub => {
                              const isEG = editingCell?.semKey === sem.key && editingCell?.subId === sub.id && editingCell?.field === 'grade';
                              const isEC = editingCell?.semKey === sem.key && editingCell?.subId === sub.id && editingCell?.field === 'credit';
                              return (
                                <div key={sub.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', opacity: sub.isExcluded ? 0.6 : 1, backgroundColor: '#ffffff' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <div>
                                      {getSubjectCategory(sub) && (
                                        <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: sub.isExcluded ? '#f1f5f9' : '#eff6ff', color: sub.isExcluded ? '#94a3b8' : '#2563eb', fontWeight: '600', fontSize: '11px', display: 'inline-block', marginBottom: '4px' }}>{getSubjectCategory(sub)}</span>
                                      )}
                                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {sub.name}
                                        {sub.isExcluded && <span style={{ fontSize: '10px', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '4px' }}>제외됨</span>}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button onClick={() => toggleExclude(sem.key, sub.id)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: sub.isExcluded ? '#fee2e2' : '#dcfce7', color: sub.isExcluded ? '#dc2626' : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {sub.isExcluded ? <X size={14} /> : <Check size={14} />}
                                      </button>
                                      <button onClick={() => deleteSubject(sem.key, sub.id)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#f1f5f9', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '8px' }}>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>단위수</span>
                                      {isEC ? (
                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); }}
                                          style={{ width: '40px', textAlign: 'center', padding: '2px', borderRadius: '4px', border: '1px solid #2563eb', fontSize: '13px', outline: 'none' }} />
                                      ) : (
                                        <span onClick={() => startEdit(sem.key, sub.id, 'credit', sub.credit)} style={{ fontSize: '14px', fontWeight: '700', color: '#475569', padding: '2px 8px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #e2e8f0' }}>{sub.credit}</span>
                                      )}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>등급</span>
                                      {isEG ? (
                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); }}
                                          style={{ width: '40px', textAlign: 'center', padding: '2px', borderRadius: '4px', border: '1px solid #2563eb', fontSize: '13px', outline: 'none' }} />
                                      ) : (
                                        <span onClick={() => startEdit(sem.key, sub.id, 'grade', sub.grade)} style={{ fontSize: '14px', fontWeight: '700', color: sub.isExcluded ? '#94a3b8' : getGradeColor(sub.grade), padding: '2px 10px', backgroundColor: sub.isExcluded ? '#ffffff' : getGradeBg(sub.grade), borderRadius: '4px', border: `1px solid ${sub.isExcluded ? '#e2e8f0' : getGradeColor(sub.grade)+'40'}` }}>{sub.grade ?? 'P'}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* 데스크탑 뷰: 원본 테이블 */
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8fafc' }}>
                                <th style={{ padding: '10px 16px', textAlign: 'left',   fontSize: '12px', color: '#64748b', fontWeight: '700', width: '120px' }}>교과명</th>
                                <th style={{ padding: '10px 20px', textAlign: 'left',   fontSize: '12px', color: '#64748b', fontWeight: '700' }}>과목명</th>
                                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '700', width: '72px' }}>단위수</th>
                                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '700', width: '72px' }}>등급</th>
                                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '700', width: '60px' }}>반영</th>
                                <th style={{ padding: '10px 12px', width: '44px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {sem.subjects.map(sub => {
                                const isEG = editingCell?.semKey === sem.key && editingCell?.subId === sub.id && editingCell?.field === 'grade';
                                const isEC = editingCell?.semKey === sem.key && editingCell?.subId === sub.id && editingCell?.field === 'credit';
                                return (
                                  <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: sub.isExcluded ? 0.4 : 1 }}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#475569' }}>
                                      {getSubjectCategory(sub)
                                        ? <span style={{ padding: '3px 8px', borderRadius: '6px', backgroundColor: sub.isExcluded ? '#f1f5f9' : '#eff6ff', color: sub.isExcluded ? '#94a3b8' : '#2563eb', fontWeight: '600', fontSize: '12px' }}>{getSubjectCategory(sub)}</span>
                                        : <span style={{ color: '#cbd5e1' }}>—</span>
                                      }
                                    </td>
                                    <td style={{ padding: '12px 20px', fontSize: '14px', color: '#0f172a' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {sub.name}
                                        {sub.isExcluded && <span style={{ fontSize: '11px', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>제외</span>}
                                      </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      {isEC ? (
                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); }}
                                          style={{ width: '44px', textAlign: 'center', padding: '4px', borderRadius: '6px', border: '1px solid #2563eb', fontSize: '14px', outline: 'none' }} />
                                      ) : (
                                        <span onClick={() => startEdit(sem.key, sub.id, 'credit', sub.credit)} style={{ fontSize: '14px', color: '#475569', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}>{sub.credit}</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      {isEG ? (
                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); }}
                                          style={{ width: '44px', textAlign: 'center', padding: '4px', borderRadius: '6px', border: '1px solid #2563eb', fontSize: '14px', outline: 'none' }} />
                                      ) : (
                                        <span onClick={() => startEdit(sem.key, sub.id, 'grade', sub.grade)} style={{ display: 'inline-block', minWidth: '32px', padding: '4px 10px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', color: sub.isExcluded ? '#94a3b8' : getGradeColor(sub.grade), backgroundColor: sub.isExcluded ? '#f1f5f9' : getGradeBg(sub.grade) }}>{sub.grade ?? 'P'}</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                      <button onClick={() => toggleExclude(sem.key, sub.id)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: sub.isExcluded ? '#fee2e2' : '#dcfce7', color: sub.isExcluded ? '#dc2626' : '#16a34a' }}>
                                        {sub.isExcluded ? <X size={14} /> : <Check size={14} />}
                                      </button>
                                    </td>
                                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                      <button onClick={() => deleteSubject(sem.key, sub.id)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', color: '#94a3b8' }}>
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}

                        {/* 리스트 하단 과목 추가 UI (인라인 / 모달 혼용) */}
                        {newRow?.semKey === sem.key && (
                          <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderTop: '1px solid #bfdbfe' }}>
                            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', alignItems: isMobile ? 'stretch' : 'center' }}>
                              <select value={newRow.category} onChange={e => setNewRow(r => r ? { ...r, category: e.target.value } : r)} style={{ flex: isMobile ? 'none' : 1, padding: '8px', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '13px' }}>
                                <option value="">교과 선택</option>
                                {SUBJECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <input autoFocus placeholder="과목명" value={newRow.name} onChange={e => setNewRow(r => r ? { ...r, name: e.target.value } : r)} style={{ flex: isMobile ? 'none' : 2, padding: '8px', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '13px' }} />
                              <div style={{ display: 'flex', gap: '10px', flex: isMobile ? 'none' : 1 }}>
                                <input placeholder="단위" value={newRow.credit} onChange={e => setNewRow(r => r ? { ...r, credit: e.target.value } : r)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '13px', textAlign: 'center' }} />
                                <input placeholder="등급" value={newRow.grade} onChange={e => setNewRow(r => r ? { ...r, grade: e.target.value } : r)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '13px', textAlign: 'center' }} />
                              </div>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: isMobile ? 'flex-end' : 'flex-start', marginTop: isMobile ? '4px' : '0' }}>
                                <button onClick={() => setNewRow(null)} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: '700' }}>취소</button>
                                <button onClick={commitNewRow} style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: '700' }}>추가</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {newRow?.semKey !== sem.key && (
                          <button onClick={() => startNewRow(sem.key)}
                            style={{ width: '100%', padding: '14px', border: 'none', borderTop: '1px solid #f1f5f9', backgroundColor: '#fafafa', color: '#64748b', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          >
                            <Plus size={14} /> 과목 추가
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!hasData && !yd.isLoading && (
            <div style={{ padding: isMobile ? '24px' : '32px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px dashed #cbd5e1' }}>
              <Upload size={32} color="#cbd5e1" strokeWidth={1.5} style={{ marginBottom: '12px' }} />
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#475569', fontWeight: '600' }}>
                {yd.inputMode === 'image' ? '성적표를 올리고 분석 버튼을 눌러주세요' : '위에서 과목 추가 버튼을 눌러 직접 입력해 주세요'}
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                {yd.inputMode === 'image' ? '1학기·2학기 성적표를 한번에 올려도 자동으로 구분해요' : '교과명, 단위수, 등급을 직접 입력하면 바로 계산돼요'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}