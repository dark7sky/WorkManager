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
const ESTIMATED_MINUTES_MAX = 100000
export const normalizedEstimatedMinutes = value => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.min(ESTIMATED_MINUTES_MAX, Math.round(number)) : null
}
export const clampedTaskProgress = value => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0
}
const normalizedLinkUrl = value => {
  const trimmed = trimField(value).slice(0, 2000)
  return trimmed && /^https?:\/\//.test(trimmed) ? trimmed : null
}
export const normalizedChecklist = items => {
  const cleaned = []
  for (const raw of Array.isArray(items) ? items : []) {
    const text = trimField(raw?.text).slice(0, 300)
    if (!text) continue
    cleaned.push({ id: String(raw?.id || `${Date.now()}-${cleaned.length}`), text, done: Boolean(raw?.done) })
    if (cleaned.length >= 200) break
  }
  return cleaned
}
export const moveChecklistItem = (items, id, direction) => {
  const list = Array.isArray(items) ? [...items] : []
  const index = list.findIndex(item => item.id === id)
  const targetIndex = index + (direction === 'up' ? -1 : 1)
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) return list
  ;[list[index], list[targetIndex]] = [list[targetIndex], list[index]]
  return list
}
export const checklistProgress = items => {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return null
  return Math.round((list.filter(item => item.done).length / list.length) * 100)
}
export const normalizedLinks = items => {
  const cleaned = []
  for (const raw of Array.isArray(items) ? items : []) {
    const url = trimField(raw?.url).slice(0, 2000)
    if (!/^https?:\/\//.test(url)) continue
    const label = trimField(raw?.label).slice(0, 200)
    cleaned.push({ id: String(raw?.id || `${Date.now()}-${cleaned.length}`), url, label })
    if (cleaned.length >= 50) break
  }
  return cleaned
}
export const normalizedCustomFields = items => {
  const cleaned = []
  for (const raw of Array.isArray(items) ? items : []) {
    const label = trimField(raw?.label).slice(0, 100)
    if (!label) continue
    const value = trimField(raw?.value).slice(0, 500)
    cleaned.push({ id: String(raw?.id || `${Date.now()}-${cleaned.length}`), label, value })
    if (cleaned.length >= 50) break
  }
  return cleaned
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
    start_time: data.start_time || null,
    due_time: data.due_time || null,
    status: normalizedStatus(data.status),
    priority: normalizedPriority(data.priority),
    progress: normalizedProgress(data.progress),
    recurrence_rule: data.recurrence_rule || null,
    recurrence_end_date: data.recurrence_rule ? (data.recurrence_end_date || null) : null,
    estimated_minutes: normalizedEstimatedMinutes(data.estimated_minutes),
    link_url: normalizedLinkUrl(data.link_url),
    checklist: normalizedChecklist(data.checklist),
    links: normalizedLinks(data.links),
    custom_fields: normalizedCustomFields(data.custom_fields),
    color: data.color || null,
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
    start_time: task?.start_time || null,
    due_time: task?.due_time || null,
    status: 'todo',
    priority: normalizedPriority(task?.priority),
    progress: 0,
    recurrence_rule: task?.recurrence_rule || null,
    recurrence_end_date: task?.recurrence_rule ? (task?.recurrence_end_date || null) : null,
    estimated_minutes: normalizedEstimatedMinutes(task?.estimated_minutes),
    link_url: normalizedLinkUrl(task?.link_url),
    checklist: normalizedChecklist(task?.checklist).map(item => ({ ...item, done: false })),
    links: normalizedLinks(task?.links),
    custom_fields: normalizedCustomFields(task?.custom_fields),
    color: task?.color || null,
    tags: normalizedTaskTags(task?.tags),
    parent_id: normalizedOptionalId(task?.parent_id),
    dependency_ids: normalizedDependencyIds(task?.dependency_ids, sourceId),
  }
}
