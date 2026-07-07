export const UNASSIGNED_LABEL = '미지정'

export const taskAssignee = task => task.assignee_name?.trim() || UNASSIGNED_LABEL

export const isTaskOverdue = (task, todayIso) => task.status !== 'done' && task.due_date && todayIso && task.due_date < todayIso

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

export const filterTasks = (tasks, { query = '', status = 'active', selectedTags = [], assignee = 'all', todayIso }) => {
  const q = query.trim().toLowerCase()
  return tasks.filter(task => {
    const matchesQuery = !q || `${task.title} ${task.description || ''} ${task.assignee_name || ''} ${(task.tags || []).join(' ')}`.toLowerCase().includes(q)
    const matchesStatus = status === 'all'
      || (status === 'overdue' ? isTaskOverdue(task, todayIso) : status === 'active' ? task.status !== 'done' : status === 'in_progress' ? ['in_progress', 'doing'].includes(task.status) : task.status === status)
    const matchesTags = !selectedTags.length || selectedTags.every(tag => (task.tags || []).includes(tag))
    const matchesAssignee = assignee === 'all' || taskAssignee(task) === assignee
    return matchesQuery && matchesStatus && matchesTags && matchesAssignee
  })
}

export const summarizeAssigneeWorkload = (tasks, todayIso) => {
  const rows = new Map()
  for (const task of tasks) {
    const assignee = taskAssignee(task)
    const row = rows.get(assignee) || { assignee, active: 0, overdue: 0, done: 0, total: 0 }
    row.total += 1
    if (task.status === 'done') row.done += 1
    else row.active += 1
    if (isTaskOverdue(task, todayIso)) row.overdue += 1
    rows.set(assignee, row)
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || b.active - a.active || a.assignee.localeCompare(b.assignee, 'ko'))
}

export const summarizeDueReminders = (tasks, todayIso, upcomingDays = 2) => {
  if (!todayIso) return { overdue: 0, dueToday: 0, dueSoon: 0, total: 0, nextDueDate: null }

  const soonLimit = addDays(todayIso, upcomingDays)
  const summary = { overdue: 0, dueToday: 0, dueSoon: 0, total: 0, nextDueDate: null }

  for (const task of tasks) {
    if (task.status === 'done' || !task.due_date) continue

    if (task.due_date < todayIso) summary.overdue += 1
    else if (task.due_date === todayIso) summary.dueToday += 1
    else if (task.due_date <= soonLimit) summary.dueSoon += 1
    else continue

    summary.total += 1
    if (!summary.nextDueDate || task.due_date < summary.nextDueDate) summary.nextDueDate = task.due_date
  }

  return summary
}
