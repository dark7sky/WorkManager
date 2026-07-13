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
