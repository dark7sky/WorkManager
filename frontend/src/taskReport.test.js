import assert from 'node:assert/strict'
import test from 'node:test'
import { taskReportFilename, tasksToPrintableReport } from './taskReport.js'

test('tasksToPrintableReport renders escaped printable task rows and summary', () => {
  const html = tasksToPrintableReport([
    {
      title: '<고객 보고>',
      status: 'todo',
      priority: 'high',
      start_date: '2026-07-06',
      due_date: '2026-07-06',
      progress: 25,
      tags: ['분기', '고객'],
      description: '검토 필요',
    },
    {
      title: '완료 업무',
      status: 'done',
      priority: 'low',
      due_date: '2026-07-08',
      progress: 100,
      tags: [],
    },
  ], { todayIso: '2026-07-07', generatedAt: '2026-07-07T18:41:12+09:00', title: '필터된 업무 보고서' })

  assert.match(html, /필터된 업무 보고서/)
  assert.match(html, /생성 시각: 2026-07-07T18:41:12\+09:00/)
  assert.match(html, /총 2개 · 진행 1개 · 완료 1개 · 지연 1개/)
  assert.match(html, /&lt;고객 보고&gt;/)
  assert.doesNotMatch(html, /<고객 보고>/)
})

test('taskReportFilename uses the requested date', () => {
  assert.equal(taskReportFilename('2026-07-07'), 'workmanager-tasks-2026-07-07.html')
})
