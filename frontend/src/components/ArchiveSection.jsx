import { useEffect, useState } from 'react'
import { Archive, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../api'

export default function ArchiveSection({ notify, onDataChanged }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(0)
  const load = async () => {
    setLoading(true)
    try { setItems(await api.archivedTasks()) }
    catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const unarchive = async item => {
    setBusy(item.id)
    try {
      await api.unarchiveTask(item.id)
      setItems(current => current.filter(value => value.id !== item.id))
      notify('업무를 보관 해제했습니다.')
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy(0) }
  }
  return <section className="settings-card">
    <div className="settings-heading"><span><Archive/></span><div><h2>보관함</h2><p>더 이상 진행 목록에 두지 않을 업무를 보관합니다. 언제든 다시 꺼낼 수 있습니다.</p></div><button className="icon-button" aria-label="보관함 새로고침" onClick={load}><RefreshCw/></button></div>
    {loading ? <div className="trash-loading"><LoaderCircle className="spin"/> 불러오는 중…</div> : items.length ? <div className="trash-list">{items.map(item => <div key={item.id}><span><strong>{item.title}</strong><time>{item.archived_at ? new Date(item.archived_at).toLocaleString('ko-KR') : ''}</time></span><div><button className="secondary" disabled={busy === item.id} onClick={() => unarchive(item)}><RotateCcw/> 보관 해제</button></div></div>)}</div> : <p className="empty-state">보관된 업무가 없습니다.</p>}
  </section>
}
