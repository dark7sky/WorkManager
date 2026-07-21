import assert from 'node:assert/strict'
import test from 'node:test'
import { auditLogCsvFilename, auditLogsToCsv, dedupeImportedEvents, dedupeImportedLogs, dedupeImportedTasks, dedupeImportedTodos, eventCsvFilename, eventsToCsv, parseEventsCsv, parseTasksCsv, parseTodosCsv, parseWorkLogsCsv, taskCsvFilename, tasksToCsv, timelineCsvFilename, timelineToCsv, todoCsvFilename, todosToCsv, workLogCsvFilename, workLogsToCsv } from './csv.js'

test('tasksToCsv exports task rows with labels and escaping', () => {
  const csv = tasksToCsv([
    {
      title: '보고서, 검토',
      status: 'todo',
      priority: 'high',
      start_date: '2026-07-06',
      due_date: '2026-07-06',
      progress: 25,
      tags: ['분기', '고객'],
      description: '첫 줄\n둘째 줄',
      checklist: [{ text: 'a', done: true }, { text: 'b', done: false }],
    },
  ], '2026-07-07')

  assert.equal(csv, [
    '제목,상태,우선순위,시작일,시작 시각,기한,완료 시각,진행률,태그,메모,링크,예상 소요시간(분),알림(분 전),색상,체크리스트',
    '"보고서, 검토",지연,높음,2026-07-06,,2026-07-06,,25%,분기; 고객,"첫 줄\n둘째 줄",,,,,[x] a; [ ] b',
  ].join('\n'))
})

test('tasksToCsv and parseTasksCsv round-trip the checklist column', () => {
  const csv = tasksToCsv([
    { title: '기획안', status: 'todo', checklist: [{ text: '초안 작성', done: true }, { text: '검토 요청', done: false }] },
  ], '2026-07-07')

  const { tasks, errors } = parseTasksCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(tasks[0].checklist, [{ text: '초안 작성', done: true }, { text: '검토 요청', done: false }])
})

test('tasksToCsv guards spreadsheet formulas', () => {
  const csv = tasksToCsv([{ title: '=IMPORTXML("https://example.com")', status: 'done', progress: 100 }], '2026-07-07')

  assert.match(csv, /\t=IMPORTXML/)
})

test('taskCsvFilename uses the requested date', () => {
  assert.equal(taskCsvFilename('2026-07-07'), 'workmanager-tasks-2026-07-07.csv')
})

test('timelineToCsv exports report timeline rows', () => {
  const csv = timelineToCsv([
    { date: '2026-07-06', type: 'task', type_label: '완료 업무', title: '보고서, 검토', tags: ['분기'], estimated_minutes: 90 },
    { date: '2026-07-05', type: 'work_log', type_label: '업무 기록', content: '회의 진행', tags: [] },
  ])

  assert.equal(csv, [
    '날짜,구분,제목,태그,예상 소요(분)',
    '2026-07-06,완료 업무,"보고서, 검토",분기,90',
    '2026-07-05,업무 기록,회의 진행,,',
  ].join('\n'))
})

test('timelineCsvFilename uses the requested range', () => {
  assert.equal(timelineCsvFilename('2026-07-01', '2026-07-31'), 'workmanager-report-2026-07-01_2026-07-31.csv')
})

test('auditLogsToCsv exports audit rows with labels and metadata', () => {
  const csv = auditLogsToCsv([
    { created_at: '2026-07-13T10:00:00', action: 'update', entity_type: 'tasks', entity_id: 5, metadata: { fields: ['title', 'status'] } },
    { created_at: '2026-07-13T09:00:00', action: 'delete', entity_type: 'events', entity_id: 2, metadata: null },
  ])

  assert.equal(csv, [
    '일시,작업,대상,대상 ID,상세',
    '2026-07-13T10:00:00,수정,업무,5,"변경 필드: title, status"',
    '2026-07-13T09:00:00,삭제,일정,2,',
  ].join('\n'))
})

