// src/components/AdmissionUploader.tsx
import React, { useState, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import {
  Upload, FileText, FileSpreadsheet, CheckCircle, XCircle,
  Loader2, ChevronDown, ChevronUp, Trash2, AlertCircle,
  Eye, X, RotateCcw, Database,
} from 'lucide-react'

// ── pdfjs-dist: 좌표 기반 표 구조 보존 텍스트 추출 ────────────────────────
// transform[4]=x, transform[5]=y 좌표를 이용해
// 같은 y줄의 텍스트를 탭으로 묶어 표 행을 재구성
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs' as any)
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allLines: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page   = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items  = content.items as any[]

    if (items.length === 0) continue

    // 1) y좌표 기준으로 행 그룹핑 (±4px 허용)
    const rows: { y: number; cells: { x: number; text: string }[] }[] = []

    for (const item of items) {
      const x   = Math.round(item.transform[4])
      const y   = Math.round(item.transform[5])
      const txt = item.str.trim()
      if (!txt) continue

      // 기존 행 중 y가 가까운 행 찾기
      const existing = rows.find(r => Math.abs(r.y - y) <= 4)
      if (existing) {
        existing.cells.push({ x, text: txt })
      } else {
        rows.push({ y, cells: [{ x, text: txt }] })
      }
    }

    // 2) y 내림차순 정렬 (PDF 좌표계는 아래가 0)
    rows.sort((a, b) => b.y - a.y)

    // 3) 각 행 내에서 x 오름차순 정렬 후 탭으로 연결
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x)
      const line = row.cells.map(c => c.text).join('\t')
      allLines.push(line)
    }

    // 페이지 구분
    allLines.push('--- PAGE ' + p + ' END ---')
  }

  return allLines.join('\n')
}

// ── 타입 ────────────────────────────────────────────────────────────────────
interface ParsedRow {
  university:       string
  admission_year:   number
  admission_type:   string
  college:          string | null
  department:       string
  major:            string | null
  quota:            number | null
  competition_rate: number | null
  waitlist_rank:    number | null
  grade_top:        number | null
  grade_avg:        number | null
  grade_bottom:     number | null
  nat_science:      boolean
}

type FileStatus = 'pending' | 'parsing' | 'previewing' | 'saving' | 'done' | 'error'

interface FileItem {
  id:       string
  file:     File
  status:   FileStatus
  progress: number        // 0~100
  rows:     ParsedRow[]
  error:    string | null
  expanded: boolean
  savedCount: number
}

const uid = () => Math.random().toString(36).slice(2, 10)

