import { normalizedEstimatedMinutes, normalizedReminderMinutesBefore, normalizedLinks, normalizedCustomFields } from './taskFormPayload.js'

export const buildLogDuplicatePayload = log => ({
  content: `${(log?.content || '').trim()} (사본)`,
  log_date: new Date().toLocaleDateString('en-CA'),
  task_id: log?.task_id || null,
  tags: Array.isArray(log?.tags) ? log.tags : [],
  duration_minutes: log?.duration_minutes || null,
  link_url: log?.link_url || null,
  links: Array.isArray(log?.links) ? log.links : [],
  color: log?.color || null,
  log_time: log?.log_time || null,
  billable: !!log?.billable,
  priority: log?.priority || 'normal',
  checklist: Array.isArray(log?.checklist) ? log.checklist.map(item => ({ ...item, done: false })) : [],
  estimated_minutes: log?.estimated_minutes || null,
  custom_fields: Array.isArray(log?.custom_fields) ? log.custom_fields : [],
  reminder_minutes_before: normalizedReminderMinutesBefore(log?.reminder_minutes_before),
  hourly_rate_override: log?.hourly_rate_override ?? null,
  client_name: log?.client_name || null,
})

export const buildTaskFromLogPayload = log => ({
  title: (log?.content || '').trim(),
  tags: Array.isArray(log?.tags) ? log.tags : [],
  priority: 'normal',
  due_date: log?.log_date || null,
  status: 'done',
  progress: 100,
  link_url: log?.link_url || null,
  checklist: Array.isArray(log?.checklist) ? log.checklist : [],
  estimated_minutes: normalizedEstimatedMinutes(log?.estimated_minutes),
  links: normalizedLinks(log?.links),
  custom_fields: normalizedCustomFields(log?.custom_fields),
  color: log?.color || null,
  reminder_minutes_before: normalizedReminderMinutesBefore(log?.reminder_minutes_before),
})
