// src/components/PromptManager.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  Loader2, Save, RotateCcw, Plus, ChevronDown, ChevronUp,
  Check, Clock, Zap, FileText, Mic, BookOpen, X,
} from 'lucide-react';

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

// ── 타입 ───────────────────────────────────────────────────────────────────
interface Prompt {
  id: string;
  type: string;
  version: number;
  label: string;
  prompt: string;
  is_active: boolean;
  created_at: string;
}

// ── 프롬프트 타입 메타 ──────────────────────────────────────────────────────
const PROMPT_TYPES = [
  {
    id: 'identity_initial',
    name: '정의서 최초 생성',
    icon: FileText,
    color: '#2563eb',
    bg: '#eff6ff',
    desc: '온보딩 데이터 → 학생 본질 정의서 생성',
    defaultPrompt: `당신은 대한민국 최고의 대학 입시 컨설턴트입니다. 학생이 입력한 '온보딩 설문 답변'을 분석하여 마크다운 형식의 '학생 본질 정의서'를 작성해주세요. 학생의 본질(Core Identity), 진로 방향성(Career Path), 그리고 핵심 키워드 3가지를 포함하여 전문가적이고 통찰력 있게 분석해 주세요. 반드시 마크다운 형식의 본문만 출력하고 인사말은 생략하세요.`,
  },
  {
    id: 'identity_edit',
    name: '정의서 수정',
    icon: FileText,
    color: '#2563eb',
    bg: '#eff6ff',
    desc: '기존 정의서 + 수정 요청 → 업데이트된 정의서',
    defaultPrompt: `당신은 대한민국 최고의 대학 입시 컨설턴트입니다. 학생의 기존 '정의서(마크다운)' 내용을 바탕으로, 사용자가 요청한 수정 프롬프트를 정확히 반영하여 더욱 정돈되고 매력적인 마크다운 형식으로 재작성해주세요. 반드시 마크다운 형식의 본문만 출력하세요.`,
  },
  {
    id: 'interview_questions',
    name: '면접 질문 생성',
    icon: Mic,
    color: '#7c3aed',
    bg: '#f5f3ff',
    desc: '정의서 + 진로 Path → 맞춤 면접 질문 3개',
    defaultPrompt: `당신은 대한민국 최고의 대학 입시 면접관입니다. 학생의 '정의서' 내용과 희망하는 '진로 Path'를 바탕으로, 실제 면접에서 나올 법한 날카롭고 본질적인 맞춤형 면접 질문 3개를 생성해 주세요. 반드시 기존에 이미 생성된 질문들과 다른 새로운 각도의 질문을 만들어야 합니다. 반드시 다른 말은 빼고 질문 3개를 JSON 배열(Array of strings) 형태로만 출력하세요. 예: ["질문1", "질문2", "질문3"]`,
  },
  {
    id: 'interview_evaluate',
    name: '면접 답변 평가',
    icon: Mic,
    color: '#7c3aed',
    bg: '#f5f3ff',
    desc: '면접 질문 + 학생 답변 → 첨삭 + 코멘트',
    defaultPrompt: `당신은 날카로우면서도 따뜻한 입시 컨설턴트입니다. 면접 질문에 대한 학생의 답변을 읽고 아래 형식으로 반드시 출력하세요.

[첨삭된 답변]
학생의 원문 의도를 살리되, 더 구체적이고 임팩트 있게 업그레이드된 완성형 답변을 작성해 주세요. 수동적 표현은 능동적으로, 추상적 표현은 구체적 사례로 보완하세요.

[컨설턴트 코멘트]
잘한 점 1가지, 개선된 핵심 포인트 2가지를 간결하게 작성해 주세요.`,
  },
  {
    id: 'record_schoollife',
    name: '생기부 문장 첨삭',
    icon: BookOpen,
    color: '#059669',
    bg: '#ecfdf5',
    desc: '활동 내용 → 완성형 생기부 문장',
    defaultPrompt: `당신은 대한민국 최고의 학생부 전문 컨설턴트입니다.
학생이 생활기록부에 기재하고 싶은 내용을 바탕으로 아래 형식으로 출력해 주세요.

[완성형 생기부 문장]
실제 학교 생활기록부에 들어갈 수 있는 완성형 문장을 작성해 주세요.
- 교사 서술형 문체 사용 (예: "~함", "~하였음", "~를 보임")
- 탐구력, 주도성, 성장, 사회적 가치 연결
- 구체적 활동 + 역량 발현 + 의미/성찰 구조
- 3~5문장, 200~350자 내외

[작성 포인트]
이 생기부 내용이 입시에서 효과적인 이유와 더 보완하면 좋을 점 2가지를 간결하게 설명해 주세요.`,
  },
  {
    id: 'record_task',
    name: '과제/수행평가 첨삭',
    icon: BookOpen,
    color: '#059669',
    bg: '#ecfdf5',
    desc: '과제 요청 → 방향성 + 초안 + 개선 포인트',
    defaultPrompt: `당신은 대한민국 최고의 학생부 전문 컨설턴트이자 학습 코치입니다.
학생이 제출해야 할 과제(수행평가, 보고서 등)에 대해 아래 형식으로 출력해 주세요.

[과제 방향성]
이 과제에서 어떤 방향으로 접근해야 좋은 평가를 받을 수 있는지 핵심 전략을 2~3가지로 설명해 주세요.

[작성 초안]
위 방향성을 반영한 실제 제출 가능한 수준의 완성형 초안을 작성해 주세요.
(학생이 제출한 초안이 있다면 그것을 업그레이드 해주세요.)

[개선 포인트]
초안에서 더 보완하면 좋을 점 2~3가지를 간결하게 설명해 주세요.`,
  },
];

