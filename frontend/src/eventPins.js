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

const priorityRank = { high: 0, normal: 1, low: 2 }
const startTime = event => event.start_at || event.start || ''

export const EVENT_SORT_COMPARATORS = {
  time: (a, b) => startTime(a).localeCompare(startTime(b)),
  priority: (a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1),
  title: (a, b) => (a.title || '').localeCompare(b.title || '', 'ko'),
  manual: () => 0,
}
export const DEFAULT_EVENT_SORT = 'time'
const EVENT_SORT_STORAGE_KEY = 'wm-event-sort'

export const loadEventSort = (storage = localStorage) => {
  try {
    const saved = storage.getItem(EVENT_SORT_STORAGE_KEY)
    return saved && EVENT_SORT_COMPARATORS[saved] ? saved : DEFAULT_EVENT_SORT
  } catch {
    return DEFAULT_EVENT_SORT
  }
}

export const saveEventSort = (sortBy, storage = localStorage) => {
  storage.setItem(EVENT_SORT_STORAGE_KEY, sortBy)
}

export const orderEventsByPin = (events, pinnedIds, sortBy = DEFAULT_EVENT_SORT, manualOrder = {}) =>
  [...events].sort((a, b) => {
    const pinDiff = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0)
    if (pinDiff !== 0) return pinDiff
    if (sortBy === 'manual') return (manualOrder[a.id] ?? Number.MAX_SAFE_INTEGER) - (manualOrder[b.id] ?? Number.MAX_SAFE_INTEGER)
    return (EVENT_SORT_COMPARATORS[sortBy] || EVENT_SORT_COMPARATORS[DEFAULT_EVENT_SORT])(a, b)
  })
