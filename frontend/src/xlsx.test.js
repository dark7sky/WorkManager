import assert from 'node:assert/strict'
import test from 'node:test'
import { rowsToSpreadsheetXml, taskExcelFilename, tasksToExcelXml } from './xlsx.js'

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