test('auditLogCsvFilename uses the requested date', () => {
  assert.equal(auditLogCsvFilename('2026-07-13'), 'workmanager-audit-log-2026-07-13.csv')
})

test('auditLogsToCsv labels import/rename actions and comment/settings entities', () => {
  const csv = auditLogsToCsv([
    { created_at: '2026-07-18T10:00:00', action: 'import', entity_type: 'backup', entity_id: null, metadata: null },
    { created_at: '2026-07-18T09:00:00', action: 'rename', entity_type: 'tags', entity_id: 3, metadata: null },
    { created_at: '2026-07-18T08:00:00', action: 'create', entity_type: 'task_comment', entity_id: 7, metadata: null },
    { created_at: '2026-07-18T07:00:00', action: 'update', entity_type: 'settings', entity_id: null, metadata: null },
  ])

  assert.equal(csv, [
    '일시,작업,대상,대상 ID,상세',
    '2026-07-18T10:00:00,가져오기,백업,,',
    '2026-07-18T09:00:00,이름 변경,태그,3,',
    '2026-07-18T08:00:00,생성,업무 댓글,7,',
    '2026-07-18T07:00:00,수정,설정,,',
  ].join('\n'))
})

test('eventsToCsv exports event rows with labels and escaping', () => {
  const csv = eventsToCsv([
    {
      title: '회의, 기획',
      start_at: '2026-07-13T10:00:00',
      end_at: '2026-07-13T11:00:00',
      google_is_all_day: false,
      priority: 'high',
      location: '3층 회의실',
      tags: ['내부'],
      description: '분기 계획\n검토',
    },
    { title: '휴가', start_at: '2026-07-14T00:00:00', end_at: '2026-07-15T00:00:00', google_is_all_day: true, priority: 'low', location: null, tags: [], description: null },
  ])

  assert.equal(csv, [
    '제목,시작,종료,종일 여부,우선순위,장소,태그,메모,링크,예상 소요시간(분),알림(분 전),색상,체크리스트',
    '"회의, 기획",2026-07-13T10:00:00,2026-07-13T11:00:00,N,높음,3층 회의실,내부,"분기 계획\n검토",,,,,',
    '휴가,2026-07-14T00:00:00,2026-07-15T00:00:00,Y,낮음,,,,,,,,',
  ].join('\n'))
})

test('eventCsvFilename uses the requested date', () => {
  assert.equal(eventCsvFilename('2026-07-13'), 'workmanager-events-2026-07-13.csv')
})

test('parseEventsCsv reads back an exported event row', () => {
  const csv = [
    '제목,시작,종료,종일 여부,우선순위,장소,태그,메모',
    '"회의, 기획",2026-07-13T10:00:00,2026-07-13T11:00:00,N,high,3층 회의실,내부,"분기 계획\n검토"',
  ].join('\n')

  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(events, [{
    title: '회의, 기획',
    start_at: '2026-07-13T10:00:00',
    end_at: '2026-07-13T11:00:00',
    google_is_all_day: false,
    priority: 'high',
    location: '3층 회의실',
    tags: ['내부'],
    description: '분기 계획\n검토',
  }])
})

test('parseEventsCsv falls back to normal priority for unrecognized labels', () => {
  const csv = [
    '제목,시작,종료,종일 여부,우선순위,장소,태그,메모',
    '휴가,2026-07-14T00:00:00,2026-07-15T00:00:00,Y,매우 높음,,,',
  ].join('\n')
  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(events[0].priority, 'normal')
})

test('parseEventsCsv defaults end to start and skips rows missing title or start', () => {
  const csv = '제목,시작,종료\n,2026-07-14T09:00:00,\n종일 행사,2026-07-14T00:00:00,\n누락된 일정,,\n'
  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(events, [{ title: '종일 행사', start_at: '2026-07-14T00:00:00', end_at: '2026-07-14T00:00:00' }])
  assert.deepEqual(errors, ['2행: 제목이 없어 건너뜀', '4행: 시작 일시가 없어 건너뜀'])
})

