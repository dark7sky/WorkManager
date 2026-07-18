import { normalizedEstimatedMinutes } from './taskFormPayload.js'

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
})
