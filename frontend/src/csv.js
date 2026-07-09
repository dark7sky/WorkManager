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
