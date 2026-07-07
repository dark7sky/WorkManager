const trimField = value => String(value ?? '').trim()
const normalizedStatus = value => (value === 'in_progress' ? 'doing' : value) || 'todo'
const normalizedPriority = value => (value === 'medium' ? 'normal' : value) || 'normal'
const normalizedProgress = value => {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}

export const buildTaskPayload = (data, { tags = [], task = null } = {}) => {
  const payload = {
    title: trimField(data.title),
    description: trimField(data.description),
    assignee_name: trimField(data.assignee_name),
    start_date: data.start_date || null,
    due_date: data.due_date || null,
    status: normalizedStatus(data.status),
    priority: normalizedPriority(data.priority),
    progress: normalizedProgress(data.progress),
    recurrence_rule: data.recurrence_rule || null,
    tags,
  }

  const parentId = data.parent_id ? Number(data.parent_id) : null
  const previousParentId = task?.parent_id || null
  if (!task || parentId !== previousParentId) payload.parent_id = parentId

  return payload
}
