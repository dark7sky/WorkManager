const STORAGE_KEY = 'wm-pinned-tasks'

export const loadPinnedTaskIds = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export const savePinnedTaskIds = (pinnedIds, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]))
}

export const togglePinnedTask = (pinnedIds, taskId) => {
  const next = new Set(pinnedIds)
  next.has(taskId) ? next.delete(taskId) : next.add(taskId)
  return next
}
