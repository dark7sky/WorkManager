import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckSquare, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Flag, History, MapPin, Paperclip, Plus, Search, Star, Tag, Upload } from 'lucide-react'
import Header from '../components/Header'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import TagsInput, { TagChips, TagFilter } from '../components/TagsInput'
import { moveEventToDay, postponeEventDates } from '../calendarDrag'
import { eventsToIcs, icsFilename, parseIcs } from '../ics'
import { eventCsvFilename, eventsToCsv, parseEventsCsv } from '../csv'
import { eventReportFilename, eventsToPrintableReport } from '../eventReport'
import { filterEventsByPriority, filterEventsByQuery } from '../eventSearch'
import { addEventFilterPreset, buildEventFilterPreset, loadEventFilterPresets, removeEventFilterPreset, saveEventFilterPresets } from '../eventFilterPresets'
import { buildEventDuplicatePayload } from '../eventDuplicate'
import { addEventTemplate, applyEventTemplate, buildEventTemplate, loadEventTemplates, removeEventTemplate, saveEventTemplates } from '../eventTemplates'
import { loadEventSort, loadPinnedEventIds, orderEventsByPin, savePinnedEventIds, saveEventSort, togglePinnedEvent } from '../eventPins'
import { expandRecurringEvent } from '../eventRecurrence'
import { tasksDueByDay } from '../calendarTaskDue'
import { monthGridCells, yearMonths } from '../calendarYear'
import { holidayNameForDate } from '../holidays'
import { EVENT_COLORS, eventColorHex } from '../eventColors'
import { moveChecklistItem } from '../taskFormPayload'
import { normalizedLinks } from '../taskFormPayload'
import { allIdsSelected, toggleSelectAllIds } from '../taskFilters'
import { findOverlappingEvents } from '../eventOverlap'
import { validateEventForm } from '../formValidation'
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

