const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export const auditLogsToPrintableReport = (logs, { actionLabels = {}, entityLabels = {}, metadataText = () => '', generatedAt = new Date().toISOString(), title = 'WorkManager 감사 로그 보고서' } = {}) => {
  const rows = logs.map(log => `<tr>
    <td>${escapeHtml(log.created_at)}</td>
    <td>${escapeHtml(actionLabels[log.action] || log.action)}</td>
    <td>${escapeHtml(entityLabels[log.entity_type] || log.entity_type)}${log.entity_id ? ` #${escapeHtml(log.entity_id)}` : ''}</td>
    <td>${escapeHtml(metadataText(log.metadata))}</td>
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
  <p class="summary">총 ${logs.length}건</p>
  <table>
    <thead><tr><th>시각</th><th>작업</th><th>대상</th><th>변경 내용</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">표시할 감사 로그가 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export const auditLogReportFilename = date => `workmanager-audit-log-${date}.html`
