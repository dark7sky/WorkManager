// Fixed-date (양력) Korean public holidays only — lunar holidays (설날/추석/부처님오신날) and
// substitute holidays (대체공휴일) need a lunar calendar and are intentionally out of scope here.
const FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: '신정' },
  { month: 3, day: 1, name: '삼일절' },
  { month: 5, day: 5, name: '어린이날' },
  { month: 6, day: 6, name: '현충일' },
  { month: 8, day: 15, name: '광복절' },
  { month: 10, day: 3, name: '개천절' },
  { month: 10, day: 9, name: '한글날' },
  { month: 12, day: 25, name: '성탄절' },
]

export function holidayNameForDate(date) {
  const found = FIXED_HOLIDAYS.find(h => h.month === date.getMonth() + 1 && h.day === date.getDate())
  return found ? found.name : null
}

export function holidayNameForKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null
  return holidayNameForDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function isHoliday(date) {
  return holidayNameForDate(date) !== null
}
