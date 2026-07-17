const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const checklistSummary = checklist => checklist?.length ? `${checklist.filter(item => item.done).length}/${checklist.length}` : '-'

const formatWhen = event => {
  const start = new Date(event.start_at || event.start)
  if (Number.isNaN(start.getTime())) return '-'
  const date = start.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  if (event.google_is_all_day) return `${date} (종일)`
  const time = start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

export const eventsToPrintableReport = (events, { title = 'WorkManager 일정 보고서', generatedAt = new Date().toISOString() } = {}) => {
  const rows = events.map(event => `<tr>
      <td><strong>${escapeHtml(event.title)}</strong>${event.description ? `<small>${escapeHtml(event.description)}</small>` : ''}</td>
      <td>${escapeHtml(formatWhen(event))}</td>
      <td>${escapeHtml(event.location || '-')}</td>
      <td>${escapeHtml((event.tags || []).join(', '))}</td>
      <td>${escapeHtml(checklistSummary(event.checklist))}</td>
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
  <p class="summary">총 ${events.length}개 일정</p>
  <table>
    <thead><tr><th>일정</th><th>일시</th><th>장소</th><th>태그</th><th>체크리스트</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">표시할 일정이 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export const eventReportFilename = date => `workmanager-events-${date}.html`
