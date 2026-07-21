import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, ArrowUpRight, CalendarClock, Check, CheckCircle2, ChevronRight, Circle, Clock3, Copy, DollarSign, Download, ExternalLink, FileText, Flag, History, Paperclip, Palette, Pause, Pencil, Play, Plus, SkipForward, Sparkles, Square, Star, Tag, Trash2, Upload, X } from 'lucide-react'
import Header from '../components/Header'
import TagsInput, { TagChips, TagFilter } from '../components/TagsInput'
import { api } from '../api'
import { clearWorkLogTimer, formatTimerElapsed, loadWorkLogTimer, pauseWorkLogTimer, resumeWorkLogTimer, startTimeString, startWorkLogTimer, timerElapsedMinutes } from '../workLogTimer'
import { loadPinnedTodoIds, loadTodoSort, orderTodosByPin, savePinnedTodoIds, saveTodoSort, togglePinnedTodo } from '../todoPins'
import { loadTodoManualOrder, moveTodoBefore, saveTodoManualOrder } from '../todoOrder'
import { loadLogManualOrder, moveLogBefore, saveLogManualOrder } from '../logOrder'
import { loadLogSort, loadPinnedLogIds, orderLogsByPin, savePinnedLogIds, saveLogSort, togglePinnedLog } from '../logPins'
import { filterTodosByQuery, filterLogsByQuery, filterTodosByPriority, filterTodosByCompleted, filterLogsByPriority, filterLogsByBillable } from '../todaySearch'
import { addTodoFilterPreset, buildTodoFilterPreset, loadTodoFilterPresets, removeTodoFilterPreset, saveTodoFilterPresets } from '../todoFilterPresets'
import { addLogFilterPreset, buildLogFilterPreset, loadLogFilterPresets, removeLogFilterPreset, saveLogFilterPresets } from '../logFilterPresets'
import { parseTodosCsv, parseWorkLogsCsv, todoCsvFilename, todosToCsv, workLogCsvFilename, workLogsToCsv } from '../csv'
import { todoReportFilename, todosToPrintableReport } from '../todoReport'
import { todoIcsFilename, todosToIcs, icsToTodos, logIcsFilename, logsToIcs, icsToLogs } from '../ics'
import { workLogReportFilename, workLogsToPrintableReport } from '../workLogReport'
import { dropZoneHandlers } from '../fileDrop'
import { EVENT_COLORS, eventColorHex } from '../eventColors'
import { formatDuration } from '../performanceReport'
import { taskEstimateOverrun } from '../taskLogs'
import { moveChecklistItem, normalizedChecklist, normalizedLinks } from '../taskFormPayload'
import { addTodoTemplate, applyTodoTemplate, buildTodoTemplate, loadTodoTemplates, removeTodoTemplate, saveTodoTemplates } from '../todoTemplates'
import { nextRowIndex } from '../rowNavigation'
import { addLogTemplate, applyLogTemplate, buildLogTemplate, loadLogTemplates, removeLogTemplate, saveLogTemplates } from '../logTemplates'
import { allIdsSelected, toggleSelectAllIds } from '../taskFilters'
import { findOverlappingWorkLogs } from '../workLogOverlap'
import { findOverlappingTodos } from '../todoOverlap'
import { validateLogForm, validateTodoForm } from '../formValidation'

const todoRecurrenceLabels = { daily: '매일', weekly: '매주', biweekly: '격주', monthly: '매월', yearly: '매년' }

function localDate(value) {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
}

function TodoComments({ todoId }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  useEffect(() => {
    let cancelled = false
    api.todoComments(todoId).then(res => { if (!cancelled) setComments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [todoId])
  const addComment = async () => {
    const body = text.trim()
    if (!body) return
    setError('')
    try {
      const comment = await api.addTodoComment(todoId, body)
      setComments(current => [...current, comment])
      setText('')
    } catch (e) { setError(e.message) }
  }
  const removeComment = async id => {
    try {
      await api.deleteTodoComment(todoId, id)
      setComments(current => current.filter(c => c.id !== id))
    } catch (e) { setError(e.message) }
  }
  const beginEdit = item => { setEditingId(item.id); setEditingText(item.body) }
  const saveEdit = async id => {
    const body = editingText.trim()
    setEditingId(null)
    const original = comments.find(c => c.id === id)
    if (!body || !original || body === original.body) return
    try {
      const updated = await api.updateTodoComment(todoId, id, body)
      setComments(current => current.map(c => c.id === id ? updated : c))
    } catch (e) { setError(e.message) }
  }
  return <div className="checklist-editor" onClick={event => event.stopPropagation()}>
    <span className="dependency-picker-label">댓글{comments.length ? ` (${comments.length})` : ''}</span>
    {comments.map(item => <div key={item.id} className="checklist-editor-item">
      {editingId === item.id
        ? <input type="text" className="inline-edit" autoFocus maxLength={2000} value={editingText} onChange={e => setEditingText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(item.id) } if (e.key === 'Escape') setEditingId(null) }} onBlur={() => saveEdit(item.id)}/>
        : <span onClick={() => beginEdit(item)}>{item.body}<span className="muted"> · {new Date(item.created_at).toLocaleString('ko-KR')}{item.edited_at ? ' (수정됨)' : ''}</span></span>}
      <button type="button" className="text-button" onClick={() => removeComment(item.id)}>삭제</button>
    </div>)}
    <div className="checklist-editor-add"><input type="text" maxLength={2000} value={text} placeholder="댓글을 입력하세요" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }}/><button type="button" className="text-button" onClick={addComment}>등록</button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>
}

function TodoAttachments({ todoId }) {
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.todoAttachments(todoId).then(res => { if (!cancelled) setAttachments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [todoId])
  const uploadFile = async file => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const item = await api.uploadTodoAttachment(todoId, file)
      setAttachments(current => [...current, item])
    } catch (err) { setError(err.message) } finally { setUploading(false) }
  }
  const upload = e => { const file = e.target.files?.[0]; e.target.value = ''; uploadFile(file) }
  const remove = async id => {
    try {
      await api.deleteTodoAttachment(todoId, id)
      setAttachments(current => current.filter(a => a.id !== id))
    } catch (err) { setError(err.message) }
  }
  const formatSize = bytes => bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return <div className="checklist-editor" onClick={event => event.stopPropagation()}>
    <span className="dependency-picker-label">첨부파일{attachments.length ? ` (${attachments.length})` : ''}</span>
    {attachments.map(item => <div key={item.id} className="checklist-editor-item">
      {item.content_type?.startsWith('image/') ? <img className="attachment-thumb" src={api.todoAttachmentDownloadUrl(todoId, item.id)} alt=""/> : null}
      <a href={api.todoAttachmentDownloadUrl(todoId, item.id)} target="_blank" rel="noopener noreferrer">{item.filename}</a>
      <span className="muted"> {formatSize(item.size_bytes)}</span>
      <button type="button" className="text-button" onClick={() => remove(item.id)}>삭제</button>
    </div>)}
    <div className="checklist-editor-add file-dropzone" {...dropZoneHandlers(uploadFile)}><input type="file" disabled={uploading} onChange={upload}/>{uploading ? <span className="muted">업로드 중…</span> : <span className="muted">또는 파일을 끌어다 놓으세요</span>}</div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>
}

function WorkLogComments({ logId }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  useEffect(() => {
    let cancelled = false
    api.workLogComments(logId).then(res => { if (!cancelled) setComments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [logId])
  const addComment = async () => {
    const body = text.trim()
    if (!body) return
    setError('')
    try {
      const comment = await api.addWorkLogComment(logId, body)
      setComments(current => [...current, comment])
      setText('')
    } catch (e) { setError(e.message) }
  }
  const removeComment = async id => {
    try {
      await api.deleteWorkLogComment(logId, id)
      setComments(current => current.filter(c => c.id !== id))
    } catch (e) { setError(e.message) }
  }
  const beginEdit = item => { setEditingId(item.id); setEditingText(item.body) }
  const saveEdit = async id => {
    const body = editingText.trim()
    setEditingId(null)
    const original = comments.find(c => c.id === id)
    if (!body || !original || body === original.body) return
    try {
      const updated = await api.updateWorkLogComment(logId, id, body)
      setComments(current => current.map(c => c.id === id ? updated : c))
    } catch (e) { setError(e.message) }
  }
  return <div className="checklist-editor" onClick={event => event.stopPropagation()}>
    <span className="dependency-picker-label">댓글{comments.length ? ` (${comments.length})` : ''}</span>
    {comments.map(item => <div key={item.id} className="checklist-editor-item">
      {editingId === item.id
        ? <input type="text" className="inline-edit" autoFocus maxLength={2000} value={editingText} onChange={e => setEditingText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(item.id) } if (e.key === 'Escape') setEditingId(null) }} onBlur={() => saveEdit(item.id)}/>
        : <span onClick={() => beginEdit(item)}>{item.body}<span className="muted"> · {new Date(item.created_at).toLocaleString('ko-KR')}{item.edited_at ? ' (수정됨)' : ''}</span></span>}
      <button type="button" className="text-button" onClick={() => removeComment(item.id)}>삭제</button>
    </div>)}
    <div className="checklist-editor-add"><input type="text" maxLength={2000} value={text} placeholder="댓글을 입력하세요" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }}/><button type="button" className="text-button" onClick={addComment}>등록</button></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>
}

function WorkLogAttachments({ logId }) {
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.workLogAttachments(logId).then(res => { if (!cancelled) setAttachments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [logId])
  const uploadFile = async file => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const item = await api.uploadWorkLogAttachment(logId, file)
      setAttachments(current => [...current, item])
    } catch (err) { setError(err.message) } finally { setUploading(false) }
  }
  const upload = e => { const file = e.target.files?.[0]; e.target.value = ''; uploadFile(file) }
  const remove = async id => {
    try {
      await api.deleteWorkLogAttachment(logId, id)
      setAttachments(current => current.filter(a => a.id !== id))
    } catch (err) { setError(err.message) }
  }
  const formatSize = bytes => bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return <div className="checklist-editor" onClick={event => event.stopPropagation()}>
    <span className="dependency-picker-label">첨부파일{attachments.length ? ` (${attachments.length})` : ''}</span>
    {attachments.map(item => <div key={item.id} className="checklist-editor-item">
      {item.content_type?.startsWith('image/') ? <img className="attachment-thumb" src={api.workLogAttachmentDownloadUrl(logId, item.id)} alt=""/> : null}
      <a href={api.workLogAttachmentDownloadUrl(logId, item.id)} target="_blank" rel="noopener noreferrer">{item.filename}</a>
      <span className="muted"> {formatSize(item.size_bytes)}</span>
      <button type="button" className="text-button" onClick={() => remove(item.id)}>삭제</button>
    </div>)}
    <div className="checklist-editor-add file-dropzone" {...dropZoneHandlers(uploadFile)}><input type="file" disabled={uploading} onChange={upload}/>{uploading ? <span className="muted">업로드 중…</span> : <span className="muted">또는 파일을 끌어다 놓으세요</span>}</div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>
}

