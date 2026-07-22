export function lastClientRate(clientName, logs) {
  const trimmed = (clientName || '').trim().toLowerCase()
  if (!trimmed) return null
  const matches = logs
    .filter(log => !log.deleted_at && log.hourly_rate_override != null && (log.client_name || '').trim().toLowerCase() === trimmed)
    .sort((a, b) => new Date(b.log_date || b.created_at || 0) - new Date(a.log_date || a.created_at || 0))
  return matches.length ? matches[0].hourly_rate_override : null
}
