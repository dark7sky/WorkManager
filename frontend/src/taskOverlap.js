export function findOverlappingTasks(startDate, startTime, dueDate, dueTime, tasks, excludeId) {
  if (!startDate || !dueDate) return []
  const start = new Date(`${startDate}T${startTime || '00:00'}`)
  const end = new Date(`${dueDate}T${dueTime || '23:59'}`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
  return tasks.filter(task => {
    if (excludeId != null && task.id === excludeId) return false
    if (task.deleted_at || task.status === 'done') return false
    if (!task.start_date || !task.due_date) return false
    const taskStart = new Date(`${task.start_date}T${task.start_time || '00:00'}`)
    const taskEnd = new Date(`${task.due_date}T${task.due_time || '23:59'}`)
    if (Number.isNaN(taskStart.getTime()) || Number.isNaN(taskEnd.getTime())) return false
    return start < taskEnd && end > taskStart
  })
}
