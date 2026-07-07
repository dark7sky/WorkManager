import { useRef, useState } from 'react'
import { api } from '../api'
import TagsInput from './TagsInput'

export default function TaskForm({ task, onSave, onCancel, onDelete }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tags, setTags] = useState(() => task?.tags || [])
  const [suggestions, setSuggestions] = useState([])
  const formRef = useRef(null)
  const today = new Date().toLocaleDateString('en-CA')

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
    const data = Object.fromEntries(new FormData(e.currentTarget))
    if (data.start_date && data.due_date && data.due_date < data.start_date) {
      setError('완료 예정일은 시작일보다 빠를 수 없습니다.')
      return
    }
    setSaving(true)
    setError('')
    const ok = await onSave({
      title: data.title.trim(),
      description: data.description.trim(),
      assignee_name: data.assignee_name.trim(),
      start_date: data.start_date || null,
      due_date: data.due_date || null,
      status: data.status === 'in_progress' ? 'doing' : data.status,
      priority: data.priority,
      progress: Number(data.progress),
      recurrence_rule: data.recurrence_rule || null,
      tags,
    })
    if (!ok) setError('저장하지 못했습니다. 입력 내용은 그대로 유지됩니다.')
    setSaving(false)
  }

  return <form ref={formRef} className="form-grid" onSubmit={submit}>
    <label className="span-2">업무 제목<input name="title" required autoFocus defaultValue={task?.title || ''}/></label>
    <label>담당자<input name="assignee_name" maxLength="120" defaultValue={task?.assignee_name || ''} placeholder="담당자 이름"/></label>
    <label>시작일<input name="start_date" type="date" defaultValue={task?.start_date || today}/></label>
    <label>완료 예정일<input name="due_date" type="date" defaultValue={task?.due_date || today}/></label>
    <label>상태<select name="status" defaultValue={task?.status === 'doing' ? 'in_progress' : task?.status || 'todo'}><option value="todo">할 일</option><option value="in_progress">진행 중</option><option value="done">완료</option></select></label>
    <label>진행률<input name="progress" type="number" min="0" max="100" defaultValue={task?.progress ?? 0}/></label>
    <label>우선순위<select name="priority" defaultValue={task?.priority || 'normal'}><option value="normal">보통</option><option value="high">높음</option><option value="low">낮음</option></select></label>
    <label>반복<select name="recurrence_rule" defaultValue={task?.recurrence_rule || ''}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option></select></label>
    <div className="span-2"><TagsInput value={tags} onChange={setTags}/><div className="tag-recommend"><button type="button" className="text-button" disabled={saving} onClick={recommend}>AI 태그 추천</button>{suggestions.map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)}</div></div>
    <label className="span-2">메모<textarea name="description" rows="4" defaultValue={task?.description || ''}/></label>
    {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    <div className="form-actions span-2">{task && onDelete ? <button type="button" className="danger-button" disabled={saving} onClick={onDelete}>휴지통으로 이동</button> : null}<span className="form-spacer"/><button type="button" className="secondary" disabled={saving} onClick={onCancel}>취소</button><button className="primary" disabled={saving}>{saving ? '처리 중…' : task ? '변경사항 저장' : '업무 등록'}</button></div>
  </form>
}
