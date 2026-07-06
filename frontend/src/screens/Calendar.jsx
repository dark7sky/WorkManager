import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, Plus } from 'lucide-react'
import Header from '../components/Header'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import TagsInput, { TagChips, TagFilter } from '../components/TagsInput'
import { api } from '../api'

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const pad = number => String(number).padStart(2, '0')
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parseDate = value => !value ? null : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
const localInput = value => { const date = parseDate(value); return date ? `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}` : '' }

function overlapsDay(event, day) {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  const start = parseDate(event.start_at || event.start)
  if (!start || Number.isNaN(start.getTime())) return false
  const end = parseDate(event.end_at || event.end) || new Date(start.getTime() + 1)
  return start < nextDay && end > dayStart
}

function EventForm({ event, date, onSave, onDelete, onCancel }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tags, setTags] = useState(() => event?.tags || [])
  const [suggestions, setSuggestions] = useState([])
  const formRef = useRef(null)
  const start = event?.start_at || event?.start || `${date}T09:00:00`
  const end = event?.end_at || event?.end || `${date}T10:00:00`
  const recommendTags = async () => {
    const data = new FormData(formRef.current)
    setSaving(true)
    setError('')
    try {
      const result = await api.aiTagSuggestions({ entity: 'event', title: data.get('title'), content: data.get('description') })
      setSuggestions(result.tags || result.items || [])
    } catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }
  const submit = async formEvent => {
    formEvent.preventDefault()
    const data = Object.fromEntries(new FormData(formEvent.currentTarget))
    if (new Date(data.end_at) <= new Date(data.start_at)) { setError('종료 시간은 시작 시간보다 늦어야 합니다.'); return }
    setSaving(true)
    setError('')
    const ok = await onSave({ ...data, title: data.title.trim(), description: data.description.trim(), location: data.location.trim(), start_at: `${data.start_at}:00`, end_at: `${data.end_at}:00`, tags })
    if (!ok) setError('저장하지 못했습니다. 입력 내용은 유지됩니다.')
    setSaving(false)
  }
  return <form ref={formRef} className="form-grid" onSubmit={submit}>
    <label className="span-2">일정 제목<input name="title" defaultValue={event?.title || ''} required autoFocus/></label>
    <label>시작<input name="start_at" type="datetime-local" required defaultValue={localInput(start)}/></label>
    <label>종료<input name="end_at" type="datetime-local" required defaultValue={localInput(end)}/></label>
    <label className="span-2">장소<input name="location" defaultValue={event?.location || ''}/></label>
    <div className="span-2"><TagsInput value={tags} onChange={setTags}/><div className="tag-recommend"><button type="button" className="text-button" disabled={saving} onClick={recommendTags}>AI 태그 추천</button>{suggestions.map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)}</div></div>
    <label className="span-2">메모<textarea name="description" rows="4" defaultValue={event?.description || ''}/></label>
    {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    <div className="form-actions span-2">{event ? <button type="button" className="danger-button" disabled={saving} onClick={onDelete}>휴지통으로 이동</button> : null}<span className="form-spacer"/><button type="button" className="secondary" disabled={saving} onClick={onCancel}>취소</button><button className="primary" disabled={saving}>{saving ? '처리 중…' : event ? '변경사항 저장' : '일정 등록'}</button></div>
  </form>
}

function ConflictPanel({ event, onResolved, notify }) {
  const [busy, setBusy] = useState('')
  let remote = event.conflict_remote_json || {}
  if (typeof remote === 'string') { try { remote = JSON.parse(remote) } catch { remote = {} } }
  const resolve = async strategy => {
    setBusy(strategy)
    try { await api.resolveEventConflict(event.id, strategy); notify(`일정 충돌을 ${strategy === 'local' ? 'WorkManager' : 'Google 캘린더'} 버전으로 해결했습니다.`); await onResolved() }
    catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }
  return <div className="conflict-panel"><AlertTriangle/><div><strong>Google 캘린더와 변경 사항이 충돌했습니다.</strong><p>WorkManager: {event.title}<br/>Google: {remote.title || remote.summary || '제목 없음'}</p><span><button className="secondary" disabled={!!busy} onClick={() => resolve('remote')}>Google 버전 사용</button><button className="primary" disabled={!!busy} onClick={() => resolve('local')}>WorkManager 버전 사용</button></span></div></div>
}

