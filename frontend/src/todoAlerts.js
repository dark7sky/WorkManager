export const TODO_ALERT_LEAD_STORAGE_KEY = 'wm-todo-alert-lead-minutes'
export const TODO_ALERT_LEAD_OPTIONS = [5, 10, 15, 30]
export const DEFAULT_TODO_ALERT_LEAD_MINUTES = 15

export const loadTodoAlertLeadMinutes = () => {
  const stored = Number(localStorage.getItem(TODO_ALERT_LEAD_STORAGE_KEY))
  return TODO_ALERT_LEAD_OPTIONS.includes(stored) ? stored : DEFAULT_TODO_ALERT_LEAD_MINUTES
}

export const todosDueForAlert = (todos, now, leadMinutes = DEFAULT_TODO_ALERT_LEAD_MINUTES) => {
  return todos.filter(t => {
    if (t.completed || !t.todo_date || !t.todo_time) return false
    const due = new Date(`${t.todo_date}T${t.todo_time}`).getTime()
    if (Number.isNaN(due)) return false
    const windowMs = (Number.isFinite(t.reminder_minutes_before) ? t.reminder_minutes_before : leadMinutes) * 60 * 1000
    return due >= now && due - now <= windowMs
  })
}
