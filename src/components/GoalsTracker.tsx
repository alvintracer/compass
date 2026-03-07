// src/components/GoalsTracker.tsx
import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { useBreakpoint } from '../hooks/useBreakpoint';
import {
  Target, Calendar, CheckCircle2, Circle, TrendingUp,
  Loader2, Mic, BookOpen, MonitorPlay, ClipboardList,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';

interface GoalsTrackerProps { session: Session }

interface CustomTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  is_completed: boolean;
  created_at: string;
}

interface WeeklyGoal {
  id: string;
  week_start: string;
  qna_target: number;
  qna_done: number;
  research_target: number;
  research_done: number;
  mock_target: number;
  mock_done: number;
}

// 수능 D-Day
const SUNEUNG_DATE = new Date('2026-11-19T00:00:00+09:00');

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}

function ProgressRing({ value, max, size = 72, color }: { value: number; max: number; size?: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: '14px', fontWeight: '800', fill: color }}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

export default function GoalsTracker({ session }: GoalsTrackerProps) {
  const { isMobile } = useBreakpoint();
  const [loading, setLoading] = useState(true);

  // 전체 진척도
  const [totalQna, setTotalQna] = useState(0);        // 500자+ Q&A 완성 수
  const [totalResearch, setTotalResearch] = useState(0); // 1000자+ 조사과제 수
  const [totalMock, setTotalMock] = useState(0);       // 모의면접 수

  // 이번주 목표
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal | null>(null);
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);

  // 컨설턴트 과제 펼치기
  const [showAllTasks, setShowAllTasks] = useState(false);

  // D-Day
  const now = new Date();
  const diffMs = SUNEUNG_DATE.getTime() - now.getTime();
  const dDay = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const fetchStats = useCallback(async () => {
    setLoading(true);

    // 1) 면접 Q&A: 500자 이상 답변 완성 + completed 상태
    // Actually, PostgREST can't do length filter this way. Let me fetch and count
    const { data: qnaData } = await supabase
      .from('interview_qnas')
      .select('id, answer_text, status')
      .eq('user_id', session.user.id);

    const qualifiedQna = (qnaData || []).filter(q =>
      (q.answer_text || '').length >= 500 && (q.status === 'completed' || (q.answer_text || '').length >= 500)
    ).length;
    setTotalQna(qualifiedQna);

    // 2) 조사 과제: 1000자 이상 내용 작성 완료
    const { data: researchData } = await supabase
      .from('research_tasks')
      .select('id, content_text')
      .eq('user_id', session.user.id);

    const qualifiedResearch = (researchData || []).filter(r =>
      (r.content_text || '').length >= 1000
    ).length;
    setTotalResearch(qualifiedResearch);

    // 3) 모의면접 횟수 (mock_sessions 테이블이 있다면)
    const { count: mockCount } = await supabase
      .from('mock_interview_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id);
    setTotalMock(mockCount || 0);

    // 4) 이번 주 목표
    const weekStart = getMonday(new Date());
    const { data: goalData } = await supabase
      .from('weekly_goals')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('week_start', weekStart)
      .single();

    if (goalData) {
      setWeeklyGoal(goalData as WeeklyGoal);
    } else {
      // 이번 주 목표가 없으면 새로 생성 (기본값)
      const { data: newGoal } = await supabase.from('weekly_goals').insert({
        user_id: session.user.id,
        week_start: weekStart,
        qna_target: 3,
        qna_done: 0,
        research_target: 2,
        research_done: 0,
        mock_target: 1,
        mock_done: 0,
      }).select().single();
      if (newGoal) setWeeklyGoal(newGoal as WeeklyGoal);
    }

    // 5) 컨설턴트 상시 과제
    const { data: taskData } = await supabase
      .from('custom_tasks')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setCustomTasks((taskData as CustomTask[]) || []);

    setLoading(false);
  }, [session.user.id]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-compute this week's done counts
  useEffect(() => {
    if (!weeklyGoal) return;
    const updateWeeklyDone = async () => {
      const weekStart = weeklyGoal.week_start;
      const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Q&A done this week (answers >= 500 chars written this week)
      const { data: weekQna } = await supabase
        .from('interview_qnas')
        .select('id, answer_text, updated_at')
        .eq('user_id', session.user.id)
        .gte('updated_at', weekStart)
        .lt('updated_at', weekEnd);
      const qnaDone = (weekQna || []).filter(q => (q.answer_text || '').length >= 500).length;

      // Research done this week
      const { data: weekResearch } = await supabase
        .from('research_tasks')
        .select('id, content_text, updated_at')
        .eq('user_id', session.user.id)
        .gte('updated_at', weekStart)
        .lt('updated_at', weekEnd);
      const researchDone = (weekResearch || []).filter(r => (r.content_text || '').length >= 1000).length;

      // Mock done this week
      const { count: mockDone } = await supabase
        .from('mock_interview_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', weekStart)
        .lt('created_at', weekEnd);

      if (qnaDone !== weeklyGoal.qna_done || researchDone !== weeklyGoal.research_done || (mockDone || 0) !== weeklyGoal.mock_done) {
        await supabase.from('weekly_goals').update({
          qna_done: qnaDone,
          research_done: researchDone,
          mock_done: mockDone || 0,
        }).eq('id', weeklyGoal.id);

        setWeeklyGoal(prev => prev ? {
          ...prev, qna_done: qnaDone, research_done: researchDone, mock_done: mockDone || 0,
        } : null);
      }
    };
    updateWeeklyDone();
  }, [weeklyGoal?.id]);

  const handleToggleTask = async (task: CustomTask) => {
    const newVal = !task.is_completed;
    await supabase.from('custom_tasks').update({ is_completed: newVal }).eq('id', task.id);
    setCustomTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_completed: newVal } : t));
  };

  // 목표 데이터
  const goals = [
    { key: 'qna', label: '면접 Q&A 완성', target: 50, done: totalQna, unit: '개', icon: Mic, color: '#2563eb', bg: '#eff6ff', desc: '500자 이상 답변 작성', page: '면접 Q&A 뱅크' },
    { key: 'research', label: '탐구 과제 수행', target: 20, done: totalResearch, unit: '개', icon: BookOpen, color: '#7c3aed', bg: '#f5f3ff', desc: '1000자 이상 조사 과제', page: '로드맵 탐구 과제' },
    { key: 'mock', label: '모의면접 진행', target: 999, done: totalMock, unit: '회', icon: MonitorPlay, color: '#ea580c', bg: '#fff7ed', desc: '주 1회, 10문항 이상', page: '모의면접실' },
  ];

  const weeklyItems = weeklyGoal ? [
    { label: '면접 Q&A', target: weeklyGoal.qna_target, done: weeklyGoal.qna_done, color: '#2563eb' },
    { label: '탐구 과제', target: weeklyGoal.research_target, done: weeklyGoal.research_done, color: '#7c3aed' },
    { label: '모의면접', target: weeklyGoal.mock_target, done: weeklyGoal.mock_done, color: '#ea580c' },
  ] : [];

  const pendingTasks = customTasks.filter(t => !t.is_completed);
  const completedTasks = customTasks.filter(t => t.is_completed);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' }}>
        <Loader2 size={32} color="#2563eb" className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* D-Day 헤더 */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        borderRadius: '20px', padding: isMobile ? '28px 20px' : '36px 40px',
        color: '#ffffff', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Target size={20} strokeWidth={2.5} />
              <span style={{ fontSize: '14px', fontWeight: '700', opacity: 0.7 }}>나의 과제와 목표</span>
            </div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: isMobile ? '24px' : '32px', fontWeight: '800', letterSpacing: '-0.5px' }}>
              수능까지
            </h2>
            <p style={{ margin: 0, fontSize: '14px', opacity: 0.6 }}>
              2026년 11월 19일 (목)
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: isMobile ? '48px' : '64px', fontWeight: '900', letterSpacing: '-2px',
              background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              lineHeight: 1,
            }}>
              D-{dDay}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '4px' }}>
              {Math.floor(dDay / 7)}주 {dDay % 7}일
            </div>
          </div>
        </div>
      </div>

      {/* 전체 목표 진척도 */}
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
        padding: isMobile ? '20px' : '28px',
      }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} /> 전체 진척도
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
          {goals.map(g => {
            const Icon = g.icon;
            const pct = g.target === 999 ? 0 : Math.min(g.done / g.target, 1);
            return (
              <div key={g.key} style={{
                padding: '20px', borderRadius: '16px', backgroundColor: g.bg,
                border: '1px solid transparent', transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon size={18} color={g.color} />
                    <span style={{ fontSize: '14px', fontWeight: '700', color: g.color }}>{g.label}</span>
                  </div>
                  {g.target !== 999 && <ProgressRing value={g.done} max={g.target} size={56} color={g.color} />}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>{g.desc}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '22px', fontWeight: '800', color: g.color }}>
                    {g.done}{g.unit}
                  </span>
                  {g.target !== 999 && (
                    <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>
                      / {g.target}{g.unit} 목표
                    </span>
                  )}
                </div>
                {g.target !== 999 && (
                  <div style={{ marginTop: '12px', height: '6px', borderRadius: '3px', backgroundColor: 'rgba(0,0,0,0.06)' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px', backgroundColor: g.color,
                      width: `${pct * 100}%`, transition: 'width 0.6s ease',
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 이번 주 할당량 */}
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
        padding: isMobile ? '20px' : '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} /> 이번 주 할당량
          </h3>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>
            {weeklyGoal?.week_start ? new Date(weeklyGoal.week_start).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : ''} ~ 주간
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
          {weeklyItems.map((w, i) => {
            const isDone = w.done >= w.target;
            return (
              <div key={i} style={{
                padding: '18px', borderRadius: '14px',
                border: `2px solid ${isDone ? '#16a34a' : '#e2e8f0'}`,
                backgroundColor: isDone ? '#f0fdf4' : '#fafafa',
                transition: 'all 0.3s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{w.label}</span>
                  {isDone ? (
                    <CheckCircle2 size={20} color="#16a34a" />
                  ) : (
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#d97706', backgroundColor: '#fef3c7', padding: '2px 8px', borderRadius: '6px' }}>
                      진행중
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '28px', fontWeight: '800', color: w.color }}>{w.done}</span>
                  <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '600' }}>/ {w.target}</span>
                </div>
                <div style={{ marginTop: '10px', height: '5px', borderRadius: '3px', backgroundColor: '#e2e8f0' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    backgroundColor: isDone ? '#16a34a' : w.color,
                    width: `${Math.min(w.done / w.target, 1) * 100}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 컨설턴트 상시 과제 */}
      <div style={{
        backgroundColor: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0',
        padding: isMobile ? '20px' : '28px',
      }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={18} /> 컨설턴트 상시 과제
          {pendingTasks.length > 0 && (
            <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px' }}>
              미완료 {pendingTasks.length}개
            </span>
          )}
        </h3>

        {customTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            <ClipboardList size={32} strokeWidth={1.5} style={{ marginBottom: '10px' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>아직 배정된 과제가 없어요</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>컨설턴트가 과제를 출제하면 여기에 표시됩니다</p>
          </div>
        ) : (
          <>
            {/* 미완료 과제 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: completedTasks.length > 0 ? '16px' : 0 }}>
              {pendingTasks.map(task => (
                <div key={task.id} onClick={() => handleToggleTask(task)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                    border: '1px solid #fbbf24', backgroundColor: '#fffbeb',
                    transition: 'all 0.2s',
                  }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0, marginTop: '1px',
                    border: '2px solid #d97706', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Circle size={0} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>{task.title}</div>
                    {task.description && <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{task.description}</div>}
                    {task.due_date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '11px', color: '#d97706', fontWeight: '600' }}>
                        <AlertCircle size={12} /> 기한: {new Date(task.due_date).toLocaleDateString('ko-KR')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 완료 과제 */}
            {completedTasks.length > 0 && (
              <>
                <button onClick={() => setShowAllTasks(!showAllTasks)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0',
                    backgroundColor: '#fafafa', color: '#94a3b8', fontSize: '12px',
                    fontWeight: '600', cursor: 'pointer', marginBottom: showAllTasks ? '12px' : 0,
                  }}>
                  {showAllTasks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  완료된 과제 ({completedTasks.length}개)
                </button>
                {showAllTasks && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {completedTasks.map(task => (
                      <div key={task.id} onClick={() => handleToggleTask(task)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                          border: '1px solid #e2e8f0', backgroundColor: '#fafafa',
                          opacity: 0.7,
                        }}>
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                          backgroundColor: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CheckCircle2 size={14} color="#fff" />
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8', textDecoration: 'line-through' }}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
