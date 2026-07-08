export const upsertTask = (tasks, savedTask) => {
  const index = tasks.findIndex(task => task.id === savedTask.id)
  if (index === -1) return [...tasks, savedTask]
  const next = tasks.slice()
  next[index] = { ...tasks[index], ...savedTask }
  return next
}