test('eventsToCsv and parseEventsCsv round-trip the checklist column', () => {
  const csv = eventsToCsv([
    { title: '행사 준비', start_at: '2026-07-18T09:00:00', checklist: [{ text: '장소 예약', done: true }, { text: '초대장 발송', done: false }] },
  ])
  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(events[0].checklist, [{ text: '장소 예약', done: true }, { text: '초대장 발송', done: false }])
})

test('parseEventsCsv returns nothing for empty input', () => {
  assert.deepEqual(parseEventsCsv(''), { events: [], errors: [] })
})

test('eventsToCsv and parseEventsCsv round-trip estimated minutes', () => {
  const csv = eventsToCsv([{ title: '워크숍', start_at: '2026-07-18T09:00:00', estimated_minutes: 120 }])
  assert.match(csv, /,120,,,$/m)
  const { events } = parseEventsCsv(csv)
  assert.equal(events[0].estimated_minutes, 120)
})

test('eventsToCsv and parseEventsCsv round-trip the reminder lead time column', () => {
  const csv = eventsToCsv([{ title: '워크숍', start_at: '2026-07-18T09:00:00', reminder_minutes_before: 30 }])
  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(events[0].reminder_minutes_before, 30)
})

test('parseTasksCsv reads back an exported task row', () => {
  const csv = [
    '제목,상태,우선순위,시작일,기한,진행률,태그,메모',
    '"보고서, 검토",지연,high,2026-07-06,2026-07-10,25%,분기; 고객,"첫 줄\n둘째 줄"',
  ].join('\n')

  const { tasks, errors } = parseTasksCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(tasks, [{
    title: '보고서, 검토',
    priority: 'high',
    start_date: '2026-07-06',
    due_date: '2026-07-10',
    tags: ['분기', '고객'],
    description: '첫 줄\n둘째 줄',
  }])
})

test('parseTasksCsv reads start/due time columns', () => {
  const csv = [
    '제목,시작일,시작 시각,기한,완료 시각',
    '보고서,2026-07-06,09:00,2026-07-10,18:30',
  ].join('\n')
  const { tasks } = parseTasksCsv(csv)
  assert.deepEqual(tasks, [{
    title: '보고서',
    start_date: '2026-07-06',
    start_time: '09:00',
    due_date: '2026-07-10',
    due_time: '18:30',
  }])
})

test('parseTasksCsv strips a UTF-8 BOM and translates Korean priority labels', () => {
  const csv = '﻿제목,우선순위\n예산안 작성,낮음\n'
  const { tasks } = parseTasksCsv(csv)
  assert.deepEqual(tasks, [{ title: '예산안 작성', priority: 'low' }])
})

test('parseTasksCsv skips rows without a title and reports the row number', () => {
  const csv = '제목,우선순위\n,high\n두 번째 업무,normal\n'
  const { tasks, errors } = parseTasksCsv(csv)
  assert.deepEqual(tasks, [{ title: '두 번째 업무', priority: 'normal' }])
  assert.deepEqual(errors, ['2행: 제목이 없어 건너뜀'])
})

test('parseTasksCsv returns nothing for empty input', () => {
  assert.deepEqual(parseTasksCsv(''), { tasks: [], errors: [] })
})

test('dedupeImportedTasks skips rows matching an existing task by title/start/due', () => {
  const existing = [{ title: '분기 보고서', start_date: '2026-07-01', due_date: '2026-07-10' }]
  const parsed = [
    { title: '분기 보고서', start_date: '2026-07-01', due_date: '2026-07-10' },
    { title: ' 분기 보고서 ', start_date: '2026-07-01', due_date: '2026-07-10' },
    { title: '신규 업무', start_date: '2026-07-01', due_date: '2026-07-10' },
  ]
  const { tasks, duplicates } = dedupeImportedTasks(parsed, existing)
  assert.deepEqual(tasks, [{ title: '신규 업무', start_date: '2026-07-01', due_date: '2026-07-10' }])
  assert.equal(duplicates.length, 2)
})

