import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextRecurrenceDate } from './recurrencePreview.js'

test('returns null without a date or rule', () => {
  assert.equal(nextRecurrenceDate('', 'daily'), null)
  assert.equal(nextRecurrenceDate('2026-07-21', ''), null)
})

test('advances daily/weekly/biweekly by fixed day counts', () => {
  assert.equal(nextRecurrenceDate('2026-07-21', 'daily'), '2026-07-22')
  assert.equal(nextRecurrenceDate('2026-07-21', 'weekly'), '2026-07-28')
  assert.equal(nextRecurrenceDate('2026-07-21', 'biweekly'), '2026-08-04')
})

test('advances monthly and clamps to shorter months', () => {
  assert.equal(nextRecurrenceDate('2026-07-21', 'monthly'), '2026-08-21')
  assert.equal(nextRecurrenceDate('2026-01-31', 'monthly'), '2026-02-28')
  assert.equal(nextRecurrenceDate('2026-12-15', 'monthly'), '2027-01-15')
})

test('advances yearly and clamps leap-day dates', () => {
  assert.equal(nextRecurrenceDate('2026-07-21', 'yearly'), '2027-07-21')
  assert.equal(nextRecurrenceDate('2028-02-29', 'yearly'), '2029-02-28')
})

test('weekdays rule skips weekends', () => {
  assert.equal(nextRecurrenceDate('2026-07-24', 'weekdays'), '2026-07-27')
  assert.equal(nextRecurrenceDate('2026-07-21', 'weekdays'), '2026-07-22')
})
