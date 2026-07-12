const TASK_TEXT_LIMITS = {
  title: 300,
  description: 20000,
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
const normalizedOptionalId = value => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}
const normalizedDependencyIds = (ids, excludeId) => {
  const cleaned = []
  const seen = new Set()
  for (const raw of Array.isArray(ids) ? ids : []) {
    const number = Number(raw)
    if (!Number.isInteger(number) || number <= 0 || number === excludeId || seen.has(number)) continue
    seen.add(number)
    cleaned.push(number)
    if (cleaned.length >= 100) break
  }
  return cleaned
}

export const initialTaskDateValue = (task, field, today) => {
  if (task) return task?.[field] || ''
  return today
}

export const buildTaskPayload = (data, { tags = [], task = null } = {}) => {
  const payload = {
    title: normalizedTaskText('title', data.title),
    description: normalizedTaskText('description', data.description),
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

  const dependencyIds = normalizedDependencyIds(data.dependency_ids, taskId)
  const previousDependencyIds = normalizedDependencyIds(task?.dependency_ids, taskId)
  const dependencyIdsChanged = !task
    || dependencyIds.length !== previousDependencyIds.length
    || dependencyIds.some(id => !previousDependencyIds.includes(id))
  if (dependencyIdsChanged) payload.dependency_ids = dependencyIds

  return payload
}

export const buildTaskDuplicatePayload = task => {
  const sourceId = normalizedOptionalId(task?.id)
  return {
    title: normalizedTaskText('title', `${trimField(task?.title)} (복사본)`),
    description: normalizedTaskText('description', task?.description),
    start_date: task?.start_date || null,
    due_date: task?.due_date || null,
    status: 'todo',
    priority: normalizedPriority(task?.priority),
    progress: 0,
    recurrence_rule: task?.recurrence_rule || null,
    tags: normalizedTaskTags(task?.tags),
    parent_id: normalizedOptionalId(task?.parent_id),
    dependency_ids: normalizedDependencyIds(task?.dependency_ids, sourceId),
  }
}
