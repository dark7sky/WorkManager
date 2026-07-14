const STORAGE_KEY = 'wm-pinned-logs'

export const loadPinnedLogIds = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export const savePinnedLogIds = (pinnedIds, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]))
}

export const togglePinnedLog = (pinnedIds, logId) => {
  const next = new Set(pinnedIds)
  next.has(logId) ? next.delete(logId) : next.add(logId)
  return next
}

export const orderLogsByPin = (logs, pinnedIds) =>
  [...logs].sort((a, b) => (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0))
