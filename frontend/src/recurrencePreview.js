const DAY_MS = 24 * 60 * 60 * 1000

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export function nextRecurrenceDate(dateStr, rule) {
  if (!dateStr || !rule) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  if (rule === 'daily') return new Date(Date.UTC(y, m - 1, d) + DAY_MS).toISOString().slice(0, 10)
  if (rule === 'weekly') return new Date(Date.UTC(y, m - 1, d) + 7 * DAY_MS).toISOString().slice(0, 10)
  if (rule === 'biweekly') return new Date(Date.UTC(y, m - 1, d) + 14 * DAY_MS).toISOString().slice(0, 10)
  if (rule === 'yearly') {
    const day = Math.min(d, daysInMonth(y + 1, m - 1))
    return `${String(y + 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  if (rule === 'monthly') {
    const nextMonth = m === 12 ? 1 : m + 1
    const nextYear = m === 12 ? y + 1 : y
    const day = Math.min(d, daysInMonth(nextYear, nextMonth - 1))
    return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}