function overlapsDay(event, day) {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  const start = localDate(event.start_at || event.start)
  if (!start || Number.isNaN(start.getTime())) return false
  const end = localDate(event.end_at || event.end) || new Date(start.getTime() + 1)
  return start < nextDay && end > dayStart
}

export default function Today(props) {
  const {
    tasks = [], allTasks = [], events = [], todos = [], overdueTodos = [], logs = [], loading,
    onAddTodo, onUpdateTodo, onToggleTodo, onDeleteTodo, onDuplicateTodo, onArchiveTodo, onPromoteTodo, onSkipTodoRecurrence, onClearCompletedTodos, onCarryOverTodos, onImportTodos, onPostponeTodo,
    onBulkCompleteTodo, onBulkDeleteTodo, onBulkAddTagTodo, onBulkPostponeTodo, onBulkPriorityTodo, onBulkColorTodo, onBulkDuplicateTodo, onBulkArchiveTodo,
    onAddLog, onUpdateLog, onDeleteLog, onDuplicateLog, onPromoteLog, onPostponeLog, onArchiveLog, onImportLogs, onToggleTask, goAI, onViewHistoryTodo, onViewHistoryLog,
    onBulkDeleteLog, onBulkAddTagLog, onBulkPostponeLog, onBulkPriorityLog, onBulkColorLog, onBulkBillableLog, onBulkDuplicateLog, onBulkArchiveLog, focusTag, notify, onOpenTask,
  } = props
  const todoImportInputRef = useRef(null)
  const logImportInputRef = useRef(null)
  const todoIcsImportInputRef = useRef(null)
  const logIcsImportInputRef = useRef(null)
  const [selectedTodoIds, setSelectedTodoIds] = useState(() => new Set())
  const [bulkTodoTag, setBulkTodoTag] = useState('')
  const [bulkTodoPostponeDays, setBulkTodoPostponeDays] = useState(1)
  const [bulkTodoPriority, setBulkTodoPriority] = useState('high')
  const [bulkTodoColor, setBulkTodoColor] = useState('')
  const [selectedLogIds, setSelectedLogIds] = useState(() => new Set())
  const [bulkLogTag, setBulkLogTag] = useState('')
  const [bulkLogPostponeDays, setBulkLogPostponeDays] = useState(1)
  const [bulkLogPriority, setBulkLogPriority] = useState('high')
  const [bulkLogColor, setBulkLogColor] = useState('')
  const [bulkLogBillable, setBulkLogBillable] = useState('billable')
  const [billingHourlyRate, setBillingHourlyRate] = useState(null)
  useEffect(() => { api.workflowSettings().then(s => setBillingHourlyRate(s?.billing_hourly_rate ?? null)).catch(() => {}) }, [])
  const now = new Date()
  const dateText = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
  const [todoDraft, setTodoDraft] = useState('')
  const [todoFieldErrors, setTodoFieldErrors] = useState({})
  const [todoTags, setTodoTags] = useState([])
  const [todoRecurrence, setTodoRecurrence] = useState('')
  const [todoRecurrenceEnd, setTodoRecurrenceEnd] = useState('')
  const [todoPriority, setTodoPriority] = useState('normal')
  const [todoLink, setTodoLink] = useState('')
  const [todoMemo, setTodoMemo] = useState('')
  const [todoColor, setTodoColor] = useState('')
  const [todoTime, setTodoTime] = useState('')
  const [todoEstimate, setTodoEstimate] = useState('')
  const [todoChecklist, setTodoChecklist] = useState([])
  const [todoChecklistText, setTodoChecklistText] = useState('')
  const [todoTemplates, setTodoTemplates] = useState(() => loadTodoTemplates())
  const [editRecurrence, setEditRecurrence] = useState('')
  const [editRecurrenceEnd, setEditRecurrenceEnd] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editLink, setEditLink] = useState('')
  const [editTodoLinks, setEditTodoLinks] = useState([])
  const [editTodoLinkUrlText, setEditTodoLinkUrlText] = useState('')
  const [editTodoLinkLabelText, setEditTodoLinkLabelText] = useState('')
  const [editTodoChecklist, setEditTodoChecklist] = useState([])
  const [editTodoChecklistText, setEditTodoChecklistText] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editTodoTime, setEditTodoTime] = useState('')
  const [editTodoEstimate, setEditTodoEstimate] = useState('')
  const [logDraft, setLogDraft] = useState('')
  const [logFieldErrors, setLogFieldErrors] = useState({})
  const [logTags, setLogTags] = useState([])
  const [logTaskId, setLogTaskId] = useState('')
  const [logMinutes, setLogMinutes] = useState('')
  const [logEstimate, setLogEstimate] = useState('')
  const [logLink, setLogLink] = useState('')
  const [logLinks, setLogLinks] = useState([])
  const [logLinkUrlText, setLogLinkUrlText] = useState('')
  const [logLinkLabelText, setLogLinkLabelText] = useState('')
  const [logColor, setLogColor] = useState('')
  const [logTime, setLogTime] = useState('')
  const [logBillable, setLogBillable] = useState(false)
  const [logPriority, setLogPriority] = useState('normal')
  const [logTemplates, setLogTemplates] = useState(() => loadLogTemplates())
  const [edit, setEdit] = useState(null)
  const [editText, setEditText] = useState('')
  const [editTags, setEditTags] = useState([])
  const [editTaskId, setEditTaskId] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const [editLogEstimate, setEditLogEstimate] = useState('')
  const [editLogLink, setEditLogLink] = useState('')
  const [editLogLinks, setEditLogLinks] = useState([])
  const [editLogLinkUrlText, setEditLogLinkUrlText] = useState('')
  const [editLogLinkLabelText, setEditLogLinkLabelText] = useState('')
  const [editLogColor, setEditLogColor] = useState('')
  const [editLogTime, setEditLogTime] = useState('')
  const [editLogBillable, setEditLogBillable] = useState(false)
  const [editLogPriority, setEditLogPriority] = useState('normal')
  const [editLogChecklist, setEditLogChecklist] = useState([])
  const [editLogChecklistText, setEditLogChecklistText] = useState('')
  const [saving, setSaving] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  useEffect(()=>{if(!focusTag)return;setSelectedTags([focusTag.tag])},[focusTag])
  const [query, setQuery] = useState('')
  const [todoPriorityFilter, setTodoPriorityFilter] = useState('all')
  const [hideCompletedTodos, setHideCompletedTodos] = useState(false)
  const [logBillableFilter, setLogBillableFilter] = useState('all')
  const [logPriorityFilter, setLogPriorityFilter] = useState('all')
  const [todoSort, setTodoSortState] = useState(() => loadTodoSort())
  const [logSort, setLogSortState] = useState(() => loadLogSort())
  const setTodoSort = value => { setTodoSortState(value); saveTodoSort(value) }
  const setLogSort = value => { setLogSortState(value); saveLogSort(value) }
  const [todoManualOrder, setTodoManualOrder] = useState(() => loadTodoManualOrder())
  const [draggedTodoId, setDraggedTodoId] = useState(null)
  const dropTodoOn = targetId => { if (draggedTodoId == null) return; const next = moveTodoBefore(shownTodos.map(t => t.id), todoManualOrder, draggedTodoId, targetId); setTodoManualOrder(next); saveTodoManualOrder(next); setDraggedTodoId(null) }
  const [logManualOrder, setLogManualOrder] = useState(() => loadLogManualOrder())
  const [draggedLogId, setDraggedLogId] = useState(null)
  const dropLogOn = targetId => { if (draggedLogId == null) return; const next = moveLogBefore(shownLogs.map(l => l.id), logManualOrder, draggedLogId, targetId); setLogManualOrder(next); saveLogManualOrder(next); setDraggedLogId(null) }
  const [todoFilterPresets, setTodoFilterPresets] = useState(() => loadTodoFilterPresets())
  const applyTodoFilterPreset = id => { const preset = todoFilterPresets.find(p => p.id === id); if (!preset) return; setQuery(preset.query); setSelectedTags(preset.selectedTags); setTodoPriorityFilter(preset.priority) }
  const saveTodoFilterPreset = () => { const name = window.prompt('필터 이름을 입력하세요.'); if (!name) return; const preset = buildTodoFilterPreset({ name, query, selectedTags, priority: todoPriorityFilter }); const next = addTodoFilterPreset(todoFilterPresets, preset); setTodoFilterPresets(next); saveTodoFilterPresets(next) }
  const deleteTodoFilterPreset = () => { const name = window.prompt('삭제할 필터 이름을 입력하세요.'); const match = todoFilterPresets.find(p => p.name === name); if (!match) return; const next = removeTodoFilterPreset(todoFilterPresets, match.id); setTodoFilterPresets(next); saveTodoFilterPresets(next) }
  const [logFilterPresets, setLogFilterPresets] = useState(() => loadLogFilterPresets())
  const applyLogFilterPreset = id => { const preset = logFilterPresets.find(p => p.id === id); if (!preset) return; setQuery(preset.query); setSelectedTags(preset.selectedTags); setLogBillableFilter(preset.billable); setLogPriorityFilter(preset.priority || 'all') }
  const saveLogFilterPreset = () => { const name = window.prompt('필터 이름을 입력하세요.'); if (!name) return; const preset = buildLogFilterPreset({ name, query, selectedTags, billable: logBillableFilter, priority: logPriorityFilter }); const next = addLogFilterPreset(logFilterPresets, preset); setLogFilterPresets(next); saveLogFilterPresets(next) }
  const deleteLogFilterPreset = () => { const name = window.prompt('삭제할 필터 이름을 입력하세요.'); const match = logFilterPresets.find(p => p.name === name); if (!match) return; const next = removeLogFilterPreset(logFilterPresets, match.id); setLogFilterPresets(next); saveLogFilterPresets(next) }
  const todoFiltersActive = query.trim() !== '' || selectedTags.length > 0 || todoPriorityFilter !== 'all' || hideCompletedTodos
  const resetTodoFilters = () => { setQuery(''); setSelectedTags([]); setTodoPriorityFilter('all'); setHideCompletedTodos(false) }
  const logFiltersActive = query.trim() !== '' || selectedTags.length > 0 || logBillableFilter !== 'all' || logPriorityFilter !== 'all'
  const resetLogFilters = () => { setQuery(''); setSelectedTags([]); setLogBillableFilter('all'); setLogPriorityFilter('all') }
  const [tagSuggestions, setTagSuggestions] = useState({})
  const [timer, setTimer] = useState(() => loadWorkLogTimer())
  const [timerNow, setTimerNow] = useState(() => new Date())
  const [pinnedTodoIds, setPinnedTodoIds] = useState(() => loadPinnedTodoIds())
  const togglePin = todo => setPinnedTodoIds(ids => { const next = togglePinnedTodo(ids, todo.id); savePinnedTodoIds(next); return next })
  const [pinnedLogIds, setPinnedLogIds] = useState(() => loadPinnedLogIds())
  const togglePinLog = log => setPinnedLogIds(ids => { const next = togglePinnedLog(ids, log.id); savePinnedLogIds(next); return next })

  useEffect(() => {
    if (!timer || timer.pausedAt) return
    const id = setInterval(() => setTimerNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [timer])

  const startTimer = () => setTimer(startWorkLogTimer(logTaskId ? Number(logTaskId) : null))
  const pauseTimer = () => setTimer(pauseWorkLogTimer())
  const resumeTimer = () => setTimer(resumeWorkLogTimer())
  const stopTimer = () => {
    if (!timer) return
    setLogMinutes(String(timerElapsedMinutes(timer, new Date())))
    setLogTime(startTimeString(timer.startedAt))
    if (timer.taskId) setLogTaskId(String(timer.taskId))
    clearWorkLogTimer()
    setTimer(null)
  }

  const addLogLink = () => {
    const url = logLinkUrlText.trim()
    if (!/^https?:\/\//.test(url)) return
    setLogLinks([...logLinks, { id: `${Date.now()}`, url, label: logLinkLabelText.trim() }])
    setLogLinkUrlText('')
    setLogLinkLabelText('')
  }
  const removeLogLink = id => setLogLinks(logLinks.filter(item => item.id !== id))
  const addEditLogLink = () => {
    const url = editLogLinkUrlText.trim()
    if (!/^https?:\/\//.test(url)) return
    setEditLogLinks([...editLogLinks, { id: `${Date.now()}`, url, label: editLogLinkLabelText.trim() }])
    setEditLogLinkUrlText('')
    setEditLogLinkLabelText('')
  }
  const removeEditLogLink = id => setEditLogLinks(editLogLinks.filter(item => item.id !== id))
  const addEditTodoLink = () => {
    const url = editTodoLinkUrlText.trim()
    if (!/^https?:\/\//.test(url)) return
    setEditTodoLinks([...editTodoLinks, { id: `${Date.now()}`, url, label: editTodoLinkLabelText.trim() }])
    setEditTodoLinkUrlText('')
    setEditTodoLinkLabelText('')
  }
  const removeEditTodoLink = id => setEditTodoLinks(editTodoLinks.filter(item => item.id !== id))
  const addTodoChecklistItem = () => {
    const text = todoChecklistText.trim()
    if (!text) return
    setTodoChecklist([...todoChecklist, { id: `${Date.now()}`, text, done: false }])
    setTodoChecklistText('')
  }
  const toggleTodoChecklistItem = id => setTodoChecklist(todoChecklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const removeTodoChecklistItem = id => setTodoChecklist(todoChecklist.filter(item => item.id !== id))
  const shiftTodoChecklistItem = (id, direction) => setTodoChecklist(list => moveChecklistItem(list, id, direction))
  const addEditTodoChecklistItem = () => {
    const text = editTodoChecklistText.trim()
    if (!text) return
    setEditTodoChecklist([...editTodoChecklist, { id: `${Date.now()}`, text, done: false }])
    setEditTodoChecklistText('')
  }
  const toggleEditTodoChecklistItem = id => setEditTodoChecklist(editTodoChecklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const removeEditTodoChecklistItem = id => setEditTodoChecklist(editTodoChecklist.filter(item => item.id !== id))
  const addEditLogChecklistItem = () => {
    const text = editLogChecklistText.trim()
    if (!text) return
    setEditLogChecklist([...editLogChecklist, { id: `${Date.now()}`, text, done: false }])
    setEditLogChecklistText('')
  }
  const toggleEditLogChecklistItem = id => setEditLogChecklist(editLogChecklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const removeEditLogChecklistItem = id => setEditLogChecklist(editLogChecklist.filter(item => item.id !== id))
  const shiftEditLogChecklistItem = (id, direction) => setEditLogChecklist(list => moveChecklistItem(list, id, direction))
  const shiftEditTodoChecklistItem = (id, direction) => setEditTodoChecklist(list => moveChecklistItem(list, id, direction))
  const byTitleKo = (a,b) => a.title.localeCompare(b.title,'ko')
  const linkableTasks = useMemo(()=>allTasks.filter(t=>t.status!=='done').sort(byTitleKo),[allTasks])
  const linkableDoneTasks = useMemo(()=>allTasks.filter(t=>t.status==='done').sort(byTitleKo),[allTasks])
  const taskTitle = useMemo(()=>new Map(allTasks.map(t=>[t.id,t.title])),[allTasks])
  const taskById = useMemo(()=>new Map(allTasks.map(t=>[t.id,t])),[allTasks])
  const allTags = useMemo(
    () => [...new Set([...tasks, ...events, ...todos, ...logs].flatMap(item => item.tags || []))].sort(),
    [tasks, events, todos, logs],
  )
  const matches = item => !selectedTags.length || selectedTags.every(tag => (item.tags || []).includes(tag))
  const todayEvents = events.filter(event => overlapsDay(event, now) && matches(event))
  const active = tasks.filter(task => task.status !== 'done' && matches(task))
  const filteredTodos = filterTodosByPriority(filterTodosByQuery(todos.filter(matches), query), todoPriorityFilter)
  const completedTodos = filteredTodos.filter(todo => todo.completed)
  const shownTodos = orderTodosByPin(filterTodosByCompleted(filteredTodos, hideCompletedTodos), pinnedTodoIds, todoSort, todoManualOrder)
  const shownLogs = orderLogsByPin(filterLogsByPriority(filterLogsByBillable(filterLogsByQuery(logs.filter(matches), query), logBillableFilter), logPriorityFilter), pinnedLogIds, logSort, logManualOrder)
  const todayKey = now.toLocaleDateString('en-CA')
  const overlappingNewLog = useMemo(() => findOverlappingWorkLogs(todayKey, logTime, logMinutes, logs, null), [todayKey, logTime, logMinutes, logs])
  const editingLog = edit?.type === 'log' ? logs.find(l => l.id === edit.id) : null
  const overlappingEditLog = useMemo(() => editingLog ? findOverlappingWorkLogs(editingLog.log_date, editLogTime, editMinutes, logs, editingLog.id) : [], [editingLog, editLogTime, editMinutes, logs])
  const overlappingNewTodo = useMemo(() => findOverlappingTodos(todayKey, todoTime, todos, null), [todayKey, todoTime, todos])
  const editingTodo = edit?.type === 'todo' ? todos.find(t => t.id === edit.id) : null
  const overlappingEditTodo = useMemo(() => editingTodo ? findOverlappingTodos(editingTodo.todo_date, editTodoTime, todos, editingTodo.id) : [], [editingTodo, editTodoTime, todos])
  const editRecurrenceEndError = editingTodo ? validateTodoForm({ title: editText, recurrence_rule: editRecurrence, recurrence_end_date: editRecurrenceEnd, todo_date: editingTodo.todo_date }).recurrence_end_date : null

  const applyTemplate = id => {
    const template = todoTemplates.find(t => t.id === id)
    if (!template) return
    const filled = applyTodoTemplate(template)
    setTodoDraft(filled.title)
    setTodoPriority(filled.priority)
    setTodoRecurrence(filled.recurrence_rule)
    setTodoTags(filled.tags)
    setTodoChecklist(filled.checklist)
    setTodoEstimate(filled.estimated_minutes || '')
    setTodoColor(filled.color || '')
    setTodoLink(filled.link_url || '')
  }
  const saveTodoTemplate = () => {
    if (!todoDraft.trim()) return
    const name = window.prompt('템플릿 이름을 입력하세요.', todoDraft.trim())
    if (!name) return
    const template = buildTodoTemplate({ name, title: todoDraft, priority: todoPriority, recurrence_rule: todoRecurrence, tags: todoTags, checklist: todoChecklist, estimated_minutes: todoEstimate, color: todoColor, link_url: todoLink })
    const next = addTodoTemplate(todoTemplates, template)
    setTodoTemplates(next)
    saveTodoTemplates(next)
  }
  const deleteTodoTemplate = () => {
    if (!todoTemplates.length) return
    const name = window.prompt('삭제할 템플릿 이름을 입력하세요.')
    const match = todoTemplates.find(t => t.name === name)
    if (!match) return
    const next = removeTodoTemplate(todoTemplates, match.id)
    setTodoTemplates(next)
    saveTodoTemplates(next)
  }
  const applyLogTpl = id => {
    const template = logTemplates.find(t => t.id === id)
    if (!template) return
    const filled = applyLogTemplate(template)
    setLogDraft(filled.content)
    setLogTags(filled.tags)
    setLogColor(filled.color)
    setLogMinutes(filled.duration_minutes)
    setLogEstimate(filled.estimated_minutes || '')
    setLogPriority(filled.priority)
    setLogLink(filled.link_url || '')
    setLogLinks(filled.links || [])
  }
  const saveLogTpl = () => {
    if (!logDraft.trim()) return
    const name = window.prompt('템플릿 이름을 입력하세요.', logDraft.trim())
    if (!name) return
    const template = buildLogTemplate({ name, content: logDraft, tags: logTags, color: logColor, duration_minutes: logMinutes, estimated_minutes: logEstimate, priority: logPriority, link_url: logLink, links: logLinks })
    const next = addLogTemplate(logTemplates, template)
    setLogTemplates(next)
    saveLogTemplates(next)
  }
  const deleteLogTpl = () => {
    if (!logTemplates.length) return
    const name = window.prompt('삭제할 템플릿 이름을 입력하세요.')
    const match = logTemplates.find(t => t.name === name)
    if (!match) return
    const next = removeLogTemplate(logTemplates, match.id)
    setLogTemplates(next)
    saveLogTemplates(next)
  }
  const submitTodo = async event => {
    event.preventDefault()
    const errors = validateTodoForm({ title: todoDraft, recurrence_rule: todoRecurrence, recurrence_end_date: todoRecurrenceEnd, todo_date: todayKey })
    setTodoFieldErrors(errors)
    if (Object.keys(errors).length) return
    setSaving('todo')
    if (await onAddTodo(todoDraft.trim(), todoTags, todoRecurrence, todoPriority, todoLink.trim(), todoRecurrenceEnd, todoMemo.trim(), todoColor, todoTime, normalizedChecklist(todoChecklist), todoEstimate)) {
      setTodoDraft('')
      setTodoFieldErrors({})
      setTodoTags([])
      setTodoRecurrence('')
      setTodoRecurrenceEnd('')
      setTodoPriority('normal')
      setTodoLink('')
      setTodoMemo('')
      setTodoColor('')
      setTodoTime('')
      setTodoChecklist([])
      setTodoChecklistText('')
      setTodoEstimate('')
    }
    setSaving('')
  }
  const submitLog = async event => {
    event.preventDefault()
    const errors = validateLogForm({ content: logDraft })
    setLogFieldErrors(errors)
    if (Object.keys(errors).length) return
    setSaving('log')
    if (await onAddLog(logDraft.trim(), logTags, logTaskId ? Number(logTaskId) : null, logMinutes ? Number(logMinutes) : null, logLink.trim(), normalizedLinks(logLinks), logColor, logTime || null, logBillable, logPriority, logEstimate ? Number(logEstimate) : null)) {
      setLogDraft('')
      setLogFieldErrors({})
      setLogTags([])
      setLogTaskId('')
      setLogMinutes('')
      setLogEstimate('')
      setLogLink('')
      setLogLinks([])
      setLogColor('')
      setLogTime('')
      setLogBillable(false)
      setLogPriority('normal')
    }
    setSaving('')
  }
  const beginEdit = (type, item) => {
    setEdit({ type, id: item.id })
    setEditText(item.title || item.content)
    setEditTags(item.tags || [])
    if (type === 'log') { setEditTaskId(item.task_id ?? ''); setEditMinutes(item.duration_minutes ?? ''); setEditLogEstimate(item.estimated_minutes ?? ''); setEditLogLink(item.link_url || ''); setEditLogLinks(item.links || []); setEditLogColor(item.color || ''); setEditLogTime(item.log_time || ''); setEditLogBillable(!!item.billable); setEditLogPriority(item.priority || 'normal'); setEditLogChecklist(item.checklist || []) }
    if (type === 'todo') { setEditRecurrence(item.recurrence_rule || ''); setEditRecurrenceEnd(item.recurrence_end_date || ''); setEditPriority(item.priority || 'normal'); setEditLink(item.link_url || ''); setEditTodoLinks(item.links || []); setEditMemo(item.memo || ''); setEditColor(item.color || ''); setEditTodoTime(item.todo_time || ''); setEditTodoChecklist(item.checklist || []); setEditTodoEstimate(item.estimated_minutes ?? '') }
  }
  const saveEdit = async item => {
    if (!editText.trim()) return
    if (edit.type === 'todo' && editRecurrenceEndError) return
    const key = `${edit.type}-${item.id}`
    setSaving(key)
    const ok = edit.type === 'todo'
      ? await onUpdateTodo(item.id, editText.trim(), editTags, editRecurrence, editPriority, editLink.trim(), editRecurrenceEnd, editMemo.trim(), editColor, normalizedLinks(editTodoLinks), editTodoTime, normalizedChecklist(editTodoChecklist), editTodoEstimate)
      : await onUpdateLog(item.id, editText.trim(), editTags, editTaskId ? Number(editTaskId) : null, editMinutes ? Number(editMinutes) : null, editLogLink.trim(), normalizedLinks(editLogLinks), editLogColor, editLogTime || null, editLogBillable, normalizedChecklist(editLogChecklist), editLogPriority, editLogEstimate ? Number(editLogEstimate) : null)
    if (ok) setEdit(null)
    setSaving('')
  }

  const editable = (type, item) => edit?.type === type && edit.id === item.id
  const editKeyDown = item => e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveEdit(item) }
    else if (e.key === 'Escape') { e.preventDefault(); setEdit(null) }
  }
  const rowKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...e.currentTarget.closest('.todo-list,.done-notes').querySelectorAll('.row-edit-btn')], idx = rows.indexOf(e.currentTarget), nextIdx = nextRowIndex(rows.length, idx, e.key)
    if (nextIdx == null || nextIdx === idx) return
    e.preventDefault(); rows[nextIdx]?.focus()
  }
  const recommendTags = async (key, entity, text) => {
    if (!text.trim()) return
    setSaving(`tags-${key}`)
    try {
      const result = await api.aiTagSuggestions({ entity, content: text })
      setTagSuggestions(current => ({ ...current, [key]: result.tags || result.items || [] }))
    } catch { setTagSuggestions(current => ({ ...current, [key]: [] })) }
    finally { setSaving('') }
  }
  const recommendationButtons = (key, tags, setTags) => (tagSuggestions[key] || []).map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)
  const recommendTodoEstimate = async () => {
    if (!todoDraft.trim()) return
    setSaving('estimate-todo')
    try {
      const result = await api.aiPreview(todoDraft)
      const item = result.items?.[0]?.data || {}
      if (item.estimated_minutes) setTodoEstimate(String(item.estimated_minutes))
      if (item.priority) setTodoPriority(item.priority)
    } catch { /* leave fields unchanged on failure */ }
    finally { setSaving('') }
  }
  const recommendLogEstimate = async () => {
    if (!logDraft.trim()) return
    setSaving('estimate-log')
    try {
      const result = await api.aiPreview(logDraft)
      const item = result.items?.[0]?.data || {}
      if (item.estimated_minutes) setLogEstimate(String(item.estimated_minutes))
      if (item.priority) setLogPriority(item.priority)
    } catch { /* leave fields unchanged on failure */ }
    finally { setSaving('') }
  }
  const exportTodos = () => {
    const csv = `﻿${todosToCsv(shownTodos)}`, blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = todoCsvFilename(now.toLocaleDateString('en-CA')); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const exportTodosIcs = () => {
    const ics = todosToIcs(shownTodos), blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = todoIcsFilename(now.toLocaleDateString('en-CA')); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const printTodosReport = () => {
    const html = todosToPrintableReport(shownTodos), win = window.open('', '_blank')
    if (!win) return
    win.document.open();win.document.write(html);win.document.close();win.document.title=todoReportFilename(now.toLocaleDateString('en-CA'));win.focus();win.print()
  }
  const importTodosCsv = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !onImportTodos) return
    const text = await file.text(), { todos: parsed, errors } = parseTodosCsv(text)
    if (!parsed.length) { notify?.(errors.length ? errors.join('\n') : '가져올 항목이 없습니다.', 'error'); return }
    await onImportTodos(parsed, errors)
  }
  const importTodosIcs = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !onImportTodos) return
    const parsed = icsToTodos(await file.text())
    if (!parsed.length) { notify?.('가져올 항목이 없습니다.', 'error'); return }
    await onImportTodos(parsed, [])
  }
  const toggleTodoSelected = id => setSelectedTodoIds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const clearSelectedTodos = () => setSelectedTodoIds(new Set())
  const allShownTodoIds = useMemo(() => shownTodos.map(t => t.id), [shownTodos])
  const allShownTodosSelected = allIdsSelected(allShownTodoIds, selectedTodoIds)
  const toggleSelectAllTodos = () => setSelectedTodoIds(toggleSelectAllIds(allShownTodoIds, selectedTodoIds))
  const bulkCompleteTodos = async () => { if (await onBulkCompleteTodo([...selectedTodoIds])) clearSelectedTodos() }
  const bulkDeleteTodos = () => { onBulkDeleteTodo([...selectedTodoIds]); clearSelectedTodos() }
  const bulkAddTagTodos = async () => { const tag = bulkTodoTag.trim(); if (!tag) return; if (await onBulkAddTagTodo([...selectedTodoIds], tag)) setBulkTodoTag('') }
  const bulkPostponeTodos = async () => { const days = Number(bulkTodoPostponeDays); if (!days) return; const ok = await onBulkPostponeTodo([...selectedTodoIds], days); if (ok) clearSelectedTodos() }
  const bulkChangeTodoPriority = async () => { await onBulkPriorityTodo([...selectedTodoIds], bulkTodoPriority); clearSelectedTodos() }
  const bulkChangeTodoColor = async () => { await onBulkColorTodo([...selectedTodoIds], bulkTodoColor); clearSelectedTodos() }
  const bulkDuplicateTodos = () => { onBulkDuplicateTodo([...selectedTodoIds]); clearSelectedTodos() }
  const bulkArchiveTodos = async () => { await onBulkArchiveTodo([...selectedTodoIds]); clearSelectedTodos() }
  const toggleLogSelected = id => setSelectedLogIds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
  const clearSelectedLogs = () => setSelectedLogIds(new Set())
  const allShownLogIds = useMemo(() => shownLogs.map(l => l.id), [shownLogs])
  const allShownLogsSelected = allIdsSelected(allShownLogIds, selectedLogIds)
  const toggleSelectAllLogs = () => setSelectedLogIds(toggleSelectAllIds(allShownLogIds, selectedLogIds))
  const bulkDeleteLogs = () => { onBulkDeleteLog([...selectedLogIds]); clearSelectedLogs() }
  const bulkAddTagLogs = async () => { const tag = bulkLogTag.trim(); if (!tag) return; if (await onBulkAddTagLog([...selectedLogIds], tag)) setBulkLogTag('') }
  const bulkPostponeLogs = async () => { const days = Number(bulkLogPostponeDays); if (!days) return; const ok = await onBulkPostponeLog([...selectedLogIds], days); if (ok) clearSelectedLogs() }
  const bulkDuplicateLogs = () => { onBulkDuplicateLog([...selectedLogIds]); clearSelectedLogs() }
  const bulkArchiveLogs = async () => { await onBulkArchiveLog([...selectedLogIds]); clearSelectedLogs() }
  const bulkChangeLogPriority = async () => { await onBulkPriorityLog([...selectedLogIds], bulkLogPriority); clearSelectedLogs() }
  const bulkChangeLogColor = async () => { await onBulkColorLog([...selectedLogIds], bulkLogColor); clearSelectedLogs() }
  const bulkChangeLogBillable = async () => { await onBulkBillableLog([...selectedLogIds], bulkLogBillable === 'billable'); clearSelectedLogs() }
  const exportLogsIcs = () => {
    const ics = logsToIcs(shownLogs), blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = logIcsFilename(now.toLocaleDateString('en-CA')); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const exportLogs = () => {
    const csv = `﻿${workLogsToCsv(shownLogs, taskTitle, billingHourlyRate)}`, blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = workLogCsvFilename(now.toLocaleDateString('en-CA')); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  const printLogsReport = () => {
    const html = workLogsToPrintableReport(shownLogs, taskTitle, billingHourlyRate), win = window.open('', '_blank')
    if (!win) return
    win.document.open();win.document.write(html);win.document.close();win.document.title=workLogReportFilename(now.toLocaleDateString('en-CA'));win.focus();win.print()
  }
  const importLogsCsv = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !onImportLogs) return
    const text = await file.text(), { logs: parsed, errors } = parseWorkLogsCsv(text)
    if (!parsed.length) { notify?.(errors.length ? errors.join('\n') : '가져올 항목이 없습니다.', 'error'); return }
    await onImportLogs(parsed, errors)
  }
  const importLogsIcs = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !onImportLogs) return
    const parsed = icsToLogs(await file.text())
    if (!parsed.length) { notify?.('가져올 항목이 없습니다.', 'error'); return }
    await onImportLogs(parsed, [])
  }
  return <>
    <Header title="오늘" subtitle={`${dateText} · 중요한 일에 집중해 보세요.`}/>
    <div className="content today-grid">
      <section className="focus-panel">
        <div className="section-title"><div><h2>오늘 할 일</h2><p>오늘 예정 업무와 빠른 Todo를 함께 확인합니다.</p></div>{loading ? <span className="status-pill">동기화 중…</span> : null}</div>
        <input className="search" type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { setQuery(''); event.target.blur() } }} aria-label="할 일/기록 검색" placeholder="할 일, 업무 기록 검색"/>
        <TagFilter tags={allTags} selected={selectedTags} onChange={setSelectedTags}/>
        <select aria-label="Todo 우선순위 필터" value={todoPriorityFilter} onChange={event => setTodoPriorityFilter(event.target.value)}><option value="all">모든 우선순위</option><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select>
        <label className="select-all-shown"><input type="checkbox" checked={hideCompletedTodos} onChange={event => setHideCompletedTodos(event.target.checked)}/>완료 항목 숨기기</label>
        <select aria-label="Todo 정렬" value={todoSort} onChange={event => setTodoSort(event.target.value)}><option value="priority">우선순위순</option><option value="title">제목순</option><option value="time">시간순</option><option value="manual">직접 정렬</option></select>
        <div className="filter-preset-bar">{todoFilterPresets.length ? <select aria-label="저장된 필터" defaultValue="" onChange={e => { applyTodoFilterPreset(e.target.value); e.target.value = '' }}><option value="" disabled>필터 선택</option>{todoFilterPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}<button type="button" className="text-button" onClick={saveTodoFilterPreset}>필터 저장</button>{todoFilterPresets.length ? <button type="button" className="text-button" onClick={deleteTodoFilterPreset}>필터 삭제</button> : null}{todoFiltersActive ? <button type="button" className="text-button" onClick={resetTodoFilters}>필터 초기화</button> : null}</div>
        <form className="quick-entry" onSubmit={submitTodo}>
          <div className="task-template-bar"><label>Todo 템플릿<select onChange={e => { applyTemplate(e.target.value); e.target.value = '' }} defaultValue=""><option value="" disabled>템플릿 선택</option>{todoTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button type="button" className="text-button" onClick={saveTodoTemplate}>템플릿으로 저장</button>{todoTemplates.length ? <button type="button" className="text-button" onClick={deleteTodoTemplate}>템플릿 삭제</button> : null}</div>
          <div className="quick-add"><Plus/><input value={todoDraft} onChange={event => setTodoDraft(event.target.value)} aria-label="오늘 Todo" placeholder="오늘 꼭 할 일을 추가하세요" maxLength={500} className={todoFieldErrors.title ? 'invalid' : ''} aria-invalid={todoFieldErrors.title ? 'true' : 'false'}/>{todoFieldErrors.title ? <small className="field-error" role="alert">{todoFieldErrors.title}</small> : null}<select aria-label="우선순위" value={todoPriority} onChange={event => setTodoPriority(event.target.value)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select><select aria-label="반복" value={todoRecurrence} onChange={event => setTodoRecurrence(event.target.value)}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option><option value="biweekly">격주</option><option value="monthly">매월</option><option value="yearly">매년</option></select>{todoRecurrence ? <input type="date" aria-label="반복 종료일" className={todoFieldErrors.recurrence_end_date ? 'invalid' : ''} aria-invalid={todoFieldErrors.recurrence_end_date ? 'true' : 'false'} value={todoRecurrenceEnd} onChange={event => setTodoRecurrenceEnd(event.target.value)}/> : null}{todoFieldErrors.recurrence_end_date ? <small className="field-error" role="alert">{todoFieldErrors.recurrence_end_date}</small> : null}<input type="time" aria-label="시간" value={todoTime} onChange={event => setTodoTime(event.target.value)}/><button disabled={saving === 'todo'}>추가</button></div>
          {overlappingNewTodo.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 시간대에 이미 할 일이 있습니다: {overlappingNewTodo.map(t => t.title).join(', ')}</p> : null}
          <input className="link-input" type="url" value={todoLink} onChange={event => setTodoLink(event.target.value)} aria-label="관련 링크" placeholder="관련 링크 (https://...)"/>
          <input className="log-minutes" type="number" min="0" step="5" value={todoEstimate} onChange={event => setTodoEstimate(event.target.value)} aria-label="예상 소요 시간(분)" placeholder="예상 소요 시간(분)"/>
          <div className="checklist-editor"><span className="dependency-picker-label">체크리스트{todoChecklist.length ? ` (${todoChecklist.filter(i => i.done).length}/${todoChecklist.length})` : ''}</span>{todoChecklist.map((item, index) => <div key={item.id} className="checklist-editor-item"><button type="button" className="text-button" onClick={() => toggleTodoChecklistItem(item.id)} aria-label={`${item.text} 완료 상태 변경`}>{item.done ? <Check aria-hidden="true"/> : <Square aria-hidden="true"/>}</button><span className={item.done ? 'checklist-done-text' : ''}>{item.text}</span><button type="button" className="text-button" disabled={index === 0} onClick={() => shiftTodoChecklistItem(item.id, 'up')} aria-label="위로 이동">▲</button><button type="button" className="text-button" disabled={index === todoChecklist.length - 1} onClick={() => shiftTodoChecklistItem(item.id, 'down')} aria-label="아래로 이동">▼</button><button type="button" className="text-button" onClick={() => removeTodoChecklistItem(item.id)}>삭제</button></div>)}<div className="checklist-editor-add"><input type="text" value={todoChecklistText} placeholder="세부 항목 추가" onChange={e => setTodoChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTodoChecklistItem() } }}/><button type="button" className="text-button" onClick={addTodoChecklistItem}>추가</button></div></div>
          <input className="link-input" value={todoMemo} onChange={event => setTodoMemo(event.target.value)} aria-label="메모" placeholder="메모 (선택)"/>
          <select aria-label="색상" value={todoColor} onChange={event => setTodoColor(event.target.value)}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          <TagsInput label="Todo 태그" value={todoTags} onChange={setTodoTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags('todo-new', 'todo', todoDraft)}>AI 태그 추천</button>{recommendationButtons('todo-new', todoTags, setTodoTags)}<button type="button" className="text-button" disabled={saving === 'estimate-todo'} onClick={recommendTodoEstimate}>AI 우선순위·예상시간 추천</button></div>
        </form>
        {completedTodos.length ? <button type="button" className="text-button" onClick={() => onClearCompletedTodos(completedTodos.map(todo => todo.id))}>완료된 항목 정리 ({completedTodos.length})</button> : null}
        {shownTodos.length ? <button type="button" className="text-button" onClick={printTodosReport}><FileText size={14}/> PDF</button> : null}
        {shownTodos.length ? <button type="button" className="text-button" onClick={exportTodos}><Download size={14}/> CSV 내보내기</button> : null}
        {shownTodos.length ? <button type="button" className="text-button" onClick={exportTodosIcs}><Download size={14}/> ICS</button> : null}
        {onImportTodos ? <><button type="button" className="text-button" onClick={() => todoImportInputRef.current?.click()}><Upload size={14}/> CSV 가져오기</button><input ref={todoImportInputRef} type="file" accept=".csv,text/csv" hidden onChange={importTodosCsv}/><button type="button" className="text-button" onClick={() => todoIcsImportInputRef.current?.click()}><Upload size={14}/> ICS 가져오기</button><input ref={todoIcsImportInputRef} type="file" accept=".ics,text/calendar" hidden onChange={importTodosIcs}/></> : null}
        {overdueTodos.length ? <div className="carryover-banner"><span>지난 할 일 {overdueTodos.length}개가 남아 있습니다.</span><button type="button" className="text-button" onClick={() => onCarryOverTodos(overdueTodos.map(todo => todo.id))}>오늘로 이월</button></div> : null}
        {shownTodos.length > 1 ? <label className="select-all-shown"><input type="checkbox" aria-label="할 일 전체 선택" checked={allShownTodosSelected} onChange={toggleSelectAllTodos}/>전체 선택</label> : null}
        {selectedTodoIds.size ? <div className="bulk-action-bar" role="toolbar" aria-label="선택 할 일 일괄 작업"><span>{selectedTodoIds.size}개 선택됨</span><button type="button" className="secondary" onClick={bulkCompleteTodos}><CheckCircle2 size={16}/>완료 처리</button><form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkAddTagTodos() }}><Tag size={14}/><input aria-label="추가할 태그" value={bulkTodoTag} onChange={e => setBulkTodoTag(e.target.value)} placeholder="태그 추가"/><button type="submit" className="secondary" disabled={!bulkTodoTag.trim()}>추가</button></form>{onBulkPostponeTodo ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkPostponeTodos() }}><CalendarClock size={14}/><input aria-label="연기할 일수" type="number" min="1" value={bulkTodoPostponeDays} onChange={e => setBulkTodoPostponeDays(e.target.value)} style={{ width: '3.5rem' }}/><button type="submit" className="secondary" disabled={!Number(bulkTodoPostponeDays)}>연기</button></form> : null}{onBulkPriorityTodo ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkChangeTodoPriority() }}><Flag size={14}/><select aria-label="변경할 우선순위" value={bulkTodoPriority} onChange={e => setBulkTodoPriority(e.target.value)}><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select><button type="submit" className="secondary">우선순위 변경</button></form> : null}{onBulkColorTodo ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkChangeTodoColor() }}><Palette size={14}/><select aria-label="변경할 색상" value={bulkTodoColor} onChange={e => setBulkTodoColor(e.target.value)}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><button type="submit" className="secondary">색상 변경</button></form> : null}{onBulkDuplicateTodo ? <button type="button" className="secondary" onClick={bulkDuplicateTodos}><Copy size={16}/>복제</button> : null}{onBulkArchiveTodo ? <button type="button" className="secondary" onClick={bulkArchiveTodos}><Archive size={16}/>보관</button> : null}<button type="button" className="danger-button" onClick={bulkDeleteTodos}>삭제</button><button type="button" className="text-button" onClick={clearSelectedTodos}>선택 해제</button></div> : null}
        {shownTodos.length ? <div className="todo-list">{shownTodos.map(todo => <div className={`todo-row ${todo.completed ? 'completed' : ''} ${todo.priority === 'high' ? 'priority-high' : ''} ${selectedTodoIds.has(todo.id) ? 'row-selected' : ''}`} style={eventColorHex(todo.color) ? { borderLeft: `3px solid ${eventColorHex(todo.color)}` } : undefined} key={todo.id} onKeyDown={editable('todo', todo) ? editKeyDown(todo) : undefined} draggable={todoSort === 'manual'} onDragStart={() => setDraggedTodoId(todo.id)} onDragOver={event => todoSort === 'manual' && event.preventDefault()} onDrop={event => { event.preventDefault(); dropTodoOn(todo.id) }}>
          <input type="checkbox" className="row-select" aria-label={`${todo.title} 선택`} checked={selectedTodoIds.has(todo.id)} onChange={() => toggleTodoSelected(todo.id)}/>
          <button className="todo-check" aria-label={`${todo.title} 완료 상태 변경`} onClick={() => onToggleTodo(todo)}>{todo.completed ? <Check/> : <Circle/>}</button>
          <div>{editable('todo', todo) ? <><input className="inline-edit" value={editText} maxLength={500} onChange={event => setEditText(event.target.value)}/><select aria-label="우선순위" value={editPriority} onChange={event => setEditPriority(event.target.value)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select><select aria-label="반복" value={editRecurrence} onChange={event => setEditRecurrence(event.target.value)}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option><option value="biweekly">격주</option><option value="monthly">매월</option><option value="yearly">매년</option></select>{editRecurrence ? <input type="date" aria-label="반복 종료일" className={editRecurrenceEndError ? 'invalid' : ''} aria-invalid={editRecurrenceEndError ? 'true' : 'false'} value={editRecurrenceEnd} onChange={event => setEditRecurrenceEnd(event.target.value)}/> : null}{editRecurrenceEndError ? <small className="field-error" role="alert">{editRecurrenceEndError}</small> : null}<input type="time" aria-label="시간" value={editTodoTime} onChange={event => setEditTodoTime(event.target.value)}/>{overlappingEditTodo.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 시간대에 이미 할 일이 있습니다: {overlappingEditTodo.map(t => t.title).join(', ')}</p> : null}<input className="link-input" type="url" value={editLink} onChange={event => setEditLink(event.target.value)} aria-label="관련 링크" placeholder="관련 링크 (https://...)"/><input className="log-minutes" type="number" min="0" step="5" value={editTodoEstimate} onChange={event => setEditTodoEstimate(event.target.value)} aria-label="예상 소요 시간(분)" placeholder="예상 소요 시간(분)"/><div className="checklist-editor"><span className="dependency-picker-label">첨부 링크{editTodoLinks.length ? ` (${editTodoLinks.length})` : ''}</span>{editTodoLinks.map(item => <div key={item.id} className="checklist-editor-item"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label || item.url}</a><button type="button" className="text-button" onClick={() => removeEditTodoLink(item.id)}>삭제</button></div>)}<div className="checklist-editor-add"><input type="url" value={editTodoLinkUrlText} placeholder="https://..." onChange={e => setEditTodoLinkUrlText(e.target.value)}/><input type="text" value={editTodoLinkLabelText} placeholder="이름 (선택)" onChange={e => setEditTodoLinkLabelText(e.target.value)}/><button type="button" className="text-button" onClick={addEditTodoLink}>추가</button></div></div><div className="checklist-editor"><span className="dependency-picker-label">체크리스트{editTodoChecklist.length ? ` (${editTodoChecklist.filter(i => i.done).length}/${editTodoChecklist.length})` : ''}</span>{editTodoChecklist.map((item, index) => <div key={item.id} className="checklist-editor-item"><button type="button" className="text-button" onClick={() => toggleEditTodoChecklistItem(item.id)} aria-label={`${item.text} 완료 상태 변경`}>{item.done ? <Check aria-hidden="true"/> : <Square aria-hidden="true"/>}</button><span className={item.done ? 'checklist-done-text' : ''}>{item.text}</span><button type="button" className="text-button" disabled={index === 0} onClick={() => shiftEditTodoChecklistItem(item.id, 'up')} aria-label="위로 이동">▲</button><button type="button" className="text-button" disabled={index === editTodoChecklist.length - 1} onClick={() => shiftEditTodoChecklistItem(item.id, 'down')} aria-label="아래로 이동">▼</button><button type="button" className="text-button" onClick={() => removeEditTodoChecklistItem(item.id)}>삭제</button></div>)}<div className="checklist-editor-add"><input type="text" value={editTodoChecklistText} placeholder="세부 항목 추가" onChange={e => setEditTodoChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditTodoChecklistItem() } }}/><button type="button" className="text-button" onClick={addEditTodoChecklistItem}>추가</button></div></div><input className="link-input" value={editMemo} onChange={event => setEditMemo(event.target.value)} aria-label="메모" placeholder="메모 (선택)"/><select aria-label="색상" value={editColor} onChange={event => setEditColor(event.target.value)}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><TagsInput value={editTags} onChange={setEditTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags(`todo-${todo.id}`, 'todo', editText)}>AI 태그 추천</button>{recommendationButtons(`todo-${todo.id}`, editTags, setEditTags)}</div><TodoAttachments todoId={todo.id}/><TodoComments todoId={todo.id}/></> :<><span>{todo.title}</span>{pinnedTodoIds.has(todo.id) ? <Star className="task-pinned-icon" aria-hidden="true"/> : null}{todo.todo_time ? <small className="log-task-link"><Clock3 aria-hidden="true"/>{todo.todo_time}</small> : null}{todo.priority === 'high' ? <small className="log-task-link">우선순위 높음</small> : null}{todo.recurrence_rule ? <small className="log-task-link">{todoRecurrenceLabels[todo.recurrence_rule]} 반복{todo.recurrence_end_date ? ` (${todo.recurrence_end_date}까지)` : ''}</small> : null}{todo.link_url ? <a className="task-link" href={todo.link_url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} aria-label={`${todo.title} 관련 링크 열기`}><ExternalLink aria-hidden="true"/>관련 링크</a> : null}{todo.links?.length ? <small className="log-task-link"><ExternalLink aria-hidden="true"/>첨부 링크 {todo.links.length}개</small> : null}{todo.checklist?.length ? <small className="checklist-progress">체크리스트 {todo.checklist.filter(i => i.done).length}/{todo.checklist.length}</small> : null}{todo.estimated_minutes ? <small className="task-estimate">예상 {formatDuration(todo.estimated_minutes)}</small> : null}{todo.comment_count ? <small className="log-task-link">댓글 {todo.comment_count}개</small> : null}{todo.attachment_count ? <small className="log-task-link"><Paperclip aria-hidden="true"/>첨부파일 {todo.attachment_count}개</small> : null}{todo.memo ? <small className="log-task-link" title={todo.memo}>{todo.memo}</small> : null}<TagChips tags={todo.tags}/></>}</div>
          <span className="row-actions">{editable('todo', todo) ? <><button aria-label="수정 취소" onClick={() => setEdit(null)}><X/></button><button aria-label="수정 저장" disabled={saving === `todo-${todo.id}`} onClick={() => saveEdit(todo)}><Check/></button></> : <><button className="row-edit-btn" aria-label={`${todo.title} 수정`} onClick={() => beginEdit('todo', todo)} onKeyDown={rowKeyDown}><Pencil/></button><button className={`task-pin${pinnedTodoIds.has(todo.id) ? ' pinned' : ''}`} aria-label={`${todo.title} ${pinnedTodoIds.has(todo.id) ? '고정 해제' : '고정'}`} title={pinnedTodoIds.has(todo.id) ? '고정 해제' : '목록 상단 고정'} onClick={() => togglePin(todo)}><Star/></button><button aria-label={`${todo.title} 복제`} onClick={() => onDuplicateTodo(todo)}><Copy/></button>{onPostponeTodo && !todo.completed ? <button aria-label={`${todo.title} 하루 미루기`} title="하루 미루기" onClick={() => onPostponeTodo(todo)}><CalendarClock/></button> : null}<button aria-label={`${todo.title} 업무로 전환`} title="업무로 전환" onClick={() => onPromoteTodo(todo)}><ArrowUpRight/></button>{onArchiveTodo ? <button aria-label={`${todo.title} 보관`} title="보관" onClick={() => onArchiveTodo(todo)}><Archive/></button> : null}{onViewHistoryTodo ? <button aria-label={`${todo.title} 변경 이력 보기`} title="변경 이력 보기" onClick={() => onViewHistoryTodo(todo)}><History/></button> : null}{todo.recurrence_rule && !todo.completed ? <button aria-label={`${todo.title} 다음 회차로 건너뛰기`} title="다음 회차로 건너뛰기" onClick={() => onSkipTodoRecurrence(todo)}><SkipForward/></button> : null}</>}<button className="danger-icon" aria-label={`${todo.title} 삭제`} onClick={() => onDeleteTodo(todo)}><Trash2/></button></span>
        </div>)}</div> : <p className="empty-state">조건에 맞는 할 일이 없습니다.</p>}
        <div className="section-divider"><span>오늘 예정 업무</span><b>{active.length}</b></div>
        <div className="task-list">{active.map(task => <div className="task-row" key={task.id}><button className="task-check" aria-label={`${task.title} 완료 상태 변경`} onClick={() => onToggleTask(task)}><Circle/></button>{onOpenTask ? <button type="button" className="task-main task-main-open" aria-label={`${task.title} 수정`} onClick={() => onOpenTask(task)}><strong>{task.title}</strong><small>{task.due_date || '기한 없음'}</small><TagChips tags={task.tags}/></button> : <span className="task-main"><strong>{task.title}</strong><small>{task.due_date || '기한 없음'}</small><TagChips tags={task.tags}/></span>}<span className="mini-progress"><i style={{ width: `${task.progress}%` }}/></span><b>{task.progress}%</b></div>)}</div>
      </section>
      <aside className="today-side">
        <section className="side-panel"><div className="section-title"><div><h2>오늘 일정</h2><p>{todayEvents.length}개의 일정</p></div><CalendarClock/></div>{todayEvents.map(event => <div className="event-row" key={event.id}><time>{event.google_is_all_day ? '종일' : new Date(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time><i/><div><strong>{event.title}</strong><small>{event.location || '일정'}</small><TagChips tags={event.tags}/></div></div>)}</section>
        <button className="ai-card" onClick={goAI}><Sparkles/><div><strong>AI에게 오늘 할 일 추천받기</strong><p>진행 상황을 분석합니다.</p></div><ChevronRight/></button>
      </aside>
      <section className="log-panel">
        <div className="section-title"><div><h2>오늘 한 일</h2><p>작은 성과도 기록해 두세요.</p></div><Clock3/></div>
        <select aria-label="청구 가능 필터" value={logBillableFilter} onChange={event => setLogBillableFilter(event.target.value)}><option value="all">전체</option><option value="billable">청구 가능</option><option value="non-billable">청구 불가</option></select>
        <select aria-label="업무 기록 우선순위 필터" value={logPriorityFilter} onChange={event => setLogPriorityFilter(event.target.value)}><option value="all">모든 우선순위</option><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select>
        <select aria-label="업무 기록 정렬" value={logSort} onChange={event => setLogSort(event.target.value)}><option value="none">기본순</option><option value="time">시각순</option><option value="duration">소요 시간순</option><option value="content">내용순</option><option value="priority">우선순위순</option><option value="manual">직접 정렬</option></select>
        <div className="filter-preset-bar">{logFilterPresets.length ? <select aria-label="저장된 기록 필터" defaultValue="" onChange={e => { applyLogFilterPreset(e.target.value); e.target.value = '' }}><option value="" disabled>필터 선택</option>{logFilterPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}<button type="button" className="text-button" onClick={saveLogFilterPreset}>필터 저장</button>{logFilterPresets.length ? <button type="button" className="text-button" onClick={deleteLogFilterPreset}>필터 삭제</button> : null}{logFiltersActive ? <button type="button" className="text-button" onClick={resetLogFilters}>필터 초기화</button> : null}</div>
        {shownLogs.length ? <button type="button" className="text-button" onClick={printLogsReport}><FileText size={14}/> PDF</button> : null}
        {shownLogs.length ? <button type="button" className="text-button" onClick={exportLogsIcs}><Download size={14}/> ICS</button> : null}
        {shownLogs.length ? <button type="button" className="text-button" onClick={exportLogs}><Download size={14}/> CSV 내보내기</button> : null}
        {onImportLogs ? <><button type="button" className="text-button" onClick={() => logImportInputRef.current?.click()}><Upload size={14}/> CSV 가져오기</button><input ref={logImportInputRef} type="file" accept=".csv,text/csv" hidden onChange={importLogsCsv}/><button type="button" className="text-button" onClick={() => logIcsImportInputRef.current?.click()}><Upload size={14}/> ICS 가져오기</button><input ref={logIcsImportInputRef} type="file" accept=".ics,text/calendar" hidden onChange={importLogsIcs}/></> : null}
        {shownLogs.length > 1 ? <label className="select-all-shown"><input type="checkbox" aria-label="업무 기록 전체 선택" checked={allShownLogsSelected} onChange={toggleSelectAllLogs}/>전체 선택</label> : null}
        {selectedLogIds.size ? <div className="bulk-action-bar" role="toolbar" aria-label="선택 업무 기록 일괄 작업"><span>{selectedLogIds.size}개 선택됨</span><form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkAddTagLogs() }}><Tag size={14}/><input aria-label="추가할 태그" value={bulkLogTag} onChange={e => setBulkLogTag(e.target.value)} placeholder="태그 추가"/><button type="submit" className="secondary" disabled={!bulkLogTag.trim()}>추가</button></form>{onBulkPostponeLog ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkPostponeLogs() }}><CalendarClock size={14}/><input aria-label="연기할 일수" type="number" min="1" value={bulkLogPostponeDays} onChange={e => setBulkLogPostponeDays(e.target.value)} style={{ width: '3.5rem' }}/><button type="submit" className="secondary" disabled={!Number(bulkLogPostponeDays)}>연기</button></form> : null}{onBulkPriorityLog ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkChangeLogPriority() }}><Flag size={14}/><select aria-label="변경할 우선순위" value={bulkLogPriority} onChange={e => setBulkLogPriority(e.target.value)}><option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option></select><button type="submit" className="secondary">우선순위 변경</button></form> : null}{onBulkColorLog ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkChangeLogColor() }}><Palette size={14}/><select aria-label="변경할 색상" value={bulkLogColor} onChange={e => setBulkLogColor(e.target.value)}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><button type="submit" className="secondary">색상 변경</button></form> : null}{onBulkBillableLog ? <form className="bulk-tag-form" onSubmit={e => { e.preventDefault(); bulkChangeLogBillable() }}><DollarSign size={14}/><select aria-label="변경할 청구 여부" value={bulkLogBillable} onChange={e => setBulkLogBillable(e.target.value)}><option value="billable">청구 가능</option><option value="non-billable">청구 불가</option></select><button type="submit" className="secondary">청구 여부 변경</button></form> : null}{onBulkDuplicateLog ? <button type="button" className="secondary" onClick={bulkDuplicateLogs}><Copy size={16}/>복제</button> : null}{onBulkArchiveLog ? <button type="button" className="secondary" onClick={bulkArchiveLogs}><Archive size={16}/>보관</button> : null}<button type="button" className="danger-button" onClick={bulkDeleteLogs}>삭제</button><button type="button" className="text-button" onClick={clearSelectedLogs}>선택 해제</button></div> : null}
        <div className="worklog-timer">{timer ? <><span className={`worklog-timer-display${timer.pausedAt ? ' paused' : ''}`}>{formatTimerElapsed(timer, timerNow)}</span>{timer.pausedAt ? <button type="button" className="text-button" onClick={resumeTimer}><Play size={14}/> 재개</button> : <button type="button" className="text-button" onClick={pauseTimer}><Pause size={14}/> 일시정지</button>}<button type="button" className="text-button" onClick={stopTimer}><Square size={14}/> 타이머 중지</button></> : <button type="button" className="text-button" onClick={startTimer}><Play size={14}/> 타이머 시작</button>}</div>
        <div className="task-template-bar"><label>기록 템플릿<select onChange={e => { applyLogTpl(e.target.value); e.target.value = '' }} defaultValue=""><option value="" disabled>템플릿 선택</option>{logTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button type="button" className="text-button" onClick={saveLogTpl}>템플릿으로 저장</button>{logTemplates.length ? <button type="button" className="text-button" onClick={deleteLogTpl}>템플릿 삭제</button> : null}</div>
        <form className="quick-entry" onSubmit={submitLog}><div className="quick-add"><Plus/><input value={logDraft} onChange={event => setLogDraft(event.target.value)} aria-label="오늘 한 일" maxLength={20000} className={logFieldErrors.content ? 'invalid' : ''} aria-invalid={logFieldErrors.content ? 'true' : 'false'}/>{logFieldErrors.content ? <small className="field-error" role="alert">{logFieldErrors.content}</small> : null}<input className="log-minutes" type="number" min="0" max="1440" value={logMinutes} onChange={event => setLogMinutes(event.target.value)} aria-label="소요 시간(분)" placeholder="분"/><input className="log-minutes" type="number" min="0" step="5" value={logEstimate} onChange={event => setLogEstimate(event.target.value)} aria-label="예상 소요 시간(분)" placeholder="예상 소요 시간(분)"/><input type="time" aria-label="시각" value={logTime} onChange={event => setLogTime(event.target.value)}/><select aria-label="우선순위" value={logPriority} onChange={event => setLogPriority(event.target.value)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select><label className="log-billable"><input type="checkbox" checked={logBillable} onChange={event => setLogBillable(event.target.checked)}/>청구 가능</label><button disabled={saving === 'log'}>기록</button></div>{overlappingNewLog.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 시간대에 이미 기록이 있습니다: {overlappingNewLog.map(l => l.content).join(', ')}</p> : null}<select aria-label="연결 업무" value={logTaskId} onChange={e=>setLogTaskId(e.target.value)}><option value="">업무 연결 안 함</option>{linkableTasks.map(t=><option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}{linkableDoneTasks.length?<optgroup label="완료된 업무">{linkableDoneTasks.map(t=><option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}</optgroup>:null}</select><input className="link-input" type="url" value={logLink} onChange={event => setLogLink(event.target.value)} aria-label="관련 링크" placeholder="관련 링크 (https://...)"/><div className="checklist-editor"><span className="dependency-picker-label">첨부 링크{logLinks.length ? ` (${logLinks.length})` : ''}</span>{logLinks.map(item => <div key={item.id} className="checklist-editor-item"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label || item.url}</a><button type="button" className="text-button" onClick={() => removeLogLink(item.id)}>삭제</button></div>)}<div className="checklist-editor-add"><input type="url" value={logLinkUrlText} placeholder="https://..." onChange={e => setLogLinkUrlText(e.target.value)}/><input type="text" value={logLinkLabelText} placeholder="이름 (선택)" onChange={e => setLogLinkLabelText(e.target.value)}/><button type="button" className="text-button" onClick={addLogLink}>추가</button></div></div><select aria-label="색상" value={logColor} onChange={event => setLogColor(event.target.value)}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><TagsInput label="업무 기록 태그" value={logTags} onChange={setLogTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags('log-new', 'work_log', logDraft)}>AI 태그 추천</button>{recommendationButtons('log-new', logTags, setLogTags)}<button type="button" className="text-button" disabled={saving === 'estimate-log'} onClick={recommendLogEstimate}>AI 우선순위·예상시간 추천</button></div></form>
        {shownLogs.length ? <div className="done-notes">{shownLogs.map(log => {const logOverrun=taskEstimateOverrun(log.estimated_minutes,log.duration_minutes);return <div key={log.id} className={selectedLogIds.has(log.id) ? 'row-selected' : undefined} style={eventColorHex(log.color) ? { borderLeft: `3px solid ${eventColorHex(log.color)}` } : undefined} onKeyDown={editable('log', log) ? editKeyDown(log) : undefined} draggable={logSort === 'manual'} onDragStart={() => setDraggedLogId(log.id)} onDragOver={event => logSort === 'manual' && event.preventDefault()} onDrop={event => { event.preventDefault(); dropLogOn(log.id) }}><input type="checkbox" className="row-select" aria-label={`${log.content} 선택`} checked={selectedLogIds.has(log.id)} onChange={() => toggleLogSelected(log.id)}/><Check/><div>{editable('log', log) ? <><input className="inline-edit" value={editText} maxLength={20000} onChange={event => setEditText(event.target.value)}/><input className="log-minutes" type="number" min="0" max="1440" value={editMinutes} onChange={event => setEditMinutes(event.target.value)} aria-label="소요 시간(분)" placeholder="분"/><input className="log-minutes" type="number" min="0" step="5" value={editLogEstimate} onChange={event => setEditLogEstimate(event.target.value)} aria-label="예상 소요 시간(분)" placeholder="예상 소요 시간(분)"/><input type="time" aria-label="시각" value={editLogTime} onChange={event => setEditLogTime(event.target.value)}/><select aria-label="우선순위" value={editLogPriority} onChange={event => setEditLogPriority(event.target.value)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select><label className="log-billable"><input type="checkbox" checked={editLogBillable} onChange={event => setEditLogBillable(event.target.checked)}/>청구 가능</label>{overlappingEditLog.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 시간대에 이미 기록이 있습니다: {overlappingEditLog.map(l => l.content).join(', ')}</p> : null}<select aria-label="연결 업무" value={editTaskId} onChange={e=>setEditTaskId(e.target.value)}><option value="">업무 연결 안 함</option>{linkableTasks.map(t=><option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}{linkableDoneTasks.length?<optgroup label="완료된 업무">{linkableDoneTasks.map(t=><option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}</optgroup>:null}</select><input className="link-input" type="url" value={editLogLink} onChange={event => setEditLogLink(event.target.value)} aria-label="관련 링크" placeholder="관련 링크 (https://...)"/><div className="checklist-editor"><span className="dependency-picker-label">첨부 링크{editLogLinks.length ? ` (${editLogLinks.length})` : ''}</span>{editLogLinks.map(item => <div key={item.id} className="checklist-editor-item"><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label || item.url}</a><button type="button" className="text-button" onClick={() => removeEditLogLink(item.id)}>삭제</button></div>)}<div className="checklist-editor-add"><input type="url" value={editLogLinkUrlText} placeholder="https://..." onChange={e => setEditLogLinkUrlText(e.target.value)}/><input type="text" value={editLogLinkLabelText} placeholder="이름 (선택)" onChange={e => setEditLogLinkLabelText(e.target.value)}/><button type="button" className="text-button" onClick={addEditLogLink}>추가</button></div></div><select aria-label="색상" value={editLogColor} onChange={event => setEditLogColor(event.target.value)}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><div className="checklist-editor"><span className="dependency-picker-label">체크리스트{editLogChecklist.length ? ` (${editLogChecklist.filter(i => i.done).length}/${editLogChecklist.length})` : ''}</span>{editLogChecklist.map((item, index) => <div key={item.id} className="checklist-editor-item"><button type="button" className="text-button" onClick={() => toggleEditLogChecklistItem(item.id)} aria-label={`${item.text} 완료 상태 변경`}>{item.done ? <Check aria-hidden="true"/> : <Square aria-hidden="true"/>}</button><span className={item.done ? 'checklist-done-text' : ''}>{item.text}</span><button type="button" className="text-button" disabled={index === 0} onClick={() => shiftEditLogChecklistItem(item.id, 'up')} aria-label="위로 이동">▲</button><button type="button" className="text-button" disabled={index === editLogChecklist.length - 1} onClick={() => shiftEditLogChecklistItem(item.id, 'down')} aria-label="아래로 이동">▼</button><button type="button" className="text-button" onClick={() => removeEditLogChecklistItem(item.id)}>삭제</button></div>)}<div className="checklist-editor-add"><input type="text" value={editLogChecklistText} placeholder="세부 항목 추가" onChange={e => setEditLogChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditLogChecklistItem() } }}/><button type="button" className="text-button" onClick={addEditLogChecklistItem}>추가</button></div></div><TagsInput value={editTags} onChange={setEditTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags(`log-${log.id}`, 'work_log', editText)}>AI 태그 추천</button>{recommendationButtons(`log-${log.id}`, editTags, setEditTags)}</div><WorkLogAttachments logId={log.id}/><WorkLogComments logId={log.id}/></> : <><span>{log.content}</span>{pinnedLogIds.has(log.id) ? <Star className="task-pinned-icon" aria-hidden="true"/> : null}{log.log_time ? <small className="log-task-link"><Clock3 aria-hidden="true"/>{log.log_time}</small> : null}{log.priority === 'high' ? <small className="log-task-link">우선순위 높음</small> : null}{log.task_id&&taskTitle.has(log.task_id)?(onOpenTask?<button type="button" className="log-task-link" onClick={event=>{event.stopPropagation();onOpenTask(taskById.get(log.task_id))}}>#{log.task_id} {taskTitle.get(log.task_id)}</button>:<small className="log-task-link">#{log.task_id} {taskTitle.get(log.task_id)}</small>):null}{log.duration_minutes?<small className="log-task-link">{log.duration_minutes}분</small>:null}{log.estimated_minutes?<small className="task-estimate">예상 {formatDuration(log.estimated_minutes)}</small>:null}{logOverrun?.isOver?<small className="task-estimate-overrun">{formatDuration(logOverrun.overMinutes)} 초과</small>:null}{log.billable?<small className="log-task-link log-billable-badge">청구 가능</small>:null}{log.link_url ? <a className="task-link" href={log.link_url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} aria-label={`${log.content} 관련 링크 열기`}><ExternalLink aria-hidden="true"/>관련 링크</a> : null}{log.links?.length ? <small className="log-task-link"><ExternalLink aria-hidden="true"/>첨부 링크 {log.links.length}개</small> : null}{log.checklist?.length ? <small className="checklist-progress">체크리스트 {log.checklist.filter(i => i.done).length}/{log.checklist.length}</small> : null}{log.comment_count ? <small className="log-task-link">댓글 {log.comment_count}개</small> : null}{log.attachment_count ? <small className="log-task-link"><Paperclip aria-hidden="true"/>첨부파일 {log.attachment_count}개</small> : null}<TagChips tags={log.tags}/></>}</div><span className="row-actions">{editable('log', log) ? <><button aria-label="수정 취소" onClick={() => setEdit(null)}><X/></button><button aria-label="수정 저장" disabled={saving === `log-${log.id}`} onClick={() => saveEdit(log)}><Check/></button></> : <><button className="row-edit-btn" aria-label={`${log.content} 수정`} onClick={() => beginEdit('log', log)} onKeyDown={rowKeyDown}><Pencil/></button><button className={`task-pin${pinnedLogIds.has(log.id) ? ' pinned' : ''}`} aria-label={`${log.content} ${pinnedLogIds.has(log.id) ? '고정 해제' : '고정'}`} title={pinnedLogIds.has(log.id) ? '고정 해제' : '목록 상단 고정'} onClick={() => togglePinLog(log)}><Star/></button><button aria-label={`${log.content} 복제`} onClick={() => onDuplicateLog(log)}><Copy/></button>{onPostponeLog ? <button aria-label={`${log.content} 하루 미루기`} title="하루 미루기" onClick={() => onPostponeLog(log)}><CalendarClock/></button> : null}<button aria-label={`${log.content} 업무로 전환`} title="업무로 전환" onClick={() => onPromoteLog(log)}><ArrowUpRight/></button>{onArchiveLog ? <button aria-label={`${log.content} 보관`} title="보관" onClick={() => onArchiveLog(log)}><Archive/></button> : null}{onViewHistoryLog ? <button aria-label={`${log.content} 변경 이력 보기`} title="변경 이력 보기" onClick={() => onViewHistoryLog(log)}><History/></button> : null}</>}<button className="danger-icon" aria-label={`${log.content} 삭제`} onClick={() => onDeleteLog(log)}><Trash2/></button></span></div>})}</div> : <p className="empty-state">조건에 맞는 기록이 없습니다.</p>}
      </section>
    </div>
  </>
}
