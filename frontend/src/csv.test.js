import assert from 'node:assert/strict'
import test from 'node:test'
import { taskCsvFilename, tasksToCsv, timelineCsvFilename, timelineToCsv } from './csv.js'

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
