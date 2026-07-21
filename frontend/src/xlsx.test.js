import assert from 'node:assert/strict'
import test from 'node:test'
import { auditLogExcelFilename, auditLogsToExcelXml, eventExcelFilename, eventsToExcelXml, rowsToSpreadsheetXml, taskExcelFilename, tasksToExcelXml, todoExcelFilename, todosToExcelXml, workLogExcelFilename, workLogsToExcelXml } from './xlsx.js'

test('rowsToSpreadsheetXml builds a valid SpreadsheetML workbook with escaped cells', () => {
  const xml = rowsToSpreadsheetXml('시트', ['제목', '메모'], [['A & B', '<탭> "인용" \'따옴표\'']])
  assert.match(xml, /^<\?xml version="1.0"\?>/)
  assert.match(xml, /<Worksheet ss:Name="시트">/)
  assert.match(xml, /<Cell><Data ss:Type="String">제목<\/Data><\/Cell>/)
  assert.match(xml, /A &amp; B/)
  assert.match(xml, /&lt;탭&gt; &quot;인용&quot; &apos;따옴표&apos;/)
  assert.equal((xml.match(/<Row>/g) || []).length, 2)
})

test('tasksToExcelXml reuses the task CSV headers and row values', () => {
  const xml = tasksToExcelXml([
    { title: '보고서 작성', status: 'todo', priority: 'high', start_date: '2026-07-06', due_date: '2026-07-06', progress: 25, tags: ['분기'] },
  ], '2026-07-07')
  assert.match(xml, /<Data ss:Type="String">제목<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">보고서 작성<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">지연<\/Data>/)
})

test('taskExcelFilename uses the .xls extension', () => {
  assert.equal(taskExcelFilename('2026-07-21'), 'workmanager-tasks-2026-07-21.xls')
})

test('eventsToExcelXml reuses the event CSV headers and row values', () => {
  const xml = eventsToExcelXml([{ title: '팀 회의', start_at: '2026-07-21T10:00:00', end_at: '2026-07-21T11:00:00', location: '회의실 A', priority: 'high' }])
  assert.match(xml, /<Data ss:Type="String">제목<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">팀 회의<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">회의실 A<\/Data>/)
})

test('eventExcelFilename uses the .xls extension', () => {
  assert.equal(eventExcelFilename('2026-07-21'), 'workmanager-events-2026-07-21.xls')
})

test('todosToExcelXml reuses the todo CSV headers and row values', () => {
  const xml = todosToExcelXml([{ title: '보고서 검토', completed: false, priority: 'normal' }])
  assert.match(xml, /<Data ss:Type="String">제목<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">보고서 검토<\/Data>/)
})

test('todoExcelFilename uses the .xls extension', () => {
  assert.equal(todoExcelFilename('2026-07-21'), 'workmanager-todos-2026-07-21.xls')
})

test('workLogsToExcelXml reuses the work log CSV headers and row values', () => {
  const xml = workLogsToExcelXml([{ log_date: '2026-07-21', content: '버그 수정', duration_minutes: 30, task_id: 5 }], new Map([[5, '결제 모듈']]), 20000)
  assert.match(xml, /<Data ss:Type="String">내용<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">버그 수정<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">#5 결제 모듈<\/Data>/)
})

test('workLogExcelFilename uses the .xls extension', () => {
  assert.equal(workLogExcelFilename('2026-07-21'), 'workmanager-work-logs-2026-07-21.xls')
})

test('auditLogsToExcelXml reuses the audit log CSV headers and row values', () => {
  const xml = auditLogsToExcelXml([{ created_at: '2026-07-21T10:00:00', action: 'update', entity_type: 'tasks', entity_id: 5, metadata: { fields: ['title'] } }])
  assert.match(xml, /<Data ss:Type="String">일시<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">수정<\/Data>/)
  assert.match(xml, /<Data ss:Type="String">업무<\/Data>/)
})

test('auditLogExcelFilename uses the .xls extension', () => {
  assert.equal(auditLogExcelFilename('2026-07-21'), 'workmanager-audit-log-2026-07-21.xls')
})
