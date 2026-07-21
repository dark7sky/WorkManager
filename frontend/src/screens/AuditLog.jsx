import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, Download, FileText, Filter, LoaderCircle, Search } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { auditLogCsvFilename, auditLogsToCsv, auditActionLabels as actionLabels, auditEntityLabels as entityLabels } from '../csv'
import { auditLogReportFilename, auditLogsToPrintableReport } from '../auditLogReport'
import { auditLogExcelFilename, auditLogsToExcelXml } from '../xlsx'

const formatTimestamp = value => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
}).format(new Date(value))

const metadataText = metadata => {
  if (!metadata || !Object.keys(metadata).length) return ''
  const parts = []
  if (Array.isArray(metadata.fields)) parts.push(`변경 필드: ${metadata.fields.join(', ')}`)
  if (metadata.strategy) parts.push(`처리 방식: ${metadata.strategy}`)
  if (metadata.rule) parts.push(`반복 규칙: ${metadata.rule}`)
  if (metadata.older_than_days) parts.push(`${metadata.older_than_days}일 이전 항목 정리`)
  if (metadata.source === 'ai') parts.push(metadata.ai_reason ? `AI 자동 수정: ${metadata.ai_reason}` : 'AI 자동 수정')
  if (parts.length) return parts.join(' · ')
  return Object.entries(metadata).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')
}

const fieldLabels = {
  title: '제목', name: '이름', description: '설명', status: '상태', priority: '우선순위',
  progress: '진행률', start_date: '시작일', due_date: '마감일', start_time: '시작 시간', due_time: '마감 시간',
  parent_id: '상위 항목', category: '분류', tags: '태그', notes: '메모', location: '장소',
  todo_date: '날짜', hours: '작업 시간', rate: '시급', completed: '완료 여부', archived: '보관 여부',
  approval_status: '승인 상태', schedule_approval_status: '일정 승인 상태',
}
const diffValue = value => value === null || value === undefined || value === '' ? '(없음)' : String(value)

const PAGE_SIZE = 200

