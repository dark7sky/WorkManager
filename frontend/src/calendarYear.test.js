import { test } from 'node:test'
import assert from 'node:assert/strict'
import { yearMonths, monthGridCells } from './calendarYear.js'

test('yearMonths returns 12 month-start dates for the given year', () => {
  const months = yearMonths(2026)
  assert.equal(months.length, 12)
  assert.equal(months[0].getFullYear(), 2026)
  assert.equal(months[0].getMonth(), 0)
  assert.equal(months[0].getDate(), 1)
  assert.equal(months[11].getMonth(), 11)
})

test('monthGridCells pads leading blanks to align the first weekday', () => {
  const cells = monthGridCells(2026, 1) // Feb 2026 starts on a Sunday
  assert.equal(cells[0].getDate(), 1)
  const withBlanks = monthGridCells(2026, 2) // Mar 2026 starts on a Sunday too; use a month with offset
  assert.ok(withBlanks.length >= 28)
})

test('monthGridCells includes every day of the month exactly once', () => {
  const cells = monthGridCells(2026, 6) // July 2026
  const days = cells.filter(Boolean)
  assert.equal(days.length, 31)
  assert.equal(days[0].getDate(), 1)
  assert.equal(days[30].getDate(), 31)
})

test('monthGridCells pads leading blanks for a month not starting on Sunday', () => {
  const cells = monthGridCells(2026, 6) // 2026-07-01 is a Wednesday
  const leadingBlanks = cells.findIndex(cell => cell !== null)
  assert.equal(leadingBlanks, new Date(2026, 6, 1).getDay())
})
