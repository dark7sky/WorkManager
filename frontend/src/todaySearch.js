export const filterTodosByQuery = (todos, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return todos
  return todos.filter(todo => `${todo.title || ''}`.toLowerCase().includes(q))
}

export const filterLogsByQuery = (logs, query = '') => {
  const q = query.trim().toLowerCase()
  if (!q) return logs
  return logs.filter(log => `${log.content || ''}`.toLowerCase().includes(q))
}