test('dedupeImportedTasks also skips duplicates within the same import batch', () => {
  const parsed = [
    { title: '업무 A', start_date: '2026-07-01', due_date: '2026-07-05' },
    { title: '업무 A', start_date: '2026-07-01', due_date: '2026-07-05' },
  ]
  const { tasks, duplicates } = dedupeImportedTasks(parsed, [])
  assert.equal(tasks.length, 1)
  assert.equal(duplicates.length, 1)
})

test('dedupeImportedEvents skips rows matching an existing event by title/start', () => {
  const existing = [{ title: '주간 회의', start_at: '2026-07-13T09:00:00' }]
  const parsed = [
    { title: '주간 회의', start_at: '2026-07-13T09:00:00' },
    { title: '신규 일정', start_at: '2026-07-13T09:00:00' },
  ]
  const { events, duplicates } = dedupeImportedEvents(parsed, existing)
  assert.deepEqual(events, [{ title: '신규 일정', start_at: '2026-07-13T09:00:00' }])
  assert.equal(duplicates.length, 1)
})

test('dedupeImportedTodos skips rows matching an existing todo by title/date', () => {
  const existing = [{ title: '장보기', todo_date: '2026-07-13' }]
  const parsed = [
    { title: '장보기', todo_date: '2026-07-13' },
    { title: '새 할 일', todo_date: '2026-07-13' },
  ]
  const { todos, duplicates } = dedupeImportedTodos(parsed, existing)
  assert.deepEqual(todos, [{ title: '새 할 일', todo_date: '2026-07-13' }])
  assert.equal(duplicates.length, 1)
})

test('dedupeImportedLogs skips rows matching an existing log by content/date', () => {
  const existing = [{ content: '코드 리뷰', log_date: '2026-07-13' }]
  const parsed = [
    { content: '코드 리뷰', log_date: '2026-07-13' },
    { content: '새 기록', log_date: '2026-07-13' },
  ]
  const { logs, duplicates } = dedupeImportedLogs(parsed, existing)
  assert.deepEqual(logs, [{ content: '새 기록', log_date: '2026-07-13' }])
  assert.equal(duplicates.length, 1)
})

test('todosToCsv exports todo rows with labels and escaping', () => {
  const csv = todosToCsv([
    { title: '보고서, 검토', completed: true, priority: 'high', recurrence_rule: 'daily', todo_date: '2026-07-13', tags: ['분기', '고객'] },
    { title: '메모 작성', completed: false, priority: 'normal', recurrence_rule: null, todo_date: '2026-07-13', tags: [] },
  ])

  assert.equal(csv, [
    '제목,완료 여부,우선순위,반복,날짜,시간,태그,메모,링크,예상 소요시간(분),알림(분 전),색상,체크리스트',
    '"보고서, 검토",Y,높음,매일,2026-07-13,,분기; 고객,,,,,,',
    '메모 작성,N,보통,,2026-07-13,,,,,,,,',
  ].join('\n'))
})

test('todosToCsv includes memo, link, time, and estimated minutes', () => {
  const csv = todosToCsv([
    { title: '자료 조사', completed: false, priority: 'normal', todo_date: '2026-07-13', todo_time: '14:00', tags: [], memo: '참고 자료 정리', link_url: 'https://example.com', estimated_minutes: 90 },
  ])
  assert.equal(csv, [
    '제목,완료 여부,우선순위,반복,날짜,시간,태그,메모,링크,예상 소요시간(분),알림(분 전),색상,체크리스트',
    '자료 조사,N,보통,,2026-07-13,14:00,,참고 자료 정리,https://example.com,90,,,',
  ].join('\n'))
})

test('todoCsvFilename uses the requested date', () => {
  assert.equal(todoCsvFilename('2026-07-13'), 'workmanager-todos-2026-07-13.csv')
})

