import { taskHeaders, taskRows } from './csv.js'

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
