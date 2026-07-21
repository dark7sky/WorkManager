import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../api'
import { EVENT_COLORS } from '../eventColors'
import { buildTaskPayload, checklistProgress, clampedTaskProgress, initialTaskDateValue, moveChecklistItem } from '../taskFormPayload'
import { suppressStaleTaskDateErrors, validateTaskForm } from '../formValidation'
import { directDependentTasks, matchesDependencyFilter, taskDependencyOptions, taskParentOptions } from '../taskHierarchy'
import { addTaskTemplate, applyTaskTemplate, buildTaskTemplate, durationDaysBetween, loadTaskTemplates, removeTaskTemplate, saveTaskTemplates } from '../taskTemplates'
import { dropZoneHandlers } from '../fileDrop'
import { findOverlappingTasks } from '../taskOverlap'
import { findDuplicateTitleTasks } from '../taskDuplicateCheck'
import { nextRecurrenceDate } from '../recurrencePreview'
import TagsInput from './TagsInput'

export default function TaskForm({ task, tasks = [], onSave, onCancel, onDelete }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [tags, setTags] = useState(() => task?.tags || [])
  const [checklist, setChecklist] = useState(() => task?.checklist || [])
  const [links, setLinks] = useState(() => task?.links || [])
  const [customFields, setCustomFields] = useState(() => task?.custom_fields || [])
  const [customFieldLabelText, setCustomFieldLabelText] = useState('')
  const [customFieldValueText, setCustomFieldValueText] = useState('')
  const [recurrenceRule, setRecurrenceRule] = useState(() => task?.recurrence_rule || '')
  const [seriesItems, setSeriesItems] = useState(null)
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [checklistText, setChecklistText] = useState('')
  const [checklistDueText, setChecklistDueText] = useState('')
  const [linkUrlText, setLinkUrlText] = useState('')
  const [linkLabelText, setLinkLabelText] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [templates, setTemplates] = useState(() => loadTaskTemplates())
  const [prefill, setPrefill] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [attachmentError, setAttachmentError] = useState('')
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const attachmentInputRef = useRef(null)
  const formRef = useRef(null)
  const progressRef = useRef(null)
  const estimateRef = useRef(null)
  const priorityRef = useRef(null)
  const [aiEstimating, setAiEstimating] = useState(false)
  const [shareToken, setShareToken] = useState(() => task?.public_token || '')
  const [shareExpiresAt, setShareExpiresAt] = useState(() => task?.public_token_expires_at || '')
  const [shareExpiryDays, setShareExpiryDays] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const applyChecklistProgress = () => {
    const value = checklistProgress(checklist)
    if (value !== null && progressRef.current) progressRef.current.value = value
  }
  const today = new Date().toLocaleDateString('en-CA')
  const parentOptions = taskParentOptions(tasks, task?.id, task?.parent_id || null)
  const dependencyOptions = taskDependencyOptions(tasks, task?.id, (task?.dependency_ids || []).map(Number))
  const [dependencyFilter, setDependencyFilter] = useState('')
  const dependentTasks = directDependentTasks(tasks, task?.id)
  const [startDateVal, setStartDateVal] = useState(() => initialTaskDateValue(task, 'start_date', today))
  const [startTimeVal, setStartTimeVal] = useState(() => task?.start_time ?? '')
  const [dueDateVal, setDueDateVal] = useState(() => initialTaskDateValue(task, 'due_date', today))
  const [dueTimeVal, setDueTimeVal] = useState(() => task?.due_time ?? '')
  const [titleVal, setTitleVal] = useState(() => task?.title ?? '')
  const overlapping = useMemo(() => findOverlappingTasks(startDateVal, startTimeVal, dueDateVal, dueTimeVal, tasks, task?.id ?? null), [startDateVal, startTimeVal, dueDateVal, dueTimeVal, tasks, task])
  const duplicateTitled = useMemo(() => findDuplicateTitleTasks(titleVal, tasks, task?.id ?? null), [titleVal, tasks, task])

  const [prefillKey, setPrefillKey] = useState(0)
  const applyTemplate = id => {
    const template = templates.find(t => t.id === id)
    if (!template) return
    const filled = applyTaskTemplate(template, today)
    setPrefill(filled)
    setPrefillKey(k => k + 1)
    setTitleVal(filled.title ?? titleVal)
    setTags(filled.tags)
    setRecurrenceRule(filled.recurrence_rule || '')
    setChecklist(filled.checklist || [])
    setStartDateVal(filled.start_date ?? startDateVal)
    setStartTimeVal(filled.start_time ?? startTimeVal)
    setDueDateVal(filled.due_date ?? dueDateVal)
    setDueTimeVal(filled.due_time ?? dueTimeVal)
    setLinks(filled.links || [])
  }

  const saveAsTemplate = () => {
    const data = new FormData(formRef.current)
    const name = window.prompt('템플릿 이름을 입력하세요.', data.get('title') || '')
    if (!name) return
    const template = buildTaskTemplate({
      name,
      title: data.get('title'),
      priority: data.get('priority'),
      recurrence_rule: data.get('recurrence_rule'),
      tags,
      durationDays: durationDaysBetween(data.get('start_date'), data.get('due_date')),
      checklist,
      estimated_minutes: data.get('estimated_minutes'),
      color: data.get('color'),
      link_url: data.get('link_url'),
      links,
    })
    const next = addTaskTemplate(templates, template)
    setTemplates(next)
    saveTaskTemplates(next)
  }

  const deleteTemplate = id => {
    const next = removeTaskTemplate(templates, id)
    setTemplates(next)
    saveTaskTemplates(next)
  }

  useEffect(() => {
    setSaving(false)
    setError('')
    setFieldErrors({})
    setSuggestions([])
    setTags(task?.tags || [])
    setChecklist(task?.checklist || [])
    setChecklistText('')
    setEditingChecklistId(null)
    setLinks(task?.links || [])
    setLinkUrlText('')
    setLinkLabelText('')
    setCustomFields(task?.custom_fields || [])
    setCustomFieldLabelText('')
    setCustomFieldValueText('')
    setRecurrenceRule(task?.recurrence_rule || '')
    setStartDateVal(initialTaskDateValue(task, 'start_date', today))
    setStartTimeVal(task?.start_time ?? '')
    setDueDateVal(initialTaskDateValue(task, 'due_date', today))
    setDueTimeVal(task?.due_time ?? '')
  }, [task?.id, task?.tags, task?.checklist, task?.links, task?.custom_fields, task?.recurrence_rule])

  useEffect(() => {
    setComments([])
    setCommentText('')
    setCommentError('')
    if (!task?.id) return
    let cancelled = false
    api.taskComments(task.id).then(res => { if (!cancelled) setComments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [task?.id])

  useEffect(() => {
    setAttachments([])
    setAttachmentError('')
    if (!task?.id) return
    let cancelled = false
    api.taskAttachments(task.id).then(res => { if (!cancelled) setAttachments(res.items || []) }).catch(() => {})
    return () => { cancelled = true }
  }, [task?.id])

  const uploadAttachmentFile = async file => {
    if (!file) return
    setAttachmentError('')
    setUploadingAttachment(true)
    try {
      const item = await api.uploadTaskAttachment(task.id, file)
      setAttachments([...attachments, item])
    } catch (err) {
      setAttachmentError(err.message)
    } finally {
      setUploadingAttachment(false)
    }
  }
  const uploadAttachment = e => { const file = e.target.files?.[0]; e.target.value = ''; uploadAttachmentFile(file) }
  const removeAttachment = async id => {
    try {
      await api.deleteTaskAttachment(task.id, id)
      setAttachments(attachments.filter(a => a.id !== id))
    } catch (err) {
      setAttachmentError(err.message)
    }
  }
  const formatAttachmentSize = bytes => bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  const shareUrl = shareToken ? `${location.origin}/public/tasks/${shareToken}` : ''
  const createShareLink = async () => {
    setShareBusy(true); setShareCopied(false)
    try { const res = await api.shareTask(task.id, shareExpiryDays ? Number(shareExpiryDays) : undefined); setShareToken(res.public_token); setShareExpiresAt(res.public_token_expires_at || '') }
    catch (e) { setError(e.message) }
    finally { setShareBusy(false) }
  }
  const revokeShareLink = async () => {
    setShareBusy(true)
    try { await api.unshareTask(task.id); setShareToken(''); setShareCopied(false); setShareExpiresAt('') }
    catch (e) { setError(e.message) }
    finally { setShareBusy(false) }
  }
  const copyShareLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setShareCopied(true) } catch { /* clipboard unavailable */ }
  }

  const addComment = async () => {
    const body = commentText.trim()
    if (!body) return
    setCommentError('')
    try {
      const comment = await api.addTaskComment(task.id, body)
      setComments([...comments, comment])
      setCommentText('')
    } catch (e) {
      setCommentError(e.message)
    }
  }
  const removeComment = async id => {
    try {
      await api.deleteTaskComment(task.id, id)
      setComments(comments.filter(c => c.id !== id))
    } catch (e) {
      setCommentError(e.message)
    }
  }
  const beginEditComment = item => { setEditingCommentId(item.id); setEditingCommentText(item.body) }
  const saveEditComment = async id => {
    const body = editingCommentText.trim()
    setEditingCommentId(null)
    const original = comments.find(c => c.id === id)
    if (!body || !original || body === original.body) return
    try {
      const updated = await api.updateTaskComment(task.id, id, body)
      setComments(comments.map(c => c.id === id ? updated : c))
    } catch (e) {
      setCommentError(e.message)
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const addChecklistItem = () => {
    const text = checklistText.trim()
    if (!text) return
    const item = { id: `${Date.now()}`, text, done: false }
    if (checklistDueText) item.due = checklistDueText
    setChecklist([...checklist, item])
    setChecklistText('')
    setChecklistDueText('')
  }
  const toggleChecklistItem = id => setChecklist(checklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const removeChecklistItem = id => setChecklist(checklist.filter(item => item.id !== id))
  const shiftChecklistItem = (id, direction) => setChecklist(list => moveChecklistItem(list, id, direction))
  const setChecklistItemDue = (id, due) => setChecklist(checklist.map(item => item.id === id ? (due ? { ...item, due } : { ...item, due: undefined }) : item))
  const [editingChecklistId, setEditingChecklistId] = useState(null)
  const [editingChecklistText, setEditingChecklistText] = useState('')
  const beginEditChecklistItem = item => { setEditingChecklistId(item.id); setEditingChecklistText(item.text) }
  const saveEditChecklistItem = id => {
    const text = editingChecklistText.trim()
    if (text) setChecklist(checklist.map(item => item.id === id ? { ...item, text } : item))
    setEditingChecklistId(null)
  }

  const addLink = () => {
    const url = linkUrlText.trim()
    if (!/^https?:\/\//.test(url)) return
    setLinks([...links, { id: `${Date.now()}`, url, label: linkLabelText.trim() }])
    setLinkUrlText('')
    setLinkLabelText('')
  }
  const removeLink = id => setLinks(links.filter(item => item.id !== id))

  const addCustomField = () => {
    const label = customFieldLabelText.trim()
    if (!label) return
    setCustomFields([...customFields, { id: `${Date.now()}`, label, value: customFieldValueText.trim() }])
    setCustomFieldLabelText('')
    setCustomFieldValueText('')
  }
  const removeCustomField = id => setCustomFields(customFields.filter(item => item.id !== id))

  const recommend = async () => {
    const data = new FormData(formRef.current)
    setSaving(true)
    setError('')
    try {
      const result = await api.aiTagSuggestions({
        entity: 'task',
        title: data.get('title'),
        content: data.get('description'),
      })
      setSuggestions(result.tags || result.items || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const recommendEstimate = async () => {
    const data = new FormData(formRef.current)
    const title = data.get('title')
    if (!title) return
    setAiEstimating(true)
    setError('')
    try {
      const result = await api.aiPreview(`${title} ${data.get('description') || ''}`.trim())
      const item = result.items?.[0]?.data || {}
      if (item.estimated_minutes && estimateRef.current) estimateRef.current.value = item.estimated_minutes
      if (item.priority && priorityRef.current) priorityRef.current.value = item.priority
      if (!item.estimated_minutes && !item.priority) setError('예상 소요 시간/우선순위를 추정하지 못했습니다.')
    } catch (e) {
      setError(e.message)
    } finally {
      setAiEstimating(false)
    }
  }

  const loadSeries = async () => {
    if (seriesItems) { setSeriesItems(null); return }
    setSeriesLoading(true)
    try {
      const result = await api.taskSeries(task.id)
      setSeriesItems(result.items || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setSeriesLoading(false)
    }
  }

  const submit = async e => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData)
    data.dependency_ids = formData.getAll('dependency_ids')
    data.checklist = checklist
    data.links = links
    data.custom_fields = customFields
    const errors = suppressStaleTaskDateErrors(validateTaskForm(data), data, task)
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      setError(Object.values(errors)[0])
      return
    }
    setFieldErrors({})
    setSaving(true)
    setError('')
    const result = await onSave(buildTaskPayload(data, { tags, task }))
    const ok = typeof result === 'object' ? result.ok : result
    if (!ok) setError(result?.error || '저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.')
    setSaving(false)
  }

  return <form ref={formRef} className="form-grid" onSubmit={submit}>
    {!task ? <div className="span-2 task-template-bar">
      <label>업무 템플릿<select onChange={e => { applyTemplate(e.target.value); e.target.value = '' }} defaultValue=""><option value="" disabled>템플릿 선택</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {templates.length ? <button type="button" className="text-button" onClick={() => { const id = window.prompt('삭제할 템플릿 이름을 입력하세요.'); const match = templates.find(t => t.name === id); if (match) deleteTemplate(match.id) }}>템플릿 삭제</button> : null}
    </div> : null}
    <label className="span-2" key={`title-${prefillKey}`}>업무 제목<input name="title" required autoFocus maxLength={300} className={fieldErrors.title ? 'invalid' : ''} aria-invalid={fieldErrors.title ? 'true' : 'false'} defaultValue={prefill?.title ?? task?.title ?? ''} onChange={e => setTitleVal(e.target.value)}/>{fieldErrors.title ? <small className="field-error" role="alert">{fieldErrors.title}</small> : null}</label>
    {duplicateTitled.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 제목의 진행 중인 업무가 이미 있습니다: {duplicateTitled.map(t => t.title).join(', ')}</p> : null}
    <label key={`start-${prefillKey}`}>시작일<input name="start_date" type="date" defaultValue={prefill?.start_date ?? initialTaskDateValue(task, 'start_date', today)} onChange={e => setStartDateVal(e.target.value)}/></label>
    <label key={`start-time-${prefillKey}`}>시작 시각<input name="start_time" type="time" defaultValue={prefill?.start_time ?? task?.start_time ?? ''} onChange={e => setStartTimeVal(e.target.value)}/></label>
    <label key={`due-${prefillKey}`}>완료 예정일<input name="due_date" type="date" className={fieldErrors.due_date ? 'invalid' : ''} aria-invalid={fieldErrors.due_date ? 'true' : 'false'} defaultValue={prefill?.due_date ?? initialTaskDateValue(task, 'due_date', today)} onChange={e => setDueDateVal(e.target.value)}/>{fieldErrors.due_date ? <small className="field-error" role="alert">{fieldErrors.due_date}</small> : null}</label>
    <label key={`due-time-${prefillKey}`}>완료 예정 시각<input name="due_time" type="time" defaultValue={prefill?.due_time ?? task?.due_time ?? ''} onChange={e => setDueTimeVal(e.target.value)}/></label>
    {overlapping.length ? <p className="form-warning span-2" role="alert"><AlertTriangle size={14} aria-hidden="true"/> 같은 기간에 이미 업무가 있습니다: {overlapping.map(t => t.title).join(', ')}</p> : null}
    <label>상태<select name="status" defaultValue={task?.status === 'doing' ? 'in_progress' : task?.status || 'todo'}><option value="todo">할 일</option><option value="in_progress">진행 중</option><option value="done">완료</option></select></label>
    <label>진행률<input ref={progressRef} name="progress" type="number" min="0" max="100" defaultValue={clampedTaskProgress(task?.progress ?? 0)}/></label>
    <label key={`estimate-${prefillKey}`}>예상 소요 시간(분)<input ref={estimateRef} name="estimated_minutes" type="number" min="0" max="100000" step="1" placeholder="예: 120" defaultValue={prefill?.estimated_minutes ?? task?.estimated_minutes ?? ''}/></label>
    <label key={`reminder-${prefillKey}`}>마감 알림 시점(분 전)<input name="reminder_minutes_before" type="number" min="0" max="1440" step="1" placeholder="설정 안 함 시 기본값 사용" defaultValue={prefill?.reminder_minutes_before ?? task?.reminder_minutes_before ?? ''}/></label>
    <label className="span-2" key={`link-url-${prefillKey}`}>관련 링크<input name="link_url" type="url" placeholder="https://..." defaultValue={prefill?.link_url ?? task?.link_url ?? ''}/></label>
    <label key={`priority-${prefillKey}`}>우선순위<select ref={priorityRef} name="priority" defaultValue={prefill?.priority ?? task?.priority ?? 'normal'}><option value="normal">보통</option><option value="high">높음</option><option value="low">낮음</option></select></label>
    <div className="span-2"><button type="button" className="text-button" disabled={aiEstimating} onClick={recommendEstimate}>AI 우선순위·예상시간 추천</button></div>
    <label key={`color-${prefillKey}`}>색상<select name="color" defaultValue={prefill?.color ?? task?.color ?? ''}>{EVENT_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
    <label key={`recurrence-${prefillKey}`}>반복<select name="recurrence_rule" value={recurrenceRule} onChange={e => setRecurrenceRule(e.target.value)}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option><option value="biweekly">격주</option><option value="monthly">매월</option><option value="yearly">매년</option></select></label>
    {recurrenceRule ? <label key={`recurrence-end-${prefillKey}`}>반복 종료일<input name="recurrence_end_date" type="date" className={fieldErrors.recurrence_end_date ? 'invalid' : ''} aria-invalid={fieldErrors.recurrence_end_date ? 'true' : 'false'} defaultValue={task?.recurrence_end_date ?? ''}/>{fieldErrors.recurrence_end_date ? <small className="field-error" role="alert">{fieldErrors.recurrence_end_date}</small> : null}</label> : null}
    {recurrenceRule && nextRecurrenceDate(dueDateVal, recurrenceRule) ? <p className="span-2 muted">다음 회차 예정일: {nextRecurrenceDate(dueDateVal, recurrenceRule)}</p> : null}
    {task?.id && task.recurrence_rule ? <div className="span-2">
      <button type="button" className="text-button" disabled={seriesLoading} onClick={loadSeries}>{seriesItems ? '반복 이력 닫기' : '반복 이력 보기'}</button>
      {seriesItems ? (seriesItems.length > 1 ? <ul className="task-log-list">{seriesItems.map(item => <li key={item.id}><strong>{item.due_date || item.start_date || '기한 없음'}</strong><span>{item.title}</span><small>{item.status === 'done' ? '완료' : item.progress ? `진행 ${item.progress}%` : '미완료'}</small></li>)}</ul> : <p className="muted">아직 생성된 다른 회차가 없습니다.</p>) : null}
    </div> : null}
    <label className="span-2">상위 업무<select name="parent_id" defaultValue={task?.parent_id || ''}><option value="">최상위 업무</option>{parentOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <div className="span-2 dependency-picker"><span className="dependency-picker-label">선행 업무 (완료되어야 진행 가능)</span>{dependencyOptions.length > 5 ? <input className="dependency-picker-filter" type="text" value={dependencyFilter} onChange={e => setDependencyFilter(e.target.value)} placeholder="업무 검색" aria-label="선행 업무 검색"/> : null}{dependencyOptions.length ? <div className="dependency-picker-list">{dependencyOptions.map(option => <label key={option.id} className="dependency-picker-item" style={matchesDependencyFilter(option, dependencyFilter) ? undefined : { display: 'none' }}><input type="checkbox" name="dependency_ids" value={option.id} defaultChecked={(task?.dependency_ids || []).map(String).includes(String(option.id))}/>{option.label}</label>)}</div> : <p className="muted">선택할 수 있는 업무가 없습니다.</p>}</div>
    {task?.id && dependentTasks.length ? <div className="span-2 dependency-picker"><span className="dependency-picker-label">후속 업무 (이 업무가 끝나야 진행 가능)</span><div className="dependency-picker-list">{dependentTasks.map(t => <span key={t.id} className="dependency-picker-item">{t.title}</span>)}</div></div> : null}
    <div className="span-2 checklist-editor"><span className="dependency-picker-label">체크리스트{checklist.length ? ` (${checklist.filter(i => i.done).length}/${checklist.length})` : ''}</span>
      {checklist.map((item, index) => <div key={item.id} className="checklist-editor-item">
        <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)}/>
        {editingChecklistId === item.id
          ? <input type="text" className="inline-edit" autoFocus value={editingChecklistText} onChange={e => setEditingChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditChecklistItem(item.id) } if (e.key === 'Escape') setEditingChecklistId(null) }} onBlur={() => saveEditChecklistItem(item.id)}/>
          : <span className={item.done ? 'checklist-done-text' : (item.due && item.due < todayIso ? 'checklist-overdue-text' : '')} onClick={() => beginEditChecklistItem(item)}>{item.text}</span>}
        <input type="date" className="checklist-item-due" value={item.due || ''} onChange={e => setChecklistItemDue(item.id, e.target.value)} aria-label="세부 항목 기한"/>
        <button type="button" className="text-button" disabled={index === 0} onClick={() => shiftChecklistItem(item.id, 'up')} aria-label="위로 이동">▲</button>
        <button type="button" className="text-button" disabled={index === checklist.length - 1} onClick={() => shiftChecklistItem(item.id, 'down')} aria-label="아래로 이동">▼</button>
        <button type="button" className="text-button" onClick={() => removeChecklistItem(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="text" value={checklistText} placeholder="세부 항목 추가" onChange={e => setChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}/><input type="date" value={checklistDueText} onChange={e => setChecklistDueText(e.target.value)} aria-label="세부 항목 기한"/><button type="button" className="text-button" onClick={addChecklistItem}>추가</button></div>
      {checklist.length ? <button type="button" className="text-button" onClick={applyChecklistProgress}>체크리스트로 진행률 계산</button> : null}
    </div>
    <div className="span-2 checklist-editor"><span className="dependency-picker-label">첨부 링크{links.length ? ` (${links.length})` : ''}</span>
      {links.map(item => <div key={item.id} className="checklist-editor-item">
        <a href={item.url} target="_blank" rel="noopener noreferrer">{item.label || item.url}</a>
        <button type="button" className="text-button" onClick={() => removeLink(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="url" value={linkUrlText} placeholder="https://..." onChange={e => setLinkUrlText(e.target.value)}/><input type="text" value={linkLabelText} placeholder="이름 (선택)" onChange={e => setLinkLabelText(e.target.value)}/><button type="button" className="text-button" onClick={addLink}>추가</button></div>
    </div>
    <div className="span-2 checklist-editor"><span className="dependency-picker-label">사용자 정의 필드{customFields.length ? ` (${customFields.length})` : ''}</span>
      {customFields.map(item => <div key={item.id} className="checklist-editor-item">
        <span><strong>{item.label}</strong>{item.value ? `: ${item.value}` : ''}</span>
        <button type="button" className="text-button" onClick={() => removeCustomField(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="text" maxLength={100} value={customFieldLabelText} placeholder="필드 이름 (예: 고객사)" onChange={e => setCustomFieldLabelText(e.target.value)}/><input type="text" maxLength={500} value={customFieldValueText} placeholder="값" onChange={e => setCustomFieldValueText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomField() } }}/><button type="button" className="text-button" onClick={addCustomField}>추가</button></div>
    </div>
    {task?.id ? <div className="span-2 checklist-editor"><span className="dependency-picker-label">댓글{comments.length ? ` (${comments.length})` : ''}</span>
      {comments.map(item => <div key={item.id} className="checklist-editor-item">
        {editingCommentId === item.id
          ? <input type="text" className="inline-edit" autoFocus maxLength={2000} value={editingCommentText} onChange={e => setEditingCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditComment(item.id) } if (e.key === 'Escape') setEditingCommentId(null) }} onBlur={() => saveEditComment(item.id)}/>
          : <span onClick={() => beginEditComment(item)}>{item.body}<span className="muted"> · {new Date(item.created_at).toLocaleString('ko-KR')}{item.edited_at ? ' (수정됨)' : ''}</span></span>}
        <button type="button" className="text-button" onClick={() => removeComment(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="text" maxLength={2000} value={commentText} placeholder="댓글을 입력하세요" onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment() } }}/><button type="button" className="text-button" onClick={addComment}>등록</button></div>
      {commentError ? <p className="form-error" role="alert">{commentError}</p> : null}
    </div> : null}
    {task?.id ? <div className="span-2 checklist-editor"><span className="dependency-picker-label">공유 링크</span>
      {shareToken
        ? <div className="checklist-editor-add"><input type="text" readOnly value={shareUrl} onFocus={e => e.target.select()}/><button type="button" className="text-button" onClick={copyShareLink}>{shareCopied ? '복사됨' : '링크 복사'}</button><button type="button" className="text-button" disabled={shareBusy} onClick={revokeShareLink}>공유 해제</button></div>
        : <div className="checklist-editor-add"><select value={shareExpiryDays} onChange={e => setShareExpiryDays(e.target.value)} aria-label="공유 링크 만료 기간"><option value="">무제한</option><option value="7">7일 후 만료</option><option value="30">30일 후 만료</option><option value="90">90일 후 만료</option></select><button type="button" className="text-button" disabled={shareBusy} onClick={createShareLink}>{shareBusy ? '생성 중…' : '공유 링크 만들기'}</button></div>}
      {shareToken ? <p className="muted">{shareExpiresAt ? `${new Date(shareExpiresAt).toLocaleDateString('ko-KR')}에 만료됩니다.` : '만료 없이 유지됩니다.'}</p> : null}
      <p className="muted">공유 링크가 있으면 로그인 없이 누구나 이 업무를 읽기 전용으로 볼 수 있습니다.</p>
    </div> : null}
    {task?.id ? <div className="span-2 checklist-editor"><span className="dependency-picker-label">첨부파일{attachments.length ? ` (${attachments.length})` : ''}</span>
      {attachments.map(item => <div key={item.id} className="checklist-editor-item">
        {item.content_type?.startsWith('image/') ? <img className="attachment-thumb" src={api.taskAttachmentDownloadUrl(task.id, item.id)} alt=""/> : null}
        <a href={api.taskAttachmentDownloadUrl(task.id, item.id)} target="_blank" rel="noopener noreferrer">{item.filename}</a>
        <span className="muted"> {formatAttachmentSize(item.size_bytes)}</span>
        <button type="button" className="text-button" onClick={() => removeAttachment(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add file-dropzone" {...dropZoneHandlers(uploadAttachmentFile)}><input ref={attachmentInputRef} type="file" disabled={uploadingAttachment} onChange={uploadAttachment}/>{uploadingAttachment ? <span className="muted">업로드 중…</span> : <span className="muted">또는 파일을 끌어다 놓으세요</span>}</div>
      <p className="muted">파일당 최대 5MB, 업무당 최대 20개까지 첨부할 수 있습니다.</p>
      {attachmentError ? <p className="form-error" role="alert">{attachmentError}</p> : null}
    </div> : null}
    <div className="span-2"><TagsInput value={tags} onChange={setTags}/><div className="tag-recommend"><button type="button" className="text-button" disabled={saving} onClick={recommend}>AI 태그 추천</button>{suggestions.map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)}</div></div>
    <label className="span-2">메모<textarea name="description" rows="4" placeholder="담당자·협업자 등은 메모나 태그로 남겨두세요." defaultValue={task?.description || ''}/></label>
    {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    <div className="form-actions span-2">{task && onDelete ? <button type="button" className="danger-button" disabled={saving} onClick={onDelete}>휴지통으로 이동</button> : null}<button type="button" className="text-button" disabled={saving} onClick={saveAsTemplate}>템플릿으로 저장</button><span className="form-spacer"/><button type="button" className="secondary" disabled={saving} onClick={onCancel}>취소</button><button className="primary" disabled={saving}>{saving ? '처리 중…' : task ? '변경사항 저장' : '업무 등록'}</button></div>
  </form>
}
