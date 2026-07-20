import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOnlineNow } from './networkStatus.js'

test('isOnlineNow defaults to true when navigator is unavailable or online', () => {
  assert.equal(isOnlineNow(), true)
})

test('isOnlineNow returns false when navigator.onLine is explicitly false', () => {
  const original = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
  assert.equal(isOnlineNow(), false)
  Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true })
})
