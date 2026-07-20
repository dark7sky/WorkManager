import assert from 'node:assert/strict'
import test from 'node:test'
import { eventsToIcs, icsFilename, icsToTasks, icsToTodos, icsToLogs, logIcsFilename, logsToIcs, parseIcs, taskIcsFilename, tasksToIcs, todoIcsFilename, todosToIcs } from './ics.js'

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

test('tasksToIcs emits a timed VEVENT when the task has a due_time', () => {
  const ics = tasksToIcs([{ id: 9, title: '시간 있음', due_date: '2026-07-20', due_time: '15:00' }])
  assert.doesNotMatch(ics, /DTSTART;VALUE=DATE/)
  assert.match(ics, /DTSTART:20260720T060000Z/)
  assert.match(ics, /DTEND:20260720T063000Z/)
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

test('logsToIcs emits an all-day VEVENT for a date-only log and a timed VEVENT sized by duration_minutes', () => {
  const ics = logsToIcs([
    { id: 3, content: '기획, 검토', log_date: '2026-07-20' },
    { id: 4, content: '시간 있음', log_date: '2026-07-21', log_time: '10:00', duration_minutes: 45 },
    { id: 5, content: '날짜 없음' },
  ])
  assert.match(ics, /BEGIN:VEVENT[\s\S]*UID:log-3@workmanager[\s\S]*END:VEVENT/)
  assert.match(ics, /DTSTART;VALUE=DATE:20260720/)
  assert.match(ics, /SUMMARY:\[기록\] 기획\\, 검토/)
  assert.match(ics, /UID:log-4@workmanager[\s\S]*DTSTART:20260721T010000Z[\s\S]*DTEND:20260721T014500Z/)
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2)
})

test('logIcsFilename uses the requested date', () => {
  assert.equal(logIcsFilename('2026-07-12'), 'workmanager-worklogs-2026-07-12.ics')
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

test('parseIcs keeps all-day VEVENTs even without a DTEND', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:마감\nDTSTART;VALUE=DATE:20260720\nEND:VEVENT\nEND:VCALENDAR'
  const parsed = parseIcs(ics)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].title, '마감')
  assert.equal(parsed[0].start_all_day, true)
  assert.equal(parsed[0].end_at, undefined)
})

test('icsToTasks round-trips an all-day task VEVENT exported by tasksToIcs, stripping the export prefix', () => {
  const ics = tasksToIcs([{ id: 5, title: '기획 승인', description: '검토 필요', due_date: '2026-07-20' }])
  const tasks = icsToTasks(ics)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].title, '기획 승인')
  assert.equal(tasks[0].due_date, '2026-07-20')
  assert.equal(tasks[0].due_time, undefined)
  assert.equal(tasks[0].description, '검토 필요')
})

test('re-importing an exported task ICS does not double the [업무] prefix', () => {
  const first = icsToTasks(tasksToIcs([{ id: 5, title: '기획 승인', due_date: '2026-07-20' }]))
  const reExported = tasksToIcs([{ id: 5, title: first[0].title, due_date: first[0].due_date }])
  const second = icsToTasks(reExported)
  assert.equal(second[0].title, '기획 승인')
})

test('tasksToIcs and icsToTasks round-trip priority', () => {
  const ics = tasksToIcs([{ id: 5, title: '기획 승인', due_date: '2026-07-20', priority: 'high' }])
  assert.match(ics, /PRIORITY:1/)
  const tasks = icsToTasks(ics)
  assert.equal(tasks[0].priority, 'high')
})

test('tasksToIcs and icsToTasks round-trip estimated_minutes', () => {
  const ics = tasksToIcs([{ id: 10, title: '기획 승인', due_date: '2026-07-20', estimated_minutes: 90 }])
  assert.match(ics, /X-WM-ESTIMATE-MINUTES:90/)
  const tasks = icsToTasks(ics)
  assert.equal(tasks[0].estimated_minutes, 90)
})

test('tasksToIcs omits X-WM-ESTIMATE-MINUTES when task has no estimate', () => {
  const ics = tasksToIcs([{ id: 11, title: '기획 승인', due_date: '2026-07-20' }])
  assert.doesNotMatch(ics, /X-WM-ESTIMATE-MINUTES/)
})

test('tasksToIcs and icsToTasks round-trip link_url', () => {
  const ics = tasksToIcs([{ id: 12, title: '기획 승인', due_date: '2026-07-20', link_url: 'https://example.com/doc' }])
  assert.match(ics, /URL:https:\/\/example\.com\/doc/)
  const tasks = icsToTasks(ics)
  assert.equal(tasks[0].link_url, 'https://example.com/doc')
})

test('eventsToIcs and parseIcs round-trip estimated_minutes', () => {
  const ics = eventsToIcs([{ id: 1, title: '회의', start_at: '2026-07-06T10:00:00+09:00', end_at: '2026-07-06T11:00:00+09:00', estimated_minutes: 60 }])
  const parsed = parseIcs(ics)
  assert.equal(parsed[0].estimated_minutes, 60)
})

test('eventsToIcs and parseIcs round-trip link_url', () => {
  const ics = eventsToIcs([{ id: 2, title: '회의', start_at: '2026-07-06T10:00:00+09:00', end_at: '2026-07-06T11:00:00+09:00', link_url: 'https://example.com/meet' }])
  const parsed = parseIcs(ics)
  assert.equal(parsed[0].link_url, 'https://example.com/meet')
})

