import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addFilterPreset,
  buildFilterPreset,
  loadFilterPresets,
  removeFilterPreset,
  saveFilterPresets,
} from './taskFilterPresets.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadFilterPresets returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadFilterPresets(new MemoryStorage()), [])
})

test('loadFilterPresets tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-filter-presets', '{not json')
  assert.deepEqual(loadFilterPresets(storage), [])
})

test('saveFilterPresets round-trips through loadFilterPresets', () => {
  const storage = new MemoryStorage()
  const preset = buildFilterPreset({ name: '지연 업무', query: '', status: 'overdue', selectedTags: ['긴급'], priority: 'high' })
  saveFilterPresets([preset], storage)
  assert.deepEqual(loadFilterPresets(storage), [preset])
})

test('buildFilterPreset trims the name and defaults missing fields', () => {
  const preset = buildFilterPreset({ name: '  내 필터  ' })
  assert.equal(preset.name, '내 필터')
  assert.equal(preset.query, '')
  assert.equal(preset.status, 'active')
  assert.deepEqual(preset.selectedTags, [])
  assert.equal(preset.priority, 'all')
})

test('addFilterPreset rejects presets missing a name', () => {
  const presets = []
  assert.equal(addFilterPreset(presets, buildFilterPreset({ name: '' })), presets)
})

test('addFilterPreset appends a valid preset and replaces an existing one with the same name', () => {
  const first = buildFilterPreset({ name: '내 필터', status: 'active' })
  assert.deepEqual(addFilterPreset([], first), [first])

  const updated = buildFilterPreset({ name: '내 필터', status: 'overdue' })
  const next = addFilterPreset([first], updated)
  assert.deepEqual(next, [updated])
})

test('removeFilterPreset filters out the matching id only', () => {
  const a = buildFilterPreset({ name: 'A' })
  const b = buildFilterPreset({ name: 'B' })
  assert.deepEqual(removeFilterPreset([a, b], a.id), [b])
})
