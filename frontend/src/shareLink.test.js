import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isShareActive, hasNativeShare } from './shareLink.js'

test('isShareActive false when no public_token', () => {
  assert.equal(isShareActive({}), false)
  assert.equal(isShareActive({ public_token_expires_at: '2099-01-01T00:00:00' }), false)
})

test('isShareActive true when token has no expiry', () => {
  assert.equal(isShareActive({ public_token: 'abc' }), true)
})

test('isShareActive respects expiry', () => {
  const now = new Date('2026-07-22T00:00:00').getTime()
  assert.equal(isShareActive({ public_token: 'abc', public_token_expires_at: '2026-07-23T00:00:00' }, now), true)
  assert.equal(isShareActive({ public_token: 'abc', public_token_expires_at: '2026-07-21T00:00:00' }, now), false)
})

test('hasNativeShare reflects navigator.share availability', () => {
  assert.equal(hasNativeShare({ share: () => Promise.resolve() }), true)
  assert.equal(hasNativeShare({}), false)
  assert.equal(hasNativeShare(undefined), false)
})
