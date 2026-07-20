import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addOwnFeatureRequestId, countPendingFeatureRequests, featureRequestStatusLabel, isOwnFeatureRequestId, OWN_FEATURE_REQUEST_LIMIT, replaceFeatureRequestStatus } from './featureRequests.js'

test('countPendingFeatureRequests counts only pending requests', () => {
  assert.equal(countPendingFeatureRequests([
    { id: 1, status: 'pending' },
    { id: 2, status: 'in_progress' },
    { id: 3, status: 'pending' },
  ]), 2)
})

test('replaceFeatureRequestStatus updates one request without dropping local fields', () => {
  const requests = [
    { id: 1, content: 'A', status: 'pending', created_at: '2026-07-07T19:00:00+09:00' },
    { id: 2, content: 'B', status: 'pending', created_at: '2026-07-07T19:01:00+09:00' },
  ]

  const updated = replaceFeatureRequestStatus(requests, { id: 2, status: 'done', completed_at: '2026-07-07T19:03:34+09:00' })

  assert.equal(updated[0], requests[0])
  assert.equal(updated[1].content, 'B')
  assert.equal(updated[1].status, 'done')
  assert.equal(updated[1].completed_at, '2026-07-07T19:03:34+09:00')
  assert.equal(featureRequestStatusLabel.done, '완료')
})

test('addOwnFeatureRequestId appends new ids and skips duplicates', () => {
  assert.deepEqual(addOwnFeatureRequestId([1, 2], 3), [1, 2, 3])
  assert.deepEqual(addOwnFeatureRequestId([1, 2], 2), [1, 2])
})

test('addOwnFeatureRequestId caps the tracked id list', () => {
  const ids = Array.from({ length: OWN_FEATURE_REQUEST_LIMIT }, (_, i) => i)
  const next = addOwnFeatureRequestId(ids, 99999)
  assert.equal(next.length, OWN_FEATURE_REQUEST_LIMIT)
  assert.equal(next[next.length - 1], 99999)
  assert.equal(next[0], 1)
})

test('isOwnFeatureRequestId reflects membership', () => {
  assert.equal(isOwnFeatureRequestId([1, 2, 3], 2), true)
  assert.equal(isOwnFeatureRequestId([1, 2, 3], 5), false)
})
