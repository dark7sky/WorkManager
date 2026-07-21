import assert from 'node:assert/strict'
import test from 'node:test'
import { billableWorkLogs, invoiceTotals, workLogsToPrintableInvoice, invoiceFilename, defaultInvoiceNumber, vatBreakdown } from './invoiceReport.js'

const logs = [
  { log_date: '2026-07-01', content: '<고객> 미팅', duration_minutes: 90, billable: true, tags: ['고객사'] },
  { log_date: '2026-07-02', content: '내부 정리', duration_minutes: 60, billable: false, tags: [] },
  { log_date: '2026-07-03', content: '개발', duration_minutes: 30, billable: true, tags: [] },
]

test('billableWorkLogs filters to billable rows only', () => {
  assert.equal(billableWorkLogs(logs).length, 2)
})

test('billableWorkLogs excludes already-invoiced rows to prevent double billing', () => {
  const withInvoiced = [...logs, { log_date: '2026-07-04', content: '이미 청구됨', duration_minutes: 45, billable: true, invoiced_at: '2026-07-05T00:00:00+09:00', tags: [] }]
  assert.equal(billableWorkLogs(withInvoiced).length, 2)
})

test('invoiceTotals sums billable minutes and computes amount from hourly rate', () => {
  const totals = invoiceTotals(logs, 60000)
  assert.equal(totals.minutes, 120)
  assert.equal(totals.amount, 120000)
})

test('invoiceTotals returns zero amount when no hourly rate is set', () => {
  const totals = invoiceTotals(logs, null)
  assert.equal(totals.minutes, 120)
  assert.equal(totals.amount, 0)
})

test('invoiceTotals uses a per-log hourly rate override instead of the global rate', () => {
  const withOverride = [...logs, { log_date: '2026-07-04', content: '고급 클라이언트', duration_minutes: 60, billable: true, hourly_rate_override: 100000, tags: [] }]
  const totals = invoiceTotals(withOverride, 60000)
  assert.equal(totals.minutes, 180)
  assert.equal(totals.amount, 220000)
})

test('invoiceTotals applies per-log override even without a global hourly rate', () => {
  const overrideOnly = [{ log_date: '2026-07-04', content: '고급 클라이언트', duration_minutes: 60, billable: true, hourly_rate_override: 100000, tags: [] }]
  const totals = invoiceTotals(overrideOnly, null)
  assert.equal(totals.amount, 100000)
})

test('workLogsToPrintableInvoice renders escaped billable rows and totals', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03', hourlyRate: 60000, generatedAt: '2026-07-17T00:00:00+09:00' })
  assert.match(html, /청구 기간: 2026-07-01 ~ 2026-07-03/)
  assert.match(html, /&lt;고객&gt; 미팅/)
  assert.doesNotMatch(html, /<고객> 미팅/)
  assert.doesNotMatch(html, /내부 정리/)
  assert.match(html, /2\.00시간/)
  assert.match(html, /120,000원/)
})

test('workLogsToPrintableInvoice shows escaped client name when provided', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03', clientName: '<Acme> Corp' })
  assert.match(html, /청구 대상: &lt;Acme&gt; Corp/)
})

test('workLogsToPrintableInvoice omits client line when not provided', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03' })
  assert.doesNotMatch(html, /청구 대상:/)
})

test('workLogsToPrintableInvoice shows escaped business registration number when provided', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03', bizRegNumber: '<123>-45-67890' })
  assert.match(html, /사업자등록번호: &lt;123&gt;-45-67890/)
})

test('workLogsToPrintableInvoice omits business registration number line when not provided', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03' })
  assert.doesNotMatch(html, /사업자등록번호:/)
})

test('workLogsToPrintableInvoice handles no billable logs', () => {
  const html = workLogsToPrintableInvoice([], { start: '2026-07-01', end: '2026-07-03' })
  assert.match(html, /청구 가능한 업무 기록이 없습니다/)
})

test('invoiceFilename uses the requested period', () => {
  assert.equal(invoiceFilename('2026-07-01', '2026-07-03'), 'workmanager-invoice-2026-07-01_2026-07-03.html')
})

test('defaultInvoiceNumber derives a stable number from the billing period', () => {
  assert.equal(defaultInvoiceNumber('2026-07-01', '2026-07-03'), 'INV-20260701-20260703')
})

test('workLogsToPrintableInvoice shows the derived invoice number by default', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03' })
  assert.match(html, /청구서 번호: INV-20260701-20260703/)
})

test('workLogsToPrintableInvoice honors an explicit invoice number override', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03', invoiceNumber: '<CUSTOM>-001' })
  assert.match(html, /청구서 번호: &lt;CUSTOM&gt;-001/)
})

test('vatBreakdown computes 10% VAT on top of the supply amount', () => {
  assert.deepEqual(vatBreakdown(120000), { supplyAmount: 120000, vatAmount: 12000, totalAmount: 132000 })
})

test('vatBreakdown rounds and treats missing amount as zero', () => {
  assert.deepEqual(vatBreakdown(null), { supplyAmount: 0, vatAmount: 0, totalAmount: 0 })
  assert.deepEqual(vatBreakdown(99), { supplyAmount: 99, vatAmount: 10, totalAmount: 109 })
})

test('workLogsToPrintableInvoice shows VAT breakdown when vatIncluded is set', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03', hourlyRate: 60000, vatIncluded: true })
  assert.match(html, /공급가액: 120,000원/)
  assert.match(html, /부가세\(10%\): 12,000원/)
  assert.match(html, /합계금액: <strong>132,000원<\/strong>/)
  assert.doesNotMatch(html, /청구 금액 합계:/)
})

test('workLogsToPrintableInvoice keeps the single-line total when vatIncluded is not set', () => {
  const html = workLogsToPrintableInvoice(logs, { start: '2026-07-01', end: '2026-07-03', hourlyRate: 60000 })
  assert.match(html, /청구 금액 합계: <strong>120,000원<\/strong>/)
  assert.doesNotMatch(html, /공급가액:/)
})
