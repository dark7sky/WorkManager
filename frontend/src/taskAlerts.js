export const TASK_ALERT_LEAD_STORAGE_KEY = 'wm-task-alert-lead-minutes'
export const TASK_ALERT_LEAD_OPTIONS = [5, 10, 15, 30]
export const DEFAULT_TASK_ALERT_LEAD_MINUTES = 15

export const loadTaskAlertLeadMinutes = () => {
  const stored = Number(localStorage.getItem(TASK_ALERT_LEAD_STORAGE_KEY))
  return TASK_ALERT_LEAD_OPTIONS.includes(stored) ? stored : DEFAULT_TASK_ALERT_LEAD_MINUTES
}

export const tasksDueForAlert = (tasks, now, leadMinutes = DEFAULT_TASK_ALERT_LEAD_MINUTES) => {
  const windowMs = leadMinutes * 60 * 1000
  return tasks.filter(t => {
    if (t.status === 'done' || !t.due_date || !t.due_time) return false
    const due = new Date(`${t.due_date}T${t.due_time}`).getTime()
    if (Number.isNaN(due)) return false
    return due >= now && due - now <= windowMs
  })
}