export default function AuditLog({ focus }) {
  const [logs,setLogs] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('')
  const [loadingMore,setLoadingMore] = useState(false), [hasMore,setHasMore] = useState(false)
  const [query,setQuery] = useState(()=>focus?.query||''), [entity,setEntity] = useState(()=>focus?.entity||'all')
  const [dateStart,setDateStart] = useState(''), [dateEnd,setDateEnd] = useState('')
  const [expanded,setExpanded] = useState(()=>new Set())
  const toggleExpanded = id => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const invalidRange = dateStart && dateEnd && dateStart > dateEnd
  const filtersActive = query || entity !== 'all' || dateStart || dateEnd
  const resetFilters = () => { setQuery(''); setEntity('all'); setDateStart(''); setDateEnd('') }
  const load = async () => {
    if (invalidRange) return
    setLoading(true); setError('')
    try {
      const result = await api.auditLogs(PAGE_SIZE, dateStart, dateEnd, 0)
      const items = result.items || []
      setLogs(items); setHasMore(items.length === PAGE_SIZE)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const result = await api.auditLogs(PAGE_SIZE, dateStart, dateEnd, logs.length)
      const items = result.items || []
      setLogs(prev=>[...prev,...items]); setHasMore(items.length === PAGE_SIZE)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }
  useEffect(()=>{ load() },[dateStart,dateEnd])
  const entities = useMemo(()=>[...new Set(logs.map(log=>log.entity_type).filter(Boolean))].sort(),[logs])
  const shown = logs.filter(log => {
    const haystack = `${log.action} ${actionLabels[log.action] || ''} ${log.entity_type} ${entityLabels[log.entity_type] || ''} ${log.entity_id || ''} ${metadataText(log.metadata)}`.toLowerCase()
    return (entity === 'all' || log.entity_type === entity) && (!query.trim() || haystack.includes(query.trim().toLowerCase()))
  })
  const exportShown = () => {
    const csv=`﻿${auditLogsToCsv(shown)}`,blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download=auditLogCsvFilename(new Date().toISOString().slice(0,10));document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)
  }
  const exportExcel = () => {
    const xml=auditLogsToExcelXml(shown),blob=new Blob([xml],{type:'application/vnd.ms-excel'}),url=URL.createObjectURL(blob),link=document.createElement('a')
    link.href=url;link.download=auditLogExcelFilename(new Date().toISOString().slice(0,10));document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)
  }
  const printReport = () => {
    const today=new Date().toISOString().slice(0,10),html=auditLogsToPrintableReport(shown,{actionLabels,entityLabels,metadataText,generatedAt:new Date().toISOString(),title:'WorkManager 감사 로그 보고서'}),win=window.open('', '_blank')
    if(!win) return
    win.document.open();win.document.write(html);win.document.close();win.document.title=auditLogReportFilename(today);win.focus();win.print()
  }
  return <><Header title="감사 로그" subtitle="업무 공간에서 발생한 주요 변경 이력을 확인하세요."/><div className="content audit-page">
    <div className="toolbar audit-toolbar">
      <div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setQuery('');e.target.blur()}}} aria-label="감사 로그 검색" placeholder="작업, 대상, 변경 내용 검색" /></div>
      <label className="filter-select"><Filter/><span>대상</span><select value={entity} onChange={e=>setEntity(e.target.value)}><option value="all">전체</option>{entities.map(value=><option key={value} value={value}>{entityLabels[value] || value}</option>)}</select></label>
      <div className="date-range"><input aria-label="시작일" type="date" value={dateStart} onChange={e=>setDateStart(e.target.value)}/><span>–</span><input aria-label="종료일" type="date" value={dateEnd} onChange={e=>setDateEnd(e.target.value)}/></div>
      {filtersActive?<button type="button" className="text-button" onClick={resetFilters}>필터 초기화</button>:null}
      <button type="button" className="text-button" onClick={printReport} disabled={!shown.length}><FileText/> PDF</button>
      <button type="button" className="text-button" onClick={exportShown} disabled={!shown.length}><Download/> CSV 내보내기</button>
      <button type="button" className="text-button" onClick={exportExcel} disabled={!shown.length}><Download/> Excel 내보내기</button>
    </div>
    <section className="audit-panel" aria-labelledby="audit-title">
      <div className="section-title"><div><h2 id="audit-title">최근 활동</h2><p>{dateStart||dateEnd?'선택한 기간의 ':''}최근 변경 이력을 보여줍니다.</p></div><ClipboardList aria-hidden="true"/></div>
      {invalidRange?<p className="inline-error">종료일은 시작일 이후여야 합니다.</p>:null}
      {loading?<div className="audit-state"><LoaderCircle className="spin"/> 불러오는 중…</div>:error?<div className="audit-state error" role="alert">{error} <button onClick={load}>다시 시도</button></div>:shown.length?<>
      <ol className="audit-list">
        {shown.map(log=>{
          const changes = log.metadata?.changes && typeof log.metadata.changes === 'object' ? Object.entries(log.metadata.changes) : []
          const isOpen = expanded.has(log.id)
          return <li key={log.id}>
          <time dateTime={log.created_at}>{formatTimestamp(log.created_at)}</time>
          <div>
            <strong>{actionLabels[log.action] || log.action}</strong>
            <span>{entityLabels[log.entity_type] || log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</span>
            {metadataText(log.metadata)?<p>{metadataText(log.metadata)}</p>:null}
            {changes.length?<>
              <button type="button" className="text-button audit-diff-toggle" onClick={()=>toggleExpanded(log.id)} aria-expanded={isOpen}>
                {isOpen?<ChevronDown/>:<ChevronRight/>} 변경 내용 보기 ({changes.length})
              </button>
              {isOpen?<ul className="audit-diff">
                {changes.map(([field,{before,after}])=><li key={field}><strong>{fieldLabels[field]||field}</strong><span className="audit-diff-before">{diffValue(before)}</span><span className="audit-diff-arrow">→</span><span className="audit-diff-after">{diffValue(after)}</span></li>)}
              </ul>:null}
            </>:null}
          </div>
        </li>})}
      </ol>
      {hasMore?<div className="audit-load-more"><button type="button" className="text-button" onClick={loadMore} disabled={loadingMore}>{loadingMore?<><LoaderCircle className="spin"/> 불러오는 중…</>:'더 보기'}</button></div>:null}
      </>:<p className="empty-state">조건에 맞는 감사 로그가 없습니다.</p>}
    </section>
  </div></>
}
