export function tasksDueByDay(tasks) {
  const map = new Map()
  for (const task of tasks || []) {
    if (!task.due_date || task.status === 'done') continue
    const list = map.get(task.due_date) || []
    list.push(task)
    map.set(task.due_date, list)
  }
  return map
}
