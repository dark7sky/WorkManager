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
