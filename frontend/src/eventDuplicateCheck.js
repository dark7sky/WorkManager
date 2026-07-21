export function findDuplicateTitleEvents(title, events, excludeId) {
  const trimmed = (title || '').trim().toLowerCase()
  if (!trimmed) return []
  return events.filter(event => {
    if (excludeId != null && event.id === excludeId) return false
    if (event.deleted_at) return false
    return (event.title || '').trim().toLowerCase() === trimmed
  })
}
