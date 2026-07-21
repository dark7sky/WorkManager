export function findDuplicateTitleTasks(title, tasks, excludeId) {
  const trimmed = (title || '').trim().toLowerCase()
  if (!trimmed) return []
  return tasks.filter(task => {
    if (excludeId != null && task.id === excludeId) return false
    if (task.deleted_at || task.status === 'done') return false
    return (task.title || '').trim().toLowerCase() === trimmed
  })
}
