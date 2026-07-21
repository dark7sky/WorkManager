export function findDuplicateContentLogs(content, logs, excludeId) {
  const trimmed = (content || '').trim().toLowerCase()
  if (!trimmed) return []
  return logs.filter(log => {
    if (excludeId != null && log.id === excludeId) return false
    if (log.deleted_at) return false
    return (log.content || '').trim().toLowerCase() === trimmed
  })
}
