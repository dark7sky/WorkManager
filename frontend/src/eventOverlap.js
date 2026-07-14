export function findOverlappingEvents(startAt, endAt, events, excludeId) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
  return events.filter(event => {
    if (excludeId != null && event.id === excludeId) return false
    if (event.deleted_at) return false
    const eventStart = new Date(event.start_at || event.start)
    if (Number.isNaN(eventStart.getTime())) return false
    const eventEnd = new Date(event.end_at || event.end || eventStart.getTime() + 1)
    return start < eventEnd && end > eventStart
  })
}
