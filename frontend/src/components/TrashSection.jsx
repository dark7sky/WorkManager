import { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api'
import ConfirmDialog from './ConfirmDialog'

const labels = { tasks: '업무', events: '일정', todos: '오늘 할 일', work_logs: '업무 기록' }

export default function TrashSection({ notify, onDataChanged }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [cleanup, setCleanup] = useState(false)
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
      notify('항목을 복원했습니다.')
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }
  const purge = async () => {
    setBusy('cleanup')
    try {
      const result = await api.cleanupTrash(30)
      const count = Object.values(result?.purged || {}).reduce((sum, value) => sum + Number(value || 0), 0)
      setCleanup(false)
      notify(`30일이 지난 항목 ${count}개를 정리했습니다.`)
      await load()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }
  return <section className="settings-card">
    <div className="settings-heading"><span><Trash2/></span><div><h2>휴지통</h2><p>삭제한 항목을 복원합니다. 30일이 지난 항목만 영구 정리할 수 있습니다.</p></div><button className="icon-button" aria-label="휴지통 새로고침" onClick={load}><RefreshCw/></button></div>
    {loading ? <div className="trash-loading"><LoaderCircle className="spin"/> 불러오는 중…</div> : items.length ? <><div className="trash-list">{items.map(item => { const key = `${item.table}-${item.id}`; return <div key={key}><span><small>{labels[item.table] || item.table}</small><strong>{item.title || item.content || '제목 없는 항목'}</strong><time>{item.deleted_at ? new Date(item.deleted_at).toLocaleString('ko-KR') : ''}</time></span><div><button className="secondary" disabled={busy === key} onClick={() => restore(item)}><RotateCcw/> 복원</button></div></div> })}</div><div className="trash-footer"><button className="danger-button" onClick={() => setCleanup(true)}><Trash2/> 30일 지난 항목 정리</button></div></> : <p className="empty-state">휴지통이 비어 있습니다.</p>}
    {cleanup ? <ConfirmDialog title="오래된 항목을 정리할까요?" message="삭제된 지 30일이 지난 항목을 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다." confirmLabel="영구 정리" busy={busy === 'cleanup'} onClose={() => setCleanup(false)} onConfirm={purge}/> : null}
  </section>
}
