import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holidayNameForDate, holidayNameForKey, isHoliday } from './holidays.js'

test('holidayNameForDate recognizes fixed-date national holidays', () => {
  assert.equal(holidayNameForDate(new Date(2026, 0, 1)), '신정')
  assert.equal(holidayNameForDate(new Date(2026, 7, 15)), '광복절')
  assert.equal(holidayNameForDate(new Date(2026, 11, 25)), '성탄절')
})

test('holidayNameForDate returns null on non-holiday dates', () => {
  assert.equal(holidayNameForDate(new Date(2026, 6, 13)), null)
})

test('holidayNameForKey parses a YYYY-MM-DD key', () => {
  assert.equal(holidayNameForKey('2026-10-09'), '한글날')
  assert.equal(holidayNameForKey('2026-10-10'), null)
  assert.equal(holidayNameForKey('not-a-date'), null)
})

test('isHoliday matches holidayNameForDate truthiness', () => {
  assert.equal(isHoliday(new Date(2026, 4, 5)), true)
  assert.equal(isHoliday(new Date(2026, 4, 6)), false)
})

test('holidayNameForDate recognizes lunar-calendar holidays', () => {
  assert.equal(holidayNameForDate(new Date(2026, 1, 17)), '설날')
  assert.equal(holidayNameForDate(new Date(2026, 1, 16)), '설날 연휴')
  assert.equal(holidayNameForDate(new Date(2026, 8, 25)), '추석')
  assert.equal(holidayNameForDate(new Date(2026, 4, 24)), '부처님오신날')
})

test('holidayNameForKey resolves a lunar holiday by date key', () => {
  assert.equal(holidayNameForKey('2025-01-29'), '설날')
  assert.equal(holidayNameForKey('2025-01-31'), null)
})

test('holidayNameForDate substitutes a Sunday-falling fixed holiday to the next weekday', () => {
  // 2026-03-01 (삼일절) is a Sunday, so 2026-03-02 (Monday) becomes 대체공휴일.
  assert.equal(holidayNameForDate(new Date(2026, 2, 1)), '삼일절')
  assert.equal(holidayNameForDate(new Date(2026, 2, 2)), '대체공휴일')
})

test('holidayNameForDate substitutes 어린이날 when it falls on a weekend', () => {
  // 2024-05-05 (어린이날) is a Sunday, so 2024-05-06 (Monday) becomes 대체공휴일.
  assert.equal(holidayNameForDate(new Date(2024, 4, 5)), '어린이날')
  assert.equal(holidayNameForDate(new Date(2024, 4, 6)), '대체공휴일')
})

test('holidayNameForDate does not add a substitute when a fixed holiday falls on a weekday', () => {
  // 2026-08-15 (광복절) is a Saturday, which does not trigger a substitute for this category.
  assert.equal(holidayNameForDate(new Date(2026, 7, 15)), '광복절')
  assert.equal(holidayNameForDate(new Date(2026, 7, 17)), null)
})
