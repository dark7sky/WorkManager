import { auditHeaders, auditRows, eventHeaders, eventRows, taskHeaders, taskRows, todoHeaders, todoRows, workLogHeaders, workLogRows } from './csv.js'

const escapeXmlText = value => {
  const text = value == null ? '' : String(value)
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export const rowsToSpreadsheetXml = (sheetName, headers, rows) => {
  const cell = value => `<Cell><Data ss:Type="String">${escapeXmlText(value)}</Data></Cell>`
  const row = cells => `<Row>${cells.map(cell).join('')}</Row>`
  const body = [row(headers), ...rows.map(row)].join('')
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${escapeXmlText(sheetName)}"><Table>${body}</Table></Worksheet></Workbook>`
}

export const tasksToExcelXml = (tasks, todayIso, pinnedIds) => rowsToSpreadsheetXml('업무', taskHeaders, taskRows(tasks, todayIso, pinnedIds))

export const taskExcelFilename = date => `workmanager-tasks-${date}.xls`

export const eventsToExcelXml = (events, pinnedIds) => rowsToSpreadsheetXml('일정', eventHeaders, eventRows(events, pinnedIds))

export const eventExcelFilename = date => `workmanager-events-${date}.xls`

export const todosToExcelXml = (todos, pinnedIds) => rowsToSpreadsheetXml('Todo', todoHeaders, todoRows(todos, pinnedIds))

export const todoExcelFilename = date => `workmanager-todos-${date}.xls`

export const workLogsToExcelXml = (logs, taskTitleById, hourlyRate, pinnedIds) => rowsToSpreadsheetXml('업무 기록', workLogHeaders, workLogRows(logs, taskTitleById, hourlyRate, pinnedIds))

export const workLogExcelFilename = date => `workmanager-work-logs-${date}.xls`

export const auditLogsToExcelXml = logs => rowsToSpreadsheetXml('감사 로그', auditHeaders, auditRows(logs))

export const auditLogExcelFilename = date => `workmanager-audit-log-${date}.xls`
