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

export const tasksToExcelXml = (tasks, todayIso) => rowsToSpreadsheetXml('업무', taskHeaders, taskRows(tasks, todayIso))

export const taskExcelFilename = date => `workmanager-tasks-${date}.xls`

export const eventsToExcelXml = events => rowsToSpreadsheetXml('일정', eventHeaders, eventRows(events))

export const eventExcelFilename = date => `workmanager-events-${date}.xls`

export const todosToExcelXml = todos => rowsToSpreadsheetXml('Todo', todoHeaders, todoRows(todos))

export const todoExcelFilename = date => `workmanager-todos-${date}.xls`

export const workLogsToExcelXml = (logs, taskTitleById, hourlyRate) => rowsToSpreadsheetXml('업무 기록', workLogHeaders, workLogRows(logs, taskTitleById, hourlyRate))

export const workLogExcelFilename = date => `workmanager-work-logs-${date}.xls`

export const auditLogsToExcelXml = logs => rowsToSpreadsheetXml('감사 로그', auditHeaders, auditRows(logs))

export const auditLogExcelFilename = date => `workmanager-audit-log-${date}.xls`
