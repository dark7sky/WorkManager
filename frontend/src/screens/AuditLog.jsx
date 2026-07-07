import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Filter, LoaderCircle, Search } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'

const actionLabels = {
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  purge: '정리',
  sync: '동기화',
  remote_delete: '원격 삭제',
  resolve_conflict: '충돌 해결',
  recurrence_create: '반복 생성',
}

const entityLabels = {
  tasks: '업무',
  events: '일정',
  todos: 'Todo',
  work_logs: '업무 기록',
  trash: '휴지통',
  google_calendar: 'Google 캘린더',
}

const formatTimestamp = value => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
}).format(new Date(value))

const metadataText = metadata => {
  if (!metadata || !Object.keys(metadata).length) return ''
  if (Array.isArray(metadata.fields)) return `변경 필드: ${metadata.fields.join(', ')}`
  if (metadata.strategy) return `처리 방식: ${metadata.strategy}`
  if (metadata.rule) return `반복 규칙: ${metadata.rule}`
  if (metadata.older_than_days) return `${metadata.older_than_days}일 이전 항목 정리`
  return Object.entries(metadata).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')
}

export default function AuditLog() {
  const [logs,setLogs] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('')
  const [query,setQuery] = useState(''), [entity,setEntity] = useState('all')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const result = await api.auditLogs(200)
      setLogs(result.items || [])
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(()=>{ load() },[])
  const entities = useMemo(()=>[...new Set(logs.map(log=>log.entity_type).filter(Boolean))].sort(),[logs])
  const shown = logs.filter(log => {
    const haystack = `${log.action} ${actionLabels[log.action] || ''} ${log.entity_type} ${entityLabels[log.entity_type] || ''} ${log.entity_id || ''} ${metadataText(log.metadata)}`.toLowerCase()
    return (entity === 'all' || log.entity_type === entity) && (!query.trim() || haystack.includes(query.trim().toLowerCase()))
  })
  return <><Header title="감사 로그" subtitle="업무 공간에서 발생한 주요 변경 이력을 확인하세요."/><div className="content audit-page">
    <div className="toolbar audit-toolbar">
      <div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="작업, 대상, 변경 내용 검색" /></div>
      <label className="filter-select"><Filter/><span>대상</span><select value={entity} onChange={e=>setEntity(e.target.value)}><option value="all">전체</option>{entities.map(value=><option key={value} value={value}>{entityLabels[value] || value}</option>)}</select></label>
    </div>
    <section className="audit-panel" aria-labelledby="audit-title">
      <div className="section-title"><div><h2 id="audit-title">최근 활동</h2><p>최대 200개의 최신 변경을 보여줍니다.</p></div><ClipboardList aria-hidden="true"/></div>
      {loading?<div className="audit-state"><LoaderCircle className="spin"/> 불러오는 중…</div>:error?<div className="audit-state error" role="alert">{error} <button onClick={load}>다시 시도</button></div>:shown.length?<ol className="audit-list">
        {shown.map(log=><li key={log.id}>
          <time dateTime={log.created_at}>{formatTimestamp(log.created_at)}</time>
          <div><strong>{actionLabels[log.action] || log.action}</strong><span>{entityLabels[log.entity_type] || log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</span>{metadataText(log.metadata)?<p>{metadataText(log.metadata)}</p>:null}</div>
        </li>)}
      </ol>:<p className="empty-state">조건에 맞는 감사 로그가 없습니다.</p>}
    </section>
  </div></>
}
