export const GANTT_DAYS = 14

export function dayAtOffset(offsetX, trackWidth, days = GANTT_DAYS) {
  if (!trackWidth || trackWidth <= 0) return 0
  return Math.max(0, Math.min(days - 1, Math.floor((offsetX / trackWidth) * days)))
}

const addDays = (isoDate, delta) => {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toLocaleDateString('en-CA')
}

// Returns the patch to persist after a drag, or null when nothing changes.
// Only tasks with both dates can be dragged: bars without an explicit start
// or due date borrow window edges for display, so a pixel delta has no
// well-defined meaning for them.
export function ganttDragDates(mode, task, { grabDay, dropDay, windowStartIso }) {
  if (!task?.start_date || !task?.due_date) return null
  if (mode === 'move') {
    const delta = dropDay - grabDay
    if (!delta) return null
    return { start_date: addDays(task.start_date, delta), due_date: addDays(task.due_date, delta) }
  }
  if (mode === 'resize-end') {
    let due = addDays(windowStartIso, dropDay)
    if (due < task.start_date) due = task.start_date
    if (due === task.due_date) return null
    return { start_date: task.start_date, due_date: due }
  }
  if (mode === 'resize-start') {
    let start = addDays(windowStartIso, dropDay)
    if (start > task.due_date) start = task.due_date
    if (start === task.start_date) return null
    return { start_date: start, due_date: task.due_date }
  }
  return null
}

// One-click "postpone" patch for an overdue task: shifts due_date (and
// start_date, to preserve duration) forward by deltaDays. Returns null when
// there is no due_date to shift.
export function postponeTaskDates(task, deltaDays = 1) {
  if (!task?.due_date) return null
  const due_date = addDays(task.due_date, deltaDays)
  if (!task.start_date) return { due_date }
  return { start_date: addDays(task.start_date, deltaDays), due_date }
}

// Same one-click "postpone" idea, applied to a todo's single todo_date.
export function postponeTodoDate(todo, deltaDays = 1) {
  if (!todo?.todo_date) return null
  return { todo_date: addDays(todo.todo_date, deltaDays) }
}

// Same one-click "postpone" idea, applied to a work log's single log_date.
export function postponeLogDate(log, deltaDays = 1) {
  if (!log?.log_date) return null
  return { log_date: addDays(log.log_date, deltaDays) }
}

// Preview geometry (in day units within the visible window) while dragging.
export function ganttDragPreview(mode, { left, width }, { grabDay, dropDay }, days = GANTT_DAYS) {
  if (mode === 'move') {
    const shifted = Math.max(-width + 1, Math.min(days - 1, left + (dropDay - grabDay)))
    return { left: shifted, width }
  }
  if (mode === 'resize-end') {
    const right = Math.max(left, Math.min(days - 1, dropDay))
    return { left, width: right - left + 1 }
  }
  if (mode === 'resize-start') {
    const right = left + width - 1
    const newLeft = Math.max(0, Math.min(right, dropDay))
    return { left: newLeft, width: right - newLeft + 1 }
  }
  return { left, width }
}
