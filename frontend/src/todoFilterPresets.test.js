import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTodoFilterPresets, saveTodoFilterPresets, buildTodoFilterPreset, addTodoFilterPreset, removeTodoFilterPreset } from './todoFilterPresets.js'

const makeStorage = () => {
  const store = new Map()
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }
}

test('loadTodoFilterPresets returns empty array when nothing stored', () => {
  assert.deepEqual(loadTodoFilterPresets(makeStorage()), [])
})

test('loadTodoFilterPresets returns empty array on malformed JSON', () => {
  const storage = makeStorage()
  storage.setItem('wm-todo-filter-presets', 'not json')
  assert.deepEqual(loadTodoFilterPresets(storage), [])
})

test('buildTodoFilterPreset trims name and defaults priority to all', () => {
  const preset = buildTodoFilterPreset({ name: '  급한 일  ', query: 'urgent', selectedTags: ['work'] })
  assert.equal(preset.name, '급한 일')
  assert.equal(preset.priority, 'all')
  assert.equal(preset.query, 'urgent')
  assert.deepEqual(preset.selectedTags, ['work'])
  assert.ok(preset.id.startsWith('tflt-'))
})

test('addTodoFilterPreset rejects unnamed presets and replaces same-name presets', () => {
  const p1 = buildTodoFilterPreset({ name: '높은 우선순위', priority: 'high' })
  let presets = addTodoFilterPreset([], p1)
  assert.equal(presets.length, 1)
  const p2 = buildTodoFilterPreset({ name: '높은 우선순위', priority: 'low' })
  presets = addTodoFilterPreset(presets, p2)
  assert.equal(presets.length, 1)
  assert.equal(presets[0].priority, 'low')
  const unnamed = buildTodoFilterPreset({ name: '' })
  presets = addTodoFilterPreset(presets, unnamed)
  assert.equal(presets.length, 1)
})

test('removeTodoFilterPreset removes preset by id', () => {
  const p1 = buildTodoFilterPreset({ name: 'a' })
  const p2 = buildTodoFilterPreset({ name: 'b' })
  const presets = removeTodoFilterPreset([p1, p2], p1.id)
  assert.deepEqual(presets, [p2])
})

test('saveTodoFilterPresets persists as JSON', () => {
  const storage = makeStorage()
  const preset = buildTodoFilterPreset({ name: 'a' })
  saveTodoFilterPresets([preset], storage)
  assert.deepEqual(loadTodoFilterPresets(storage), [preset])
})
