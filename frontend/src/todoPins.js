const STORAGE_KEY = 'wm-pinned-todos'

export const loadPinnedTodoIds = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export const savePinnedTodoIds = (pinnedIds, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]))
}

export const togglePinnedTodo = (pinnedIds, todoId) => {
  const next = new Set(pinnedIds)
  next.has(todoId) ? next.delete(todoId) : next.add(todoId)
  return next
}

const priorityRank = { high: 0, normal: 1, low: 2 }

export const TODO_SORT_COMPARATORS = {
  priority: (a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1),
  title: (a, b) => (a.title || '').localeCompare(b.title || '', 'ko'),
  time: (a, b) => (a.todo_time || '').localeCompare(b.todo_time || ''),
}
export const DEFAULT_TODO_SORT = 'priority'
const TODO_SORT_STORAGE_KEY = 'wm-todo-sort'

export const loadTodoSort = (storage = localStorage) => {
  try {
    const saved = storage.getItem(TODO_SORT_STORAGE_KEY)
    return saved && TODO_SORT_COMPARATORS[saved] ? saved : DEFAULT_TODO_SORT
  } catch {
    return DEFAULT_TODO_SORT
  }
}

export const saveTodoSort = (sortBy, storage = localStorage) => {
  storage.setItem(TODO_SORT_STORAGE_KEY, sortBy)
}

export const orderTodosByPin = (todos, pinnedIds, sortBy = DEFAULT_TODO_SORT) =>
  [...todos].sort((a, b) => {
    const pinDiff = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0)
    if (pinDiff !== 0) return pinDiff
    return (TODO_SORT_COMPARATORS[sortBy] || TODO_SORT_COMPARATORS[DEFAULT_TODO_SORT])(a, b)
  })
