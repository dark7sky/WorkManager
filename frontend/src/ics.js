const pad = n => String(n).padStart(2, '0')

const toIcsDate = value => {
  const date = new Date(value)
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

const escapeIcsText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

const priorityToIcs = { high: 1, normal: 5, low: 9 }
const priorityFromIcs = { 1: 'high', 5: 'normal', 9: 'low' }

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
    if (priorityToIcs[event.priority]) lines.push(`PRIORITY:${priorityToIcs[event.priority]}`)
    if (event.estimated_minutes) lines.push(`X-WM-ESTIMATE-MINUTES:${event.estimated_minutes}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

export const icsFilename = date => `workmanager-events-${date}.ics`

const toIcsAllDayDate = value => {
  const date = new Date(`${value}T00:00:00`)
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export const tasksToIcs = tasks => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WorkManager//Task Export//KO']
  for (const task of tasks) {
    if (!task.due_date) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:task-${task.id}@workmanager`)
    lines.push(`DTSTAMP:${toIcsDate(new Date())}`)
    if (task.due_time) {
      const start = new Date(`${task.due_date}T${task.due_time}:00`)
      const end = new Date(start.getTime() + 30 * 60000)
      lines.push(`DTSTART:${toIcsDate(start)}`)
      lines.push(`DTEND:${toIcsDate(end)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${toIcsAllDayDate(task.due_date)}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(`[업무] ${task.title}`)}`)
    if (task.description) lines.push(`DESCRIPTION:${escapeIcsText(task.description)}`)
    if (priorityToIcs[task.priority]) lines.push(`PRIORITY:${priorityToIcs[task.priority]}`)
    if (task.estimated_minutes) lines.push(`X-WM-ESTIMATE-MINUTES:${task.estimated_minutes}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

export const taskIcsFilename = date => `workmanager-tasks-${date}.ics`

export const todosToIcs = todos => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WorkManager//Todo Export//KO']
  for (const todo of todos) {
    if (!todo.todo_date) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:todo-${todo.id}@workmanager`)
    lines.push(`DTSTAMP:${toIcsDate(new Date())}`)
    if (todo.todo_time) {
      const start = new Date(`${todo.todo_date}T${todo.todo_time}:00`)
      const end = new Date(start.getTime() + 30 * 60000)
      lines.push(`DTSTART:${toIcsDate(start)}`)
      lines.push(`DTEND:${toIcsDate(end)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${toIcsAllDayDate(todo.todo_date)}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(`[할 일] ${todo.title}`)}`)
    if (todo.memo) lines.push(`DESCRIPTION:${escapeIcsText(todo.memo)}`)
    if (priorityToIcs[todo.priority]) lines.push(`PRIORITY:${priorityToIcs[todo.priority]}`)
    if (todo.estimated_minutes) lines.push(`X-WM-ESTIMATE-MINUTES:${todo.estimated_minutes}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

export const todoIcsFilename = date => `workmanager-todos-${date}.ics`

export const logsToIcs = logs => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WorkManager//Work Log Export//KO']
  for (const log of logs) {
    if (!log.log_date) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:log-${log.id}@workmanager`)
    lines.push(`DTSTAMP:${toIcsDate(new Date())}`)
    if (log.log_time) {
      const start = new Date(`${log.log_date}T${log.log_time}:00`)
      const end = new Date(start.getTime() + (log.duration_minutes || 30) * 60000)
      lines.push(`DTSTART:${toIcsDate(start)}`)
      lines.push(`DTEND:${toIcsDate(end)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${toIcsAllDayDate(log.log_date)}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(`[기록] ${log.content}`)}`)
    if (priorityToIcs[log.priority]) lines.push(`PRIORITY:${priorityToIcs[log.priority]}`)
    if (log.estimated_minutes) lines.push(`X-WM-ESTIMATE-MINUTES:${log.estimated_minutes}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

export const logIcsFilename = date => `workmanager-worklogs-${date}.ics`

const unfoldIcs = text => text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')

const unescapeIcsText = value => value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

const parseIcsDate = value => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (h === undefined) return `${y}-${mo}-${d}T00:00:00`
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`
  return new Date(iso).toISOString()
}

export const parseIcs = text => {
  const lines = unfoldIcs(text).split('\n').map(l => l.trim()).filter(Boolean)
  const events = []
  let current = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue }
    if (line === 'END:VEVENT') { if (current?.title && current.start_at) events.push(current); current = null; continue }
    if (!current) continue
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).split(';')[0]
    const value = unescapeIcsText(line.slice(sep + 1))
    if (key === 'SUMMARY') current.title = value
    else if (key === 'DESCRIPTION') current.description = value
    else if (key === 'LOCATION') current.location = value
    else if (key === 'DTSTART') { current.start_at = parseIcsDate(value); current.start_all_day = line.slice(0, sep).includes('VALUE=DATE') }
    else if (key === 'DTEND') current.end_at = parseIcsDate(value)
    else if (key === 'PRIORITY') current.priority = priorityFromIcs[Number(value)]
    else if (key === 'X-WM-ESTIMATE-MINUTES') current.estimated_minutes = Number(value) || undefined
  }
  return events.filter(e => e.start_at && (e.end_at || e.start_all_day))
}

const stripPrefix = (title, prefix) => title.startsWith(prefix) ? title.slice(prefix.length) : title

export const icsToTasks = text => parseIcs(text).map(({ title, description, start_at, start_all_day, priority, estimated_minutes }) => {
  const date = new Date(start_at)
  const task = { title: stripPrefix(title, '[업무] '), due_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
  if (!start_all_day) task.due_time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (description) task.description = description
  if (priority) task.priority = priority
  if (estimated_minutes) task.estimated_minutes = estimated_minutes
  return task
})

export const icsToTodos = text => parseIcs(text).map(({ title, description, start_at, start_all_day, priority, estimated_minutes }) => {
  const date = new Date(start_at)
  const todo = { title: stripPrefix(title, '[할 일] '), todo_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
  if (!start_all_day) todo.todo_time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (description) todo.memo = description
  if (priority) todo.priority = priority
  if (estimated_minutes) todo.estimated_minutes = estimated_minutes
  return todo
})

export const icsToLogs = text => parseIcs(text).map(({ title, start_at, end_at, start_all_day, priority, estimated_minutes }) => {
  const date = new Date(start_at)
  const log = { content: stripPrefix(title, '[기록] '), log_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
  if (!start_all_day) {
    log.log_time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
    if (end_at) log.duration_minutes = Math.round((new Date(end_at) - date) / 60000)
  }
  if (priority) log.priority = priority
  if (estimated_minutes) log.estimated_minutes = estimated_minutes
  return log
})
