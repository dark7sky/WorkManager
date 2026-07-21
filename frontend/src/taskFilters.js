export const isTaskOverdue = (task, todayIso) => task.status !== 'done' && task.due_date && todayIso && task.due_date < todayIso

export const withAddedTag = (tags, tag) => {
  const trimmed = (tag || '').trim()
  if (!trimmed) return tags || []
  const existing = tags || []
  if (existing.some(x => x.toLowerCase() === trimmed.toLowerCase())) return existing
  return [...existing, trimmed]
}

export const pendingApprovalCount = tasks => tasks.filter(task => (task.status === 'done' && task.approval_status === 'pending') || task.schedule_approval_status === 'pending').length

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

export const DEFAULT_TASK_FILTERS = { query: '', status: 'active', selectedTags: [], priority: 'all' }

export const hasActiveTaskFilters = ({ query = '', status = 'active', selectedTags = [], priority = 'all' }) =>
  query.trim() !== '' || status !== DEFAULT_TASK_FILTERS.status || selectedTags.length > 0 || priority !== 'all'

export const filterTasks = (tasks, { query = '', status = 'active', selectedTags = [], priority = 'all', todayIso }) => {
  const q = query.trim().toLowerCase()
  return tasks.filter(task => {
    const checklistText = (task.checklist || []).map(item => item?.text || '').join(' ')
    const attachmentText = (task.attachment_names || []).join(' ')
    const customFieldText = (task.custom_fields || []).map(field => `${field?.label || ''} ${field?.value || ''}`).join(' ')
    const matchesQuery = !q || `${task.title} ${task.description || ''} ${(task.tags || []).join(' ')} ${checklistText} ${attachmentText} ${customFieldText}`.toLowerCase().includes(q)
    const matchesStatus = status === 'all'
      || (status === 'overdue'
        ? isTaskOverdue(task, todayIso)
        : status === 'due_today'
          ? task.status !== 'done' && task.due_date && todayIso && task.due_date === todayIso
        : status === 'due_this_week'
          ? task.status !== 'done' && task.due_date && todayIso && task.due_date >= todayIso && task.due_date <= addDays(todayIso, 6)
          : status === 'no_due_date'
            ? task.status !== 'done' && !task.due_date
            : status === 'blocked'
              ? task.status !== 'done' && taskBlockingDependencies(task, tasks).length > 0
            : status === 'active'
            ? task.status !== 'done'
            : status === 'in_progress'
              ? ['in_progress', 'doing'].includes(task.status)
              : status === 'approval_pending'
                ? task.status === 'done' && task.approval_status === 'pending'
                : status === 'schedule_pending'
                  ? task.schedule_approval_status === 'pending'
                  : task.status === status)
    const matchesTags = !selectedTags.length || selectedTags.every(tag => (task.tags || []).includes(tag))
    const matchesPriority = priority === 'all' || task.priority === priority
    return matchesQuery && matchesStatus && matchesTags && matchesPriority
  })
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

export const REMINDER_DIGEST_STORAGE_KEY = 'wm-reminder-digest-scope'

export const reminderDigestTasks = (tasks, todayIso, scope = 'today') => {
  if (!todayIso) return []
  if (scope === 'due_soon') {
    const soonLimit = addDays(todayIso, 2)
    return tasks.filter(task => task.status !== 'done' && task.due_date && task.due_date <= soonLimit)
  }
  return tasks.filter(task => task.status !== 'done' && task.due_date === todayIso)
}

export const allIdsSelected = (ids, selected) => ids.length > 0 && ids.every(id => selected.has(id))

export const toggleSelectAllIds = (ids, selected) =>
  allIdsSelected(ids, selected) ? new Set() : new Set(ids)

export const BOARD_STATUSES = ['todo', 'doing', 'done']

export const groupTasksByStatus = tasks => {
  const groups = { todo: [], doing: [], done: [] }
  for (const task of tasks) {
    const status = task.status === 'in_progress' ? 'doing' : task.status
    ;(groups[status] || groups.todo).push(task)
  }
  return groups
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

export const newlyUnblockedTasks = (prevTasks, tasks) => {
  if (!prevTasks?.length || !tasks?.length) return []
  const prevBlockedIds = new Set(
    prevTasks.filter(task => task.status !== 'done' && taskBlockingDependencies(task, prevTasks).length).map(task => task.id)
  )
  return tasks.filter(task => task.status !== 'done' && prevBlockedIds.has(task.id) && taskBlockingDependencies(task, tasks).length === 0)
}
