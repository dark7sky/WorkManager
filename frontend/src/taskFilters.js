export const UNASSIGNED_LABEL = '미지정'

export const taskAssignee = task => task.assignee_name?.trim() || UNASSIGNED_LABEL

export const taskAssigneeOptions = tasks => [...new Set(tasks
  .map(task => task.assignee_name?.trim())
  .filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'ko'))

export const isTaskOverdue = (task, todayIso) => task.status !== 'done' && task.due_date && todayIso && task.due_date < todayIso

export const taskBlockingDependencies = (task, tasks) => {
  const ids = new Set((task.dependency_ids || []).map(Number))
  if (!ids.size || task.status === 'done') return []
  return tasks.filter(item => ids.has(Number(item.id)) && item.status !== 'done')
}

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

const dateRange = (startIso, endIso) => {
  const dates = []
  if (!startIso || !endIso) return dates
  const current = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime()) || end < current) return dates
  while (current <= end) {
    dates.push(current.toLocaleDateString('en-CA'))
    current.setDate(current.getDate() + 1)
  }
  return dates
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

export const summarizeAssigneeAssignmentLoad = (tasks, assigneeName, todayIso, excludeTaskId = null, upcomingDays = 7) => {
  const assignee = assigneeName?.trim()
  if (!assignee || !todayIso) return null

  const soonLimit = addDays(todayIso, upcomingDays)
  const summary = { assignee, active: 0, overdue: 0, dueSoon: 0, highPriority: 0 }

  for (const task of tasks) {
    if (task.id === excludeTaskId || taskAssignee(task) !== assignee || task.status === 'done') continue

    summary.active += 1
    if (isTaskOverdue(task, todayIso)) summary.overdue += 1
    else if (task.due_date && task.due_date <= soonLimit) summary.dueSoon += 1
    if (task.priority === 'high') summary.highPriority += 1
  }

  return summary
}

export const summarizeOwnershipGaps = (tasks, todayIso) => {
  const activeUnassigned = tasks.filter(task => task.status !== 'done' && taskAssignee(task) === UNASSIGNED_LABEL)
  return {
    activeUnassigned: activeUnassigned.length,
    overdueUnassigned: todayIso ? activeUnassigned.filter(task => task.due_date && task.due_date < todayIso).length : 0,
  }
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

export const summarizeBlockedTasks = tasks => {
  const blocked = tasks
    .filter(task => taskBlockingDependencies(task, tasks).length)
    .map(task => ({ task, blockers: taskBlockingDependencies(task, tasks) }))

  return {
    total: blocked.length,
    blockerTotal: blocked.reduce((sum, item) => sum + item.blockers.length, 0),
    nextDueDate: blocked
      .map(item => item.task.due_date)
      .filter(Boolean)
      .sort()[0] || null,
    items: blocked,
  }
}

export const summarizeAssigneeCapacity = (tasks, todayIso, days = 14, dailyLimit = 3) => {
  if (!todayIso || days <= 0) return []

  const windowEnd = addDays(todayIso, days - 1)
  const rows = new Map()

  for (const task of tasks) {
    if (task.status === 'done') continue
    const start = task.start_date || task.due_date
    const end = task.due_date || task.start_date
    if (!start || !end || end < todayIso || start > windowEnd) continue

    const assignee = taskAssignee(task)
    const row = rows.get(assignee) || { assignee, scheduledTasks: 0, scheduledDays: 0, peakDailyLoad: 0, overloadDays: 0, daily: new Map() }
    row.scheduledTasks += 1

    for (const day of dateRange(start < todayIso ? todayIso : start, end > windowEnd ? windowEnd : end)) {
      row.daily.set(day, (row.daily.get(day) || 0) + 1)
    }
    rows.set(assignee, row)
  }

  return [...rows.values()].map(row => {
    const loads = [...row.daily.values()]
    row.scheduledDays = loads.length
    row.peakDailyLoad = loads.length ? Math.max(...loads) : 0
    row.overloadDays = loads.filter(load => load > dailyLimit).length
    delete row.daily
    return row
  }).sort((a, b) => b.overloadDays - a.overloadDays || b.peakDailyLoad - a.peakDailyLoad || b.scheduledTasks - a.scheduledTasks || a.assignee.localeCompare(b.assignee, 'ko'))
}
