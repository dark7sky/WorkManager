const pad = n => String(n).padStart(2, '0')

const shiftDateTime = (value, dayDelta) => {
  if (!value) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  d.setDate(d.getDate() + dayDelta)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Patch to move an event to another calendar day, keeping its time of day
// and duration. Returns null when the drop lands on the event's own day.
export function moveEventToDay(event, dayIso) {
  const start = event?.start_at || event?.start
  const end = event?.end_at || event?.end
  if (!start || !dayIso) return null
  const startDay = String(start).slice(0, 10)
  if (startDay === dayIso) return null
  const dayDelta = Math.round((new Date(`${dayIso}T00:00:00`) - new Date(`${startDay}T00:00:00`)) / 86400000)
  if (!dayDelta) return null
  return { start_at: shiftDateTime(start, dayDelta), end_at: shiftDateTime(end, dayDelta) }
}

// One-click "postpone" patch for an event: shifts start_at/end_at forward by
// deltaDays, keeping time of day and duration. Returns null when there is no
// start_at to shift.
export function postponeEventDates(event, deltaDays = 1) {
  const start = event?.start_at || event?.start
  if (!start || !deltaDays) return null
  const end = event?.end_at || event?.end
  return { start_at: shiftDateTime(start, deltaDays), end_at: shiftDateTime(end, deltaDays) }
}
