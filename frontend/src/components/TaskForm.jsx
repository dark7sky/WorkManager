export default function TaskForm({ task, onSave, onCancel, onDelete }) {
  const today = new Date().toLocaleDateString('en-CA')
  const submit = e => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    onSave({
      title: d.title.trim(), description: d.description.trim(),
      start_date: d.start_date || null, due_date: d.due_date || null,
      status: d.status, priority: d.priority, progress: Number(d.progress),
      tags: d.category.trim() ? [d.category.trim()] : [],
    })
  }
  const category = Array.isArray(task?.tags) ? task.tags[0] : ''
  return <form className="form-grid" onSubmit={submit}>
    <label className="span-2">업무 제목<input name="title" required autoFocus defaultValue={task?.title || ''} placeholder="해야 할 일을 입력하세요" /></label>
    <label>시작일<input name="start_date" type="date" defaultValue={task?.start_date || today} /></label>
    <label>완료 예정일<input name="due_date" type="date" min={task?.start_date || undefined} defaultValue={task?.due_date || today} /></label>
    <label>상태<select name="status" defaultValue={task?.status === 'doing' ? 'in_progress' : task?.status || 'todo'}><option value="todo">할 일</option><option value="in_progress">진행 중</option><option value="done">완료</option></select></label>
    <label>진행률<input name="progress" type="number" min="0" max="100" defaultValue={task?.progress ?? 0} /></label>
    <label>우선순위<select name="priority" defaultValue={task?.priority || 'normal'}><option value="normal">보통</option><option value="high">높음</option><option value="low">낮음</option></select></label>
    <label>분류<input name="category" defaultValue={category} placeholder="예: 기획" /></label>
    <label className="span-2">메모<textarea name="description" rows="4" defaultValue={task?.description || ''} placeholder="필요한 내용과 완료 조건을 메모하세요" /></label>
    <div className="form-actions span-2">{task && onDelete ? <button type="button" className="danger-button" onClick={onDelete}>삭제</button> : null}<span className="form-spacer"/><button type="button" className="secondary" onClick={onCancel}>취소</button><button className="primary">{task ? '변경사항 저장' : '업무 등록'}</button></div>
  </form>
}
