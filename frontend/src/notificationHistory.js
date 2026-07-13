export const NOTIFICATION_HISTORY_STORAGE_KEY = 'wm-notification-history'
const MAX_ENTRIES = 30

export const loadNotificationHistory = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const pushNotificationHistory = (title, body, storage = localStorage) => {
  const entry = { title, body, firedAt: new Date().toISOString() }
  const next = [entry, ...loadNotificationHistory(storage)].slice(0, MAX_ENTRIES)
  storage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify(next))
  return next
}

export const clearNotificationHistory = (storage = localStorage) => storage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, '[]')
