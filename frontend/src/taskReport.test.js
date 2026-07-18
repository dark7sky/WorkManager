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

test('tasksToPrintableReport shows checklist completion summary', () => {
  const html = tasksToPrintableReport([
    { title: '체크리스트 업무', status: 'todo', priority: 'normal', tags: [], checklist: [{ text: 'a', done: true }, { text: 'b', done: false }] },
    { title: '체크리스트 없음', status: 'todo', priority: 'normal', tags: [] },
  ], { todayIso: '2026-07-07' })

  assert.match(html, /<td>1\/2<\/td>/)
  assert.match(html, /<th>체크리스트<\/th>/)
})

test('tasksToPrintableReport shows estimated minutes column', () => {
  const html = tasksToPrintableReport([
    { title: '예상 소요 업무', status: 'todo', priority: 'normal', tags: [], estimated_minutes: 90 },
    { title: '예상 없음', status: 'todo', priority: 'normal', tags: [] },
  ], { todayIso: '2026-07-07' })

  assert.match(html, /<th>예상 소요시간<\/th>/)
  assert.match(html, /<td>90분<\/td>/)
})

test('tasksToPrintableReport shows link column', () => {
  const html = tasksToPrintableReport([
    { title: '링크 업무', status: 'todo', priority: 'normal', tags: [], link_url: 'https://example.com' },
    { title: '링크 없음', status: 'todo', priority: 'normal', tags: [] },
  ], { todayIso: '2026-07-07' })

  assert.match(html, /<th>링크<\/th>/)
  assert.match(html, /<a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/)
})
