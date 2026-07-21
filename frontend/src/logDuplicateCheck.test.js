import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDuplicateContentLogs } from './logDuplicateCheck.js'

const logs = [
  { id: 1, content: '주간 보고서 작성' },
  { id: 2, content: '주간 보고서 작성' },
  { id: 3, content: '  회의 참석 ' },
  { id: 4, content: '삭제된 기록', deleted_at: '2026-07-20T00:00:00Z' },
]

test('finds logs with matching content, ignoring case and whitespace', () => {
  const result = findDuplicateContentLogs('주간 보고서 작성', logs)
  assert.deepEqual(result.map(l => l.id), [1, 2])
})

test('matches trimmed content regardless of surrounding whitespace', () => {
  const result = findDuplicateContentLogs(' 회의 참석', logs)
  assert.deepEqual(result.map(l => l.id), [3])
})

test('excludes soft-deleted logs', () => {
  const result = findDuplicateContentLogs('삭제된 기록', logs)
  assert.deepEqual(result, [])
})

test('excludes the log currently being edited', () => {
  const result = findDuplicateContentLogs('주간 보고서 작성', logs, 1)
  assert.deepEqual(result.map(l => l.id), [2])
})

test('returns empty array for blank or missing content', () => {
  assert.deepEqual(findDuplicateContentLogs('', logs), [])
  assert.deepEqual(findDuplicateContentLogs('   ', logs), [])
  assert.deepEqual(findDuplicateContentLogs(undefined, logs), [])
})
