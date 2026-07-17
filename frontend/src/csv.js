const taskStatusLabels = {
  todo: '할 일',
  doing: '진행 중',
  in_progress: '진행 중',
  done: '완료',
  overdue: '지연',
}

const priorityValueToLabel = { low: '낮음', normal: '보통', high: '높음' }

const headers = ['제목', '상태', '우선순위', '시작일', '기한', '진행률', '분류', '태그', '메모']

const escapeCsvCell = value => {
  const text = value == null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `\t${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export const taskExportStatus = (task, todayIso) => {
  const overdue = task.status !== 'done' && task.due_date && todayIso && task.due_date < todayIso
  return overdue ? 'overdue' : task.status
}

export const tasksToCsv = (tasks, todayIso) => {
  const rows = tasks.map(task => [
    task.title,
    taskStatusLabels[taskExportStatus(task, todayIso)] || task.status,
    priorityValueToLabel[task.priority] || task.priority,
    task.start_date,
    task.due_date,
    `${Number(task.progress || 0)}%`,
    task.category,
    (task.tags || []).join('; '),
    task.description,
  ])
  return [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const taskCsvFilename = date => `workmanager-tasks-${date}.csv`

const priorityLabelToValue = { 낮음: 'low', 보통: 'normal', 높음: 'high', low: 'low', normal: 'normal', high: 'high' }

const parseCsvRows = text => {
  const rows = []
  let row = [], cell = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\r') continue
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c !== ''))
}

export const parseTasksCsv = text => {
  const rows = parseCsvRows(text.replace(/^﻿/, ''))
  if (!rows.length) return { tasks: [], errors: [] }
  const header = rows[0].map(h => h.trim())
  const col = name => header.indexOf(name)
  const iTitle = col('제목'), iPriority = col('우선순위'), iStart = col('시작일'), iDue = col('기한'), iTags = col('태그'), iDescription = col('메모')
  const tasks = [], errors = []
  rows.slice(1).forEach((cells, idx) => {
    const title = (iTitle >= 0 ? cells[iTitle] : '')?.trim()
    if (!title) { errors.push(`${idx + 2}행: 제목이 없어 건너뜀`); return }
    const task = { title }
    if (iPriority >= 0 && cells[iPriority]) task.priority = priorityLabelToValue[cells[iPriority].trim()] || 'normal'
    if (iStart >= 0 && cells[iStart]) task.start_date = cells[iStart].trim()
    if (iDue >= 0 && cells[iDue]) task.due_date = cells[iDue].trim()
    if (iTags >= 0 && cells[iTags]) task.tags = cells[iTags].split(';').map(t => t.trim()).filter(Boolean)
    if (iDescription >= 0 && cells[iDescription]) task.description = cells[iDescription]
    tasks.push(task)
  })
  return { tasks, errors }
}

const timelineHeaders = ['날짜', '구분', '제목', '태그']

export const timelineToCsv = items => {
  const rows = items.map(item => [
    item.date,
    item.type_label || item.type,
    item.title || item.content,
    (item.tags || []).join('; '),
  ])
  return [timelineHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const timelineCsvFilename = (start, end) => `workmanager-report-${start}_${end}.csv`

export const auditActionLabels = {
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  purge: '정리',
  sync: '동기화',
  remote_delete: '원격 삭제',
  resolve_conflict: '충돌 해결',
  recurrence_create: '반복 생성',
  import: '가져오기',
  rename: '이름 변경',
}

export const auditEntityLabels = {
  tasks: '업무',
  events: '일정',
  todos: 'Todo',
  work_logs: '업무 기록',
  trash: '휴지통',
  google_calendar: 'Google 캘린더',
  task_comment: '업무 댓글',
  event_comment: '일정 댓글',
  todo_comment: 'Todo 댓글',
  work_log_comment: '업무 기록 댓글',
  task_attachment: '업무 첨부파일',
  event_attachment: '일정 첨부파일',
  todo_attachment: 'Todo 첨부파일',
  work_log_attachment: '업무 기록 첨부파일',
  session: '세션',
  settings: '설정',
  feature_requests: '기능 요청',
  tags: '태그',
  backup: '백업',
}

const auditMetadataText = metadata => {
  if (!metadata || !Object.keys(metadata).length) return ''
  if (Array.isArray(metadata.fields)) return `변경 필드: ${metadata.fields.join(', ')}`
  if (metadata.strategy) return `처리 방식: ${metadata.strategy}`
  if (metadata.rule) return `반복 규칙: ${metadata.rule}`
  if (metadata.older_than_days) return `${metadata.older_than_days}일 이전 항목 정리`
  return Object.entries(metadata).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' · ')
}

const auditHeaders = ['일시', '작업', '대상', '대상 ID', '상세']

export const auditLogsToCsv = logs => {
  const rows = logs.map(log => [
    log.created_at,
    auditActionLabels[log.action] || log.action,
    auditEntityLabels[log.entity_type] || log.entity_type,
    log.entity_id ?? '',
    auditMetadataText(log.metadata),
  ])
  return [auditHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const auditLogCsvFilename = date => `workmanager-audit-log-${date}.csv`

const eventHeaders = ['제목', '시작', '종료', '종일 여부', '우선순위', '장소', '태그', '메모']

export const eventsToCsv = events => {
  const rows = events.map(event => [
    event.title,
    event.start_at || event.start,
    event.end_at || event.end,
    event.google_is_all_day ? 'Y' : 'N',
    priorityValueToLabel[event.priority] || event.priority,
    event.location,
    (event.tags || []).join('; '),
    event.description,
  ])
  return [eventHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const eventCsvFilename = date => `workmanager-events-${date}.csv`

export const parseEventsCsv = text => {
  const rows = parseCsvRows(text.replace(/^﻿/, ''))
  if (!rows.length) return { events: [], errors: [] }
  const header = rows[0].map(h => h.trim())
  const col = name => header.indexOf(name)
  const iTitle = col('제목'), iStart = col('시작'), iEnd = col('종료'), iAllDay = col('종일 여부'), iPriority = col('우선순위'), iLocation = col('장소'), iTags = col('태그'), iDescription = col('메모')
  const events = [], errors = []
  rows.slice(1).forEach((cells, idx) => {
    const title = (iTitle >= 0 ? cells[iTitle] : '')?.trim()
    if (!title) { errors.push(`${idx + 2}행: 제목이 없어 건너뜀`); return }
    const start = (iStart >= 0 ? cells[iStart] : '')?.trim()
    if (!start) { errors.push(`${idx + 2}행: 시작 일시가 없어 건너뜀`); return }
    const event = { title, start_at: start, end_at: (iEnd >= 0 && cells[iEnd]?.trim()) || start }
    if (iAllDay >= 0 && cells[iAllDay]) event.google_is_all_day = cells[iAllDay].trim().toUpperCase() === 'Y'
    if (iPriority >= 0 && cells[iPriority]) event.priority = priorityLabelToValue[cells[iPriority].trim()] || 'normal'
    if (iLocation >= 0 && cells[iLocation]) event.location = cells[iLocation].trim()
    if (iTags >= 0 && cells[iTags]) event.tags = cells[iTags].split(';').map(t => t.trim()).filter(Boolean)
    if (iDescription >= 0 && cells[iDescription]) event.description = cells[iDescription]
    events.push(event)
  })
  return { events, errors }
}

const todoHeaders = ['제목', '완료 여부', '우선순위', '반복', '날짜', '태그']
const todoRecurrenceLabels = { daily: '매일', weekly: '매주', biweekly: '격주', monthly: '매월' }

export const todosToCsv = todos => {
  const rows = todos.map(todo => [
    todo.title,
    todo.completed ? 'Y' : 'N',
    priorityValueToLabel[todo.priority] || todo.priority,
    todoRecurrenceLabels[todo.recurrence_rule] || '',
    todo.todo_date,
    (todo.tags || []).join('; '),
  ])
  return [todoHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const todoCsvFilename = date => `workmanager-todos-${date}.csv`

const todoRecurrenceLabelToValue = { 매일: 'daily', 매주: 'weekly', 격주: 'biweekly', 매월: 'monthly', daily: 'daily', weekly: 'weekly', biweekly: 'biweekly', monthly: 'monthly' }

export const parseTodosCsv = text => {
  const rows = parseCsvRows(text.replace(/^﻿/, ''))
  if (!rows.length) return { todos: [], errors: [] }
  const header = rows[0].map(h => h.trim())
  const col = name => header.indexOf(name)
  const iTitle = col('제목'), iPriority = col('우선순위'), iRecurrence = col('반복'), iDate = col('날짜'), iTags = col('태그')
  const todos = [], errors = []
  rows.slice(1).forEach((cells, idx) => {
    const title = (iTitle >= 0 ? cells[iTitle] : '')?.trim()
    if (!title) { errors.push(`${idx + 2}행: 제목이 없어 건너뜀`); return }
    const todo = { title }
    if (iPriority >= 0 && cells[iPriority]) todo.priority = priorityLabelToValue[cells[iPriority].trim()] || 'normal'
    if (iRecurrence >= 0 && cells[iRecurrence]) todo.recurrence_rule = todoRecurrenceLabelToValue[cells[iRecurrence].trim()] || null
    if (iDate >= 0 && cells[iDate]) todo.todo_date = cells[iDate].trim()
    if (iTags >= 0 && cells[iTags]) todo.tags = cells[iTags].split(';').map(t => t.trim()).filter(Boolean)
    todos.push(todo)
  })
  return { todos, errors }
}

const workLogHeaders = ['날짜', '내용', '소요 시간(분)', '연결 업무', '태그', '청구 가능', '청구 금액(원)']

export const workLogsToCsv = (logs, taskTitleById, hourlyRate) => {
  const rows = logs.map(log => [
    log.log_date,
    log.content,
    log.duration_minutes ?? '',
    log.task_id ? (taskTitleById?.get(log.task_id) ? `#${log.task_id} ${taskTitleById.get(log.task_id)}` : `#${log.task_id}`) : '',
    (log.tags || []).join('; '),
    log.billable ? 'Y' : '',
    log.billable && hourlyRate != null ? Math.round((log.duration_minutes || 0) / 60 * hourlyRate) : '',
  ])
  return [workLogHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const workLogCsvFilename = date => `workmanager-work-logs-${date}.csv`

export const parseWorkLogsCsv = text => {
  const rows = parseCsvRows(text.replace(/^﻿/, ''))
  if (!rows.length) return { logs: [], errors: [] }
  const header = rows[0].map(h => h.trim())
  const col = name => header.indexOf(name)
  const iDate = col('날짜'), iContent = col('내용'), iDuration = col('소요 시간(분)'), iTags = col('태그')
  const logs = [], errors = []
  rows.slice(1).forEach((cells, idx) => {
    const content = (iContent >= 0 ? cells[iContent] : '')?.trim()
    if (!content) { errors.push(`${idx + 2}행: 내용이 없어 건너뜀`); return }
    const log = { content }
    if (iDate >= 0 && cells[iDate]) log.log_date = cells[iDate].trim()
    if (iDuration >= 0 && cells[iDuration] && !Number.isNaN(Number(cells[iDuration]))) log.duration_minutes = Number(cells[iDuration])
    if (iTags >= 0 && cells[iTags]) log.tags = cells[iTags].split(';').map(t => t.trim()).filter(Boolean)
    logs.push(log)
  })
  return { logs, errors }
}
