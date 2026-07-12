const pad = n => String(n).padStart(2, '0')

const toIcsDate = value => {
  const date = new Date(value)
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

const escapeIcsText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

const foldLine = line => {
  if (line.length <= 75) return line
  const chunks = []
  let rest = line
  while (rest.length > 75) { chunks.push(rest.slice(0, 75)); rest = ' ' + rest.slice(75) }
  chunks.push(rest)
  return chunks.join('\r\n')
}

export const eventsToIcs = events => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WorkManager//Calendar Export//KO']
  for (const event of events) {
    const start = event.start_at || event.start
    const end = event.end_at || event.end
    if (!start || !end) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.id ?? event.local_uid ?? Math.random().toString(36).slice(2)}@workmanager`)
    lines.push(`DTSTAMP:${toIcsDate(new Date())}`)
    lines.push(`DTSTART:${toIcsDate(start)}`)
    lines.push(`DTEND:${toIcsDate(end)}`)
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

export const icsFilename = date => `workmanager-events-${date}.ics`
