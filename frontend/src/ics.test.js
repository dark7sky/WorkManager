import assert from 'node:assert/strict'
import test from 'node:test'
import { eventsToIcs, icsFilename, parseIcs, taskIcsFilename, tasksToIcs, todoIcsFilename, todosToIcs } from './ics.js'

test('eventsToIcs emits a VEVENT per event with escaped text fields', () => {
  const ics = eventsToIcs([
    { id: 1, title: '기획, 회의', description: '1차 논의\n결론 없음', location: '회의실 A', start_at: '2026-07-06T10:00:00+09:00', end_at: '2026-07-06T11:00:00+09:00' },
  ])
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0/)
  assert.match(ics, /BEGIN:VEVENT[\s\S]*UID:1@workmanager[\s\S]*END:VEVENT/)
  assert.match(ics, /SUMMARY:기획\\, 회의/)
  assert.match(ics, /DESCRIPTION:1차 논의\\n결론 없음/)
  assert.match(ics, /LOCATION:회의실 A/)
  assert.match(ics, /DTSTART:20260706T010000Z/)
  assert.match(ics, /END:VCALENDAR$/)
})

test('eventsToIcs skips events missing start or end', () => {
  const ics = eventsToIcs([{ id: 2, title: '미완성', start_at: '2026-07-06T10:00:00+09:00' }])
  assert.doesNotMatch(ics, /BEGIN:VEVENT/)
})

test('icsFilename uses the requested date', () => {
  assert.equal(icsFilename('2026-07-12'), 'workmanager-events-2026-07-12.ics')
})

test('tasksToIcs emits an all-day VEVENT per task with a due date', () => {
  const ics = tasksToIcs([
    { id: 5, title: '기획, 승인', description: '검토\n필요', due_date: '2026-07-20' },
    { id: 6, title: '기한 없음' },
  ])
  assert.match(ics, /BEGIN:VEVENT[\s\S]*UID:task-5@workmanager[\s\S]*END:VEVENT/)
  assert.match(ics, /DTSTART;VALUE=DATE:20260720/)
  assert.match(ics, /SUMMARY:\[업무\] 기획\\, 승인/)
  assert.match(ics, /DESCRIPTION:검토\\n필요/)
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1)
})

test('taskIcsFilename uses the requested date', () => {
  assert.equal(taskIcsFilename('2026-07-12'), 'workmanager-tasks-2026-07-12.ics')
})

test('todosToIcs emits an all-day VEVENT for a date-only todo and a timed VEVENT for one with a time', () => {
  const ics = todosToIcs([
    { id: 7, title: '기획, 검토', todo_date: '2026-07-20', memo: '메모\n확인' },
    { id: 8, title: '시간 있음', todo_date: '2026-07-21', todo_time: '10:00' },
    { id: 9, title: '날짜 없음' },
  ])
  assert.match(ics, /BEGIN:VEVENT[\s\S]*UID:todo-7@workmanager[\s\S]*END:VEVENT/)
  assert.match(ics, /DTSTART;VALUE=DATE:20260720/)
  assert.match(ics, /SUMMARY:\[할 일\] 기획\\, 검토/)
  assert.match(ics, /DESCRIPTION:메모\\n확인/)
  assert.match(ics, /UID:todo-8@workmanager[\s\S]*DTSTART:20260721T010000Z[\s\S]*DTEND:20260721T013000Z/)
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2)
})

test('todoIcsFilename uses the requested date', () => {
  assert.equal(todoIcsFilename('2026-07-12'), 'workmanager-todos-2026-07-12.ics')
})

test('parseIcs round-trips events exported by eventsToIcs', () => {
  const exported = eventsToIcs([
    { id: 1, title: '기획, 회의', description: '1차 논의\n결론 없음', location: '회의실 A', start_at: '2026-07-06T10:00:00+09:00', end_at: '2026-07-06T11:00:00+09:00' },
  ])
  const parsed = parseIcs(exported)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].title, '기획, 회의')
  assert.equal(parsed[0].description, '1차 논의\n결론 없음')
  assert.equal(parsed[0].location, '회의실 A')
  assert.equal(parsed[0].start_at, '2026-07-06T01:00:00.000Z')
  assert.equal(parsed[0].end_at, '2026-07-06T02:00:00.000Z')
})

test('parseIcs skips VEVENTs missing a title or times', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260706T010000Z\nEND:VEVENT\nEND:VCALENDAR'
  assert.deepEqual(parseIcs(ics), [])
})

test('parseIcs handles multiple VEVENTs and folded lines', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:회의 A\nDTSTART:20260706T010000Z\nDTEND:20260706T020000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:회의 B\nDTSTART:20260707T030000Z\nDTEND:20260707T040000Z\nEND:VEVENT\nEND:VCALENDAR'
  const parsed = parseIcs(ics)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].title, '회의 A')
  assert.equal(parsed[1].title, '회의 B')
})
