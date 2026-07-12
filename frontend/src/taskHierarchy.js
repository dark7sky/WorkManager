const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'ko')
const bySchedule = (a, b) => {
  const ad = a.start_date || a.due_date || '', bd = b.start_date || b.due_date || ''
  if (ad !== bd) return ad ? (bd ? (ad < bd ? -1 : 1) : -1) : 1
  return byTitle(a, b)
}
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 }
const byPriority = (a, b) => {
  const ar = PRIORITY_RANK[a.priority] ?? 1, br = PRIORITY_RANK[b.priority] ?? 1
  return ar !== br ? ar - br : bySchedule(a, b)
}
const byProgress = (a, b) => {
  const ap = a.progress ?? 0, bp = b.progress ?? 0
  return ap !== bp ? bp - ap : bySchedule(a, b)
}

export const TASK_SORT_COMPARATORS = { schedule: bySchedule, priority: byPriority, progress: byProgress, title: byTitle }
export const DEFAULT_TASK_SORT = 'schedule'
export const TASK_SORT_STORAGE_KEY = 'wm-task-sort'

export const loadTaskSort = (storage = localStorage) => {
  try {
    const saved = storage.getItem(TASK_SORT_STORAGE_KEY)
    return saved && TASK_SORT_COMPARATORS[saved] ? saved : DEFAULT_TASK_SORT
  } catch {
    return DEFAULT_TASK_SORT
  }
}

export const saveTaskSort = (sortBy, storage = localStorage) => {
  storage.setItem(TASK_SORT_STORAGE_KEY, sortBy)
}

export const childTaskIds = (tasks, taskId) => {
  if (!taskId) return new Set()
  const children = new Map()
  for (const task of tasks) {
    if (!task.parent_id) continue
    const group = children.get(task.parent_id) || []
    group.push(task.id)
    children.set(task.parent_id, group)
  }
  const result = new Set()
  const stack = [...(children.get(taskId) || [])]
  while (stack.length) {
    const id = stack.pop()
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(children.get(id) || []))
  }
  return result
}

export const taskParentOptions = (tasks, currentTaskId) => {
  const blocked = childTaskIds(tasks, currentTaskId)
  if (currentTaskId) blocked.add(currentTaskId)
  return orderTasksHierarchically(tasks, tasks)
    .filter(({ task }) => !blocked.has(task.id))
    .map(({ task, depth }) => ({ id: task.id, label: `${'-- '.repeat(depth)}${task.title || `#${task.id}`}` }))
}

export const dependentTaskIds = (tasks, taskId) => {
  if (!taskId) return new Set()
  const dependents = new Map()
  for (const task of tasks) {
    for (const depId of task.dependency_ids || []) {
      const group = dependents.get(depId) || []
      group.push(task.id)
      dependents.set(depId, group)
    }
  }
  const result = new Set()
  const stack = [...(dependents.get(taskId) || [])]
  while (stack.length) {
    const id = stack.pop()
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(dependents.get(id) || []))
  }
  return result
}

export const taskDependencyOptions = (tasks, currentTaskId) => {
  const blocked = dependentTaskIds(tasks, currentTaskId)
  if (currentTaskId) blocked.add(currentTaskId)
  return orderTasksHierarchically(tasks, tasks)
    .filter(({ task }) => !blocked.has(task.id))
    .map(({ task, depth }) => ({ id: task.id, label: `${'-- '.repeat(depth)}${task.title || `#${task.id}`}` }))
}

export const subtaskCompletionSummary = (tasks, taskId) => {
  const children = tasks.filter(task => task.parent_id === taskId)
  if (!children.length) return null
  return { total: children.length, done: children.filter(task => task.status === 'done').length }
}

export const taskHierarchyDepths = tasks => {
  const parents = new Map(tasks.map(task => [task.id, task.parent_id || null]))
  const depths = new Map()
  const depthOf = id => {
    if (!parents.has(id)) return 0
    if (depths.has(id)) return depths.get(id)
    const seen = new Set([id])
    let parent = parents.get(id)
    let depth = 0
    while (parent && parents.has(parent) && !seen.has(parent)) {
      depth += 1
      seen.add(parent)
      parent = parents.get(parent)
    }
    depths.set(id, depth)
    return depth
  }
  tasks.forEach(task => depthOf(task.id))
  return depths
}

export const subtaskRowClass = depth => depth > 0 ? ` subtask-row subtask-depth-${Math.min(depth, 3)}` : ''

export const taskIndent = depth => `${8 + Math.min(depth, 5) * 18}px`

export const orderTasksHierarchically = (visibleTasks, allTasks = visibleTasks, sortBy = DEFAULT_TASK_SORT) => {
  const compare = TASK_SORT_COMPARATORS[sortBy] || bySchedule
  const visible = new Set(visibleTasks.map(task => task.id))
  const children = new Map()
  for (const task of visibleTasks) {
    const parent = visible.has(task.parent_id) ? task.parent_id : null
    const group = children.get(parent) || []
    group.push(task)
    children.set(parent, group)
  }
  for (const group of children.values()) group.sort(compare)
  const ordered = []
  const visit = task => {
    ordered.push(task)
    for (const child of children.get(task.id) || []) visit(child)
  }
  for (const task of children.get(null) || []) visit(task)

  const depths = taskHierarchyDepths(allTasks)
  return ordered.map(task => ({ task, depth: depths.get(task.id) || 0 }))
}