function EventForm({ event, date, allEvents = [], onSave, onDelete, onDuplicate, onViewHistory, onCancel }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [tags, setTags] = useState(() => event?.tags || [])
  const [suggestions, setSuggestions] = useState([])
  const [startValue, setStartValue] = useState(() => localInput(event?.start_at || event?.start || `${date}T09:00:00`))
  const [endValue, setEndValue] = useState(() => localInput(event?.end_at || event?.end || `${date}T10:00:00`))
  const [repeatRule, setRepeatRule] = useState('')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [applyToSeries, setApplyToSeries] = useState(false)
  const [links, setLinks] = useState(() => event?.links || [])
  const [linkUrlText, setLinkUrlText] = useState('')
  const [linkLabelText, setLinkLabelText] = useState('')
  const [checklist, setChecklist] = useState(() => event?.checklist || [])
  const [checklistText, setChecklistText] = useState('')
  const [editingChecklistId, setEditingChecklistId] = useState(null)
  const [editingChecklistText, setEditingChecklistText] = useState('')
  const [templates, setTemplates] = useState(() => loadEventTemplates())
  const [prefill, setPrefill] = useState(null)
  const [prefillKey, setPrefillKey] = useState(0)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [attachmentError, setAttachmentError] = useState('')
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const attachmentInputRef = useRef(null)
  const endTouchedRef = useRef(false)
  const formRef = useRef(null)
  const applyTemplate = id => {
    const template = templates.find(t => t.id === id)
    if (!template) return
    const filled = applyEventTemplate(template)
    setPrefill(filled)
    setPrefillKey(k => k + 1)
    setTags(filled.tags)
  }
  const saveAsTemplate = () => {
    const data = new FormData(formRef.current)
    const name = window.prompt('템플릿 이름을 입력하세요.', data.get('title') || '')
    if (!name) return
    const template = buildEventTemplate({ name, title: data.get('title'), location: data.get('location'), color: data.get('color'), tags })
    const next = addEventTemplate(templates, template)
    setTemplates(next)
    saveEventTemplates(next)
  }
  const deleteTemplate = id => {
    const next = removeEventTemplate(templates, id)
    setTemplates(next)
    saveEventTemplates(next)
  }
  const addLink = () => {
    const url = linkUrlText.trim()
    if (!/^https?:\/\//.test(url)) return
    setLinks([...links, { id: `${Date.now()}`, url, label: linkLabelText.trim() }])
    setLinkUrlText('')
    setLinkLabelText('')
  }
  const removeLink = id => setLinks(links.filter(item => item.id !== id))
  const addChecklistItem = () => {
    const text = checklistText.trim()
    if (!text) return
    setChecklist([...checklist, { id: `${Date.now()}`, text, done: false }])
    setChecklistText('')
  }
  const toggleChecklistItem = id => setChecklist(checklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const removeChecklistItem = id => setChecklist(checklist.filter(item => item.id !== id))
  const shiftChecklistItem = (id, direction) => setChecklist(list => moveChecklistItem(list, id, direction))
  const beginEditChecklistItem = item => { setEditingChecklistId(item.id); setEditingChecklistText(item.text) }
  const saveEditChecklistItem = id => {
    const text = editingChecklistText.trim()
    if (text) setChecklist(checklist.map(item => item.id === id ? { ...item, text } : item))
    setEditingChecklistId(null)
  }
  useEffect(() => {
    setComments([])
    setCommentText('')
    setCommentError('')
    if (!event?.id) return
    let cancelled = false
    api.eventComments(event.id).then(res => { if (!cancelled) setComments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [event?.id])
  const addComment = async () => {
    const body = commentText.trim()
    if (!body) return
    setCommentError('')
    try {
      const comment = await api.addEventComment(event.id, body)
      setComments([...comments, comment])
      setCommentText('')
    } catch (e) {
      setCommentError(e.message)
    }
  }
  const removeComment = async id => {
    try {
      await api.deleteEventComment(event.id, id)
      setComments(comments.filter(c => c.id !== id))
    } catch (e) {
      setCommentError(e.message)
    }
  }
  useEffect(() => {
    setAttachments([])
    setAttachmentError('')
    if (!event?.id) return
    let cancelled = false
    api.eventAttachments(event.id).then(res => { if (!cancelled) setAttachments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [event?.id])
  const uploadAttachment = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAttachmentError('')
    setUploadingAttachment(true)
    try {
      const item = await api.uploadEventAttachment(event.id, file)
      setAttachments([...attachments, item])
    } catch (err) {
      setAttachmentError(err.message)
    } finally {
      setUploadingAttachment(false)
    }
  }
  const removeAttachment = async id => {
    try {
      await api.deleteEventAttachment(event.id, id)
      setAttachments(attachments.filter(a => a.id !== id))
    } catch (err) {
      setAttachmentError(err.message)
    }
  }
  const formatAttachmentSize = bytes => bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  const beginEditComment = item => { setEditingCommentId(item.id); setEditingCommentText(item.body) }
  const saveEditComment = async id => {
    const body = editingCommentText.trim()
    setEditingCommentId(null)
    const original = comments.find(c => c.id === id)
    if (!body || !original || body === original.body) return
    try {
      const updated = await api.updateEventComment(event.id, id, body)
      setComments(comments.map(c => c.id === id ? updated : c))
    } catch (e) {
      setCommentError(e.message)
    }
  }
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
  const overlapping = useMemo(() => findOverlappingEvents(startValue, endValue, allEvents, event?.id ?? null), [startValue, endValue, allEvents, event])
  const submit = async formEvent => {
    formEvent.preventDefault()
    const data = Object.fromEntries(new FormData(formEvent.currentTarget))
    const errors = validateEventForm(data)
    if (Object.keys(errors).length) { setFieldErrors(errors); setError(Object.values(errors)[0]); return }
    if (repeatRule && repeatUntil && new Date(repeatUntil) < new Date(data.start_at)) { setError('반복 종료일은 시작일 이후여야 합니다.'); return }
    setFieldErrors({})
    setSaving(true)
    setError('')
    const linkUrl = data.link_url.trim()
    const payload = { ...data, title: data.title.trim(), description: data.description.trim(), location: data.location.trim(), start_at: `${data.start_at}:00`, end_at: `${data.end_at}:00`, tags, link_url: linkUrl && /^https?:\/\//.test(linkUrl) ? linkUrl : null, color: data.color || null, priority: data.priority || null, links: normalizedLinks(links), checklist }
    const toSave = !event && repeatRule && repeatUntil ? expandRecurringEvent(payload, repeatRule, repeatUntil) : payload
    const ok = await onSave(toSave, applyToSeries)
    if (!ok) setError('저장하지 못했습니다. 입력 내용은 유지됩니다.')
    setSaving(false)
  }
  return <form ref={formRef} className="form-grid" onSubmit={submit}>
    {!event ? <div className="span-2 task-template-bar">
      <label>일정 템플릿<select onChange={e => { applyTemplate(e.target.value); e.target.value = '' }} defaultValue=""><option value="" disabled>템플릿 선택</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {templates.length ? <button type="button" className="text-button" onClick={() => { const id = window.prompt('삭제할 템플릿 이름을 입력하세요.'); const match = templates.find(t => t.name === id); if (match) deleteTemplate(match.id) }}>템플릿 삭제</button> : null}
    </div> : null}
    <label className="span-2" key={`title-${prefillKey}`}>일정 제목<input name="title" defaultValue={prefill?.title ?? event?.title ?? ''} required autoFocus className={fieldErrors.title ? 'invalid' : ''} aria-invalid={fieldErrors.title ? 'true' : 'false'}/>{fieldErrors.title ? <small className="field-error" role="alert">{fieldErrors.title}</small> : null}</label>
    <label>시작<input name="start_at" type="datetime-local" required value={startValue} onChange={onStartChange}/></label>
    <label>종료<input name="end_at" type="datetime-local" required value={endValue} onChange={onEndChange} className={fieldErrors.end_at ? 'invalid' : ''} aria-invalid={fieldErrors.end_at ? 'true' : 'false'}/>{fieldErrors.end_at ? <small className="field-error" role="alert">{fieldErrors.end_at}</small> : null}</label>
    <label className="span-2" key={`location-${prefillKey}`}>장소<input name="location" defaultValue={prefill?.location ?? event?.location ?? ''}/></label>
    <label className="span-2">관련 링크<input name="link_url" type="url" placeholder="https://..." defaultValue={event?.link_url ?? ''}/></label>
    <label key={`color-${prefillKey}`}>색상<select name="color" defaultValue={prefill?.color ?? event?.color ?? ''}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
    <label key={`priority-${prefillKey}`}>우선순위<select name="priority" defaultValue={prefill?.priority ?? event?.priority ?? ''}><option value="">보통</option><option value="low">낮음</option><option value="high">중요</option></select></label>
    {!event ? <><label>반복<select value={repeatRule} onChange={e => setRepeatRule(e.target.value)}><option value="">반복 안 함</option><option value="daily">매일</option><option value="weekly">매주</option><option value="biweekly">격주</option><option value="monthly">매월</option></select></label>{repeatRule ? <label>반복 종료일<input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)} required/></label> : null}</> : null}
    {event?.recurrence_group_id ? <label className="span-2"><input type="checkbox" checked={applyToSeries} onChange={e => setApplyToSeries(e.target.checked)}/> <span>이 일정과 이후 반복 일정에 모두 적용 (제목·장소·태그·색상 등)</span></label> : null}
    <div className="span-2 checklist-editor"><span className="dependency-picker-label">체크리스트{checklist.length ? ` (${checklist.filter(i => i.done).length}/${checklist.length})` : ''}</span>
      {checklist.map((item, index) => <div key={item.id} className="checklist-editor-item">
        <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)}/>
        {editingChecklistId === item.id
          ? <input type="text" className="inline-edit" autoFocus value={editingChecklistText} onChange={e => setEditingChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditChecklistItem(item.id) } if (e.key === 'Escape') setEditingChecklistId(null) }} onBlur={() => saveEditChecklistItem(item.id)}/>
          : <span className={item.done ? 'checklist-done-text' : ''} onClick={() => beginEditChecklistItem(item)}>{item.text}</span>}
        <button type="button" className="text-button" disabled={index === 0} onClick={() => shiftChecklistItem(item.id, 'up')} aria-label="위로 이동">▲</button>
        <button type="button" className="text-button" disabled={index === checklist.length - 1} onClick={() => shiftChecklistItem(item.id, 'down')} aria-label="아래로 이동">▼</button>
        <button type="button" className="text-button" onClick={() => removeChecklistItem(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="text" value={checklistText} placeholder="세부 항목 추가" onChange={e => setChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}/><button type="button" className="text-button" onClick={addChecklistItem}>추가</button></div>
    </div>
    <div className="span-2 checklist-editor"><span className="dependency-picker-label">첨부 링크{links.length ? ` (${links.length})` : ''}</span>
      {links.map(item => <div key={item.id} className="checklist-editor-item">
        <a href={item.url} target="_blank" rel="noopener noreferrer">{item.label || item.url}</a>
        <button type="button" className="text-button" onClick={() => removeLink(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="url" value={linkUrlText} placeholder="https://..." onChange={e => setLinkUrlText(e.target.value)}/><input type="text" value={linkLabelText} placeholder="이름 (선택)" onChange={e => setLinkLabelText(e.target.value)}/><button type="button" className="text-button" onClick={addLink}>추가</button></div>
    </div>
    {event?.id ? <div className="span-2 checklist-editor"><span className="dependency-picker-label">댓글{comments.length ? ` (${comments.length})` : ''}</span>
      {comments.map(item => <div key={item.id} className="checklist-editor-item">
        {editingCommentId === item.id
          ? <input type="text" className="inline-edit" autoFocus value={editingCommentText} onChange={e => setEditingCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditComment(item.id) } if (e.key === 'Escape') setEditingCommentId(null) }} onBlur={() => saveEditComment(item.id)}/>
          : <span onClick={() => beginEditComment(item)}>{item.body}<span className="muted"> · {new Date(item.created_at).toLocaleString('ko-KR')}{item.edited_at ? ' (수정됨)' : ''}</span></span>}
        <button type="button" className="text-button" onClick={() => removeComment(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="text" value={commentText} placeholder="댓글을 입력하세요" onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }}/><button type="button" className="text-button" onClick={addComment}>등록</button></div>
      {commentError ? <p className="form-error" role="alert">{commentError}</p> : null}
    </div> : null}
    {event?.id ? <div className="span-2 checklist-editor"><span className="dependency-picker-label">첨부파일{attachments.length ? ` (${attachments.length})` : ''}</span>
      {attachments.map(item => <div key={item.id} className="checklist-editor-item">
        <a href={api.eventAttachmentDownloadUrl(event.id, item.id)} target="_blank" rel="noopener noreferrer">{item.filename}</a>
        <span className="muted"> {formatAttachmentSize(item.size_bytes)}</span>
        <button type="button" className="text-button" onClick={() => removeAttachment(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input ref={attachmentInputRef} type="file" disabled={uploadingAttachment} onChange={uploadAttachment}/>{uploadingAttachment ? <span className="muted">업로드 중…</span> : null}</div>
      {attachmentError ? <p className="form-error" role="alert">{attachmentError}</p> : null}
    </div> : null}
    <div className="span-2"><TagsInput value={tags} onChange={setTags}/><div className="tag-recommend"><button type="button" className="text-button" disabled={saving} onClick={recommendTags}>AI 태그 추천</button>{suggestions.map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)}</div></div>
    <label className="span-2">메모<textarea name="description" rows="4" defaultValue={event?.description || ''}/></label>
    {overlapping.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 시간대에 이미 일정이 있습니다: {overlapping.map(e => e.title).join(', ')}</p> : null}
    {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    <div className="form-actions span-2">{event ? <button type="button" className="danger-button" disabled={saving} onClick={onDelete}>휴지통으로 이동</button> : null}{event && onDuplicate ? <button type="button" className="secondary" disabled={saving} onClick={() => onDuplicate(event)}><Copy aria-hidden="true"/>복제</button> : null}{event && onViewHistory ? <button type="button" className="secondary" disabled={saving} onClick={() => onViewHistory(event)}><History aria-hidden="true"/>이력</button> : null}<button type="button" className="text-button" disabled={saving} onClick={saveAsTemplate}>템플릿으로 저장</button><span className="form-spacer"/><button type="button" className="secondary" disabled={saving} onClick={onCancel}>취소</button><button className="primary" disabled={saving}>{saving ? '처리 중…' : event ? '변경사항 저장' : '일정 등록'}</button></div>
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

export default function Calendar({ events, tasks = [], onOpenTask, onCreate, onUpdate, onDelete, onBulkDelete, onBulkAddTag, onBulkPostpone, onBulkPriority, onDataChanged, onViewHistory, notify }) {
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState('month')
  const [editing, setEditing] = useState(null)
  const [newDate, setNewDate] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteSeries, setDeleteSeries] = useState(false)
  const [selectedTags, setSelectedTags] = useState([])
  const [query, setQuery] = useState('')
  const [priority, setPriority] = useState('all')
  const [eventFilterPresets, setEventFilterPresets] = useState(() => loadEventFilterPresets())
  const applyEventFilterPreset = id => { const preset = eventFilterPresets.find(p => p.id === id); if (!preset) return; setQuery(preset.query); setSelectedTags(preset.selectedTags); setPriority(preset.priority) }
  const saveEventFilterPreset = () => { const name = window.prompt('필터 이름을 입력하세요.'); if (!name) return; const preset = buildEventFilterPreset({ name, query, selectedTags, priority }); const next = addEventFilterPreset(eventFilterPresets, preset); setEventFilterPresets(next); saveEventFilterPresets(next) }
  const deleteEventFilterPreset = () => { const name = window.prompt('삭제할 필터 이름을 입력하세요.'); const match = eventFilterPresets.find(p => p.name === name); if (!match) return; const next = removeEventFilterPreset(eventFilterPresets, match.id); setEventFilterPresets(next); saveEventFilterPresets(next) }
  const [selectedEventIds, setSelectedEventIds] = useState(() => new Set())
  const toggleEventSelected = id => setSelectedEventIds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const clearSelectedEvents = () => setSelectedEventIds(new Set())
  const bulkDeleteEvents = () => { onBulkDelete([...selectedEventIds]); clearSelectedEvents() }
  const [bulkEventTag, setBulkEventTag] = useState('')
  const bulkAddTagEvents = async () => { const tag = bulkEventTag.trim(); if (!tag) return; if (await onBulkAddTag([...selectedEventIds], tag)) setBulkEventTag('') }
  const [bulkPostponeDays, setBulkPostponeDays] = useState(1)
  const bulkPostponeEvents = async () => { const days = Number(bulkPostponeDays); if (!days) return; if (await onBulkPostpone([...selectedEventIds], days)) clearSelectedEvents() }
  const [bulkPriority, setBulkPriority] = useState('normal')
  const bulkChangePriorityEvents = async () => { if (await onBulkPriority([...selectedEventIds], bulkPriority)) clearSelectedEvents() }
  const [pinnedIds, setPinnedIds] = useState(() => loadPinnedEventIds())
  const togglePin = event => setPinnedIds(ids => { const next = togglePinnedEvent(ids, event.id); savePinnedEventIds(next); return next })
  const [eventSort, setEventSortState] = useState(() => loadEventSort())
  const setEventSort = value => { setEventSortState(value); saveEventSort(value) }
  const importInputRef = useRef(null)
  const csvImportInputRef = useRef(null)
  const allTags = useMemo(() => [...new Set(events.flatMap(event => event.tags || []))].sort(), [events])
  const filtered = useMemo(() => {
    const byTag = selectedTags.length ? events.filter(event => selectedTags.every(tag => (event.tags || []).includes(tag))) : events
    return filterEventsByPriority(filterEventsByQuery(byTag, query), priority)
  }, [events, selectedTags, query, priority])
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
  const tasksByDay = useMemo(() => tasksDueByDay(tasks), [tasks])
  const yearMonthsList = useMemo(() => yearMonths(cursor.getFullYear()), [cursor])
  const yearEventCounts = useMemo(() => {
    const map = new Map()
    if (view !== 'year') return map
    for (const event of filtered) {
      const start = parseDate(event.start_at || event.start)
      if (!start || Number.isNaN(start.getTime()) || start.getFullYear() !== cursor.getFullYear()) continue
      const key = dateKey(start)
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [filtered, cursor, view])
  const yearTaskCounts = useMemo(() => {
    const map = new Map()
    if (view !== 'year') return map
    for (const [key, list] of tasksByDay) { if (Number(key.slice(0, 4)) === cursor.getFullYear()) map.set(key, list.length) }
    return map
  }, [tasksByDay, cursor, view])
  const sorted = useMemo(() => { const byId = new Map(); for (const list of eventsByDay.values()) for (const event of list) byId.set(event.id, event); return [...byId.values()].sort((a, b) => parseDate(a.start_at || a.start) - parseDate(b.start_at || b.start)) }, [eventsByDay])
  const agendaEvents = useMemo(() => orderEventsByPin(sorted, pinnedIds, eventSort), [sorted, pinnedIds, eventSort])
  const allShownEventIds = useMemo(() => agendaEvents.map(event => event.id), [agendaEvents])
  const allShownEventsSelected = allIdsSelected(allShownEventIds, selectedEventIds)
  const toggleSelectAllEvents = () => setSelectedEventIds(toggleSelectAllIds(allShownEventIds, selectedEventIds))
  const close = () => { setEditing(null); setNewDate(null) }
  const exportIcs = () => {
    const ics = eventsToIcs(sorted), blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = icsFilename(dateKey(new Date())); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const exportCsv = () => {
    const csv = eventsToCsv(sorted), blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = eventCsvFilename(dateKey(new Date())); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const printReport = () => {
    const html = eventsToPrintableReport(sorted, { generatedAt: new Date().toISOString(), title: 'WorkManager 일정 보고서' }), win = window.open('', '_blank')
    if (!win) return
    win.document.open(); win.document.write(html); win.document.close(); win.document.title = eventReportFilename(dateKey(new Date())); win.focus(); win.print()
  }
  const importIcs = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const parsed = parseIcs(await file.text())
    if (!parsed.length) { notify?.('가져올 일정이 없습니다.', 'error'); return }
    await onCreate(parsed.map(({ title, description, location, start_at, end_at }) => ({ title, description: description || '', location: location || '', start_at, end_at, tags: [] })))
  }
  const importCsv = async e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const text = await file.text(), { events: parsed, errors } = parseEventsCsv(text)
    if (!parsed.length) { notify?.(errors.length ? errors.join('\n') : '가져올 일정이 없습니다.', 'error'); return }
    await onCreate(parsed)
    if (errors.length) notify?.(errors.join('\n'), 'error')
  }
  return <>
    <Header title="일정" subtitle="월간 달력과 모바일 일정 목록을 한눈에 확인하세요." action="새 일정" onAction={() => setNewDate(dateKey(cursor))}/>
    <div className={`content cal-view-${view}`}>
      <div className="calendar-tools"><div className="month-switch"><button className="secondary" onClick={() => setCursor(new Date())}>오늘</button><button className="icon-button" aria-label={view === 'week' ? '이전 주' : view === 'year' ? '이전 해' : '이전 달'} onClick={() => setCursor(date => view === 'week' ? new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7) : view === 'year' ? new Date(date.getFullYear() - 1, date.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft/></button><h2>{view === 'year' ? `${cursor.getFullYear()}년` : view === 'month' ? `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월` : (() => { const weekStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay()), weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6); return `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일 – ${weekEnd.getMonth() + 1}월 ${weekEnd.getDate()}일` })()}</h2><button className="icon-button" aria-label={view === 'week' ? '다음 주' : view === 'year' ? '다음 해' : '다음 달'} onClick={() => setCursor(date => view === 'week' ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7) : view === 'year' ? new Date(date.getFullYear() + 1, date.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight/></button></div><div className="view-switch"><button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>월</button><button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>주</button><button className={view === 'year' ? 'active' : ''} onClick={() => setView('year')}>년</button></div><button className="secondary" onClick={printReport} disabled={!sorted.length}><FileText size={17}/>PDF</button><button className="secondary" onClick={exportIcs} disabled={!sorted.length}><Download size={17}/>ICS</button><button className="secondary" onClick={exportCsv} disabled={!sorted.length}><Download size={17}/>CSV</button><button className="secondary" onClick={() => importInputRef.current?.click()}><Upload size={17}/>ICS 가져오기</button><input ref={importInputRef} type="file" accept=".ics,text/calendar" hidden onChange={importIcs}/><button className="secondary" onClick={() => csvImportInputRef.current?.click()}><Upload size={17}/>CSV 가져오기</button><input ref={csvImportInputRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv}/></div>
      <label className="search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="제목, 장소, 메모, 태그 검색" aria-label="일정 검색"/></label>
      <label className="filter-select"><Flag/><span>우선순위</span><select value={priority} onChange={e => setPriority(e.target.value)}><option value="all">전체</option><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select></label>
      <label className="filter-select"><select aria-label="일정 정렬" value={eventSort} onChange={e => setEventSort(e.target.value)}><option value="time">시간순</option><option value="priority">우선순위순</option><option value="title">제목순</option></select></label>
      <TagFilter tags={allTags} selected={selectedTags} onChange={setSelectedTags}/>
      <div className="filter-preset-bar">{eventFilterPresets.length ? <select aria-label="저장된 필터" defaultValue="" onChange={e => { applyEventFilterPreset(e.target.value); e.target.value = '' }}><option value="" disabled>필터 선택</option>{eventFilterPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}<button type="button" className="text-button" onClick={saveEventFilterPreset}>필터 저장</button>{eventFilterPresets.length ? <button type="button" className="text-button" onClick={deleteEventFilterPreset}>필터 삭제</button> : null}</div>
      {view === 'year' ? <section className="calendar calendar-year"><div className="year-grid">{yearMonthsList.map(monthDate => { const monthIndex = monthDate.getMonth(); const monthCells = monthGridCells(cursor.getFullYear(), monthIndex); return <div key={monthIndex} className="year-month" role="button" tabIndex="0" aria-label={`${monthIndex + 1}월로 이동`} onClick={() => { setCursor(new Date(cursor.getFullYear(), monthIndex, 1)); setView('month') }} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && (setCursor(new Date(cursor.getFullYear(), monthIndex, 1)), setView('month'))}><h3>{monthIndex + 1}월</h3><div className="year-month-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div><div className="year-month-grid">{monthCells.map((cell, index) => { if (!cell) return <span key={index} className="year-day-empty"/>; const key = dateKey(cell); const holidayName = holidayNameForDate(cell); const count = yearEventCounts.get(key) || 0; const taskCount = yearTaskCounts.get(key) || 0; return <span key={index} className={`${key === dateKey(new Date()) ? 'year-today' : ''}${holidayName ? ' year-holiday' : ''}${count ? ' has-events' : ''}${taskCount ? ' has-tasks' : ''}`} title={[holidayName, taskCount ? `업무 마감 ${taskCount}건` : null].filter(Boolean).join(' · ') || undefined}>{cell.getDate()}</span> })}</div></div> })}</div></section> : view === 'month' ? <section className="calendar calendar-desktop"><div className="weekdays">{weekdays.map(day => <div key={day}>{day}</div>)}</div><div className="calendar-grid">{cells.map(cell => { const holidayName = holidayNameForDate(cell.date); return <div key={dateKey(cell.date)} role="button" tabIndex="0" aria-label={`${dateKey(cell.date)} 일정 추가${holidayName ? `, ${holidayName}` : ''}`} className={`${cell.current ? '' : 'outside'}${dateKey(cell.date) === dateKey(new Date()) ? ' today-cell' : ''}${holidayName ? ' holiday-cell' : ''}`} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && setNewDate(dateKey(cell.date))} onClick={() => setNewDate(dateKey(cell.date))} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/wm-event')); const dragged = filtered.find(x => x.id === id); const patch = dragged && moveEventToDay(dragged, dateKey(cell.date)); if (patch) onUpdate(dragged, patch) }}><span>{cell.date.getDate()}</span>{holidayName ? <em className="holiday-label">{holidayName}</em> : null}{(eventsByDay.get(dateKey(cell.date)) || []).slice(0, 3).map(event => <button className={`cal-event ${event.sync_state === 'conflict' ? 'conflict' : ''} ${event.priority === 'high' ? 'cal-event-priority-high' : ''}`} style={eventColorHex(event.color) ? { background: `color-mix(in srgb, ${eventColorHex(event.color)} 18%, var(--surface))`, color: eventColorHex(event.color) } : undefined} key={event.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/wm-event', String(event.id)); e.dataTransfer.effectAllowed = 'move' }} onClick={click => { click.stopPropagation(); setEditing(event) }}><b>{event.title}</b><small>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small><TagChips tags={event.tags}/></button>)}{(tasksByDay.get(dateKey(cell.date)) || []).slice(0, 2).map(task => <button key={`task-${task.id}`} className="cal-task-due" onClick={click => { click.stopPropagation(); onOpenTask?.(task) }}><CheckSquare size={12} aria-hidden="true"/>{task.title}</button>)}<button className="cell-add" aria-label={`${dateKey(cell.date)} 일정 추가`}><Plus/></button></div> })}</div></section> : <section className="calendar calendar-week"><div className="weekdays">{weekdays.map(day => <div key={day}>{day}</div>)}</div><div className="week-grid">{cells.map(cell => { const holidayName = holidayNameForDate(cell.date); return <div key={dateKey(cell.date)} role="button" tabIndex="0" aria-label={`${dateKey(cell.date)} 일정 추가${holidayName ? `, ${holidayName}` : ''}`} className={`${dateKey(cell.date) === dateKey(new Date()) ? 'today-column' : ''}${holidayName ? ' holiday-cell' : ''}`} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && setNewDate(dateKey(cell.date))} onClick={() => setNewDate(dateKey(cell.date))} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/wm-event')); const dragged = filtered.find(x => x.id === id); const patch = dragged && moveEventToDay(dragged, dateKey(cell.date)); if (patch) onUpdate(dragged, patch) }}><header><span>{cell.date.getDate()}</span>{holidayName ? <em className="holiday-label">{holidayName}</em> : null}</header>{(eventsByDay.get(dateKey(cell.date)) || []).map(event => <button className={`cal-event ${event.sync_state === 'conflict' ? 'conflict' : ''} ${event.priority === 'high' ? 'cal-event-priority-high' : ''}`} style={eventColorHex(event.color) ? { background: `color-mix(in srgb, ${eventColorHex(event.color)} 18%, var(--surface))`, color: eventColorHex(event.color) } : undefined} key={event.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/wm-event', String(event.id)); e.dataTransfer.effectAllowed = 'move' }} onClick={click => { click.stopPropagation(); setEditing(event) }}><b>{event.title}</b><small>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small><TagChips tags={event.tags}/></button>)}{(tasksByDay.get(dateKey(cell.date)) || []).map(task => <button key={`task-${task.id}`} className="cal-task-due" onClick={click => { click.stopPropagation(); onOpenTask?.(task) }}><CheckSquare size={12} aria-hidden="true"/>{task.title}</button>)}</div> })}</div></section>}
      {agendaEvents.length > 1 ? <label className="select-all-shown"><input type="checkbox" aria-label="일정 전체 선택" checked={allShownEventsSelected} onChange={toggleSelectAllEvents}/>전체 선택</label> : null}
      {selectedEventIds.size ? <div className="bulk-action-bar" role="toolbar" aria-label="선택 일정 일괄 작업"><span>{selectedEventIds.size}개 선택됨</span>{onBulkAddTag ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkAddTagEvents() }}><Tag size={14}/><input aria-label="추가할 태그" value={bulkEventTag} onChange={e => setBulkEventTag(e.target.value)} placeholder="태그 추가"/><button type="submit" className="secondary" disabled={!bulkEventTag.trim()}>추가</button></form> : null}{onBulkPostpone ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkPostponeEvents() }}><CalendarClock size={14}/><input aria-label="연기할 일수" type="number" min="1" value={bulkPostponeDays} onChange={e => setBulkPostponeDays(e.target.value)} style={{ width: '3.5rem' }}/><button type="submit" className="secondary" disabled={!Number(bulkPostponeDays)}>연기</button></form> : null}{onBulkPriority ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkChangePriorityEvents() }}><Flag size={14}/><select aria-label="변경할 우선순위" value={bulkPriority} onChange={e => setBulkPriority(e.target.value)}><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select><button type="submit" className="secondary">우선순위 변경</button></form> : null}<button type="button" className="danger-button" onClick={bulkDeleteEvents}>삭제</button><button type="button" className="text-button" onClick={clearSelectedEvents}>선택 해제</button></div> : null}
      <section className="mobile-agenda">{agendaEvents.length ? agendaEvents.map(event => <div key={event.id} className={`agenda-row ${selectedEventIds.has(event.id) ? 'row-selected' : ''}`}><input type="checkbox" className="row-select" aria-label={`${event.title} 선택`} checked={selectedEventIds.has(event.id)} onChange={() => toggleEventSelected(event.id)}/><button onClick={() => setEditing(event)}><time>{parseDate(event.start_at || event.start).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}<b>{event.google_is_all_day ? '종일' : parseDate(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</b></time><span><strong>{event.title}</strong>{pinnedIds.has(event.id) ? <Star className="task-pinned-icon" aria-hidden="true"/> : null}<small>{event.location ? <><MapPin/> {event.location}</> : '장소 없음'}</small>{event.priority === 'high' ? <small className="log-task-link">우선순위 높음</small> : null}<TagChips tags={event.tags}/>{event.link_url ? <a className="task-link" href={event.link_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} aria-label={`${event.title} 관련 링크 열기`}><ExternalLink aria-hidden="true"/>관련 링크</a> : null}{event.links?.length ? <small className="task-recurrence"><ExternalLink aria-hidden="true"/>첨부 링크 {event.links.length}개</small> : null}{event.comment_count ? <small className="task-recurrence">댓글 {event.comment_count}개</small> : null}{event.attachment_count ? <small className="task-recurrence"><Paperclip aria-hidden="true"/>첨부파일 {event.attachment_count}개</small> : null}{event.sync_state === 'conflict' ?<em className="conflict-label">동기화 충돌</em> : null}</span><ChevronRight/></button><button className={`task-pin${pinnedIds.has(event.id) ? ' pinned' : ''}`} aria-label={`${event.title} ${pinnedIds.has(event.id) ? '고정 해제' : '고정'}`} title={pinnedIds.has(event.id) ? '고정 해제' : '목록 상단 고정'} onClick={() => togglePin(event)}><Star/></button><button aria-label={`${event.title} 복제`} title="복제" onClick={() => onCreate(buildEventDuplicatePayload(event))}><Copy/></button></div>) : <p className="empty-state">등록된 일정이 없습니다.</p>}</section>
    </div>
    {(editing || newDate) ? <Modal title={editing ? '일정 수정' : '새 일정'} onClose={close}>{editing?.sync_state === 'conflict' ? <ConflictPanel event={editing} notify={notify} onResolved={async () => { await onDataChanged(); close() }}/> : null}<EventForm event={editing} date={newDate || dateKey(cursor)} allEvents={events} onCancel={close} onDelete={() => { setDeleteSeries(false); setDeleting(true) }} onDuplicate={async e => { const ok = await onCreate(buildEventDuplicatePayload(e)); if (ok) close() }} onViewHistory={onViewHistory} onSave={async (data, applyToSeries) => { const ok = await (editing ? onUpdate(editing, data, applyToSeries) : onCreate(data)); if (ok) close(); return ok }}/></Modal> : null}
    {deleting ? <ConfirmDialog message={<>‘{editing?.title}’ 일정을 삭제합니다.{editing?.recurrence_group_id ? <label className="span-2"><input type="checkbox" checked={deleteSeries} onChange={e => setDeleteSeries(e.target.checked)}/> <span>이 일정과 이후 반복 일정에 모두 적용</span></label> : null}</>} onClose={() => setDeleting(false)} onConfirm={async () => { const ok = await onDelete(editing, deleteSeries); if (ok) { setDeleting(false); close() } }}/> : null}
  </>
}
