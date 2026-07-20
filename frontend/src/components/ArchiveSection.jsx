import { useEffect, useState } from 'react'
import { Archive, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../api'

const ENTITY_LABELS = { task: { heading: '업무 보관함', hint: '더 이상 진행 목록에 두지 않을 업무를 보관합니다. 언제든 다시 꺼낼 수 있습니다.', empty: '보관된 업무가 없습니다.', done: '업무를 보관 해제했습니다.' },
  todo: { heading: '할 일 보관함', hint: '더 이상 진행 목록에 두지 않을 할 일을 보관합니다. 언제든 다시 꺼낼 수 있습니다.', empty: '보관된 할 일이 없습니다.', done: '할 일을 보관 해제했습니다.' } }

export default function ArchiveSection({ notify, onDataChanged, entity = 'task' }) {
  const labels = ENTITY_LABELS[entity]
  const listFn = entity === 'todo' ? api.archivedTodos : api.archivedTasks
  const unarchiveFn = entity === 'todo' ? api.unarchiveTodo : api.unarchiveTask
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(0)
  const load = async () => {
    setLoading(true)
    try { setItems(await listFn()) }
    catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const unarchive = async item => {
    setBusy(item.id)
    try {
      await unarchiveFn(item.id)
      setItems(current => current.filter(value => value.id !== item.id))
      notify(labels.done)
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy(0) }
  }
  return <section className="settings-card">
    <div className="settings-heading"><span><Archive/></span><div><h2>{labels.heading}</h2><p>{labels.hint}</p></div><button className="icon-button" aria-label={`${labels.heading} 새로고침`} onClick={load}><RefreshCw/></button></div>
    {loading ? <div className="trash-loading"><LoaderCircle className="spin"/> 불러오는 중…</div> : items.length ? <div className="trash-list">{items.map(item => <div key={item.id}><span><strong>{item.title}</strong><time>{item.archived_at ? new Date(item.archived_at).toLocaleString('ko-KR') : ''}</time></span><div><button className="secondary" disabled={busy === item.id} onClick={() => unarchive(item)}><RotateCcw/> 보관 해제</button></div></div>)}</div> : <p className="empty-state">{labels.empty}</p>}
  </section>
}