test('parseTodosCsv reads back an exported todo row', () => {
  const csv = [
    '제목,완료 여부,우선순위,반복,날짜,태그',
    '"보고서, 검토",Y,high,매일,2026-07-13,분기; 고객',
  ].join('\n')

  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(todos, [{
    title: '보고서, 검토',
    priority: 'high',
    recurrence_rule: 'daily',
    todo_date: '2026-07-13',
    tags: ['분기', '고객'],
  }])
})

test('todosToCsv and parseTodosCsv round-trip memo, link, time, and estimated minutes', () => {
  const csv = todosToCsv([
    { title: '자료 조사', completed: false, priority: 'normal', todo_date: '2026-07-13', todo_time: '14:00', tags: [], memo: '참고 자료 정리', link_url: 'https://example.com', estimated_minutes: 90 },
  ])
  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(todos, [{
    title: '자료 조사',
    priority: 'normal',
    todo_date: '2026-07-13',
    todo_time: '14:00',
    memo: '참고 자료 정리',
    link_url: 'https://example.com',
    estimated_minutes: 90,
  }])
})

test('todosToCsv and parseTodosCsv round-trip the checklist column', () => {
  const csv = todosToCsv([
    { title: '이사 준비', completed: false, priority: 'normal', todo_date: '2026-07-13', tags: [], checklist: [{ text: '박스 포장', done: true }, { text: '업체 예약', done: false }] },
  ])
  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(todos[0].checklist, [{ text: '박스 포장', done: true }, { text: '업체 예약', done: false }])
})

test('parseTodosCsv skips rows without a title and reports the row number', () => {
  const csv = '제목,우선순위\n,high\n두 번째 할 일,normal\n'
  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(todos, [{ title: '두 번째 할 일', priority: 'normal' }])
  assert.deepEqual(errors, ['2행: 제목이 없어 건너뜀'])
})

test('parseTodosCsv returns nothing for empty input', () => {
  assert.deepEqual(parseTodosCsv(''), { todos: [], errors: [] })
})

test('todosToCsv and parseTodosCsv round-trip a monthly recurring todo', () => {
  const csv = todosToCsv([
    { title: '월간 정산', completed: false, priority: 'normal', recurrence_rule: 'monthly', todo_date: '2026-07-13', tags: [] },
  ])
  assert.match(csv, /매월/)

  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(todos[0].recurrence_rule, 'monthly')
})

test('workLogsToCsv exports work log rows with linked task title and escaping', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '회의, 진행', duration_minutes: 30, priority: 'high', task_id: 5, tags: ['분기'], billable: true },
    { log_date: '2026-07-13', content: '문서 정리', duration_minutes: null, task_id: null, tags: [] },
  ], new Map([[5, '보고서 작성']]))

  assert.equal(csv, [
    '날짜,내용,소요 시간(분),예상 소요시간(분),우선순위,연결 업무,태그,링크,청구 가능,청구 금액(원),시급 재정의(원),청구 완료일시,색상,체크리스트',
    '2026-07-14,"회의, 진행",30,,높음,#5 보고서 작성,분기,,Y,,,,,',
    '2026-07-13,문서 정리,,,,,,,,,,,,',
  ].join('\n'))
})

