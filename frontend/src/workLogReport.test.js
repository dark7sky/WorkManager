import assert from 'node:assert/strict'
import test from 'node:test'
import { workLogReportFilename, workLogsToPrintableReport } from './workLogReport.js'

test('workLogsToPrintableReport renders escaped printable log rows and summary', () => {
  const taskTitleById = new Map([[1, '<고객 대응>']])
  const html = workLogsToPrintableReport([
    { content: '보고서 검토', log_time: '10:00', duration_minutes: 30, task_id: 1, billable: true, tags: ['업무'] },
    { content: '휴식', log_time: '11:00', duration_minutes: 10, billable: false, tags: [] },
  ], taskTitleById, 50000, { generatedAt: '2026-07-17T18:41:12+09:00', title: '필터된 업무 기록 보고서' })

  assert.match(html, /필터된 업무 기록 보고서/)
  assert.match(html, /생성 시각: 2026-07-17T18:41:12\+09:00/)
  assert.match(html, /총 2건 · 총 40분 · 청구 가능 30분/)
  assert.match(html, /&lt;고객 대응&gt;/)
  assert.doesNotMatch(html, /<고객 대응>/)
})

test('workLogReportFilename uses the requested date', () => {
  assert.equal(workLogReportFilename('2026-07-17'), 'workmanager-worklogs-2026-07-17.html')
})
