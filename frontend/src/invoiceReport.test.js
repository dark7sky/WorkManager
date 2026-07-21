import assert from 'node:assert/strict'
import test from 'node:test'
import { billableWorkLogs, invoiceTotals, workLogsToPrintableInvoice, invoiceFilename, defaultInvoiceNumber } from './invoiceReport.js'

const logs = [
  { log_date: '2026-07-01', content: '<고객> 미팅', duration_minutes: 90, billable: true, tags: ['고객사'] },
  { log_date: '2026-07-02', content: '내부 정리', duration_minutes: 60, billable: false, tags: [] },
  { log_date: '2026-07-03', content: '개발', duration_minutes: 30, billable: true, tags: [] },
]

test('billableWorkLogs filters to billable rows only', () => {
  assert.equal(billableWorkLogs(logs).length, 2)
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
