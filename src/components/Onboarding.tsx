// src/components/Onboarding.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import type { Session } from '@supabase/supabase-js'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { User, Target, Search, CheckCircle2, Plus, X, ArrowLeft, RefreshCw } from 'lucide-react'

interface OnboardingProps {
  session: Session
  onComplete: () => void
  mode?: 'initial' | 'regenerate'
  onCancel?: () => void
}

export default function Onboarding({ session, onComplete, mode = 'initial', onCancel }: OnboardingProps) {
  const isRegenerate = mode === 'regenerate'

  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [school, setSchool] = useState('')

  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState('')
  const [q3, setQ3] = useState('')
  const [q4, setQ4] = useState('')

  const [targets, setTargets] = useState([{ university: '', major: '' }, { university: '', major: '' }])
  const [loading, setLoading] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const { isMobile } = useBreakpoint()

  // 재생성 모드: 기존 데이터 프리필
  useEffect(() => {
    if (!isRegenerate || prefilled) return
    const prefill = async () => {
      const { data: profile } = await supabase
        .from('profiles').select('name, school, target_year')
        .eq('id', session.user.id).single()
      if (profile) {
        setName(profile.name || '')
        setSchool(profile.school || '')
        if (profile.target_year) setBirthYear(String(profile.target_year))
      }
      const { data: ob } = await supabase
        .from('onboarding_data').select('dreams_and_hobbies, target_majors')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false }).limit(1).single()
      if (ob) {
        if (ob.target_majors && ob.target_majors.length > 0) {
          const parsed = ob.target_majors.map((t: string) => {
            const parts = t.split(' ')
            return { university: parts[0] || '', major: parts.slice(1).join(' ') || '' }
          })
          setTargets(parsed.length >= 2 ? parsed : [...parsed, { university: '', major: '' }])
        }
        if (ob.dreams_and_hobbies) {
          const answers = ob.dreams_and_hobbies.match(/답변:\s*(.*?)(?=\n\d\.|$)/gs)
          if (answers && answers.length >= 4) {
            setQ1(answers[0].replace(/^답변:\s*/, '').trim())
            setQ2(answers[1].replace(/^답변:\s*/, '').trim())
            setQ3(answers[2].replace(/^답변:\s*/, '').trim())
            setQ4(answers[3].replace(/^답변:\s*/, '').trim())
          }
        }
      }
      setPrefilled(true)
    }
    prefill()
  }, [isRegenerate, prefilled, session.user.id])

  const firstName = name.length > 1 ? name.substring(1) : name
  const displayName = firstName.trim() || '학생'

  const hasJongseong = (str: string) => {
    if (!str) return false
    const lastChar = str.charCodeAt(str.length - 1)
    if (lastChar < 0xAC00 || lastChar > 0xD7A3) return false
    return (lastChar - 0xAC00) % 28 > 0
  }

  const eunNeun = firstName ? (hasJongseong(firstName) ? '은' : '는') : '은(는)'
  const yiGa = firstName ? (hasJongseong(firstName) ? '이' : '가') : '이(가)'

  const handleAddTarget = () => {
    if (targets.length < 6) setTargets([...targets, { university: '', major: '' }])
  }

  const handleRemoveTarget = (index: number) => {
    if (targets.length > 2) setTargets(targets.filter((_, i) => i !== index))
  }

  const handleTargetChange = (index: number, field: 'university' | 'major', value: string) => {
    const newTargets = [...targets]
    newTargets[index][field] = value
    setTargets(newTargets)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ name: name, school: school, target_year: parseInt(birthYear) || null })
      .eq('id', session.user.id)

    if (profileError) {
      alert('프로필 저장 중 문제가 발생했습니다.')
      setLoading(false)
      return
    }

    const formattedDreams = `
1. ${displayName}${eunNeun} 무엇을 할 때 가장 행복한가요?
답변: ${q1}
2. ${displayName}${yiGa} 살면서 가장 멋지다고 생각한 사람은 누구인가요?
답변: ${q2}
3. ${displayName}의 꿈은 무엇인가요?
답변: ${q3}
4. ${displayName}${eunNeun} 무엇을 제일 잘한다고 생각하나요?
답변: ${q4}
    `.trim()

    const formattedMajors = targets.map(t => `${t.university} ${t.major}`.trim()).filter(t => t !== '')

    // 재생성 모드: AI 토큰 차감 후 기존 정의서 삭제
    if (isRegenerate) {
      const { error: tokenError } = await supabase.rpc('decrement_ai_token', {
        target_user_id: session.user.id,
      })
      if (tokenError) {
        alert('AI 토큰이 부족하거나 차감 중 문제가 발생했습니다.')
        setLoading(false)
        return
      }
      await supabase.from('identity_documents').delete().eq('user_id', session.user.id)
    }

    const { error: onboardingError } = await supabase
      .from('onboarding_data')
      .insert([
        {
          user_id: session.user.id,
          target_majors: formattedMajors,
          dreams_and_hobbies: formattedDreams,
          raw_content: "생기부 원본 텍스트는 추후 업데이트 예정"
        }
      ])

    // identity_documents 테이블에 초기 초안 인서트 (상태를 generating으로 변경!)
    if (!onboardingError) {
      await supabase
        .from('identity_documents')
        .insert([
          {
            user_id: session.user.id,
            content: "AI가 데이터를 바탕으로 정의서를 생성하고 있습니다...",
            status: 'generating'
          }
        ])
    }

    setLoading(false)

    if (onboardingError) alert('데이터 저장 중 문제가 발생했습니다: ' + onboardingError.message)
    else {
      alert(isRegenerate ? '정의서가 새로 생성됩니다!' : '온보딩이 완료되었습니다.')
      onComplete()
    }
  }

  const inputStyle = {
    width: '100%', padding: isMobile ? '14px 14px' : '16px 18px', borderRadius: '12px',
    border: '1px solid #e2e8f0', fontSize: isMobile ? '14px' : '15px', outline: 'none',
    backgroundColor: '#f8fafc', boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease', color: '#0f172a'
  }

  return (
    <div style={{
      backgroundColor: '#ffffff', padding: isMobile ? '24px 20px' : '56px', borderRadius: isMobile ? '16px' : '24px',
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)', width: '100%', maxWidth: '880px', margin: '0'
    }}>
      <div style={{ marginBottom: isMobile ? '28px' : '48px', borderBottom: '1px solid #e2e8f0', paddingBottom: isMobile ? '20px' : '32px' }}>
        {isRegenerate && onCancel && (
          <button onClick={onCancel} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff', color: '#64748b', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer', marginBottom: '16px', transition: 'all 0.15s',
          }}>
            <ArrowLeft size={16} /> 돌아가기
          </button>
        )}
        <h2 style={{ margin: '0 0 16px 0', fontSize: isMobile ? '22px' : '28px', color: '#0f172a', fontWeight: '800', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isRegenerate ? (
            <><RefreshCw size={isMobile ? 22 : 28} color="#2563eb" /> 정의서 새로 생성하기</>
          ) : (
            'Compass Initialization'
          )}
        </h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '14px' : '16px', lineHeight: '1.6' }}>
          {isRegenerate ? (
            <>기존 데이터를 바탕으로 프로필과 답변을 수정하고,<br/>정의서를 처음부터 새로 생성합니다. (AI 토큰 1개 차감)</>
          ) : (
            <>나침반의 방향을 맞추기 위해 학생의 본질을 파악하는 과정입니다.<br/>가장 솔직하고 편안한 언어로 답변을 작성해 주세요.</>
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '36px' : '56px' }}>

        {/* Step 01 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isMobile ? '16px' : '24px' }}>
            <User size={isMobile ? 20 : 24} color="#2563eb" strokeWidth={2.5} />
            <h3 style={{ fontSize: isMobile ? '17px' : '20px', color: '#0f172a', margin: 0, fontWeight: '700' }}>기본 정보</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '16px' : '24px', marginBottom: isMobile ? '16px' : '24px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569', fontSize: isMobile ? '13px' : '14px' }}>이름</label>
              <input type="text" placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
            </div>
            <div style={{ flex: isMobile ? 1 : 2 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569', fontSize: isMobile ? '13px' : '14px' }}>생년월일</label>
              <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px' }}>
                <div style={{ flex: 1.5, position: 'relative' }}>
                  <input type="number" placeholder="YYYY" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} required style={inputStyle} />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: isMobile ? '12px' : '14px', pointerEvents: 'none' }}>년</span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="number" placeholder="MM" value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} required style={inputStyle} min="1" max="12" />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: isMobile ? '12px' : '14px', pointerEvents: 'none' }}>월</span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="number" placeholder="DD" value={birthDay} onChange={(e) => setBirthDay(e.target.value)} required style={inputStyle} min="1" max="31" />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: isMobile ? '12px' : '14px', pointerEvents: 'none' }}>일</span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569', fontSize: isMobile ? '13px' : '14px' }}>소속 학교</label>
            <input type="text" placeholder="한국고등학교" value={school} onChange={(e) => setSchool(e.target.value)} required style={inputStyle} />
          </div>
        </section>

        {/* Step 02 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isMobile ? '16px' : '24px' }}>
            <Search size={isMobile ? 20 : 24} color="#2563eb" strokeWidth={2.5} />
            <h3 style={{ fontSize: isMobile ? '17px' : '20px', color: '#0f172a', margin: 0, fontWeight: '700' }}>나를 알아가는 시간</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '24px' : '32px' }}>
            {[
              { id: 'q1', val: q1, setter: setQ1, label: `${displayName}${eunNeun} 무엇을 할 때 가장 행복한가요?` },
              { id: 'q2', val: q2, setter: setQ2, label: `${displayName}${yiGa} 살면서 가장 멋지다고 생각한 사람은 누구인가요?` },
              { id: 'q3', val: q3, setter: setQ3, label: `${displayName}의 꿈은 무엇인가요?` },
              { id: 'q4', val: q4, setter: setQ4, label: `${displayName}${eunNeun} 무엇을 제일 잘한다고 생각하나요?` }
            ].map((q, i) => (
              <div key={q.id}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: '600', color: '#334155', fontSize: isMobile ? '14px' : '15px' }}>
                  <span style={{ color: '#94a3b8', fontSize: isMobile ? '13px' : '14px' }}>Q{i+1}.</span> {q.label}
                </label>
                <textarea value={q.val} onChange={(e) => q.setter(e.target.value)} required style={{...inputStyle, minHeight: isMobile ? '100px' : '120px', resize: 'vertical'}} />
              </div>
            ))}
          </div>
        </section>

        {/* Step 03 */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '16px' : '24px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Target size={isMobile ? 20 : 24} color="#2563eb" strokeWidth={2.5} />
              <h3 style={{ fontSize: isMobile ? '17px' : '20px', color: '#0f172a', margin: 0, fontWeight: '700' }}>목표 설정</h3>
            </div>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500', backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '20px' }}>최소 2개, 최대 6개</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px' }}>
            {targets.map((target, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '8px' : '16px', alignItems: isMobile ? 'stretch' : 'center' }}>
                {!isMobile && (
                  <span style={{ fontWeight: '600', color: '#cbd5e1', width: '24px', fontSize: '16px' }}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                )}
                {isMobile && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', color: '#cbd5e1', fontSize: '14px' }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {index >= 2 && (
                      <button type="button" onClick={() => handleRemoveTarget(index)} style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #fecaca', backgroundColor: '#ffffff', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        삭제
                      </button>
                    )}
                  </div>
                )}
                <input type="text" placeholder="e.g., 고려대학교" value={target.university} onChange={(e) => handleTargetChange(index, 'university', e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
                <input type="text" placeholder="e.g., 경영학과" value={target.major} onChange={(e) => handleTargetChange(index, 'major', e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
                {!isMobile && (
                  index >= 2 ? (
                    <button type="button" onClick={() => handleRemoveTarget(index)} style={{ width: '48px', height: '48px', borderRadius: '12px', border: '1px solid #fecaca', backgroundColor: '#ffffff', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: 0 }}>
                      <X size={20} />
                    </button>
                  ) : <div style={{ width: '48px', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>
          {targets.length < 6 && (
            <button type="button" onClick={handleAddTarget} style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: isMobile ? '14px' : '16px', width: '100%', borderRadius: '12px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px dashed #cbd5e1', fontSize: isMobile ? '14px' : '15px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s ease' }}>
              <Plus size={18} /> 희망 학교 및 학과 추가
            </button>
          )}
        </section>

        <button type="submit" disabled={loading} style={{ marginTop: isMobile ? '16px' : '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: isMobile ? '16px' : '20px', width: '100%', backgroundColor: isRegenerate ? '#2563eb' : '#0f172a', color: 'white', border: 'none', borderRadius: '14px', fontSize: isMobile ? '15px' : '16px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1, transition: 'all 0.2s ease', letterSpacing: '0.5px' }}>
          {loading ? '데이터 동기화 중...' : isRegenerate ? <><RefreshCw size={20} /> 정의서 새로 생성하기</> : <><CheckCircle2 size={20} /> 정의서 생성 시작하기</>}
        </button>
      </form>
    </div>
  )
}