// ── 히스토리 모달 ───────────────────────────────────────────────────────────
function HistoryModal({ type, onRestore, onClose }: {
  type: string;
  onRestore: (prompt: Prompt) => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [history, setHistory] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ai_prompts').select('*')
      .eq('type', type).order('version', { ascending: false })
      .then(({ data }) => { setHistory(data ?? []); setLoading(false); });
  }, [type]);

  const meta = PROMPT_TYPES.find(p => p.id === type);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '20px' }}>
      <div style={{ backgroundColor: '#ffffff', borderRadius: isMobile ? '0' : '20px', width: isMobile ? '100%' : '100%', maxWidth: '680px', height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100vh' : '80vh', display: 'flex', flexDirection: 'column', border: isMobile ? 'none' : '1px solid #e2e8f0' }}>

        <div style={{ padding: isMobile ? '20px 20px' : '24px 28px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>버전 히스토리</h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>{meta?.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#94a3b8" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 20px' : '16px 28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px' }}><Loader2 size={24} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} /></div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>히스토리가 없어요</div>
          ) : history.map(p => (
            <div key={p.id} style={{ marginBottom: '12px', borderRadius: '12px', border: `1px solid ${p.is_active ? (meta?.color ?? '#2563eb') : '#e2e8f0'}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: p.is_active ? (meta?.bg ?? '#eff6ff') : '#ffffff', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {p.is_active && <span style={{ fontSize: '11px', fontWeight: '700', color: meta?.color, backgroundColor: meta?.bg, border: `1px solid ${meta?.color}`, padding: '2px 8px', borderRadius: '5px' }}>활성</span>}
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>v{p.version} — {p.label || '(라벨 없음)'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(p.created_at).toLocaleDateString('ko-KR')}</span>
                  {expanded === p.id ? <ChevronUp size={15} color="#94a3b8" /> : <ChevronDown size={15} color="#94a3b8" />}
                </div>
              </div>
              {expanded === p.id && (
                <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  <pre style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{p.prompt}</pre>
                  {!p.is_active && (
                    <button onClick={() => onRestore(p)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: isMobile ? '100%' : 'auto', gap: '5px', padding: '10px 14px', borderRadius: '8px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      <RotateCcw size={14} /> 이 버전으로 복원
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 프롬프트 카드 ───────────────────────────────────────────────────────────
function PromptCard({ typeMeta, onSaved }: {
  typeMeta: typeof PROMPT_TYPES[0];
  onSaved: () => void;
}) {
  const isMobile = useIsMobile();
  const [active, setActive]       = useState<Prompt | null>(null);
  const [draft, setDraft]         = useState('');
  const [label, setLabel]         = useState('');
  const [isDirty, setIsDirty]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ai_prompts')
      .select('*').eq('type', typeMeta.id).eq('is_active', true)
      .order('version', { ascending: false }).limit(1).single();

    if (data) {
      setActive(data as Prompt);
      setDraft(data.prompt);
    } else {
      setDraft(typeMeta.defaultPrompt);
    }
    setLoading(false);
    setIsDirty(false);
  }, [typeMeta.id]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (val: string) => {
    setDraft(val);
    setIsDirty(val !== (active?.prompt ?? typeMeta.defaultPrompt));
  };

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);

    if (active) {
      await supabase.from('ai_prompts').update({ is_active: false }).eq('id', active.id);
    }

    const newVersion = (active?.version ?? 0) + 1;
    await supabase.from('ai_prompts').insert({
      type:      typeMeta.id,
      version:   newVersion,
      label:     label.trim() || `v${newVersion}`,
      prompt:    draft.trim(),
      is_active: true,
    });

    setSaving(false);
    setSaveSuccess(true);
    setLabel('');
    setIsDirty(false);
    setTimeout(() => setSaveSuccess(false), 2000);
    load();
    onSaved();
  };

  const handleRestore = async (p: Prompt) => {
    if (active) await supabase.from('ai_prompts').update({ is_active: false }).eq('id', active.id);
    await supabase.from('ai_prompts').update({ is_active: true }).eq('id', p.id);
    setShowHistory(false);
    load();
    onSaved();
  };

  const Icon = typeMeta.icon;

  return (
    <>
      {showHistory && (
        <HistoryModal type={typeMeta.id} onRestore={handleRestore} onClose={() => setShowHistory(false)} />
      )}

      <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

        {/* 카드 헤더 */}
        <div style={{ padding: isMobile ? '16px' : '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0', backgroundColor: typeMeta.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <Icon size={18} color={typeMeta.color} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{typeMeta.name}</p>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{typeMeta.desc}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            {active ? (
              <span style={{ fontSize: '12px', color: '#64748b', backgroundColor: '#ffffff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontWeight: '600' }}>
                v{active.version} 활성중
              </span>
            ) : <div />}
            <button onClick={() => setShowHistory(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
              <Clock size={13} /> 히스토리
            </button>
          </div>
        </div>

        {/* 프롬프트 편집 */}
        <div style={{ padding: isMobile ? '16px' : '20px 22px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px' }}><Loader2 size={20} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} /></div>
          ) : (
            <>
              <textarea
                value={draft}
                onChange={e => handleChange(e.target.value)}
                style={{
                  width: '100%', minHeight: isMobile ? '220px' : '180px', padding: '14px 16px',
                  borderRadius: '10px', border: `1px solid ${isDirty ? typeMeta.color : '#e2e8f0'}`,
                  fontSize: '13px', lineHeight: 1.8, outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit', boxSizing: 'border-box', color: '#334155',
                  backgroundColor: isDirty ? typeMeta.bg : '#f8fafc',
                  transition: 'all 0.15s',
                }}
              />

              {isDirty && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', alignItems: isMobile ? 'stretch' : 'center' }}>
                  <input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="변경 내용 요약 (예: 진로 키워드 강화)"
                    style={{ flex: 1, padding: '11px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'inherit', color: '#334155' }}
                  />
                  <button onClick={handleSave} disabled={saving}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px 18px', borderRadius: '9px', border: 'none', backgroundColor: typeMeta.color, color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, flexShrink: 0 }}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <Check size={14} /> : <Save size={14} />}
                    {saving ? '저장 중...' : saveSuccess ? '저장됨!' : '새 버전 저장'}
                  </button>
                </div>
              )}

              {isDirty && draft !== typeMeta.defaultPrompt && (
                <button onClick={() => { setDraft(active?.prompt ?? typeMeta.defaultPrompt); setIsDirty(false); }}
                  style={{ marginTop: isMobile ? '12px' : '8px', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', width: isMobile ? '100%' : 'auto', gap: '5px', padding: '10px 12px', borderRadius: '7px', border: isMobile ? '1px solid #e2e8f0' : 'none', backgroundColor: isMobile ? '#f8fafc' : 'transparent', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  <RotateCcw size={14} /> 되돌리기
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── 메인 PromptManager ──────────────────────────────────────────────────────
export default function PromptManager() {
  const isMobile = useIsMobile();
  const [activeGroup, setActiveGroup] = useState<'identity' | 'interview' | 'record'>('identity');
  const [refreshKey, setRefreshKey]   = useState(0);

  const GROUP_TABS = [
    { id: 'identity'  as const, name: '정의서', icon: FileText, color: '#2563eb' },
    { id: 'interview' as const, name: '면접 Q&A', icon: Mic,    color: '#7c3aed' },
    { id: 'record'    as const, name: '생기부 첨삭', icon: BookOpen, color: '#059669' },
  ];

  const filtered = PROMPT_TYPES.filter(p => p.id.startsWith(activeGroup));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

      {/* 헤더 */}
      <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Zap size={20} color="#f59e0b" />
          <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '20px', fontWeight: '800', color: '#0f172a' }}>AI 프롬프트 관리</h2>
        </div>
        <p style={{ margin: 0, fontSize: isMobile ? '13px' : '14px', color: '#64748b' }}>각 AI 기능의 시스템 프롬프트를 편집하고 버전을 관리해요. 저장 즉시 반영돼요.</p>
      </div>

      {/* 그룹 탭 (모바일에서는 가로 스크롤 허용) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px', whiteSpace: 'nowrap' }}>
        {GROUP_TABS.map(g => {
          const Icon = g.icon;
          const isActive = activeGroup === g.id;
          return (
            <button key={g.id} onClick={() => setActiveGroup(g.id)} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '10px 20px', borderRadius: '12px', border: `2px solid ${isActive ? g.color : '#e2e8f0'}`,
              backgroundColor: isActive ? g.color : '#ffffff',
              color: isActive ? '#ffffff' : '#64748b',
              fontSize: '14px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s',
              flex: isMobile ? 'none' : 'auto'
            }}>
              <Icon size={15} />
              {g.name}
            </button>
          );
        })}
      </div>

      {/* 프롬프트 카드 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filtered.map(type => (
          <PromptCard key={`${type.id}-${refreshKey}`} typeMeta={type} onSaved={() => setRefreshKey(k => k + 1)} />
        ))}
      </div>

      {/* 안내 */}
      <div style={{ marginTop: '24px', padding: '16px 20px', backgroundColor: '#fefce8', borderRadius: '12px', border: '1px solid #fde68a' }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#92400e', lineHeight: 1.6 }}>
          ⚠️ <strong>Edge Function 연동 안내:</strong> 프롬프트를 저장해도 Edge Function이 DB에서 활성 프롬프트를 불러오도록 수정되어야 실제 반영돼요.
          각 함수에서 <code style={{ backgroundColor: '#fef3c7', padding: '1px 5px', borderRadius: '4px', fontSize: '12px' }}>ai_prompts</code> 테이블의 활성 레코드를 조회하는 코드를 추가해 주세요.
        </p>
      </div>
    </div>
  );
}