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

export const orderTodosByPin = (todos, pinnedIds) =>
  [...todos].sort((a, b) => {
    const pinDiff = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0)
    if (pinDiff !== 0) return pinDiff
    return (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
  })
