import { useEffect, useState } from 'react'
import { Archive, LoaderCircle, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { api } from '../api'
import { allIdsSelected, toggleSelectAllIds } from '../taskFilters'

const ENTITY_LABELS = { task: { heading: '업무 보관함', hint: '더 이상 진행 목록에 두지 않을 업무를 보관합니다. 언제든 다시 꺼낼 수 있습니다.', empty: '보관된 업무가 없습니다.', done: '업무를 보관 해제했습니다.' },
  todo: { heading: '할 일 보관함', hint: '더 이상 진행 목록에 두지 않을 할 일을 보관합니다. 언제든 다시 꺼낼 수 있습니다.', empty: '보관된 할 일이 없습니다.', done: '할 일을 보관 해제했습니다.' },
  event: { heading: '일정 보관함', hint: '더 이상 진행 목록에 두지 않을 일정을 보관합니다. 언제든 다시 꺼낼 수 있습니다.', empty: '보관된 일정이 없습니다.', done: '일정을 보관 해제했습니다.' },
  work_log: { heading: '업무 기록 보관함', hint: '더 이상 진행 목록에 두지 않을 업무 기록을 보관합니다. 언제든 다시 꺼낼 수 있습니다.', empty: '보관된 업무 기록이 없습니다.', done: '업무 기록을 보관 해제했습니다.' } }
const LIST_FNS = { task: api.archivedTasks, todo: api.archivedTodos, event: api.archivedEvents, work_log: api.archivedLogs }
const UNARCHIVE_FNS = { task: api.unarchiveTask, todo: api.unarchiveTodo, event: api.unarchiveEvent, work_log: api.unarchiveLog }
const itemLabel = item => item.title || item.content || ''
const PAGE_SIZE = 50

export default function ArchiveSection({ notify, onDataChanged, entity = 'task' }) {
  const labels = ENTITY_LABELS[entity]
  const listFn = LIST_FNS[entity]
  const unarchiveFn = UNARCHIVE_FNS[entity]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const load = async () => {
    setLoading(true)
    try { const result = await listFn(PAGE_SIZE, 0); setItems(result); setHasMore(result.length === PAGE_SIZE) }
    catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  const loadMore = async () => {
    setLoadingMore(true)
    try { const result = await listFn(PAGE_SIZE, items.length); setItems(current => [...current, ...result]); setHasMore(result.length === PAGE_SIZE) }
    catch (error) { notify(error.message, 'error') }
    finally { setLoadingMore(false) }
  }
  useEffect(() => { load() }, [])
  const unarchive = async item => {
    setBusy(item.id)
    try {
      await unarchiveFn(item.id)
      setItems(current => current.filter(value => value.id !== item.id))
      setSelected(current => { const next = new Set(current); next.delete(item.id); return next })
      notify(labels.done)
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy(0) }
  }
  const toggleSelected = id => setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const bulkUnarchive = async () => {
    setBusy('bulk')
    const targets = shown.filter(item => selected.has(item.id))
    try {
      await Promise.all(targets.map(item => unarchiveFn(item.id)))
      setItems(current => current.filter(item => !selected.has(item.id)))
      notify(`${targets.length}개 항목을 보관 해제했습니다.`)
      setSelected(new Set())
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy(0) }
  }
  const shown = items.filter(item => !query.trim() || itemLabel(item).toLowerCase().includes(query.trim().toLowerCase()))
  const shownIds = shown.map(item => item.id)
  const allShownSelected = allIdsSelected(shownIds, selected)
  const toggleSelectAllShown = () => setSelected(toggleSelectAllIds(shownIds, selected))
  return <section className="settings-card">
    <div className="settings-heading"><span><Archive/></span><div><h2>{labels.heading}</h2><p>{labels.hint}</p></div><button className="icon-button" aria-label={`${labels.heading} 새로고침`} onClick={load}><RefreshCw/></button></div>
    {!loading && items.length ? <div className="trash-filters"><label className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 내용 검색" aria-label={`${labels.heading} 검색`}/></label>{shown.length > 1 ? <label className="select-all-shown"><input type="checkbox" aria-label={`${labels.heading} 전체 선택`} checked={allShownSelected} onChange={toggleSelectAllShown}/>전체 선택</label> : null}</div> : null}
    {selected.size ? <div className="bulk-action-bar" role="toolbar" aria-label="선택 항목 일괄 작업"><span>{selected.size}개 선택됨</span><button type="button" className="secondary" disabled={busy === 'bulk'} onClick={bulkUnarchive}><RotateCcw size={16}/> 선택 보관 해제</button><button type="button" className="text-button" onClick={() => setSelected(new Set())}>선택 해제</button></div> : null}
    {loading ? <div className="trash-loading"><LoaderCircle className="spin"/> 불러오는 중…</div> : items.length ? shown.length ? <div className="trash-list">{shown.map(item => <div key={item.id}><input type="checkbox" className="row-select" aria-label={`${itemLabel(item) || '항목'} 선택`} checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)}/><span><strong>{itemLabel(item)}</strong><time>{item.archived_at ? new Date(item.archived_at).toLocaleString('ko-KR') : ''}</time></span><div><button className="secondary" disabled={busy === item.id} onClick={() => unarchive(item)}><RotateCcw/> 보관 해제</button></div></div>)}</div> : <p className="empty-state">검색 조건에 맞는 항목이 없습니다.</p> : <p className="empty-state">{labels.empty}</p>}
    {!loading && !query.trim() && hasMore ? <div className="audit-load-more"><button type="button" className="text-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin"/> 불러오는 중…</> : '더 보기'}</button></div> : null}
  </section>
}
