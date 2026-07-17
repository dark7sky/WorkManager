const MAX_OCCURRENCES = 52
const pad = n => String(n).padStart(2, '0')
const toLocalString = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
const makeRecurrenceGroupId = () => `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function advance(date, rule) {
  const next = new Date(date)
  if (rule === 'daily') next.setDate(next.getDate() + 1)
  else if (rule === 'weekly') next.setDate(next.getDate() + 7)
  else if (rule === 'biweekly') next.setDate(next.getDate() + 14)
  else if (rule === 'monthly') next.setMonth(next.getMonth() + 1)
  return next
}

export function expandRecurringEvent(payload, rule, until) {
  if (!rule || !until) return [payload]
  const untilDate = new Date(`${until}T23:59:59`)
  const start = new Date(payload.start_at)
  const end = new Date(payload.end_at)
  const duration = end.getTime() - start.getTime()
  const occurrences = []
  let cursor = start
  while (cursor <= untilDate && occurrences.length < MAX_OCCURRENCES) {
    occurrences.push({ ...payload, start_at: toLocalString(cursor), end_at: toLocalString(new Date(cursor.getTime() + duration)) })
    cursor = advance(cursor, rule)
  }
  if (!occurrences.length) return [payload]
  if (occurrences.length === 1) return occurrences
  const groupId = makeRecurrenceGroupId()
  return occurrences.map(o => ({ ...o, recurrence_group_id: groupId }))
}
