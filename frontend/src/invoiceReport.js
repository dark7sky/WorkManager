const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const formatMinutesAsHours = minutes => (Number(minutes || 0) / 60).toFixed(2)
const formatWon = amount => Math.round(Number(amount || 0)).toLocaleString('ko-KR')

export const billableWorkLogs = logs => (logs || []).filter(log => log?.billable && !log?.invoiced_at)

export const invoiceTotals = (logs, hourlyRate) => {
  const minutes = billableWorkLogs(logs).reduce((sum, log) => sum + Number(log.duration_minutes || 0), 0)
  const rate = Number(hourlyRate) || 0
  return { minutes, amount: rate ? Math.round(minutes / 60 * rate) : 0 }
}

export const defaultInvoiceNumber = (start, end) => `INV-${String(start || '').replaceAll('-', '')}-${String(end || '').replaceAll('-', '')}`

export const workLogsToPrintableInvoice = (logs, { start, end, hourlyRate, clientName, bizRegNumber, invoiceNumber, generatedAt = new Date().toISOString(), title = 'WorkManager 청구서' } = {}) => {
  const billable = billableWorkLogs(logs)
  const { minutes, amount } = invoiceTotals(logs, hourlyRate)
  const number = invoiceNumber || defaultInvoiceNumber(start, end)
  const rows = billable.map(log => `<tr>
      <td>${escapeHtml(log.log_date || '-')}</td>
      <td><strong>${escapeHtml(log.content || '')}</strong>${(log.tags || []).length ? `<small>${escapeHtml(log.tags.join(', '))}</small>` : ''}</td>
      <td>${formatMinutesAsHours(log.duration_minutes)}시간</td>
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
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:16px}
    th,td{border:1px solid #dfe3e8;padding:8px;text-align:left;vertical-align:top}
    th{background:#f5f7fa}
    td small{display:block;color:#5f6670;margin-top:4px}
    .totals{margin-top:20px;text-align:right;font-size:15px}
    .totals strong{font-size:19px}
    @media print{body{margin:18mm}.no-print{display:none}}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>청구서 번호: ${escapeHtml(number)}</p>
    ${clientName ? `<p>청구 대상: ${escapeHtml(clientName)}</p>` : ''}
    ${bizRegNumber ? `<p>사업자등록번호: ${escapeHtml(bizRegNumber)}</p>` : ''}
    <p>청구 기간: ${escapeHtml(start || '-')} ~ ${escapeHtml(end || '-')}</p>
    <p>생성 시각: ${escapeHtml(generatedAt)}</p>
  </header>
  <table>
    <thead><tr><th>날짜</th><th>내용</th><th>시간</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">청구 가능한 업무 기록이 없습니다.</td></tr>'}</tbody>
  </table>
  <p class="totals">청구 가능 시간 합계: ${formatMinutesAsHours(minutes)}시간${hourlyRate ? `<br>시급 ${formatWon(hourlyRate)}원 × 청구 가능 시간 = <strong>${formatWon(amount)}원</strong>` : ''}</p>
</body>
</html>`
}

export const invoiceFilename = (start, end) => `workmanager-invoice-${start}_${end}.html`
