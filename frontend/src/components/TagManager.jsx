import { useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, Pencil, Tags, Trash2 } from 'lucide-react'
import { api } from '../api'
import { pickTagTarget } from '../tagTarget'

const tagTargetLabel = item => pickTagTarget(item.tables).label

export default function TagManager({ notify, onDataChanged, onTagClick }) {
  const [items, setItems] = useState(null)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setItems((await api.tags()).items || []) }
    catch (e) { notify(e.message, 'error'); setItems([]) }
  }
  useEffect(() => { load() }, [])

  const rename = async (from, to) => {
    setBusy(true)
    try {
      const result = await api.renameTag(from, to)
      notify(to ? `'${from}' 태그를 '${to}'로 바꿨습니다 · ${result.changed}건` : `'${from}' 태그를 제거했습니다 · ${result.changed}건`)
      setEditing(null)
      await Promise.all([load(), onDataChanged?.()])
    } catch (e) { notify(e.message, 'error') }
    finally { setBusy(false) }
  }

  return <section className="settings-card">
    <div className="settings-heading"><span><Tags /></span><div><h2>태그 관리</h2><p>업무·일정·할 일·기록 전체에서 태그 이름을 한 번에 바꾸거나 정리합니다.</p></div></div>
    {!items ? <div className="skeleton lines" /> : !items.length ? <p className="empty-state">사용 중인 태그가 없습니다.</p> : <div className="tag-manager">
      {items.map(item => editing === item.tag
        ? <form key={item.tag} className="tag-manager-edit" onSubmit={e => { e.preventDefault(); if (draft.trim() !== item.tag) rename(item.tag, draft.trim()) }}>
            <input autoFocus value={draft} maxLength={50} onChange={e => setDraft(e.target.value)} aria-label={`'${item.tag}' 새 이름`} />
            <button className="primary" disabled={busy || draft.trim() === item.tag}>{busy ? <LoaderCircle className="spin" size={15} /> : null} 변경</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => { if (confirm(`'${item.tag}' 태그를 모든 항목에서 제거할까요? (${item.total}건)`)) rename(item.tag, '') }}><Trash2 size={15} /> 제거</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => setEditing(null)}>취소</button>
          </form>
        : <span key={item.tag} className="tag-manager-chip">
            <button type="button" title={`업무 ${item.tables.tasks} · 일정 ${item.tables.events} · 할 일 ${item.tables.todos} · 기록 ${item.tables.work_logs}`} onClick={() => { setEditing(item.tag); setDraft(item.tag) }}>#{item.tag}<b>{item.total}</b><Pencil size={12} aria-hidden="true" /></button>
            {onTagClick ? <button type="button" title={`이 태그로 ${tagTargetLabel(item)} 화면 이동`} onClick={() => onTagClick(item)}><ExternalLink size={12} aria-hidden="true" /></button> : null}
          </span>)}
    </div>}
  </section>
}
