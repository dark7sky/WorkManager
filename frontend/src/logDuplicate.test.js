import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLogDuplicatePayload, buildTaskFromLogPayload } from './logDuplicate.js'

test('buildLogDuplicatePayload copies fields and resets log_date to today', () => {
  const log = { id: 1, content: '스탠드업 참여', log_date: '2026-07-01', task_id: 7, tags: ['회의'], duration_minutes: 30, link_url: 'https://x.com', links: [{ id: 1, url: 'https://a.com', label: 'A' }], color: 'green', log_time: '09:30' }
  const result = buildLogDuplicatePayload(log)
  assert.equal(result.content, '스탠드업 참여 (사본)')
  assert.equal(result.log_date, new Date().toLocaleDateString('en-CA'))
  assert.equal(result.task_id, 7)
  assert.deepEqual(result.tags, ['회의'])
  assert.equal(result.duration_minutes, 30)
  assert.equal(result.link_url, 'https://x.com')
  assert.deepEqual(result.links, [{ id: 1, url: 'https://a.com', label: 'A' }])
  assert.equal(result.color, 'green')
  assert.equal(result.log_time, '09:30')
})

test('buildLogDuplicatePayload handles missing optional fields', () => {
  const result = buildLogDuplicatePayload({ content: '문서 정리' })
  assert.equal(result.content, '문서 정리 (사본)')
  assert.equal(result.task_id, null)
  assert.deepEqual(result.tags, [])
  assert.equal(result.duration_minutes, null)
  assert.equal(result.link_url, null)
  assert.deepEqual(result.links, [])
  assert.equal(result.color, null)
  assert.equal(result.log_time, null)
})

test('buildTaskFromLogPayload carries title/tags/due date and marks the task done', () => {
  const log = { content: '스탠드업 참여', log_date: '2026-07-01', tags: ['회의'], link_url: 'https://x.com' }
  const result = buildTaskFromLogPayload(log)
  assert.equal(result.title, '스탠드업 참여')
  assert.deepEqual(result.tags, ['회의'])
  assert.equal(result.priority, 'normal')
  assert.equal(result.due_date, '2026-07-01')
  assert.equal(result.status, 'done')
  assert.equal(result.progress, 100)
  assert.equal(result.link_url, 'https://x.com')
})

test('buildTaskFromLogPayload handles missing optional fields', () => {
  const result = buildTaskFromLogPayload({ content: '문서 정리' })
  assert.equal(result.title, '문서 정리')
  assert.deepEqual(result.tags, [])
  assert.equal(result.due_date, null)
  assert.equal(result.link_url, null)
})
