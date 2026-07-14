// Fixed-date (양력) Korean public holidays.
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

// Lunar-calendar holidays (설날/추석/부처님오신날) shift on the solar calendar every year, so they're
// looked up from KASI's published solar-calendar dates rather than computed. Covers 2024-2028;
// extend this table as later years' official dates are published. 대체공휴일 substitute-holiday
// rules remain out of scope.
const LUNAR_HOLIDAY_DATES = {
  '2024-02-09': '설날 연휴', '2024-02-10': '설날', '2024-02-11': '설날 연휴', '2024-05-15': '부처님오신날',
  '2024-09-16': '추석 연휴', '2024-09-17': '추석', '2024-09-18': '추석 연휴',
  '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴', '2025-05-05': '부처님오신날',
  '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴',
  '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴', '2026-05-24': '부처님오신날',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-05-13': '부처님오신날',
  '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
  '2028-01-26': '설날 연휴', '2028-01-27': '설날', '2028-01-28': '설날 연휴', '2028-05-02': '부처님오신날',
  '2028-10-02': '추석 연휴', '2028-10-03': '추석', '2028-10-04': '추석 연휴',
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 대체공휴일 (substitute holiday) rule: 어린이날 substitutes when it falls on Sat/Sun; 설날/추석
// 연휴 and the other named single-day holidays (삼일절/광복절/개천절/한글날/성탄절/부처님오신날)
// substitute only when they land on a Sunday. The substitute is the first following day that
// isn't itself already a holiday. Computed rather than hardcoded so it covers any year we have
// lunar-holiday data for.
const WEEKEND_TRIGGER_HOLIDAYS = new Set(['어린이날'])
const SUNDAY_TRIGGER_HOLIDAYS = new Set(['삼일절', '광복절', '개천절', '한글날', '성탄절', '부처님오신날'])

const substituteCache = new Map()

function substituteHolidaysForYear(year) {
  if (substituteCache.has(year)) return substituteCache.get(year)

  const fixed = FIXED_HOLIDAYS.map(h => ({ date: new Date(year, h.month - 1, h.day), name: h.name }))
  const lunar = Object.keys(LUNAR_HOLIDAY_DATES)
    .filter(k => k.startsWith(`${year}-`))
    .map(k => {
      const [y, m, d] = k.split('-').map(Number)
      return { date: new Date(y, m - 1, d), name: LUNAR_HOLIDAY_DATES[k] }
    })
  const holidayKeys = new Set([...fixed, ...lunar].map(e => dateKeyOf(e.date)))

  const groups = []
  const lunarByBase = {}
  for (const e of lunar) {
    const base = e.name.includes('설날') ? '설날' : e.name.includes('추석') ? '추석' : e.name
    ;(lunarByBase[base] ||= []).push(e.date)
  }
  for (const base in lunarByBase) groups.push({ dates: lunarByBase[base], weekendTrigger: false })
  for (const e of fixed) {
    if (WEEKEND_TRIGGER_HOLIDAYS.has(e.name)) groups.push({ dates: [e.date], weekendTrigger: true })
    else if (SUNDAY_TRIGGER_HOLIDAYS.has(e.name)) groups.push({ dates: [e.date], weekendTrigger: false })
  }

  const substitutes = {}
  for (const g of groups) {
    const triggered = g.weekendTrigger
      ? g.dates.some(d => d.getDay() === 0 || d.getDay() === 6)
      : g.dates.some(d => d.getDay() === 0)
    if (!triggered) continue
    const maxDate = new Date(Math.max(...g.dates.map(d => d.getTime())))
    const candidate = new Date(maxDate)
    do { candidate.setDate(candidate.getDate() + 1) } while (holidayKeys.has(dateKeyOf(candidate)))
    substitutes[dateKeyOf(candidate)] = '대체공휴일'
  }

  substituteCache.set(year, substitutes)
  return substitutes
}

export function holidayNameForDate(date) {
  const key = dateKeyOf(date)
  const lunar = LUNAR_HOLIDAY_DATES[key]
  if (lunar) return lunar
  const found = FIXED_HOLIDAYS.find(h => h.month === date.getMonth() + 1 && h.day === date.getDate())
  if (found) return found.name
  return substituteHolidaysForYear(date.getFullYear())[key] || null
}

export function holidayNameForKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return null
  return holidayNameForDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function isHoliday(date) {
  return holidayNameForDate(date) !== null
}
