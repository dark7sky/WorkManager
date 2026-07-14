const taskStatusLabels = {
  todo: '할 일',
  doing: '진행 중',
  in_progress: '진행 중',
  done: '완료',
  overdue: '지연',
}

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
    task.priority,
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

const auditActionLabels = {
  create: '생성',
  update: '수정',
  delete: '삭제',
  restore: '복원',
  purge: '정리',
  sync: '동기화',
  remote_delete: '원격 삭제',
  resolve_conflict: '충돌 해결',
  recurrence_create: '반복 생성',
}

const auditEntityLabels = {
  tasks: '업무',
  events: '일정',
  todos: 'Todo',
  work_logs: '업무 기록',
  trash: '휴지통',
  google_calendar: 'Google 캘린더',
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

const eventHeaders = ['제목', '시작', '종료', '종일 여부', '장소', '태그', '메모']

export const eventsToCsv = events => {
  const rows = events.map(event => [
    event.title,
    event.start_at || event.start,
    event.end_at || event.end,
    event.google_is_all_day ? 'Y' : 'N',
    event.location,
    (event.tags || []).join('; '),
    event.description,
  ])
  return [eventHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const eventCsvFilename = date => `workmanager-events-${date}.csv`

const todoHeaders = ['제목', '완료 여부', '우선순위', '반복', '날짜', '태그']
const todoRecurrenceLabels = { daily: '매일', weekly: '매주' }

export const todosToCsv = todos => {
  const rows = todos.map(todo => [
    todo.title,
    todo.completed ? 'Y' : 'N',
    todo.priority,
    todoRecurrenceLabels[todo.recurrence_rule] || '',
    todo.todo_date,
    (todo.tags || []).join('; '),
  ])
  return [todoHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const todoCsvFilename = date => `workmanager-todos-${date}.csv`

const todoRecurrenceLabelToValue = { 매일: 'daily', 매주: 'weekly', daily: 'daily', weekly: 'weekly' }

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

const workLogHeaders = ['날짜', '내용', '소요 시간(분)', '연결 업무', '태그']

export const workLogsToCsv = (logs, taskTitleById) => {
  const rows = logs.map(log => [
    log.log_date,
    log.content,
    log.duration_minutes ?? '',
    log.task_id ? (taskTitleById?.get(log.task_id) ? `#${log.task_id} ${taskTitleById.get(log.task_id)}` : `#${log.task_id}`) : '',
    (log.tags || []).join('; '),
  ])
  return [workLogHeaders, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
}

export const workLogCsvFilename = date => `workmanager-work-logs-${date}.csv`
