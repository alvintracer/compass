// src/components/AdmissionViewer.tsx
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Search, RefreshCw, Loader2, Trash2, ChevronUp, ChevronDown, Filter } from 'lucide-react'

interface AdmissionRow {
  id: string
  university: string
  admission_year: number
  admission_type: string
  college: string | null
  department: string
  major: string | null
  quota: number | null
  competition_rate: number | null
  waitlist_rank: number | null
  grade_top: number | null
  grade_avg: number | null
  grade_bottom: number | null
  nat_science: boolean
  created_at: string
}

type SortKey = 'university' | 'department' | 'admission_type' | 'grade_avg' | 'competition_rate' | 'admission_year'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

export default function AdmissionViewer() {
  const [rows, setRows]           = useState<AdmissionRow[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  // 필터
  const [search, setSearch]       = useState('')
  const [filterYear, setFilterYear]     = useState('')
  const [filterType, setFilterType]     = useState('')
  const [filterUniv, setFilterUniv]     = useState('')

  // 정렬
  const [sortKey, setSortKey]     = useState<SortKey>('university')
  const [sortDir, setSortDir]     = useState<SortDir>('asc')

  // 필터 옵션 (distinct)
  const [years, setYears]         = useState<number[]>([])
  const [types, setTypes]         = useState<string[]>([])
  const [univs, setUnivs]         = useState<string[]>([])

  const [showFilters, setShowFilters] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'row' | 'bulk'; id?: string; label: string } | null>(null)

  // 필터 옵션 로드
  useEffect(() => {
    loadOptions()
  }, [])

  const loadOptions = async () => {
    const { data } = await supabase
      .from('admission_results')
      .select('admission_year, admission_type, university')
    if (!data) return
    setYears([...new Set(data.map(r => r.admission_year))].sort((a, b) => b - a))
    setTypes([...new Set(data.map(r => r.admission_type))].sort())
    setUnivs([...new Set(data.map(r => r.university))].sort())
  }

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    try {
      let q = supabase.from('admission_results').select('*', { count: 'exact' })

      if (filterYear) q = q.eq('admission_year', Number(filterYear))
      if (filterType) q = q.eq('admission_type', filterType)
      if (filterUniv) q = q.eq('university', filterUniv)
      if (search) {
        q = q.or(`department.ilike.%${search}%,major.ilike.%${search}%,university.ilike.%${search}%`)
      }

      const dir = sortDir === 'asc'
      q = q.order(sortKey, { ascending: dir })
      q = q.range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

      const { data, count, error } = await q
      if (error) throw error
      setRows(data as AdmissionRow[])
      setTotal(count ?? 0)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }, [search, filterYear, filterType, filterUniv, sortKey, sortDir])

  useEffect(() => { load(0) }, [load])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span style={{ opacity: 0.3, fontSize: '10px' }}>↕</span>
    return sortDir === 'asc'
      ? <ChevronUp size={12} color="#2563eb" />
      : <ChevronDown size={12} color="#2563eb" />
  }

  // 단일 행 삭제
  const deleteRow = async (id: string) => {
    setDeleting(id)
    await supabase.from('admission_results').delete().eq('id', id)
    setRows(r => r.filter(x => x.id !== id))
    setTotal(t => t - 1)
    setDeleting(null)
    setDeleteTarget(null)
  }

  // 필터 조건 전체 삭제
  const deleteBulk = async () => {
    setLoading(true)
    let q = supabase.from('admission_results').delete()
    if (filterYear) q = (q as any).eq('admission_year', Number(filterYear))
    if (filterType) q = (q as any).eq('admission_type', filterType)
    if (filterUniv) q = (q as any).eq('university', filterUniv)
    await q
    setDeleteTarget(null)
    await loadOptions()
    await load(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const gradeColor = (v: number | null) => {
    if (v === null) return '#94a3b8'
    if (v <= 2) return '#16a34a'
    if (v <= 3) return '#2563eb'
    if (v <= 4) return '#d97706'
    return '#dc2626'
  }

  const TH = ({ label, sortK, w }: { label: string; sortK?: SortKey; w?: string }) => (
    <th
      onClick={sortK ? () => handleSort(sortK) : undefined}
      style={{
        padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '700',
        color: '#475569', whiteSpace: 'nowrap', width: w,
        cursor: sortK ? 'pointer' : 'default',
        backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label} {sortK && <SortIcon k={sortK} />}
      </span>
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
            📋 입시결과 데이터
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            총 <strong>{total.toLocaleString()}</strong>행
            {(filterUniv || filterYear || filterType || search) && ' (필터 적용중)'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(filterUniv || filterYear || filterType) && (
            <button
              onClick={() => setDeleteTarget({
                type: 'bulk',
                label: [filterUniv, filterYear, filterType].filter(Boolean).join(' / ') + ' 전체'
              })}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              <Trash2 size={13} /> 필터 결과 삭제
            </button>
          )}
          <button
            onClick={() => { load(0); loadOptions() }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* 검색창 */}
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="학과명, 전공명, 대학교명으로 검색"
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* 필터 토글 */}
        <button
          onClick={() => setShowFilters(f => !f)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: showFilters ? '#eff6ff' : '#f8fafc', color: showFilters ? '#2563eb' : '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer', width: 'fit-content' }}
        >
          <Filter size={13} /> 필터
          {(filterYear || filterType || filterUniv) && (
            <span style={{ marginLeft: '4px', padding: '1px 7px', borderRadius: '20px', backgroundColor: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: '700' }}>
              {[filterYear, filterType, filterUniv].filter(Boolean).length}
            </span>
          )}
          {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showFilters && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select value={filterUniv} onChange={e => setFilterUniv(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', minWidth: '140px' }}>
              <option value="">전체 대학</option>
              {univs.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', minWidth: '100px' }}>
              <option value="">전체 연도</option>
              {years.map(y => <option key={y} value={y}>{y}학년도</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', minWidth: '160px' }}>
              <option value="">전체 전형</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(filterYear || filterType || filterUniv) && (
              <button onClick={() => { setFilterYear(''); setFilterType(''); setFilterUniv('') }}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                초기화
              </button>
            )}
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Loader2 size={28} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
            조건에 맞는 데이터가 없어요
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <TH label="대학교"   sortK="university"       w="100px" />
                  <TH label="연도"     sortK="admission_year"   w="60px" />
                  <TH label="전형"     sortK="admission_type"   w="130px" />
                  <TH label="단과대"   w="90px" />
                  <TH label="학과"     sortK="department"       w="130px" />
                  <TH label="전공"     w="110px" />
                  <TH label="모집"     w="48px" />
                  <TH label="경쟁률"   sortK="competition_rate" w="64px" />
                  <TH label="예비"     w="48px" />
                  <TH label="최고"     w="48px" />
                  <TH label="평균"     sortK="grade_avg"        w="52px" />
                  <TH label="최저"     w="48px" />
                  <TH label=""         w="36px" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}
                    style={{ borderBottom: '1px solid #f8fafc', backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#ffffff' : '#fafafa')}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap' }}>{row.university}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.admission_year}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '700',
                        backgroundColor: row.admission_type.includes('교과') ? '#eff6ff' : row.admission_type.includes('종합') || row.admission_type.includes('프런티어') ? '#f5f3ff' : '#fef9c3',
                        color: row.admission_type.includes('교과') ? '#2563eb' : row.admission_type.includes('종합') || row.admission_type.includes('프런티어') ? '#7c3aed' : '#854d0e',
                      }}>
                        {row.admission_type}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '12px' }}>{row.college ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#0f172a', fontWeight: '600' }}>
                      {row.department}
                      {row.nat_science && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#2563eb', fontWeight: '700' }}>[자연]</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '12px' }}>{row.major ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#334155', textAlign: 'center' }}>{row.quota ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#334155', textAlign: 'center', fontWeight: '600' }}>
                      {row.competition_rate != null ? `${row.competition_rate}:1` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#334155', textAlign: 'center' }}>{row.waitlist_rank ?? '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: gradeColor(row.grade_top) }}>
                      {row.grade_top ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '800', fontSize: '14px', color: gradeColor(row.grade_avg) }}>
                      {row.grade_avg ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: gradeColor(row.grade_bottom) }}>
                      {row.grade_bottom ?? '—'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      {deleting === row.id ? (
                        <Loader2 size={13} color="#94a3b8" className="animate-spin" style={{ display: 'inline-block' }} />
                      ) : (
                        <button
                          onClick={() => setDeleteTarget({ type: 'row', id: row.id, label: `${row.university} ${row.department} (${row.admission_type})` })}
                          style={{ width: '26px', height: '26px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                        >
                          <Trash2 size={13} color="#dc2626" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total.toLocaleString()}행
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => load(0)} disabled={page === 0}
                style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '12px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
                «
              </button>
              <button onClick={() => load(page - 1)} disabled={page === 0}
                style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '12px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
                ◀
              </button>
              <span style={{ padding: '5px 14px', borderRadius: '7px', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '12px', fontWeight: '700' }}>
                {page + 1} / {totalPages}
              </span>
              <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
                style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '12px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                ▶
              </button>
              <button onClick={() => load(totalPages - 1)} disabled={page >= totalPages - 1}
                style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '12px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setDeleteTarget(null)}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '28px', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={20} color="#dc2626" />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>삭제 확인</p>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>이 작업은 되돌릴 수 없어요</p>
              </div>
            </div>
            <div style={{ padding: '12px 14px', backgroundColor: '#fef2f2', borderRadius: '10px', marginBottom: '20px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#dc2626', fontWeight: '600' }}>{deleteTarget.label}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#64748b', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                취소
              </button>
              <button
                onClick={() => deleteTarget.type === 'row' && deleteTarget.id
                  ? deleteRow(deleteTarget.id)
                  : deleteBulk()
                }
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}