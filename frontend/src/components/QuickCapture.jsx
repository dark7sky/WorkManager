import { useEffect, useState } from 'react'
import { CornerDownLeft, LoaderCircle, Search } from 'lucide-react'
import Modal from './Modal'
import { api } from '../api'

const ACTION_LABELS = { create: '새 항목 등록', update: '기존 항목 수정' }
const ENTITY_LABELS = { task: '업무', event: '일정', todo: '오늘 할 일', work_log: '업무 기록' }

export default function QuickCapture({ open, onClose, notify, onApplied }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setText(''); setPreview(null); setBusy(false) } }, [open])

  if (!open) return null

  const data = preview?.data || {}

  const analyze = async e => {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try { setPreview(await api.aiPreview(text)) }
    catch (err) { notify(err.message, 'error') }
    finally { setBusy(false) }
  }

  const apply = async () => {
    setBusy(true)
    try {
      await api.aiApply({ action: preview.action, entity: preview.entity, id: preview.id, data: preview.data })
      notify('빠른 입력으로 추가했습니다.')
      await onApplied?.()
      onClose()
    } catch (err) { notify(err.message, 'error') }
    finally { setBusy(false) }
  }

  return <Modal title="빠른 입력" onClose={onClose}>
    <form className="quick-capture-form" onSubmit={analyze}>
      <div className="quick-capture-input"><Search size={18} aria-hidden="true"/><input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="예: 내일 오후 3시 고객 미팅" disabled={busy} aria-label="빠른 입력"/></div>
      {!preview ? <button className="primary" disabled={!text.trim() || busy}>{busy ? <LoaderCircle className="spin"/> : <CornerDownLeft/>} 분석</button> : null}
    </form>
    {preview ? <div className="quick-capture-preview">
      <small>{ACTION_LABELS[preview.action] || preview.action} · {ENTITY_LABELS[preview.entity] || preview.entity}</small>
      <strong>{data.title || data.content || '제목 없음'}</strong>
      {data.start_at || data.due_date || data.log_date ? <span>{data.start_at || data.due_date || data.log_date}</span> : null}
      <div className="form-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => setPreview(null)}>다시 입력</button>
        <button type="button" className="primary" disabled={busy} onClick={apply}>{busy ? <LoaderCircle className="spin"/> : null} 추가</button>
      </div>
    </div> : <p className="muted quick-capture-hint">자연어로 업무·일정·할 일·기록을 바로 만듭니다. 어디서든 Ctrl/⌘+K로 열 수 있어요.</p>}
  </Modal>
}
