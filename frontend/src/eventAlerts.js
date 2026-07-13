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
