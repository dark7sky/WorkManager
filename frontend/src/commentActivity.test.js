import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadCommentLastViewed, saveCommentLastViewed, markCommentsViewed, hasUnseenComments } from './commentActivity.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadCommentLastViewed returns an empty object when nothing is stored', () => {
  assert.deepEqual(loadCommentLastViewed(new MemoryStorage()), {})
})

test('loadCommentLastViewed tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-comment-last-viewed', '{not json')
  assert.deepEqual(loadCommentLastViewed(storage), {})
})

test('markCommentsViewed adds an entry without mutating the original map', () => {
  const original = { 'tasks:1': '2026-01-01T00:00:00Z' }
  const next = markCommentsViewed(original, 'tasks', 2, '2026-01-02T00:00:00Z')
  assert.deepEqual(next, { 'tasks:1': '2026-01-01T00:00:00Z', 'tasks:2': '2026-01-02T00:00:00Z' })
  assert.deepEqual(original, { 'tasks:1': '2026-01-01T00:00:00Z' })
})

test('saveCommentLastViewed round-trips through loadCommentLastViewed', () => {
  const storage = new MemoryStorage()
  saveCommentLastViewed({ 'tasks:1': '2026-01-01T00:00:00Z' }, storage)
  assert.deepEqual(loadCommentLastViewed(storage), { 'tasks:1': '2026-01-01T00:00:00Z' })
})

test('hasUnseenComments is false when the item has no comments', () => {
  assert.equal(hasUnseenComments({ id: 1 }, 'tasks', {}), false)
})

test('hasUnseenComments is true when never viewed', () => {
  const item = { id: 1, latest_comment_at: '2026-01-05T00:00:00Z' }
  assert.equal(hasUnseenComments(item, 'tasks', {}), true)
})

test('hasUnseenComments compares against the last viewed timestamp', () => {
  const item = { id: 1, latest_comment_at: '2026-01-05T00:00:00Z' }
  const map = { 'tasks:1': '2026-01-01T00:00:00Z' }
  assert.equal(hasUnseenComments(item, 'tasks', map), true)
  const upToDate = markCommentsViewed(map, 'tasks', 1, '2026-01-06T00:00:00Z')
  assert.equal(hasUnseenComments(item, 'tasks', upToDate), false)
})

test('hasUnseenComments does not confuse ids across entities', () => {
  const item = { id: 1, latest_comment_at: '2026-01-05T00:00:00Z' }
  const map = { 'todos:1': '2026-01-06T00:00:00Z' }
  assert.equal(hasUnseenComments(item, 'tasks', map), true)
})
