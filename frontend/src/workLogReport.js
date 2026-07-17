const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const checklistSummary = checklist => checklist?.length ? `${checklist.filter(item => item.done).length}/${checklist.length}` : '-'

export const workLogsToPrintableReport = (logs, taskTitleById, hourlyRate, { generatedAt = new Date().toISOString(), title = 'WorkManager 업무 기록 보고서' } = {}) => {
  const totalMinutes = logs.reduce((sum, log) => sum + Number(log.duration_minutes || 0), 0)
  const billableMinutes = logs.filter(log => log.billable).reduce((sum, log) => sum + Number(log.duration_minutes || 0), 0)
  const rows = logs.map(log => `<tr>
      <td><strong>${escapeHtml(log.content)}</strong></td>
      <td>${escapeHtml(log.log_time || '-')}</td>
      <td>${log.duration_minutes ? `${Number(log.duration_minutes)}분` : '-'}</td>
      <td>${log.task_id && taskTitleById?.has(log.task_id) ? escapeHtml(taskTitleById.get(log.task_id)) : '-'}</td>
      <td>${log.billable ? '가능' : '불가'}</td>
      <td>${escapeHtml((log.tags || []).join(', '))}</td>
      <td>${escapeHtml(checklistSummary(log.checklist))}</td>
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
    @media print{body{margin:18mm}.no-print{display:none}}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>생성 시각: ${escapeHtml(generatedAt)}</p>
  </header>
  <p class="summary">총 ${logs.length}건 · 총 ${totalMinutes}분${hourlyRate ? ` · 청구 가능 ${billableMinutes}분` : ''}</p>
  <table>
    <thead><tr><th>내용</th><th>시각</th><th>소요 시간</th><th>연결 업무</th><th>청구 가능</th><th>태그</th><th>체크리스트</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">표시할 업무 기록이 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export const workLogReportFilename = date => `workmanager-worklogs-${date}.html`
