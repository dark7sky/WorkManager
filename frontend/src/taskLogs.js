export const taskWorkLogs = (logs, taskId) =>
  (logs || [])
    .filter(log => log.task_id === taskId)
    .sort((a, b) => (b.log_date || '').localeCompare(a.log_date || '') || (b.id - a.id))

export const taskWorkLogsTotalMinutes = logs =>
  logs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0)