test('workLogsToCsv computes billable amount when an hourly rate is given', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '개발', duration_minutes: 90, task_id: null, tags: [], billable: true },
    { log_date: '2026-07-14', content: '내부 회의', duration_minutes: 60, task_id: null, tags: [], billable: false },
  ], new Map(), 40000)

  assert.equal(csv, [
    '날짜,내용,소요 시간(분),예상 소요시간(분),우선순위,연결 업무,태그,링크,청구 가능,청구 금액(원),시급 재정의(원),청구 완료일시,색상,체크리스트',
    '2026-07-14,개발,90,,,,,,Y,60000,,,,',
    '2026-07-14,내부 회의,60,,,,,,,,,,,',
  ].join('\n'))
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the hourly rate override and invoiced-at columns', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '외주 개발', duration_minutes: 120, task_id: null, tags: [], billable: true, hourly_rate_override: 55000, invoiced_at: '2026-07-20T10:00:00' },
    { log_date: '2026-07-15', content: '내부 정리', duration_minutes: 30, task_id: null, tags: [], billable: false },
  ], new Map(), 40000)

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(logs[0].hourly_rate_override, 55000)
  assert.equal(logs[0].invoiced_at, '2026-07-20T10:00:00')
  assert.equal(logs[1].hourly_rate_override, undefined)
  assert.equal(logs[1].invoiced_at, undefined)
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the priority column', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '긴급 대응', duration_minutes: 45, priority: 'high', task_id: null, tags: [] },
  ], new Map())
  assert.match(csv, /,높음,/)

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs, [{
    content: '긴급 대응',
    log_date: '2026-07-14',
    duration_minutes: 45,
    priority: 'high',
  }])
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the estimated minutes column', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '기획 검토', duration_minutes: 30, estimated_minutes: 60, task_id: null, tags: [] },
  ], new Map())
  assert.match(csv, /,30,60,/)

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs, [{
    content: '기획 검토',
    log_date: '2026-07-14',
    duration_minutes: 30,
    estimated_minutes: 60,
  }])
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the link column', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '자료 정리', duration_minutes: 20, task_id: null, tags: [], link_url: 'https://example.com/log' },
  ], new Map())

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs, [{
    content: '자료 정리',
    log_date: '2026-07-14',
    duration_minutes: 20,
    link_url: 'https://example.com/log',
  }])
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the billable column', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '고객 미팅', duration_minutes: 60, task_id: null, tags: [], billable: true },
    { log_date: '2026-07-15', content: '내부 정리', duration_minutes: 30, task_id: null, tags: [], billable: false },
  ], new Map())

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(logs[0].billable, true)
  assert.equal(logs[1].billable, undefined)
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the checklist column', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '점검', duration_minutes: 30, task_id: null, tags: [], checklist: [{ text: '로그 확인', done: true }, { text: '보고서 작성', done: false }] },
  ], new Map())
  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs[0].checklist, [{ text: '로그 확인', done: true }, { text: '보고서 작성', done: false }])
})

test('workLogCsvFilename uses the requested date', () => {
  assert.equal(workLogCsvFilename('2026-07-14'), 'workmanager-work-logs-2026-07-14.csv')
})

test('parseWorkLogsCsv reads back an exported work log row', () => {
  const csv = [
    '날짜,내용,소요 시간(분),우선순위,연결 업무,태그',
    '2026-07-14,"회의, 진행",30,보통,#5 보고서 작성,분기; 고객',
  ].join('\n')

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs, [{
    content: '회의, 진행',
    log_date: '2026-07-14',
    duration_minutes: 30,
    priority: 'normal',
    task_id: 5,
    tags: ['분기', '고객'],
  }])
})

test('workLogsToCsv and parseWorkLogsCsv round-trip the linked task column', () => {
  const taskTitleById = new Map([[7, '분기 보고서']])
  const csv = workLogsToCsv([
    { log_date: '2026-07-16', content: '자료 정리', duration_minutes: 45, task_id: 7, tags: [] },
    { log_date: '2026-07-17', content: '독립 작업', duration_minutes: 15, task_id: null, tags: [] },
  ], taskTitleById)

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(logs[0].task_id, 7)
  assert.equal(logs[1].task_id, undefined)
})

test('parseWorkLogsCsv skips rows without content and reports the row number', () => {
  const csv = '날짜,내용\n2026-07-14,\n2026-07-13,두 번째 기록\n'
  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(logs, [{ content: '두 번째 기록', log_date: '2026-07-13' }])
  assert.deepEqual(errors, ['2행: 내용이 없어 건너뜀'])
})

