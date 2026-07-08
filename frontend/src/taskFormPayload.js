const TASK_TEXT_LIMITS = {
  title: 300,
  description: 20000,
  assignee_name: 120,
}
const TASK_TAG_LIMIT = 50
const TASK_TAG_COUNT_LIMIT = 50

const trimField = value => String(value ?? '').trim()
const normalizedTaskText = (field, value) => trimField(value).slice(0, TASK_TEXT_LIMITS[field] ?? undefined)
const normalizedTaskTags = tags => {
  const cleaned = []
  const seen = new Set()
  for (const raw of Array.isArray(tags) ? tags : []) {
    const value = trimField(raw).replace(/^#/, '').slice(0, TASK_TAG_LIMIT)
    const key = value.toLocaleLowerCase('ko-KR')
    if (!value || seen.has(key)) continue
    seen.add(key)
    cleaned.push(value)
    if (cleaned.length >= TASK_TAG_COUNT_LIMIT) break
  }
  return cleaned
}
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
const requiresTaskOwner = data => {
  const status = normalizedStatus(data?.status)
  const progress = normalizedProgress(data?.progress)
  return status === 'doing' || status === 'done' || progress > 0
}

export const initialTaskDateValue = (task, field, today) => {
  if (task) return task?.[field] || ''
  return today
}

export const validateTaskOwnership = (data, task = null) => {
  const nextAssignee = normalizedAssigneeName(data.assignee_name)
  if (!requiresTaskOwner(data) || nextAssignee) return ''
  if (task && requiresTaskOwner(task) && !normalizedAssigneeName(task.assignee_name)) return ''
    return '진행 중이거나 완료된 업무에는 담당자를 지정해 주세요.'
}

export const buildTaskPayload = (data, { tags = [], task = null } = {}) => {
  const payload = {
    title: normalizedTaskText('title', data.title),
    description: normalizedTaskText('description', data.description),
    assignee_name: normalizedTaskText('assignee_name', data.assignee_name),
    start_date: data.start_date || null,
    due_date: data.due_date || null,
    status: normalizedStatus(data.status),
    priority: normalizedPriority(data.priority),
    progress: normalizedProgress(data.progress),
    recurrence_rule: data.recurrence_rule || null,
    tags: normalizedTaskTags(tags),
  }

  const taskId = normalizedOptionalId(task?.id)
  const parentId = normalizedOptionalId(data.parent_id)
  const previousParentId = normalizedOptionalId(task?.parent_id)
  if (parentId !== taskId && (!task || parentId !== previousParentId)) payload.parent_id = parentId

  return payload
}
