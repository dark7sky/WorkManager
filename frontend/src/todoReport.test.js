import assert from 'node:assert/strict'
import test from 'node:test'
import { todoReportFilename, todosToPrintableReport } from './todoReport.js'

test('todosToPrintableReport renders escaped printable todo rows and summary', () => {
  const html = todosToPrintableReport([
    { title: '<보고서 작성>', completed: false, priority: 'high', todo_time: '09:00', tags: ['분기'], memo: '검토 필요' },
    { title: '완료 항목', completed: true, priority: 'low', tags: [] },
  ], { generatedAt: '2026-07-17T18:41:12+09:00', title: '필터된 Todo 보고서' })

  assert.match(html, /필터된 Todo 보고서/)
  assert.match(html, /생성 시각: 2026-07-17T18:41:12\+09:00/)
  assert.match(html, /총 2개 · 완료 1개/)
  assert.match(html, /&lt;보고서 작성&gt;/)
  assert.doesNotMatch(html, /<보고서 작성>/)
})

test('todoReportFilename uses the requested date', () => {
  assert.equal(todoReportFilename('2026-07-17'), 'workmanager-todos-2026-07-17.html')
})
