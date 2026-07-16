export const EVENT_ALERT_LEAD_STORAGE_KEY = 'wm-event-alert-lead-minutes'
export const EVENT_ALERT_LEAD_OPTIONS = [5, 10, 15, 30]
export const DEFAULT_EVENT_ALERT_LEAD_MINUTES = 15

export const loadEventAlertLeadMinutes = () => {
  const stored = Number(localStorage.getItem(EVENT_ALERT_LEAD_STORAGE_KEY))
  return EVENT_ALERT_LEAD_OPTIONS.includes(stored) ? stored : DEFAULT_EVENT_ALERT_LEAD_MINUTES
}

export const eventsDueForAlert = (events, now, leadMinutes = DEFAULT_EVENT_ALERT_LEAD_MINUTES) => {
  const windowMs = leadMinutes * 60 * 1000
  return events.filter(ev => {
    if (!ev.start_at) return false
    const start = new Date(ev.start_at).getTime()
    if (Number.isNaN(start)) return false
    return start >= now && start - now <= windowMs
  })
}

export const QUIET_HOURS_STORAGE_KEY = 'wm-quiet-hours'
export const DEFAULT_QUIET_HOURS = { enabled: false, start: '22:00', end: '08:00' }

export const loadQuietHours = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(QUIET_HOURS_STORAGE_KEY))
    if (stored && typeof stored.start === 'string' && typeof stored.end === 'string') return { ...DEFAULT_QUIET_HOURS, ...stored }
  } catch { /* ignore malformed value */ }
  return DEFAULT_QUIET_HOURS
}

export const isWithinQuietHours = (now, quietHours) => {
  if (!quietHours?.enabled) return false
  const [startH, startM] = quietHours.start.split(':').map(Number)
  const [endH, endM] = quietHours.end.split(':').map(Number)
  if ([startH, startM, endH, endM].some(Number.isNaN)) return false
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  if (startMinutes === endMinutes) return false
  if (startMinutes < endMinutes) return minutesNow >= startMinutes && minutesNow < endMinutes
  return minutesNow >= startMinutes || minutesNow < endMinutes
}
