const statusLabels = {
  todo: '할 일',
  doing: '진행 중',
  in_progress: '진행 중',
  done: '완료',
  overdue: '지연',
}

const priorityLabels = {
  high: '높음',
  medium: '보통',
  normal: '보통',
  low: '낮음',
}

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const reportStatus = (task, todayIso) => {
  const overdue = task.status !== 'done' && task.due_date && todayIso && task.due_date < todayIso
  return overdue ? 'overdue' : task.status
}

export const tasksToPrintableReport = (tasks, { todayIso, generatedAt = new Date().toISOString(), title = 'WorkManager 업무 보고서' } = {}) => {
  const active = tasks.filter(task => task.status !== 'done').length
  const done = tasks.filter(task => task.status === 'done').length
  const overdue = tasks.filter(task => reportStatus(task, todayIso) === 'overdue').length
  const rows = tasks.map(task => {
    const status = reportStatus(task, todayIso)
    return `<tr>
      <td><strong>${escapeHtml(task.title)}</strong>${task.description ? `<small>${escapeHtml(task.description)}</small>` : ''}</td>
      <td>${escapeHtml(statusLabels[status] || status || '')}</td>
      <td>${escapeHtml(priorityLabels[task.priority] || task.priority || '')}</td>
      <td>${escapeHtml(task.start_date || '-')}</td>
      <td>${escapeHtml(task.due_date || '-')}</td>
      <td>${Number(task.progress || 0)}%</td>
      <td>${escapeHtml((task.tags || []).join(', '))}</td>
    </tr>`
  }).join('')

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Segoe UI,Noto Sans KR,Arial,sans-serif;color:#202124;margin:32px}
    header{border-bottom:2px solid #202124;padding-bottom:16px;margin-bottom:20px}
    h1{font-size:24px;margin:0 0 8px}
    p{margin:0;color:#5f6670}
    .summary{display:flex;gap:12px;margin:18px 0;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #dfe3e8;padding:8px;text-align:left;vertical-align:top}
    th{background:#f5f7fa}
    td small{display:block;color:#5f6670;margin-top:4px;white-space:pre-wrap}
    @media print{body{margin:18mm}.no-print{display:none}}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>생성 시각: ${escapeHtml(generatedAt)}</p>
  </header>
  <p class="summary">총 ${tasks.length}개 · 진행 ${active}개 · 완료 ${done}개 · 지연 ${overdue}개</p>
  <table>
    <thead><tr><th>업무</th><th>상태</th><th>우선순위</th><th>시작일</th><th>기한</th><th>진행률</th><th>태그</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">표시할 업무가 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export const taskReportFilename = date => `workmanager-tasks-${date}.html`
