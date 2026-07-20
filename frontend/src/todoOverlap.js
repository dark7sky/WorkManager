export function findOverlappingTodos(todoDate, todoTime, todos, excludeId) {
  if (!todoDate || !todoTime) return []
  const start = new Date(`${todoDate}T${todoTime}`)
  if (Number.isNaN(start.getTime())) return []
  return todos.filter(todo => {
    if (excludeId != null && todo.id === excludeId) return false
    if (todo.deleted_at || todo.completed || !todo.todo_date || !todo.todo_time) return false
    if (todo.todo_date !== todoDate) return false
    return todo.todo_time === todoTime
  })
}
