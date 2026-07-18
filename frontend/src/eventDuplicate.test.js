import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEventDuplicatePayload } from './eventDuplicate.js'

test('buildEventDuplicatePayload copies fields and suffixes the title', () => {
  const event = { id: 5, title: '주간 회의', description: '메모', start_at: '2026-07-14T09:00:00', end_at: '2026-07-14T10:00:00', location: '회의실 A', tags: ['업무'] }
  const result = buildEventDuplicatePayload(event)
  assert.equal(result.title, '주간 회의 (사본)')
  assert.equal(result.description, '메모')
  assert.equal(result.start_at, '2026-07-14T09:00:00')
  assert.equal(result.end_at, '2026-07-14T10:00:00')
  assert.equal(result.location, '회의실 A')
  assert.deepEqual(result.tags, ['업무'])
})

test('buildEventDuplicatePayload handles missing optional fields', () => {
  const result = buildEventDuplicatePayload({ title: '휴가' })
  assert.equal(result.title, '휴가 (사본)')
  assert.equal(result.description, '')
  assert.equal(result.start_at, null)
  assert.equal(result.end_at, null)
  assert.equal(result.location, '')
  assert.deepEqual(result.tags, [])
  assert.equal(result.estimated_minutes, null)
})

test('buildEventDuplicatePayload copies estimated_minutes', () => {
  const result = buildEventDuplicatePayload({ title: '워크숍', estimated_minutes: 90 })
  assert.equal(result.estimated_minutes, 90)
})
