const STORAGE_KEY = 'wm-collapsed-tasks'

export const loadCollapsedTaskIds = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export const saveCollapsedTaskIds = (collapsedIds, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...collapsedIds]))
}

export const toggleCollapsedTask = (collapsedIds, taskId) => {
  const next = new Set(collapsedIds)
  next.has(taskId) ? next.delete(taskId) : next.add(taskId)
  return next
}
