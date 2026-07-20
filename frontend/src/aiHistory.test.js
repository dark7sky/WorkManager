import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addAiHistoryEntry, loadAiHistory, removeAiHistoryEntry, saveAiHistory } from './aiHistory.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadAiHistory returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadAiHistory(new MemoryStorage()), [])
})

test('loadAiHistory tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-ai-history', '{not json')
  assert.deepEqual(loadAiHistory(storage), [])
})

test('saveAiHistory round-trips through loadAiHistory', () => {
  const storage = new MemoryStorage()
  saveAiHistory(['첫 요청'], storage)
  assert.deepEqual(loadAiHistory(storage), ['첫 요청'])
})

test('addAiHistoryEntry ignores blank text', () => {
  assert.deepEqual(addAiHistoryEntry(['기존'], '   '), ['기존'])
})

test('addAiHistoryEntry trims and prepends the newest entry', () => {
  assert.deepEqual(addAiHistoryEntry(['이전 요청'], '  새 요청  '), ['새 요청', '이전 요청'])
})

test('addAiHistoryEntry moves a repeated entry to the front instead of duplicating it', () => {
  assert.deepEqual(addAiHistoryEntry(['A', 'B', 'C'], 'B'), ['B', 'A', 'C'])
})

test('addAiHistoryEntry caps history at 8 entries', () => {
  const history = ['1', '2', '3', '4', '5', '6', '7', '8']
  assert.deepEqual(addAiHistoryEntry(history, '9'), ['9', '1', '2', '3', '4', '5', '6', '7'])
})

test('removeAiHistoryEntry filters out the matching text only', () => {
  assert.deepEqual(removeAiHistoryEntry(['A', 'B', 'C'], 'B'), ['A', 'C'])
})