const STATUS_META: Record<FileStatus, { label: string; color: string; bg: string }> = {
  pending:    { label: '대기중',      color: '#64748b', bg: '#f1f5f9' },
  parsing:    { label: 'AI 파싱중',   color: '#2563eb', bg: '#eff6ff' },
  previewing: { label: '파싱 완료',   color: '#d97706', bg: '#fffbeb' },
  saving:     { label: 'DB 저장중',   color: '#7c3aed', bg: '#f5f3ff' },
  done:       { label: '저장 완료',   color: '#16a34a', bg: '#f0fdf4' },
  error:      { label: '오류',        color: '#dc2626', bg: '#fef2f2' },
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function AdmissionUploader() {
  const [queue, setQueue]         = useState<FileItem[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const update = useCallback((id: string, patch: Partial<FileItem>) => {
    setQueue(q => q.map(f => f.id === id ? { ...f, ...patch } : f))
  }, [])

  // 파일 추가
  const addFiles = (files: FileList | File[]) => {
    const allowed = Array.from(files).filter(f =>
      f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.csv')
    )
    if (allowed.length === 0) return
    setQueue(q => [
      ...q,
      ...allowed.map(file => ({
        id: uid(), file, status: 'pending' as FileStatus,
        progress: 0, rows: [], error: null, expanded: false, savedCount: 0,
      })),
    ])
  }

  // CSV → text
  const toText = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const r = new FileReader()
      r.onload  = () => res(r.result as string)
      r.onerror = rej
      r.readAsText(file, 'utf-8')
    })

  // Edge Function 호출 → ParsedRow[]
  // PDF는 브라우저에서 pdfjs로 텍스트 추출 후 전달 (image_url 방식 사용 불가)
  const parseFile = async (item: FileItem): Promise<ParsedRow[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const isCsv = item.file.name.toLowerCase().endsWith('.csv')
    // PDF든 CSV든 모두 rawText로 변환
    const rawText = isCsv
      ? await toText(item.file)
      : await extractPdfText(item.file)

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-admission`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'parse_text', fileName: item.file.name, rawText }),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `서버 오류 (HTTP ${res.status})`)
    }
    const data = await res.json()
    if (!Array.isArray(data.rows)) throw new Error('파싱 결과 형식이 올바르지 않아요')
    return data.rows
  }

  // Supabase 저장 (50행씩 청크)
  const saveRows = async (id: string, rows: ParsedRow[]) => {
    update(id, { status: 'saving', progress: 85 })
    const CHUNK = 50
    let saved = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('admission_results').insert(rows.slice(i, i + CHUNK))
      if (error) throw new Error(error.message)
      saved += Math.min(CHUNK, rows.length - i)
      update(id, {
        savedCount: saved,
        progress: 85 + Math.round((saved / rows.length) * 15),
      })
    }
  }

  // 단일 파일 처리
  const processOne = async (item: FileItem) => {
    try {
      // 1) 파싱
      update(item.id, { status: 'parsing', progress: 15, error: null })
      // 가짜 진행률 애니메이션 (GPT 응답 대기 체감용)
      // 가짜 진행률 (GPT 응답 대기 중 체감용 — 청크 처리 때문에 시간이 걸림)
      const fakeTimer = setInterval(() => {
        setQueue(q => q.map(f =>
          f.id === item.id && f.status === 'parsing' && f.progress < 70
            ? { ...f, progress: f.progress + 3 }
            : f
        ))
      }, 1500)

      const rows = await parseFile(item)
      clearInterval(fakeTimer)

      if (rows.length === 0) throw new Error('파싱된 데이터가 없어요. 파일 형식을 확인해 주세요.')

      // 2) 미리보기 (저장 전)
      update(item.id, { status: 'previewing', rows, progress: 80, expanded: true })

      // 3) 저장
      await saveRows(item.id, rows)

      // 4) 완료
      update(item.id, { status: 'done', progress: 100, expanded: false })

    } catch (err: any) {
      update(item.id, { status: 'error', error: err.message, progress: 0 })
    }
  }

  // 전체 큐 순차 실행
  const runQueue = async () => {
    setIsRunning(true)
    // 큐 스냅샷에서 pending만
    const snapshot = queue.filter(f => f.status === 'pending')
    for (const item of snapshot) {
      await processOne(item)
    }
    setIsRunning(false)
  }

  // 단일 재시도
  const retry = async (item: FileItem) => {
    update(item.id, { status: 'pending', progress: 0, error: null, rows: [] })
    setTimeout(() => processOne({ ...item, status: 'pending', progress: 0, error: null, rows: [] }), 100)
  }

  const pendingCount = queue.filter(f => f.status === 'pending').length
  const doneCount    = queue.filter(f => f.status === 'done').length
  const errorCount   = queue.filter(f => f.status === 'error').length
  const totalSaved   = queue.reduce((s, f) => s + f.savedCount, 0)

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* 헤더 */}
      <div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>
          📊 입시결과 데이터 업로드
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
          대학별 입시결과 PDF 또는 CSV를 올리면 GPT-4o가 자동으로 파싱해서 DB에 저장해요.
          여러 파일을 한번에 올려도 <strong>순차적으로</strong> 처리해요.
        </p>
      </div>

      {/* 드래그앤드롭 존 */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
        onDrop={e => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragOver ? '#2563eb' : '#cbd5e1'}`,
          borderRadius: '18px', padding: '48px 24px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          backgroundColor: isDragOver ? '#eff6ff' : '#f8fafc',
          transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.csv"
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '14px' }}>
          <FileText size={32} color={isDragOver ? '#2563eb' : '#94a3b8'} />
          <FileSpreadsheet size={32} color={isDragOver ? '#059669' : '#94a3b8'} />
        </div>
        <p style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '700', color: isDragOver ? '#2563eb' : '#0f172a' }}>
          파일을 드래그하거나 클릭해서 선택
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          PDF · CSV 지원 &nbsp;·&nbsp; 여러 파일 동시 선택 가능
        </p>
      </div>

      {/* 큐가 있을 때만 표시 */}
      {queue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* 상태 요약 바 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', backgroundColor: '#ffffff', borderRadius: '14px',
            border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px',
          }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Stat label="전체" value={queue.length} color="#0f172a" />
              {pendingCount > 0 && <Stat label="대기" value={pendingCount} color="#64748b" />}
              {doneCount    > 0 && <Stat label="완료" value={doneCount}   color="#16a34a" />}
              {errorCount   > 0 && <Stat label="오류" value={errorCount}  color="#dc2626" />}
              {totalSaved   > 0 && <Stat label="저장된 행" value={`${totalSaved}행`} color="#2563eb" />}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {doneCount > 0 && (
                <button
                  onClick={() => setQueue(q => q.filter(f => f.status !== 'done'))}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  완료 정리
                </button>
              )}
              <button
                onClick={runQueue}
                disabled={isRunning || pendingCount === 0}
                style={{
                  padding: '9px 22px', borderRadius: '9px', border: 'none',
                  backgroundColor: isRunning || pendingCount === 0 ? '#e2e8f0' : '#0f172a',
                  color: isRunning || pendingCount === 0 ? '#94a3b8' : '#ffffff',
                  fontSize: '14px', fontWeight: '700',
                  cursor: isRunning || pendingCount === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '7px', transition: 'all 0.2s',
                }}>
                {isRunning
                  ? <><Loader2 size={15} className="animate-spin" /> 처리중...</>
                  : <><Upload size={15} /> {pendingCount}개 파일 처리 시작</>
                }
              </button>
            </div>
          </div>

          {/* 파일 카드 목록 */}
          {queue.map(item => (
            <FileCard
              key={item.id}
              item={item}
              isRunning={isRunning}
              onRemove={() => setQueue(q => q.filter(f => f.id !== item.id))}
              onToggle={() => update(item.id, { expanded: !item.expanded })}
              onRetry={() => retry(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── 통계 뱃지 ────────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
      <span style={{ fontSize: '18px', fontWeight: '800', color }}>{value}</span>
      <span style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>{label}</span>
    </div>
  )
}

// ── 파일 카드 ────────────────────────────────────────────────────────────────
function FileCard({
  item, isRunning, onRemove, onToggle, onRetry,
}: {
  item: FileItem
  isRunning: boolean
  onRemove: () => void
  onToggle: () => void
  onRetry: () => void
}) {
  const meta = STATUS_META[item.status]
  const isActive  = item.status === 'parsing' || item.status === 'saving'
  const canRemove = !isActive
  const canRetry  = item.status === 'error'
  const hasPreview = item.rows.length > 0 && (item.status === 'previewing' || item.status === 'done')
  const isCsv = item.file.name.toLowerCase().endsWith('.csv')

  return (
    <div style={{
      backgroundColor: '#ffffff', borderRadius: '14px',
      border: `1px solid ${item.status === 'error' ? '#fecaca' : item.status === 'done' ? '#bbf7d0' : '#e2e8f0'}`,
      overflow: 'hidden', transition: 'border-color 0.3s',
    }}>
      {/* 카드 헤더 */}
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>

        {/* 파일 아이콘 */}
        <div style={{ flexShrink: 0 }}>
          {isCsv
            ? <FileSpreadsheet size={20} color="#059669" />
            : <FileText size={20} color="#2563eb" />
          }
        </div>

        {/* 파일 정보 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.file.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* 상태 뱃지 */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
              backgroundColor: meta.bg, color: meta.color,
            }}>
              {isActive && <Loader2 size={10} className="animate-spin" />}
              {item.status === 'done' && <CheckCircle size={10} />}
              {item.status === 'error' && <XCircle size={10} />}
              {meta.label}
            </span>
            {item.status === 'done' && (
              <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>
                <Database size={11} style={{ display: 'inline', marginRight: '3px' }} />
                {item.savedCount}행 저장됨
              </span>
            )}
            {item.status === 'previewing' && (
              <span style={{ fontSize: '12px', color: '#d97706', fontWeight: '600' }}>
                {item.rows.length}행 파싱됨
              </span>
            )}
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {(item.file.size / 1024).toFixed(0)} KB
            </span>
          </div>
        </div>

        {/* 우측 액션 */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {hasPreview && (
            <button onClick={onToggle} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 11px', borderRadius: '8px',
              border: '1px solid #e2e8f0', backgroundColor: '#f8fafc',
              color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}>
              <Eye size={13} />
              {item.expanded ? '숨기기' : '미리보기'}
              {item.expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {canRetry && (
            <button onClick={onRetry} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 11px', borderRadius: '8px',
              border: '1px solid #fecaca', backgroundColor: '#fef2f2',
              color: '#dc2626', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            }}>
              <RotateCcw size={12} /> 재시도
            </button>
          )}
          {canRemove && (
            <button onClick={onRemove} style={{
              width: '30px', height: '30px', borderRadius: '8px',
              border: '1px solid #e2e8f0', backgroundColor: '#ffffff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={14} color="#94a3b8" />
            </button>
          )}
        </div>
      </div>

      {/* 진행률 바 */}
      {(isActive || item.status === 'previewing') && (
        <div style={{ padding: '0 18px 4px' }}>
          <div style={{ height: '4px', backgroundColor: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '2px', transition: 'width 0.5s ease',
              width: `${item.progress}%`,
              background: item.status === 'saving'
                ? 'linear-gradient(90deg, #7c3aed, #2563eb)'
                : 'linear-gradient(90deg, #2563eb, #60a5fa)',
            }} />
          </div>
          <p style={{ margin: '4px 0 10px', fontSize: '11px', color: '#94a3b8', textAlign: 'right' }}>
            {item.status === 'parsing' && `GPT-4o가 테이블을 읽고 있어요... ${item.progress}%`}
            {item.status === 'saving'  && `Supabase에 저장 중... ${item.savedCount}/${item.rows.length}행`}
            {item.status === 'previewing' && '저장 전 미리보기 — 처리 시작 버튼을 누르면 저장돼요'}
          </p>
        </div>
      )}

      {/* 에러 메세지 */}
      {item.status === 'error' && item.error && (
        <div style={{ margin: '0 18px 16px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca', display: 'flex', gap: '8px' }}>
          <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
          <p style={{ margin: 0, fontSize: '13px', color: '#dc2626', lineHeight: 1.6 }}>{item.error}</p>
        </div>
      )}

      {/* 파싱 결과 미리보기 */}
      {item.expanded && hasPreview && (
        <PreviewTable rows={item.rows} />
      )}
    </div>
  )
}

// ── 미리보기 테이블 ──────────────────────────────────────────────────────────
function PreviewTable({ rows }: { rows: ParsedRow[] }) {
  const [page, setPage] = useState(0)
  const PER   = 10
  const total = Math.ceil(rows.length / PER)
  const slice = rows.slice(page * PER, (page + 1) * PER)

  const COLS: { key: keyof ParsedRow; label: string; w: string }[] = [
    { key: 'university',       label: '대학',   w: '88px'  },
    { key: 'admission_year',   label: '연도',   w: '50px'  },
    { key: 'admission_type',   label: '전형',   w: '120px' },
    { key: 'department',       label: '학과',   w: '130px' },
    { key: 'quota',            label: '모집',   w: '42px'  },
    { key: 'competition_rate', label: '경쟁률', w: '58px'  },
    { key: 'waitlist_rank',    label: '예비',   w: '42px'  },
    { key: 'grade_top',        label: '최고',   w: '42px'  },
    { key: 'grade_avg',        label: '평균',   w: '42px'  },
    { key: 'grade_bottom',     label: '최저',   w: '42px'  },
  ]

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 18px 18px' }}>
      <p style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: '700', color: '#64748b' }}>
        파싱 결과 미리보기 — 총 {rows.length}행
      </p>
      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {COLS.map(c => (
                <th key={c.key} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap', width: c.w, borderBottom: '1px solid #e2e8f0' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                {COLS.map(c => (
                  <td key={c.key} style={{ padding: '7px 10px', color: '#334155', whiteSpace: 'nowrap' }}>
                    {row[c.key] == null
                      ? <span style={{ color: '#cbd5e1' }}>—</span>
                      : String(row[c.key])
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 페이지네이션 */}
      {total > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '12px', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
            ◀
          </button>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
            {page + 1} / {total} 페이지
          </span>
          <button onClick={() => setPage(p => Math.min(total - 1, p + 1))} disabled={page === total - 1}
            style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '12px', cursor: page === total - 1 ? 'not-allowed' : 'pointer', opacity: page === total - 1 ? 0.4 : 1 }}>
            ▶
          </button>
        </div>
      )}
    </div>
  )
}