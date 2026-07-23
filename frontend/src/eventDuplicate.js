import { normalizedEstimatedMinutes, normalizedChecklist, normalizedLinks, normalizedCustomFields, normalizedReminderMinutesBefore } from './taskFormPayload.js'

export const buildEventDuplicatePayload = event => ({
  title: `${(event?.title || '').trim()} (사본)`,
  description: (event?.description || '').trim(),
  start_at: event?.start_at || event?.start || null,
  end_at: event?.end_at || event?.end || null,
  location: (event?.location || '').trim(),
  tags: Array.isArray(event?.tags) ? event.tags : [],
  color: event?.color || null,
  priority: event?.priority || null,
  estimated_minutes: normalizedEstimatedMinutes(event?.estimated_minutes),
  link_url: event?.link_url || null,
  links: normalizedLinks(event?.links),
  checklist: normalizedChecklist(event?.checklist).map(item => ({ ...item, done: false })),
  google_is_all_day: !!event?.google_is_all_day,
  custom_fields: normalizedCustomFields(event?.custom_fields),
  reminder_minutes_before: normalizedReminderMinutesBefore(event?.reminder_minutes_before),
})

const EVENT_PRIORITY_TO_TASK = { high: 'high', normal: 'normal', low: 'low' }

export const buildTaskFromEventPayload = event => ({
  title: (event?.title || '').trim(),
  tags: Array.isArray(event?.tags) ? event.tags : [],
  priority: EVENT_PRIORITY_TO_TASK[event?.priority] || 'normal',
  due_date: (event?.start_at || event?.start || '').slice(0, 10) || null,
  status: 'todo',
  progress: 0,
  link_url: event?.link_url || null,
  description: (event?.description || '').trim() || null,
  checklist: normalizedChecklist(event?.checklist),
  estimated_minutes: normalizedEstimatedMinutes(event?.estimated_minutes),
  links: normalizedLinks(event?.links),
  custom_fields: normalizedCustomFields(event?.custom_fields),
  color: event?.color || null,
  reminder_minutes_before: normalizedReminderMinutesBefore(event?.reminder_minutes_before),
})
