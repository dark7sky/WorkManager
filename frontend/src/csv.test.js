import assert from 'node:assert/strict'
import test from 'node:test'
import { auditLogCsvFilename, auditLogsToCsv, parseTasksCsv, taskCsvFilename, tasksToCsv, timelineCsvFilename, timelineToCsv } from './csv.js'

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
