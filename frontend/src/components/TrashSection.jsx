import { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react'
import { api } from '../api'
import ConfirmDialog from './ConfirmDialog'
import { filterTrashItems, trashTables } from '../trashFilter'

const labels = { tasks: '업무', events: '일정', todos: '오늘 할 일', work_logs: '업무 기록' }

export default function TrashSection({ notify, onDataChanged }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [cleanup, setCleanup] = useState(0)
  const [query, setQuery] = useState('')
  const [table, setTable] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const load = async () => {
    setLoading(true)
    try {
      const response = await api.trash()
      setItems(Array.isArray(response) ? response : Object.entries(response.items || response).flatMap(([table, rows]) =>
        Array.isArray(rows) ? rows.map(item => ({ ...item, table: item.table || table })) : []))
    } catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const restore = async item => {
    const key = `${item.table}-${item.id}`
    setBusy(key)
    try {
      await api.restoreTrash(item.table, item.id)
      setItems(current => current.filter(value => value !== item))
      setSelected(current => { const next = new Set(current); next.delete(key); return next })
      notify('항목을 복원했습니다.')
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }
  const toggleSelected = key => setSelected(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next })
  const clearSelected = () => setSelected(new Set())
  const bulkRestore = async () => {
    setBusy('bulk')
    const targets = shown.filter(item => selected.has(`${item.table}-${item.id}`))
    try {
      await Promise.all(targets.map(item => api.restoreTrash(item.table, item.id)))
      setItems(current => current.filter(item => !selected.has(`${item.table}-${item.id}`)))
      notify(`${targets.length}개 항목을 복원했습니다.`)
      clearSelected()
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }
  const purge = async () => {
    setBusy('cleanup')
    try {
      const result = await api.cleanupTrash(cleanup)
      const count = Object.values(result?.purged || {}).reduce((sum, value) => sum + Number(value || 0), 0)
      const days = cleanup
      setCleanup(0)
      notify(`${days}일이 지난 항목 ${count}개를 정리했습니다.`)
      await load()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }
  const availableTables = trashTables(items)
  const shown = filterTrashItems(items, { query, table })
  return <section className="settings-card">
    <div className="settings-heading"><span><Trash2/></span><div><h2>휴지통</h2><p>삭제한 항목을 복원합니다. 7일 또는 30일이 지난 항목을 영구 정리할 수 있습니다.</p></div><button className="icon-button" aria-label="휴지통 새로고침" onClick={load}><RefreshCw/></button></div>
    {!loading && items.length ? <div className="trash-filters"><label className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 내용 검색" aria-label="휴지통 검색"/></label><label className="filter-select"><span>유형</span><select value={table} onChange={e => setTable(e.target.value)}><option value="all">전체</option>{availableTables.map(t => <option key={t} value={t}>{labels[t] || t}</option>)}</select></label></div> : null}
    {selected.size ? <div className="bulk-action-bar" role="toolbar" aria-label="선택 항목 일괄 작업"><span>{selected.size}개 선택됨</span><button type="button" className="secondary" disabled={busy === 'bulk'} onClick={bulkRestore}><RotateCcw size={16}/> 선택 복원</button><button type="button" className="text-button" onClick={clearSelected}>선택 해제</button></div> : null}
    {loading ? <div className="trash-loading"><LoaderCircle className="spin"/> 불러오는 중…</div> : items.length ? shown.length ? <><div className="trash-list">{shown.map(item => { const key = `${item.table}-${item.id}`; return <div key={key}><input type="checkbox" className="row-select" aria-label={`${item.title || item.content || '항목'} 선택`} checked={selected.has(key)} onChange={() => toggleSelected(key)}/><span><small>{labels[item.table] || item.table}</small><strong>{item.title || item.content || '제목 없는 항목'}</strong><time>{item.deleted_at ? new Date(item.deleted_at).toLocaleString('ko-KR') : ''}</time></span><div><button className="secondary" disabled={busy === key} onClick={() => restore(item)}><RotateCcw/> 복원</button></div></div> })}</div><div className="trash-footer"><button className="secondary" onClick={() => setCleanup(7)}><Trash2/> 7일 지난 항목 정리</button><button className="danger-button" onClick={() => setCleanup(30)}><Trash2/> 30일 지난 항목 정리</button></div></> : <p className="empty-state">검색 조건에 맞는 항목이 없습니다.</p> : <p className="empty-state">휴지통이 비어 있습니다.</p>}
    {cleanup ? <ConfirmDialog title="오래된 항목을 정리할까요?" message={`삭제된 지 ${cleanup}일이 지난 항목을 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.`} confirmLabel="영구 정리" busy={busy === 'cleanup'} onClose={() => setCleanup(0)} onConfirm={purge}/> : null}
  </section>
}
