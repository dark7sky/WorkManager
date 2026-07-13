import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Download, MapPin, Plus, Search, Upload } from 'lucide-react'
import Header from '../components/Header'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import TagsInput, { TagChips, TagFilter } from '../components/TagsInput'
import { moveEventToDay } from '../calendarDrag'
import { eventsToIcs, icsFilename, parseIcs } from '../ics'
import { eventCsvFilename, eventsToCsv } from '../csv'
import { filterEventsByQuery } from '../eventSearch'
import { buildEventDuplicatePayload } from '../eventDuplicate'
import { expandRecurringEvent } from '../eventRecurrence'
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

function EventForm({ event, date, onSave, onDelete, onDuplicate, onCancel }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tags, setTags] = useState(() => event?.tags || [])
  const [suggestions, setSuggestions] = useState([])
  const [startValue, setStartValue] = useState(() => localInput(event?.start_at || event?.start || `${date}T09:00:00`))
  const [endValue, setEndValue] = useState(() => localInput(event?.end_at || event?.end || `${date}T10:00:00`))
  const [repeatRule, setRepeatRule] = useState('')
  const [repeatUntil, setRepeatUntil] = useState('')
  const endTouchedRef = useRef(false)
  const formRef = useRef(null)
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
  const addHour = value => {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    d.setHours(d.getHours() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const onStartChange = e => {
    const value = e.target.value
    setStartValue(value)
    if (!endTouchedRef.current) setEndValue(addHour(value))
  }
  const onEndChange = e => { endTouchedRef.current = true; setEndValue(e.target.value) }
  const submit = async formEvent => {
    formEvent.preventDefault()
    const data = Object.fromEntries(new FormData(formEvent.currentTarget))
    if (new Date(data.end_at) <= new Date(data.start_at)) { setError('종료 시간은 시작 시간보다 늦어야 합니다.'); return }
    if (repeatRule && repeatUntil && new Date(repeatUntil) < new Date(data.start_at)) { setError('반복 종료일은 시작일 이후여야 합니다.'); return }
    setSaving(true)
    setError('')
    const payload = { ...data, title: data.title.trim(), description: data.description.trim(), location: data.location.trim(), start_at: `${data.start_at}:00`, end_at: `${data.end_at}:00`, tags }
    const toSave = !event && repeatRule && repeatUntil ? expandRecurringEvent(payload, repeatRule, repeatUntil) : payload
    const ok = await onSave(toSave)
    if (!ok) setError('저장하지 못했습니다. 입력 내용은 유지됩니다.')
    setSaving(false)
  }
  return <form ref={formRef} className="form-grid" onSubmit={submit}>
    <label className="span-2">일정 제목<input name="title" defaultValue={event?.title || ''} required autoFocus/></label>
    <label>시작<input name="start_at" type="datetime-local" required value={startValue} onChange={onStartChange}/></label>
    <label>종료<input name="end_at" type="datetime-local" required value={endValue} onChange={onEndChange}/></label>
    <label className="span-2">장소<input name="location" defaultValue={event?.location || ''}/></label>
    {!event ? <><label>반복<select value={repeatRule} onChange={e => setRepeatRule(e.target.value)}><option value="">반복 안 함</option><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>{repeatRule ? <label>반복 종료일<input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} required/></label> : null}</> : null}
    <div className="span-2"><TagsInput value={tags} onChange={setTags}/><div className="tag-recommend"><button type="button" className="text-button" disabled={saving} onClick={recommendTags}>AI 태그 추천</button>{suggestions.map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)}</div></div>
    <label className="span-2">메모<textarea name="description" rows="4" defaultValue={event?.description || ''}/></label>
    {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    <div className="form-actions span-2">{event ? <button type="button" className="danger-button" disabled={saving} onClick={onDelete}>휴지통으로 이동</button> : null}{event && onDuplicate ? <button type="button" className="secondary" disabled={saving} onClick={() => onDuplicate(event)}><Copy aria-hidden="true"/>복제</button> : null}<span className="form-spacer"/><button type="button" className="secondary" disabled={saving} onClick={onCancel}>취소</button><button className="primary" disabled={saving}>{saving ? '처리 중…' : event ? '변경사항 저장' : '일정 등록'}</button></div>
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
  const [view, setView] = useState('month')
  const [editing, setEditing] = useState(null)
  const [newDate, setNewDate] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedTags, setSelectedTags] = useState([])
  const [query, setQuery] = useState('')
  const importInputRef = useRef(null)
  const allTags = useMemo(() => [...new Set(events.flatMap(event => event.tags || []))].sort(), [events])
  const filtered = useMemo(() => {
    const byTag = selectedTags.length ? events.filter(event => selectedTags.every(tag => (event.tags || []).includes(tag))) : events
    return filterEventsByQuery(byTag, query)
  }, [events, selectedTags, query])
  const cells = useMemo(() => {
    if (view === 'week') {
      const weekStart = new Date(cursor)
      weekStart.setDate(cursor.getDate() - cursor.getDay())
      return Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return { date, current: true } })
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const grid = new Date(first)
    grid.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(grid); date.setDate(grid.getDate() + index); return { date, current: date.getMonth() === cursor.getMonth() } })
  }, [cursor, view])
  const eventsByDay = useMemo(() => new Map(cells.map(cell => [dateKey(cell.date), filtered.filter(event => overlapsDay(event, cell.date)).sort((a, b) => parseDate(a.start_at || a.start) - parseDate(b.start_at || b.start))])), [cells, filtered])
  const sorted = useMemo(() => [...filtered].sort((a, b) => parseDate(a.start_at || a.start) - parseDate(b.start_at || b.start)), [filtered])
  const close = () => { setEditing(null); setNewDate(null) }
  const exportIcs = () => {
    const ics = eventsToIcs(sorted), blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = icsFilename(dateKey(new Date())); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const exportCsv = () => {
    const csv = eventsToCsv(sorted), blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = eventCsvFilename(dateKey(new Date())); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const importIcs = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const parsed = parseIcs(await file.text())
    if (!parsed.length) { window.alert('가져올 일정이 없습니다.'); return }
    await onCreate(parsed.map(({ title, description, location, start_at, end_at }) => ({ title, description: description || '', location: location || '', start_at, end_at, tags: [] })))
  }
  return <>
    <Header title="일정" subtitle="월간 달력과 모바일 일정 목록을 한눈에 확인하세요." action="새 일정" onAction={() => setNewDate(dateKey(cursor))}/>
    <div className="content">
      <div className="calendar-tools"><div className="month-switch"><button className="secondary" onClick={() => setCursor(new Date())}>오늘</button><button className="icon-button" aria-label={view === 'week' ? '이전 주' : '이전 달'} onClick={() => setCursor(date => view === 'week' ? new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7) : new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft/></button><h2>{view === 'month' ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월` : (() => { const weekStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay()), weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6); return `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 – ${weekEnd.getMonth() + 1}월 ${weekEnd.getDate()}일` })()}</h2><button className="icon-button" aria-label={view === 'week' ? '다음 주' : '다음 달'} onClick={() => setCursor(date => view === 'week' ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7) : new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight/></button></div><div className="view-switch"><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>월</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>주</button></div><button className="secondary" onClick={exportIcs} disabled={!sorted.length}><Download size={17}/>ICS</button><button className="secondary" onClick={exportCsv} disabled={!sorted.length}><Download size={17}/>CSV</button><button className="secondary" onClick={() => importInputRef.current?.click()}><Upload size={17}/>ICS 가져오기</button><input ref={importInputRef} type="file" accept=".ics,text/calendar" hidden onChange={importIcs}/></div>
      <label className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 장소, 메모 검색" aria-label="일정 검색"/></label>
      <TagFilter tags={allTags} selected={selectedTags} onChange={setSelectedTags}/>
      {view === 'month' ? <section className="calendar calendar-desktop"><div className="weekdays">{weekdays.map(day => <div key={day}>{day}</div>)}</div><div className="calendar-grid">{cells.map(cell => <div key={dateKey(cell.date)} role="button" tabIndex="0" aria-label={`${dateKey(cell.date)} 일정 추가`} className={`${cell.current ? '' : 'outside'}${dateKey(cell.date) === dateKey(new Date()) ? ' today-cell' : ''}`} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && setNewDate(dateKey(cell.date))} onClick={() => setNewDate(dateKey(cell.date))} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/wm-event')); const dragged = filtered.find(x => x.id === id); const patch = dragged && moveEventToDay(dragged, dateKey(cell.date)); if (patch) onUpdate(dragged, patch) }}><span>{cell.date.getDate()}</span>{(eventsByDay.get(dateKey(cell.date)) || []).slice(0, 3).map(event => <button className={`cal-event ${event.sync_state === 'conflict' ? 'conflict' : ''}`} key={event.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/wm-event', String(event.id)); e.dataTransfer.effectAllowed = 'move' }} onClick={click => { click.stopPropagation(); setEditing(event) }}><b>{event.title}</b><small>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small><TagChips tags={event.tags}/></button>)}<button className="cell-add" aria-label={`${dateKey(cell.date)} 일정 추가`}><Plus/></button></div>)}</div></section> : <section className="calendar calendar-week"><div className="weekdays">{weekdays.map(day => <div key={day}>{day}</div>)}</div><div className="week-grid">{cells.map(cell => <div key={dateKey(cell.date)} role="button" tabIndex="0" aria-label={`${dateKey(cell.date)} 일정 추가`} className={dateKey(cell.date) === dateKey(new Date()) ? 'today-column' : ''} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && setNewDate(dateKey(cell.date))} onClick={() => setNewDate(dateKey(cell.date))} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/wm-event')); const dragged = filtered.find(x => x.id === id); const patch = dragged && moveEventToDay(dragged, dateKey(cell.date)); if (patch) onUpdate(dragged, patch) }}><header><span>{cell.date.getDate()}</span></header>{(eventsByDay.get(dateKey(cell.date)) || []).map(event => <button className={`cal-event ${event.sync_state === 'conflict' ? 'conflict' : ''}`} key={event.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/wm-event', String(event.id)); e.dataTransfer.effectAllowed = 'move' }} onClick={click => { click.stopPropagation(); setEditing(event) }}><b>{event.title}</b><small>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small><TagChips tags={event.tags}/></button>)}</div>)}</div></section>}
      <section className="mobile-agenda">{sorted.length ? sorted.map(event => <button key={event.id} onClick={() => setEditing(event)}><time>{parseDate(event.start_at || event.start).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}<b>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</b></time><span><strong>{event.title}</strong><small>{event.location ? <><MapPin/> {event.location}</> : '장소 없음'}</small><TagChips tags={event.tags}/>{event.sync_state === 'conflict' ? <em className="conflict-label">동기화 충돌</em> : null}</span><ChevronRight/></button>) : <p className="empty-state">등록된 일정이 없습니다.</p>}</section>
    </div>
    {(editing || newDate) ? <Modal title={editing ? '일정 수정' : '새 일정'} onClose={close}>{editing?.sync_state === 'conflict' ? <ConflictPanel event={editing} notify={notify} onResolved={async () => { await onDataChanged(); close() }}/> : null}<EventForm event={editing} date={newDate || dateKey(cursor)} onCancel={close} onDelete={() => setDeleting(true)} onDuplicate={async e => { const ok = await onCreate(buildEventDuplicatePayload(e)); if (ok) close() }} onSave={async data => { const ok = await (editing ? onUpdate(editing, data) : onCreate(data)); if (ok) close(); return ok }}/></Modal> : null}
    {deleting ? <ConfirmDialog message={`‘${editing?.title}’ 일정을 삭제합니다.`} onClose={() => setDeleting(false)} onConfirm={async () => { const ok = await onDelete(editing); if (ok) { setDeleting(false); close() } }}/> : null}
  </>
}
