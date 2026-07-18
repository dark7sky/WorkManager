export function findOverlappingWorkLogs(logDate, logTime, durationMinutes, logs, excludeId) {
  if (!logDate || !logTime) return []
  const start = new Date(`${logDate}T${logTime}`)
  if (Number.isNaN(start.getTime())) return []
  const minutes = Number(durationMinutes)
  const end = new Date(start.getTime() + (Number.isFinite(minutes) && minutes > 0 ? minutes : 1) * 60000)
  return logs.filter(log => {
    if (excludeId != null && log.id === excludeId) return false
    if (log.deleted_at || !log.log_date || !log.log_time) return false
    if (log.log_date !== logDate) return false
    const logStart = new Date(`${log.log_date}T${log.log_time}`)
    if (Number.isNaN(logStart.getTime())) return false
    const logMinutes = Number(log.duration_minutes)
    const logEnd = new Date(logStart.getTime() + (Number.isFinite(logMinutes) && logMinutes > 0 ? logMinutes : 1) * 60000)
    return start < logEnd && end > logStart
  })
}
