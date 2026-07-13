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

export const orderTodosByPin = (todos, pinnedIds) =>
  [...todos].sort((a, b) => {
    const pinDiff = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0)
    return pinDiff !== 0 ? pinDiff : 0
  })