test('parseWorkLogsCsv returns nothing for empty input', () => {
  assert.deepEqual(parseWorkLogsCsv(''), { logs: [], errors: [] })
})

test('checklist column exports each item with its done state across all four CSV exports and round-trips on import', () => {
  const checklist = [{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c', done: true }]

  assert.match(tasksToCsv([{ title: '업무', status: 'todo', progress: 0, checklist }], '2026-07-18'), /,\[x\] a; \[ \] b; \[x\] c$/m)
  assert.match(eventsToCsv([{ title: '일정', start_at: '2026-07-18T09:00:00', checklist }]), /,\[x\] a; \[ \] b; \[x\] c$/m)
  assert.match(todosToCsv([{ title: '할 일', completed: false, checklist }]), /,\[x\] a; \[ \] b; \[x\] c$/m)
  assert.match(workLogsToCsv([{ log_date: '2026-07-18', content: '기록', checklist }], new Map()), /,\[x\] a; \[ \] b; \[x\] c$/m)

  const { tasks } = parseTasksCsv(tasksToCsv([{ title: '업무', status: 'todo', progress: 0, checklist }], '2026-07-18'))
  assert.deepEqual(tasks[0].checklist, checklist)
})

test('tasksToCsv and parseTasksCsv round-trip the link column', () => {
  const csv = tasksToCsv([{ title: '업무', status: 'todo', progress: 0, link_url: 'https://example.com/doc' }], '2026-07-18')
  assert.match(csv, /,https:\/\/example\.com\/doc,,,,$/m)
  const { tasks } = parseTasksCsv(csv)
  assert.equal(tasks[0].link_url, 'https://example.com/doc')
})

test('tasksToCsv and parseTasksCsv round-trip the estimated minutes column', () => {
  const csv = tasksToCsv([{ title: '업무', status: 'todo', progress: 0, estimated_minutes: 90 }], '2026-07-18')
  assert.match(csv, /,90,,,$/m)
  const { tasks } = parseTasksCsv(csv)
  assert.equal(tasks[0].estimated_minutes, 90)
})

test('tasksToCsv and parseTasksCsv round-trip the reminder lead time column', () => {
  const csv = tasksToCsv([{ title: '업무', status: 'todo', progress: 0, reminder_minutes_before: 15 }], '2026-07-18')
  const { tasks, errors } = parseTasksCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(tasks[0].reminder_minutes_before, 15)
})

test('todosToCsv and parseTodosCsv round-trip the reminder lead time column', () => {
  const csv = todosToCsv([{ title: '할 일', completed: false, reminder_minutes_before: 10 }])
  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(errors, [])
  assert.equal(todos[0].reminder_minutes_before, 10)
})

test('eventsToCsv and parseEventsCsv round-trip the link column', () => {
  const csv = eventsToCsv([{ title: '일정', start_at: '2026-07-18T09:00:00', link_url: 'https://example.com/doc' }])
  assert.match(csv, /,https:\/\/example\.com\/doc,,,,$/m)
  const { events } = parseEventsCsv(csv)
  assert.equal(events[0].link_url, 'https://example.com/doc')
})

test('color column round-trips across all four CSV exports', () => {
  const { tasks } = parseTasksCsv(tasksToCsv([{ title: '업무', status: 'todo', progress: 0, color: 'green' }], '2026-07-18'))
  assert.equal(tasks[0].color, 'green')

  const { events } = parseEventsCsv(eventsToCsv([{ title: '일정', start_at: '2026-07-18T09:00:00', color: 'purple' }]))
  assert.equal(events[0].color, 'purple')

  const { todos } = parseTodosCsv(todosToCsv([{ title: '할 일', completed: false, color: 'red' }]))
  assert.equal(todos[0].color, 'red')

  const { logs } = parseWorkLogsCsv(workLogsToCsv([{ log_date: '2026-07-18', content: '기록', color: 'gray' }], new Map()))
  assert.equal(logs[0].color, 'gray')
})
