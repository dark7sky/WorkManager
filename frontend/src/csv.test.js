import assert from 'node:assert/strict'
import test from 'node:test'
import { auditLogCsvFilename, auditLogsToCsv, eventCsvFilename, eventsToCsv, parseEventsCsv, parseTasksCsv, parseTodosCsv, parseWorkLogsCsv, taskCsvFilename, tasksToCsv, timelineCsvFilename, timelineToCsv, todoCsvFilename, todosToCsv, workLogCsvFilename, workLogsToCsv } from './csv.js'

test('tasksToCsv exports task rows with labels and escaping', () => {
  const csv = tasksToCsv([
    {
      title: '보고서, 검토',
      status: 'todo',
      priority: 'high',
      start_date: '2026-07-06',
      due_date: '2026-07-06',
      progress: 25,
      category: '기획',
      tags: ['분기', '고객'],
      description: '첫 줄\n둘째 줄',
    },
  ], '2026-07-07')

  assert.equal(csv, [
    '제목,상태,우선순위,시작일,기한,진행률,분류,태그,메모',
    '"보고서, 검토",지연,high,2026-07-06,2026-07-06,25%,기획,분기; 고객,"첫 줄\n둘째 줄"',
  ].join('\n'))
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
    { date: '2026-07-06', type: 'task', type_label: '완료 업무', title: '보고서, 검토', tags: ['분기'] },
    { date: '2026-07-05', type: 'work_log', type_label: '업무 기록', content: '회의 진행', tags: [] },
  ])

  assert.equal(csv, [
    '날짜,구분,제목,태그',
    '2026-07-06,완료 업무,"보고서, 검토",분기',
    '2026-07-05,업무 기록,회의 진행,',
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

test('eventsToCsv exports event rows with labels and escaping', () => {
  const csv = eventsToCsv([
    {
      title: '회의, 기획',
      start_at: '2026-07-13T10:00:00',
      end_at: '2026-07-13T11:00:00',
      google_is_all_day: false,
      location: '3층 회의실',
      tags: ['내부'],
      description: '분기 계획\n검토',
    },
    { title: '휴가', start_at: '2026-07-14T00:00:00', end_at: '2026-07-15T00:00:00', google_is_all_day: true, location: null, tags: [], description: null },
  ])

  assert.equal(csv, [
    '제목,시작,종료,종일 여부,장소,태그,메모',
    '"회의, 기획",2026-07-13T10:00:00,2026-07-13T11:00:00,N,3층 회의실,내부,"분기 계획\n검토"',
    '휴가,2026-07-14T00:00:00,2026-07-15T00:00:00,Y,,,',
  ].join('\n'))
})

test('eventCsvFilename uses the requested date', () => {
  assert.equal(eventCsvFilename('2026-07-13'), 'workmanager-events-2026-07-13.csv')
})

test('parseEventsCsv reads back an exported event row', () => {
  const csv = [
    '제목,시작,종료,종일 여부,장소,태그,메모',
    '"회의, 기획",2026-07-13T10:00:00,2026-07-13T11:00:00,N,3층 회의실,내부,"분기 계획\n검토"',
  ].join('\n')

  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(events, [{
    title: '회의, 기획',
    start_at: '2026-07-13T10:00:00',
    end_at: '2026-07-13T11:00:00',
    google_is_all_day: false,
    location: '3층 회의실',
    tags: ['내부'],
    description: '분기 계획\n검토',
  }])
})

test('parseEventsCsv defaults end to start and skips rows missing title or start', () => {
  const csv = '제목,시작,종료\n,2026-07-14T09:00:00,\n종일 행사,2026-07-14T00:00:00,\n누락된 일정,,\n'
  const { events, errors } = parseEventsCsv(csv)
  assert.deepEqual(events, [{ title: '종일 행사', start_at: '2026-07-14T00:00:00', end_at: '2026-07-14T00:00:00' }])
  assert.deepEqual(errors, ['2행: 제목이 없어 건너뜀', '4행: 시작 일시가 없어 건너뜀'])
})

test('parseEventsCsv returns nothing for empty input', () => {
  assert.deepEqual(parseEventsCsv(''), { events: [], errors: [] })
})

test('parseTasksCsv reads back an exported task row', () => {
  const csv = [
    '제목,상태,우선순위,시작일,기한,진행률,분류,태그,메모',
    '"보고서, 검토",지연,high,2026-07-06,2026-07-10,25%,기획,분기; 고객,"첫 줄\n둘째 줄"',
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

test('todosToCsv exports todo rows with labels and escaping', () => {
  const csv = todosToCsv([
    { title: '보고서, 검토', completed: true, priority: 'high', recurrence_rule: 'daily', todo_date: '2026-07-13', tags: ['분기', '고객'] },
    { title: '메모 작성', completed: false, priority: 'normal', recurrence_rule: null, todo_date: '2026-07-13', tags: [] },
  ])

  assert.equal(csv, [
    '제목,완료 여부,우선순위,반복,날짜,태그',
    '"보고서, 검토",Y,high,매일,2026-07-13,분기; 고객',
    '메모 작성,N,normal,,2026-07-13,',
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

test('parseTodosCsv skips rows without a title and reports the row number', () => {
  const csv = '제목,우선순위\n,high\n두 번째 할 일,normal\n'
  const { todos, errors } = parseTodosCsv(csv)
  assert.deepEqual(todos, [{ title: '두 번째 할 일', priority: 'normal' }])
  assert.deepEqual(errors, ['2행: 제목이 없어 건너뜀'])
})

test('parseTodosCsv returns nothing for empty input', () => {
  assert.deepEqual(parseTodosCsv(''), { todos: [], errors: [] })
})

test('workLogsToCsv exports work log rows with linked task title and escaping', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '회의, 진행', duration_minutes: 30, task_id: 5, tags: ['분기'], billable: true },
    { log_date: '2026-07-13', content: '문서 정리', duration_minutes: null, task_id: null, tags: [] },
  ], new Map([[5, '보고서 작성']]))

  assert.equal(csv, [
    '날짜,내용,소요 시간(분),연결 업무,태그,청구 가능,청구 금액(원)',
    '2026-07-14,"회의, 진행",30,#5 보고서 작성,분기,Y,',
    '2026-07-13,문서 정리,,,,,',
  ].join('\n'))
})

test('workLogsToCsv computes billable amount when an hourly rate is given', () => {
  const csv = workLogsToCsv([
    { log_date: '2026-07-14', content: '개발', duration_minutes: 90, task_id: null, tags: [], billable: true },
    { log_date: '2026-07-14', content: '내부 회의', duration_minutes: 60, task_id: null, tags: [], billable: false },
  ], new Map(), 40000)

  assert.equal(csv, [
    '날짜,내용,소요 시간(분),연결 업무,태그,청구 가능,청구 금액(원)',
    '2026-07-14,개발,90,,,Y,60000',
    '2026-07-14,내부 회의,60,,,,',
  ].join('\n'))
})

test('workLogCsvFilename uses the requested date', () => {
  assert.equal(workLogCsvFilename('2026-07-14'), 'workmanager-work-logs-2026-07-14.csv')
})

test('parseWorkLogsCsv reads back an exported work log row', () => {
  const csv = [
    '날짜,내용,소요 시간(분),연결 업무,태그',
    '2026-07-14,"회의, 진행",30,#5 보고서 작성,분기; 고객',
  ].join('\n')

  const { logs, errors } = parseWorkLogsCsv(csv)
  assert.deepEqual(errors, [])
  assert.deepEqual(logs, [{
    content: '회의, 진행',
    log_date: '2026-07-14',
    duration_minutes: 30,
    tags: ['분기', '고객'],
  }])
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
