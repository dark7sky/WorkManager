const STORAGE_KEY = 'wm-pinned-events'

export const loadPinnedEventIds = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export const savePinnedEventIds = (pinnedIds, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]))
}

export const togglePinnedEvent = (pinnedIds, eventId) => {
  const next = new Set(pinnedIds)
  next.has(eventId) ? next.delete(eventId) : next.add(eventId)
  return next
}

export const orderEventsByPin = (events, pinnedIds) =>
  [...events].sort((a, b) => (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0))