test('tasksToIcs omits PRIORITY when task has no priority', () => {
  const ics = tasksToIcs([{ id: 6, title: '기획 승인', due_date: '2026-07-20' }])
  assert.doesNotMatch(ics, /PRIORITY:/)
})

test('icsToTasks sets due_time for a timed VEVENT', () => {
  const ics = tasksToIcs([{ id: 9, title: '시간 있음', due_date: '2026-07-20', due_time: '15:00' }])
  const tasks = icsToTasks(ics)
  assert.equal(tasks[0].due_date, '2026-07-20')
  assert.equal(tasks[0].due_time, '15:00')
})

test('icsToTodos round-trips an all-day todo VEVENT exported by todosToIcs, stripping the export prefix', () => {
  const ics = todosToIcs([{ id: 3, title: '장보기', memo: '우유 사기', todo_date: '2026-07-20' }])
  const todos = icsToTodos(ics)
  assert.equal(todos.length, 1)
  assert.equal(todos[0].title, '장보기')
  assert.equal(todos[0].todo_date, '2026-07-20')
  assert.equal(todos[0].todo_time, undefined)
  assert.equal(todos[0].memo, '우유 사기')
})

test('icsToTodos sets todo_time for a timed VEVENT', () => {
  const ics = todosToIcs([{ id: 7, title: '회의 준비', todo_date: '2026-07-20', todo_time: '09:30' }])
  const todos = icsToTodos(ics)
  assert.equal(todos[0].todo_date, '2026-07-20')
  assert.equal(todos[0].todo_time, '09:30')
})

test('todosToIcs and icsToTodos round-trip priority', () => {
  const ics = todosToIcs([{ id: 3, title: '장보기', todo_date: '2026-07-20', priority: 'low' }])
  assert.match(ics, /PRIORITY:9/)
  const todos = icsToTodos(ics)
  assert.equal(todos[0].priority, 'low')
})

test('todosToIcs and icsToTodos round-trip estimated_minutes', () => {
  const ics = todosToIcs([{ id: 4, title: '장보기', todo_date: '2026-07-20', estimated_minutes: 15 }])
  assert.match(ics, /X-WM-ESTIMATE-MINUTES:15/)
  const todos = icsToTodos(ics)
  assert.equal(todos[0].estimated_minutes, 15)
})

test('todosToIcs and icsToTodos round-trip link_url', () => {
  const ics = todosToIcs([{ id: 8, title: '장보기', todo_date: '2026-07-20', link_url: 'https://example.com/list' }])
  assert.match(ics, /URL:https:\/\/example\.com\/list/)
  const todos = icsToTodos(ics)
  assert.equal(todos[0].link_url, 'https://example.com/list')
})

test('logsToIcs and icsToLogs round-trip estimated_minutes', () => {
  const ics = logsToIcs([{ id: 5, content: '보고서 작성', log_date: '2026-07-20', estimated_minutes: 120 }])
  assert.match(ics, /X-WM-ESTIMATE-MINUTES:120/)
  const logs = icsToLogs(ics)
  assert.equal(logs[0].estimated_minutes, 120)
})

test('logsToIcs and icsToLogs round-trip link_url', () => {
  const ics = logsToIcs([{ id: 9, content: '보고서 작성', log_date: '2026-07-20', link_url: 'https://example.com/report' }])
  assert.match(ics, /URL:https:\/\/example\.com\/report/)
  const logs = icsToLogs(ics)
  assert.equal(logs[0].link_url, 'https://example.com/report')
})

test('logsToIcs and icsToLogs round-trip priority', () => {
  const ics = logsToIcs([{ id: 2, content: '보고서 작성', log_date: '2026-07-20', priority: 'normal' }])
  assert.match(ics, /PRIORITY:5/)
  const logs = icsToLogs(ics)
  assert.equal(logs[0].priority, 'normal')
})

test('icsToLogs round-trips an all-day log VEVENT exported by logsToIcs, stripping the export prefix', () => {
  const ics = logsToIcs([{ id: 2, content: '보고서 작성', log_date: '2026-07-20' }])
  const logs = icsToLogs(ics)
  assert.equal(logs.length, 1)
  assert.equal(logs[0].content, '보고서 작성')
  assert.equal(logs[0].log_date, '2026-07-20')
  assert.equal(logs[0].log_time, undefined)
})

test('icsToLogs sets log_time and duration_minutes for a timed VEVENT', () => {
  const ics = logsToIcs([{ id: 4, content: '통화', log_date: '2026-07-20', log_time: '14:00', duration_minutes: 45 }])
  const logs = icsToLogs(ics)
  assert.equal(logs[0].log_date, '2026-07-20')
  assert.equal(logs[0].log_time, '14:00')
  assert.equal(logs[0].duration_minutes, 45)
})

test('parseIcs handles multiple VEVENTs and folded lines', () => {
  const ics = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:회의 A\nDTSTART:20260706T010000Z\nDTEND:20260706T020000Z\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:회의 B\nDTSTART:20260707T030000Z\nDTEND:20260707T040000Z\nEND:VEVENT\nEND:VCALENDAR'
  const parsed = parseIcs(ics)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].title, '회의 A')
  assert.equal(parsed[1].title, '회의 B')
})
