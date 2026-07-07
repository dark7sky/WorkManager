const trimField = value => String(value ?? '').trim()
const normalizedStatus = value => (value === 'in_progress' ? 'doing' : value) || 'todo'
const normalizedPriority = value => (value === 'medium' ? 'normal' : value) || 'normal'
const normalizedProgress = value => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}
const normalizedAssigneeName = value => trimField(value)
const normalizedOptionalId = value => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

export const initialTaskDateValue = (task, field, today) => {
  if (task) return task?.[field] || ''
  return today
}

export const validateTaskOwnership = data => {
  const status = normalizedStatus(data.status)
  const progress = normalizedProgress(data.progress)
  if ((status === 'doing' || status === 'done' || progress > 0) && !normalizedAssigneeName(data.assignee_name)) {
    return '진행 중이거나 완료된 업무에는 담당자를 지정해 주세요.'
  }
  return ''
}

export const buildTaskPayload = (data, { tags = [], task = null } = {}) => {
  const payload = {
    title: trimField(data.title),
    description: trimField(data.description),
    assignee_name: normalizedAssigneeName(data.assignee_name),
    start_date: data.start_date || null,
    due_date: data.due_date || null,
    status: normalizedStatus(data.status),
    priority: normalizedPriority(data.priority),
    progress: normalizedProgress(data.progress),
    recurrence_rule: data.recurrence_rule || null,
    tags,
  }

  const taskId = normalizedOptionalId(task?.id)
  const parentId = normalizedOptionalId(data.parent_id)
  const previousParentId = normalizedOptionalId(task?.parent_id)
  if (parentId !== taskId && (!task || parentId !== previousParentId)) payload.parent_id = parentId

  return payload
}
