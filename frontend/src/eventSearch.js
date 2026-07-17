export const filterEventsByQuery = (events, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return events
  return events.filter(event => {
    const checklistText = (event.checklist || []).map(item => item?.text || '').join(' ')
    return `${event.title || ''} ${event.location || ''} ${event.description || ''} ${(event.tags || []).join(' ')} ${checklistText}`.toLowerCase().includes(q)
  })
}

export const filterEventsByPriority = (events, priority = 'all') => {
  if (priority === 'all') return events
  return events.filter(event => (event.priority || 'normal') === priority)
}
