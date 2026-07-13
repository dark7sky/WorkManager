import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventColorHex, EVENT_COLORS } from './eventColors.js'

test('eventColorHex resolves known colors', () => {
  assert.equal(eventColorHex('red'), '#e5484d')
  assert.equal(eventColorHex('green'), '#2f9e44')
})

test('eventColorHex returns null for empty or unknown colors', () => {
  assert.equal(eventColorHex(''), null)
  assert.equal(eventColorHex(undefined), null)
  assert.equal(eventColorHex('not-a-color'), null)
})

test('EVENT_COLORS includes a default option with no hex', () => {
  assert.equal(EVENT_COLORS[0].value, '')
  assert.equal(EVENT_COLORS[0].hex, undefined)
})
