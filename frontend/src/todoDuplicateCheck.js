export function findDuplicateTitleTodos(title, todos, excludeId) {
  const trimmed = (title || '').trim().toLowerCase()
  if (!trimmed) return []
  return todos.filter(todo => {
    if (excludeId != null && todo.id === excludeId) return false
    if (todo.deleted_at || todo.completed) return false
    return (todo.title || '').trim().toLowerCase() === trimmed
  })
}
