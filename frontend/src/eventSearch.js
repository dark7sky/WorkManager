export const filterEventsByQuery = (events, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return events
  return events.filter(event => {
    const checklistText = (event.checklist || []).map(item => item?.text || '').join(' ')
    const attachmentText = (event.attachment_names || []).join(' ')
    const customFieldText = (event.custom_fields || []).map(field => `${field?.label || ''} ${field?.value || ''}`).join(' ')
    return `${event.title || ''} ${event.location || ''} ${event.description || ''} ${(event.tags || []).join(' ')} ${checklistText} ${attachmentText} ${customFieldText}`.toLowerCase().includes(q)
  })
}

export const filterEventsByPriority = (events, priority = 'all') => {
  if (priority === 'all') return events
  return events.filter(event => (event.priority || 'normal') === priority)
}
