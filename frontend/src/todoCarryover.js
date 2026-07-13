export const overdueIncompleteTodos = (todos, todayIso) =>
  (todos || []).filter(todo => !todo.completed && todo.todo_date && todayIso && todo.todo_date < todayIso)
