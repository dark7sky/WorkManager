import assert from 'node:assert/strict'
import test from 'node:test'
import { eventReportFilename, eventsToPrintableReport } from './eventReport.js'

test('eventsToPrintableReport renders escaped printable event rows and summary', () => {
  const html = eventsToPrintableReport([
    {
      title: '<주간 회의>',
      start_at: '2026-07-07T10:00:00',
      end_at: '2026-07-07T11:00:00',
      location: '회의실 A',
      tags: ['업무'],
      description: '분기 리뷰',
    },
    {
      title: '워크숍',
      start_at: '2026-07-08T00:00:00',
      end_at: '2026-07-08T23:59:00',
      google_is_all_day: true,
      tags: [],
    },
  ], { generatedAt: '2026-07-07T18:41:12+09:00', title: '이번 주 일정 보고서' })

  assert.match(html, /이번 주 일정 보고서/)
  assert.match(html, /생성 시각: 2026-07-07T18:41:12\+09:00/)
  assert.match(html, /총 2개 일정/)
  assert.match(html, /&lt;주간 회의&gt;/)
  assert.doesNotMatch(html, /<주간 회의>/)
  assert.match(html, /\(종일\)/)
})

test('eventsToPrintableReport handles an empty list', () => {
  const html = eventsToPrintableReport([])
  assert.match(html, /표시할 일정이 없습니다/)
  assert.match(html, /총 0개 일정/)
})

test('eventReportFilename uses the requested date', () => {
  assert.equal(eventReportFilename('2026-07-07'), 'workmanager-events-2026-07-07.html')
})

test('eventsToPrintableReport shows checklist completion summary', () => {
  const html = eventsToPrintableReport([
    { title: '체크리스트 일정', start_at: '2026-07-07T10:00:00', tags: [], checklist: [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: true }] },
  ])
  assert.match(html, /<td>2\/3<\/td>/)
  assert.match(html, /<th>체크리스트<\/th>/)
})

test('eventsToPrintableReport shows estimated minutes column', () => {
  const html = eventsToPrintableReport([
    { title: '예상 소요 일정', start_at: '2026-07-07T10:00:00', tags: [], estimated_minutes: 45 },
  ])
  assert.match(html, /<th>예상 소요시간<\/th>/)
  assert.match(html, /<td>45분<\/td>/)
})
