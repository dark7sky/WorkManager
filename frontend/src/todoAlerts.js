export const todosDueForAlert = (todos, now, leadMinutes = 15) => {
  const windowMs = leadMinutes * 60 * 1000
  return todos.filter(t => {
    if (t.completed || !t.todo_date || !t.todo_time) return false
    const due = new Date(`${t.todo_date}T${t.todo_time}`).getTime()
    if (Number.isNaN(due)) return false
    return due >= now && due - now <= windowMs
  })
}
