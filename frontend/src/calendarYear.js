export function yearMonths(year) {
  return Array.from({ length: 12 }, (_, month) => new Date(year, month, 1))
}

export function monthGridCells(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = new Date(year, month, 1).getDay()
  const cells = Array.from({ length: startOffset }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day))
  return cells
}
