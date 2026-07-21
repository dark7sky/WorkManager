import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadEventFilterPresets, saveEventFilterPresets, buildEventFilterPreset, addEventFilterPreset, removeEventFilterPreset, eventDeepLink } from './eventFilterPresets.js'

const makeStorage = () => {
  const store = new Map()
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }
}

test('loadEventFilterPresets returns empty array when nothing stored', () => {
  assert.deepEqual(loadEventFilterPresets(makeStorage()), [])
})

test('loadEventFilterPresets returns empty array on malformed JSON', () => {
  const storage = makeStorage()
  storage.setItem('wm-event-filter-presets', 'not json')
  assert.deepEqual(loadEventFilterPresets(storage), [])
})

test('buildEventFilterPreset trims name and defaults priority to all', () => {
  const preset = buildEventFilterPreset({ name: '  중요 회의  ', query: 'meeting', selectedTags: ['work'] })
  assert.equal(preset.name, '중요 회의')
  assert.equal(preset.priority, 'all')
  assert.equal(preset.query, 'meeting')
  assert.deepEqual(preset.selectedTags, ['work'])
  assert.ok(preset.id.startsWith('eflt-'))
})

test('addEventFilterPreset rejects unnamed presets and replaces same-name presets', () => {
  const p1 = buildEventFilterPreset({ name: '높은 우선순위', priority: 'high' })
  let presets = addEventFilterPreset([], p1)
  assert.equal(presets.length, 1)
  const p2 = buildEventFilterPreset({ name: '높은 우선순위', priority: 'low' })
  presets = addEventFilterPreset(presets, p2)
  assert.equal(presets.length, 1)
  assert.equal(presets[0].priority, 'low')
  const unnamed = buildEventFilterPreset({ name: '' })
  presets = addEventFilterPreset(presets, unnamed)
  assert.equal(presets.length, 1)
})

test('removeEventFilterPreset removes preset by id', () => {
  const p1 = buildEventFilterPreset({ name: 'a' })
  const p2 = buildEventFilterPreset({ name: 'b' })
  const presets = removeEventFilterPreset([p1, p2], p1.id)
  assert.deepEqual(presets, [p2])
})

test('saveEventFilterPresets persists as JSON', () => {
  const storage = makeStorage()
  const preset = buildEventFilterPreset({ name: 'a' })
  saveEventFilterPresets([preset], storage)
  assert.deepEqual(loadEventFilterPresets(storage), [preset])
})

test('eventDeepLink builds a calendar page URL with the event id', () => {
  assert.equal(eventDeepLink('https://app.example.com', '/', 42), 'https://app.example.com/?page=calendar&eventId=42')
})
