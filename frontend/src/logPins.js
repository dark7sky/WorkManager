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

export const LOG_SORT_COMPARATORS = {
  none: () => 0,
  time: (a, b) => (a.log_time || '').localeCompare(b.log_time || ''),
  duration: (a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0),
  content: (a, b) => (a.content || '').localeCompare(b.content || '', 'ko'),
}
export const DEFAULT_LOG_SORT = 'none'
const LOG_SORT_STORAGE_KEY = 'wm-log-sort'

export const loadLogSort = (storage = localStorage) => {
  try {
    const saved = storage.getItem(LOG_SORT_STORAGE_KEY)
    return saved && LOG_SORT_COMPARATORS[saved] ? saved : DEFAULT_LOG_SORT
  } catch {
    return DEFAULT_LOG_SORT
  }
}

export const saveLogSort = (sortBy, storage = localStorage) => {
  storage.setItem(LOG_SORT_STORAGE_KEY, sortBy)
}

export const orderLogsByPin = (logs, pinnedIds, sortBy = DEFAULT_LOG_SORT) =>
  [...logs].sort((a, b) => {
    const pinDiff = (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0)
    if (pinDiff !== 0) return pinDiff
    return (LOG_SORT_COMPARATORS[sortBy] || LOG_SORT_COMPARATORS[DEFAULT_LOG_SORT])(a, b)
  })