export default function Calendar({ events, onCreate, onUpdate, onDelete, onDataChanged, notify }) {
  const [cursor, setCursor] = useState(() => new Date())
  const [editing, setEditing] = useState(null)
  const [newDate, setNewDate] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedTags, setSelectedTags] = useState([])
  const allTags = useMemo(() => [...new Set(events.flatMap(event => event.tags || []))].sort(), [events])
  const filtered = useMemo(() => selectedTags.length ? events.filter(event => selectedTags.every(tag => (event.tags || []).includes(tag))) : events, [events, selectedTags])
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const grid = new Date(first)
    grid.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(grid); date.setDate(grid.getDate() + index); return { date, current: date.getMonth() === cursor.getMonth() } })
  }, [cursor])
  const eventsByDay = useMemo(() => new Map(cells.map(cell => [dateKey(cell.date), filtered.filter(event => overlapsDay(event, cell.date))])), [cells, filtered])
  const sorted = useMemo(() => [...filtered].sort((a, b) => parseDate(a.start_at || a.start) - parseDate(b.start_at || b.start)), [filtered])
  const close = () => { setEditing(null); setNewDate(null) }
  return <>
    <Header title="일정" subtitle="월간 달력과 모바일 일정 목록을 한눈에 확인하세요." action="새 일정" onAction={() => setNewDate(dateKey(cursor))}/>
    <div className="content">
      <div className="calendar-tools"><div className="month-switch"><button className="secondary" onClick={() => setCursor(new Date())}>오늘</button><button className="icon-button" aria-label="이전 달" onClick={() => setCursor(date => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft/></button><h2>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</h2><button className="icon-button" aria-label="다음 달" onClick={() => setCursor(date => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight/></button></div></div>
      <TagFilter tags={allTags} selected={selectedTags} onChange={setSelectedTags}/>
      <section className="calendar calendar-desktop"><div className="weekdays">{weekdays.map(day => <div key={day}>{day}</div>)}</div><div className="calendar-grid">{cells.map(cell => <div key={dateKey(cell.date)} role="button" tabIndex="0" aria-label={`${dateKey(cell.date)} 일정 추가`} className={cell.current ? '' : 'outside'} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && setNewDate(dateKey(cell.date))} onClick={() => setNewDate(dateKey(cell.date))}><span>{cell.date.getDate()}</span>{(eventsByDay.get(dateKey(cell.date)) || []).slice(0, 3).map(event => <button className={`cal-event ${event.sync_state === 'conflict' ? 'conflict' : ''}`} key={event.id} onClick={click => { click.stopPropagation(); setEditing(event) }}><b>{event.title}</b><small>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small><TagChips tags={event.tags}/></button>)}<button className="cell-add" aria-label={`${dateKey(cell.date)} 일정 추가`}><Plus/></button></div>)}</div></section>
      <section className="mobile-agenda">{sorted.length ? sorted.map(event => <button key={event.id} onClick={() => setEditing(event)}><time>{parseDate(event.start_at || event.start).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}<b>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</b></time><span><strong>{event.title}</strong><small>{event.location ? <><MapPin/> {event.location}</> : '장소 없음'}</small><TagChips tags={event.tags}/>{event.sync_state === 'conflict' ? <em className="conflict-label">동기화 충돌</em> : null}</span><ChevronRight/></button>) : <p className="empty-state">등록된 일정이 없습니다.</p>}</section>
    </div>
    {(editing || newDate) ? <Modal title={editing ? '일정 수정' : '새 일정'} onClose={close}>{editing?.sync_state === 'conflict' ? <ConflictPanel event={editing} notify={notify} onResolved={async () => { await onDataChanged(); close() }}/> : null}<EventForm event={editing} date={newDate || dateKey(cursor)} onCancel={close} onDelete={() => setDeleting(true)} onSave={async data => { const ok = await (editing ? onUpdate(editing, data) : onCreate(data)); if (ok) close(); return ok }}/></Modal> : null}
    {deleting ? <ConfirmDialog message={`‘${editing?.title}’ 일정을 삭제합니다.`} onClose={() => setDeleting(false)} onConfirm={async () => { const ok = await onDelete(editing); if (ok) { setDeleting(false); close() } }}/> : null}
  </>
}
