import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Download, FileText, Filter, LoaderCircle, Search } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { auditLogCsvFilename, auditLogsToCsv, auditActionLabels as actionLabels, auditEntityLabels as entityLabels } from '../csv'
import { auditLogReportFilename, auditLogsToPrintableReport } from '../auditLogReport'

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

const PAGE_SIZE = 200

export default function AuditLog({ focus }) {
  const [logs,setLogs] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('')
  const [loadingMore,setLoadingMore] = useState(false), [hasMore,setHasMore] = useState(false)
  const [query,setQuery] = useState(()=>focus?.query||''), [entity,setEntity] = useState(()=>focus?.entity||'all')
  const [dateStart,setDateStart] = useState(''), [dateEnd,setDateEnd] = useState('')
  const invalidRange = dateStart && dateEnd && dateStart > dateEnd
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
  const printReport = () => {
    const today=new Date().toISOString().slice(0,10),html=auditLogsToPrintableReport(shown,{actionLabels,entityLabels,metadataText,generatedAt:new Date().toISOString(),title:'WorkManager 감사 로그 보고서'}),win=window.open('', '_blank')
    if(!win) return
    win.document.open();win.document.write(html);win.document.close();win.document.title=auditLogReportFilename(today);win.focus();win.print()
  }
  return <><Header title="감사 로그" subtitle="업무 공간에서 발생한 주요 변경 이력을 확인하세요."/><div className="content audit-page">
    <div className="toolbar audit-toolbar">
      <div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setQuery('');e.target.blur()}}} placeholder="작업, 대상, 변경 내용 검색" /></div>
      <label className="filter-select"><Filter/><span>대상</span><select value={entity} onChange={e=>setEntity(e.target.value)}><option value="all">전체</option>{entities.map(value=><option key={value} value={value}>{entityLabels[value] || value}</option>)}</select></label>
      <div className="date-range"><input aria-label="시작일" type="date" value={dateStart} onChange={e=>setDateStart(e.target.value)}/><span>–</span><input aria-label="종료일" type="date" value={dateEnd} onChange={e=>setDateEnd(e.target.value)}/>{(dateStart||dateEnd)?<button type="button" className="text-button" onClick={()=>{setDateStart('');setDateEnd('')}}>초기화</button>:null}</div>
      <button type="button" className="text-button" onClick={printReport} disabled={!shown.length}><FileText/> PDF</button>
      <button type="button" className="text-button" onClick={exportShown} disabled={!shown.length}><Download/> CSV 내보내기</button>
    </div>
    <section className="audit-panel" aria-labelledby="audit-title">
      <div className="section-title"><div><h2 id="audit-title">최근 활동</h2><p>{dateStart||dateEnd?'선택한 기간의 ':''}최근 변경 이력을 보여줍니다.</p></div><ClipboardList aria-hidden="true"/></div>
      {invalidRange?<p className="inline-error">종료일은 시작일 이후여야 합니다.</p>:null}
      {loading?<div className="audit-state"><LoaderCircle className="spin"/> 불러오는 중…</div>:error?<div className="audit-state error" role="alert">{error} <button onClick={load}>다시 시도</button></div>:shown.length?<>
      <ol className="audit-list">
        {shown.map(log=><li key={log.id}>
          <time dateTime={log.created_at}>{formatTimestamp(log.created_at)}</time>
          <div><strong>{actionLabels[log.action] || log.action}</strong><span>{entityLabels[log.entity_type] || log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</span>{metadataText(log.metadata)?<p>{metadataText(log.metadata)}</p>:null}</div>
        </li>)}
      </ol>
      {hasMore?<div className="audit-load-more"><button type="button" className="text-button" onClick={loadMore} disabled={loadingMore}>{loadingMore?<><LoaderCircle className="spin"/> 불러오는 중…</>:'더 보기'}</button></div>:null}
      </>:<p className="empty-state">조건에 맞는 감사 로그가 없습니다.</p>}
    </section>
  </div></>
}
