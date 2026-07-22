export const LOG_ALERT_LEAD_STORAGE_KEY = 'wm-log-alert-lead-minutes'
export const LOG_ALERT_LEAD_OPTIONS = [5, 10, 15, 30]
export const DEFAULT_LOG_ALERT_LEAD_MINUTES = 15

export const loadLogAlertLeadMinutes = () => {
  const stored = Number(localStorage.getItem(LOG_ALERT_LEAD_STORAGE_KEY))
  return LOG_ALERT_LEAD_OPTIONS.includes(stored) ? stored : DEFAULT_LOG_ALERT_LEAD_MINUTES
}

export const logsDueForAlert = (logs, now, leadMinutes = DEFAULT_LOG_ALERT_LEAD_MINUTES) => {
  return logs.filter(l => {
    if (!l.log_date || !l.log_time) return false
    const due = new Date(`${l.log_date}T${l.log_time}`).getTime()
    if (Number.isNaN(due)) return false
    const windowMs = (Number.isFinite(l.reminder_minutes_before) ? l.reminder_minutes_before : leadMinutes) * 60 * 1000
    return due >= now && due - now <= windowMs
  })
}
