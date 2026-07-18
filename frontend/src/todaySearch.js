export const filterTodosByQuery = (todos, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return todos
  return todos.filter(todo => {
    const checklistText = (todo.checklist || []).map(item => item?.text || '').join(' ')
    return `${todo.title || ''} ${todo.memo || ''} ${(todo.tags || []).join(' ')} ${checklistText}`.toLowerCase().includes(q)
  })
}

export const filterLogsByQuery = (logs, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return logs
  return logs.filter(log => {
    const checklistText = (log.checklist || []).map(item => item?.text || '').join(' ')
    return `${log.content || ''} ${(log.tags || []).join(' ')} ${checklistText}`.toLowerCase().includes(q)
  })
}

export const filterTodosByPriority = (todos, priority = 'all') => {
  if (priority === 'all') return todos
  return todos.filter(todo => (todo.priority || 'normal') === priority)
}

export const filterLogsByPriority = (logs, priority = 'all') => {
  if (priority === 'all') return logs
  return logs.filter(log => (log.priority || 'normal') === priority)
}

export const filterLogsByBillable = (logs, billable = 'all') => {
  if (billable === 'all') return logs
  if (billable === 'billable') return logs.filter(log => !!log.billable)
  return logs.filter(log => !log.billable)
}
