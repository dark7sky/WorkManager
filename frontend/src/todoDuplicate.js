import { normalizedEstimatedMinutes, normalizedCustomFields, normalizedReminderMinutesBefore } from './taskFormPayload.js'

export const buildTodoDuplicatePayload = todo => ({
  title: `${(todo?.title || '').trim()} (사본)`,
  todo_date: new Date().toLocaleDateString('en-CA'),
  todo_time: todo?.todo_time || null,
  completed: false,
  tags: Array.isArray(todo?.tags) ? todo.tags : [],
  recurrence_rule: todo?.recurrence_rule || null,
  recurrence_end_date: todo?.recurrence_rule ? todo?.recurrence_end_date || null : null,
  priority: todo?.priority || 'normal',
  link_url: todo?.link_url || null,
  links: Array.isArray(todo?.links) ? todo.links : [],
  memo: todo?.memo || null,
  color: todo?.color || null,
  checklist: Array.isArray(todo?.checklist) ? todo.checklist.map(item => ({ ...item, done: false })) : [],
  estimated_minutes: normalizedEstimatedMinutes(todo?.estimated_minutes),
  custom_fields: normalizedCustomFields(todo?.custom_fields),
  reminder_minutes_before: normalizedReminderMinutesBefore(todo?.reminder_minutes_before),
})

const TODO_PRIORITY_TO_TASK = { high: 'high', normal: 'normal', low: 'low' }

export const buildTaskFromTodoPayload = todo => ({
  title: (todo?.title || '').trim(),
  tags: Array.isArray(todo?.tags) ? todo.tags : [],
  priority: TODO_PRIORITY_TO_TASK[todo?.priority] || 'normal',
  due_date: todo?.todo_date || null,
  status: todo?.completed ? 'done' : 'todo',
  progress: todo?.completed ? 100 : 0,
  link_url: todo?.link_url || null,
  description: todo?.memo || null,
  checklist: Array.isArray(todo?.checklist) ? todo.checklist : [],
  estimated_minutes: normalizedEstimatedMinutes(todo?.estimated_minutes),
})
