import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CornerDownLeft, LoaderCircle, Search } from 'lucide-react'
import Modal from './Modal'
import { api } from '../api'
import { searchItems, searchScreens } from '../commandPalette'
import { nextRowIndex } from '../rowNavigation'

const ACTION_LABELS = { create: '새 항목 등록', update: '기존 항목 수정' }
const ENTITY_LABELS = { task: '업무', event: '일정', todo: '오늘 할 일', work_log: '업무 기록' }
const RESULT_TYPE_LABELS = { task: '업무', event: '일정', todo: '할 일', log: '기록' }

export default function QuickCapture({ open, onClose, notify, onApplied, data, onNavigate }) {
  const [text, setText] = useState('')
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setText(''); setItems(null); setBusy(false) } }, [open])

  const screenMatches = useMemo(() => items ? [] : searchScreens(text), [text, items])
  const itemMatches = useMemo(() => items ? [] : searchItems(text, data), [text, data, items])

  if (!open) return null

  const go = page => { onNavigate?.(page); onClose() }

  const onResultKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...e.currentTarget.closest('.palette-results').querySelectorAll('.palette-result-btn')]
    const idx = rows.indexOf(e.currentTarget)
    const nextIdx = nextRowIndex(rows.length, idx, e.key)
    if (nextIdx == null || nextIdx === idx) return
    e.preventDefault()
    rows[nextIdx]?.focus()
  }

  const analyze = async e => {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try { const result = await api.aiPreview(text); setItems(result.items || []) }
    catch (err) { notify(err.message, 'error') }
    finally { setBusy(false) }
  }

  const applyItem = async index => {
    setBusy(true)
    try {
      const item = items[index]
      await api.aiApply({ action: item.action, entity: item.entity, id: item.id, data: item.data, reason: item.reason })
      const remaining = items.filter((_, i) => i !== index)
      setItems(remaining)
      await onApplied?.()
      notify('빠른 입력으로 추가했습니다.')
      if (!remaining.length) onClose()
    } catch (err) { notify(err.message, 'error') }
    finally { setBusy(false) }
  }

  return <Modal title="빠른 입력" onClose={onClose}>
    <form className="quick-capture-form" onSubmit={analyze}>
      <div className="quick-capture-input"><Search size={18} aria-hidden="true"/><input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="예: 내일 오후 3시 고객 미팅 (여러 건은 줄바꿈으로 구분)" disabled={busy} aria-label="빠른 입력"/></div>
      {!items ? <button className="primary" disabled={!text.trim() || busy}>{busy ? <LoaderCircle className="spin"/> : <CornerDownLeft/>} 분석</button> : null}
    </form>
    {items && items.length ? <>
      {items.length > 1 ? <small className="quick-capture-count">{items.length}건 분석됨 · 하나씩 확인 후 추가하세요.</small> : null}
      {items[0]?.warning ? <div className="ai-warning"><AlertTriangle/><span>{items[0].warning}</span></div> : null}
      {items.map((item, index) => {
        const data = item?.data || {}
        return <div className="quick-capture-preview" key={`${item.action}-${item.entity}-${index}`}>
          <small>{ACTION_LABELS[item.action] || item.action} · {ENTITY_LABELS[item.entity] || item.entity}</small>
          <strong>{data.title || data.content || '제목 없음'}</strong>
          {data.start_at || data.due_date || data.log_date ? <span>{data.start_at || data.due_date || data.log_date}</span> : null}
          <div className="form-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => applyItem(index)}>{busy ? <LoaderCircle className="spin"/> : null} 추가</button>
          </div>
        </div>
      })}
      <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setItems(null)}>다시 입력</button></div>
    </> : null}
    {!items && (screenMatches.length || itemMatches.length) ? <div className="palette-results">
      {screenMatches.length ? <div className="palette-group"><small>화면 이동</small>
        {screenMatches.map(screen => <button type="button" className="palette-result-btn" key={screen.id} onClick={() => go(screen.id)} onKeyDown={onResultKeyDown}><ArrowRight size={14} aria-hidden="true"/><span>{screen.label}</span></button>)}
      </div> : null}
      {itemMatches.length ? <div className="palette-group"><small>검색 결과</small>
        {itemMatches.map(result => <button type="button" className="palette-result-btn" key={`${result.type}-${result.id}`} onClick={() => go(result.page)} onKeyDown={onResultKeyDown}><em>{RESULT_TYPE_LABELS[result.type]}</em><span>{result.title}</span>{result.detail ? <small>{result.detail}</small> : null}</button>)}
      </div> : null}
    </div> : null}
    {!items ? <p className="muted quick-capture-hint">입력하면 기존 항목·화면을 바로 찾고, 분석을 누르면 자연어로 업무·일정·할 일·기록을 만듭니다. 어디서든 Ctrl/⌘+K.</p> : null}
  </Modal>
}
