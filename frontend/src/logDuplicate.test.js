import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLogDuplicatePayload, buildTaskFromLogPayload } from './logDuplicate.js'

test('buildLogDuplicatePayload copies fields and resets log_date to today', () => {
  const log = { id: 1, content: '스탠드업 참여', log_date: '2026-07-01', task_id: 7, tags: ['회의'], duration_minutes: 30, link_url: 'https://x.com', links: [{ id: 1, url: 'https://a.com', label: 'A' }], color: 'green', log_time: '09:30', priority: 'high', checklist: [{ id: 'c1', text: '준비', done: true }], estimated_minutes: 45, custom_fields: [{ id: 'f1', label: '고객사', value: 'ACME' }], reminder_minutes_before: 20, hourly_rate_override: 50000, client_name: 'ACME Corp' }
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
  assert.equal(result.priority, 'high')
  assert.deepEqual(result.checklist, [{ id: 'c1', text: '준비', done: false }])
  assert.equal(result.estimated_minutes, 45)
  assert.deepEqual(result.custom_fields, [{ id: 'f1', label: '고객사', value: 'ACME' }])
  assert.equal(result.reminder_minutes_before, 20)
  assert.equal(result.hourly_rate_override, 50000)
  assert.equal(result.client_name, 'ACME Corp')
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
  assert.equal(result.priority, 'normal')
  assert.deepEqual(result.checklist, [])
  assert.equal(result.estimated_minutes, null)
  assert.deepEqual(result.custom_fields, [])
  assert.equal(result.reminder_minutes_before, null)
  assert.equal(result.hourly_rate_override, null)
  assert.equal(result.client_name, null)
})

test('buildTaskFromLogPayload carries title/tags/due date/estimate and marks the task done', () => {
  const log = { content: '스탠드업 참여', log_date: '2026-07-01', tags: ['회의'], link_url: 'https://x.com', checklist: [{ id: 'c1', text: '준비', done: true }], estimated_minutes: 45 }
  const result = buildTaskFromLogPayload(log)
  assert.equal(result.title, '스탠드업 참여')
  assert.deepEqual(result.tags, ['회의'])
  assert.equal(result.priority, 'normal')
  assert.equal(result.due_date, '2026-07-01')
  assert.equal(result.status, 'done')
  assert.equal(result.progress, 100)
  assert.equal(result.link_url, 'https://x.com')
  assert.deepEqual(result.checklist, [{ id: 'c1', text: '준비', done: true }])
  assert.equal(result.estimated_minutes, 45)
})

test('buildTaskFromLogPayload handles missing optional fields', () => {
  const result = buildTaskFromLogPayload({ content: '문서 정리' })
  assert.equal(result.title, '문서 정리')
  assert.deepEqual(result.tags, [])
  assert.equal(result.due_date, null)
  assert.equal(result.link_url, null)
  assert.deepEqual(result.checklist, [])
  assert.equal(result.estimated_minutes, null)
})

test('buildTaskFromLogPayload carries links, custom_fields, color and reminder_minutes_before', () => {
  const log = { content: '스탠드업 참여', links: [{ id: '1', url: 'https://a.com', label: 'A' }], custom_fields: [{ id: 'f1', label: '고객사', value: 'ACME' }], color: 'green', reminder_minutes_before: 20 }
  const result = buildTaskFromLogPayload(log)
  assert.deepEqual(result.links, [{ id: '1', url: 'https://a.com', label: 'A' }])
  assert.deepEqual(result.custom_fields, [{ id: 'f1', label: '고객사', value: 'ACME' }])
  assert.equal(result.color, 'green')
  assert.equal(result.reminder_minutes_before, 20)
})

test('buildTaskFromLogPayload defaults links, custom_fields, color and reminder_minutes_before when missing', () => {
  const result = buildTaskFromLogPayload({ content: '문서 정리' })
  assert.deepEqual(result.links, [])
  assert.deepEqual(result.custom_fields, [])
  assert.equal(result.color, null)
  assert.equal(result.reminder_minutes_before, null)
})
