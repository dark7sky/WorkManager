const priorityLabels = {
  high: '높음',
  normal: '보통',
  low: '낮음',
}

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const checklistSummary = checklist => checklist?.length ? `${checklist.filter(item => item.done).length}/${checklist.length}` : '-'

export const todosToPrintableReport = (todos, { generatedAt = new Date().toISOString(), title = 'WorkManager Todo 보고서' } = {}) => {
  const done = todos.filter(todo => todo.completed).length
  const rows = todos.map(todo => `<tr>
      <td><strong>${escapeHtml(todo.title)}</strong>${todo.memo ? `<small>${escapeHtml(todo.memo)}</small>` : ''}</td>
      <td>${todo.completed ? '완료' : '진행 중'}</td>
      <td>${escapeHtml(priorityLabels[todo.priority] || todo.priority || '')}</td>
      <td>${escapeHtml(todo.todo_time || '-')}</td>
      <td>${escapeHtml((todo.tags || []).join(', '))}</td>
      <td>${escapeHtml(checklistSummary(todo.checklist))}</td>
    </tr>`).join('')

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
    .summary{margin:18px 0;font-weight:700}
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
  <p class="summary">총 ${todos.length}개 · 완료 ${done}개</p>
  <table>
    <thead><tr><th>Todo</th><th>상태</th><th>우선순위</th><th>시간</th><th>태그</th><th>체크리스트</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">표시할 Todo가 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export const todoReportFilename = date => `workmanager-todos-${date}.html`
