export const filterEventsByQuery = (events, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return events
  return events.filter(event => `${event.title || ''} ${event.location || ''} ${event.description || ''}`.toLowerCase().includes(q))
}
