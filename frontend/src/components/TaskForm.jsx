import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { buildTaskPayload, initialTaskDateValue } from '../taskFormPayload'
import { taskDependencyOptions, taskParentOptions } from '../taskHierarchy'
import { addTaskTemplate, applyTaskTemplate, buildTaskTemplate, durationDaysBetween, loadTaskTemplates, removeTaskTemplate, saveTaskTemplates } from '../taskTemplates'
import TagsInput from './TagsInput'

export default function TaskForm({ task, tasks = [], onSave, onCancel, onDelete }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tags, setTags] = useState(() => task?.tags || [])
  const [checklist, setChecklist] = useState(() => task?.checklist || [])
  const [checklistText, setChecklistText] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [templates, setTemplates] = useState(() => loadTaskTemplates())
  const [prefill, setPrefill] = useState(null)
  const formRef = useRef(null)
  const today = new Date().toLocaleDateString('en-CA')
  const parentOptions = taskParentOptions(tasks, task?.id)
  const dependencyOptions = taskDependencyOptions(tasks, task?.id)

  const [prefillKey, setPrefillKey] = useState(0)
  const applyTemplate = id => {
    const template = templates.find(t => t.id === id)
    if (!template) return
    const filled = applyTaskTemplate(template, today)
    setPrefill(filled)
    setPrefillKey(k => k + 1)
    setTags(filled.tags)
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
    setSuggestions([])
    setTags(task?.tags || [])
    setChecklist(task?.checklist || [])
    setChecklistText('')
    setEditingChecklistId(null)
  }, [task?.id, task?.tags, task?.checklist])

  const addChecklistItem = () => {
    const text = checklistText.trim()
    if (!text) return
    setChecklist([...checklist, { id: `${Date.now()}`, text, done: false }])
    setChecklistText('')
  }
  const toggleChecklistItem = id => setChecklist(checklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const removeChecklistItem = id => setChecklist(checklist.filter(item => item.id !== id))
  const [editingChecklistId, setEditingChecklistId] = useState(null)
  const [editingChecklistText, setEditingChecklistText] = useState('')
  const beginEditChecklistItem = item => { setEditingChecklistId(item.id); setEditingChecklistText(item.text) }
  const saveEditChecklistItem = id => {
    const text = editingChecklistText.trim()
    if (text) setChecklist(checklist.map(item => item.id === id ? { ...item, text } : item))
    setEditingChecklistId(null)
  }

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

  const submit = async e => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData)
    data.dependency_ids = formData.getAll('dependency_ids')
    data.checklist = checklist
    const startChanged = data.start_date !== (task?.start_date || '')
    const dueChanged = data.due_date !== (task?.due_date || '')
    if (data.start_date && data.due_date && data.due_date < data.start_date && (startChanged || dueChanged)) {
      setError('완료 예정일은 시작일보다 빠를 수 없습니다.')
      return
    }
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
    <label className="span-2" key={`title-${prefillKey}`}>업무 제목<input name="title" required autoFocus defaultValue={prefill?.title ?? task?.title ?? ''}/></label>
    <label key={`start-${prefillKey}`}>시작일<input name="start_date" type="date" defaultValue={prefill?.start_date ?? initialTaskDateValue(task, 'start_date', today)}/></label>
    <label key={`due-${prefillKey}`}>완료 예정일<input name="due_date" type="date" defaultValue={prefill?.due_date ?? initialTaskDateValue(task, 'due_date', today)}/></label>
    <label>상태<select name="status" defaultValue={task?.status === 'doing' ? 'in_progress' : task?.status || 'todo'}><option value="todo">할 일</option><option value="in_progress">진행 중</option><option value="done">완료</option></select></label>
    <label>진행률<input name="progress" type="number" min="0" max="100" defaultValue={task?.progress ?? 0}/></label>
    <label>예상 소요 시간(분)<input name="estimated_minutes" type="number" min="0" step="5" placeholder="예: 120" defaultValue={task?.estimated_minutes ?? ''}/></label>
    <label className="span-2">관련 링크<input name="link_url" type="url" placeholder="https://..." defaultValue={task?.link_url ?? ''}/></label>
    <label key={`priority-${prefillKey}`}>우선순위<select name="priority" defaultValue={prefill?.priority ?? task?.priority ?? 'normal'}><option value="normal">보통</option><option value="high">높음</option><option value="low">낮음</option></select></label>
    <label key={`recurrence-${prefillKey}`}>반복<select name="recurrence_rule" defaultValue={prefill?.recurrence_rule ?? task?.recurrence_rule ?? ''}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
    <label className="span-2">상위 업무<select name="parent_id" defaultValue={task?.parent_id || ''}><option value="">최상위 업무</option>{parentOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <div className="span-2 dependency-picker"><span className="dependency-picker-label">선행 업무 (완료되어야 진행 가능)</span>{dependencyOptions.length ? <div className="dependency-picker-list">{dependencyOptions.map(option => <label key={option.id} className="dependency-picker-item"><input type="checkbox" name="dependency_ids" value={option.id} defaultChecked={(task?.dependency_ids || []).map(String).includes(String(option.id))}/>{option.label}</label>)}</div> : <p className="muted">선택할 수 있는 업무가 없습니다.</p>}</div>
    <div className="span-2 checklist-editor"><span className="dependency-picker-label">체크리스트{checklist.length ? ` (${checklist.filter(i => i.done).length}/${checklist.length})` : ''}</span>
      {checklist.map(item => <div key={item.id} className="checklist-editor-item">
        <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)}/>
        {editingChecklistId === item.id
          ? <input type="text" className="inline-edit" autoFocus value={editingChecklistText} onChange={e => setEditingChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditChecklistItem(item.id) } if (e.key === 'Escape') setEditingChecklistId(null) }} onBlur={() => saveEditChecklistItem(item.id)}/>
          : <span className={item.done ? 'checklist-done-text' : ''} onClick={() => beginEditChecklistItem(item)}>{item.text}</span>}
        <button type="button" className="text-button" onClick={() => removeChecklistItem(item.id)}>삭제</button>
      </div>)}
      <div className="checklist-editor-add"><input type="text" value={checklistText} placeholder="세부 항목 추가" onChange={e => setChecklistText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}/><button type="button" className="text-button" onClick={addChecklistItem}>추가</button></div>
    </div>
    <div className="span-2"><TagsInput value={tags} onChange={setTags}/><div className="tag-recommend"><button type="button" className="text-button" disabled={saving} onClick={recommend}>AI 태그 추천</button>{suggestions.map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)}</div></div>
    <label className="span-2">메모<textarea name="description" rows="4" placeholder="담당자·협업자 등은 메모나 태그로 남겨두세요." defaultValue={task?.description || ''}/></label>
    {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    <div className="form-actions span-2">{task && onDelete ? <button type="button" className="danger-button" disabled={saving} onClick={onDelete}>휴지통으로 이동</button> : null}<button type="button" className="text-button" disabled={saving} onClick={saveAsTemplate}>템플릿으로 저장</button><span className="form-spacer"/><button type="button" className="secondary" disabled={saving} onClick={onCancel}>취소</button><button className="primary" disabled={saving}>{saving ? '처리 중…' : task ? '변경사항 저장' : '업무 등록'}</button></div>
  </form>
}
