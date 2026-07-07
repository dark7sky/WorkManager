import assert from 'node:assert/strict'
import test from 'node:test'
import { taskCsvFilename, tasksToCsv } from './csv.js'

test('tasksToCsv exports task rows with labels and escaping', () => {
  const csv = tasksToCsv([
    {
      title: '보고서, 검토',
      assignee_name: '김민준',
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
    '제목,담당자,상태,우선순위,시작일,기한,진행률,분류,태그,메모',
    '"보고서, 검토",김민준,지연,high,2026-07-06,2026-07-06,25%,기획,분기; 고객,"첫 줄\n둘째 줄"',
  ].join('\n'))
})

test('tasksToCsv guards spreadsheet formulas', () => {
  const csv = tasksToCsv([{ title: '=IMPORTXML("https://example.com")', status: 'done', progress: 100 }], '2026-07-07')

  assert.match(csv, /\t=IMPORTXML/)
})

test('taskCsvFilename uses the requested date', () => {
  assert.equal(taskCsvFilename('2026-07-07'), 'workmanager-tasks-2026-07-07.csv')
})
