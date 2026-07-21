import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadLogFilterPresets, saveLogFilterPresets, buildLogFilterPreset, addLogFilterPreset, removeLogFilterPreset, logDeepLink } from './logFilterPresets.js'

const makeStorage = () => {
  const store = new Map()
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  }
}

test('loadLogFilterPresets returns empty array when nothing stored', () => {
  assert.deepEqual(loadLogFilterPresets(makeStorage()), [])
})

test('loadLogFilterPresets returns empty array on malformed JSON', () => {
  const storage = makeStorage()
  storage.setItem('wm-log-filter-presets', 'not json')
  assert.deepEqual(loadLogFilterPresets(storage), [])
})

test('buildLogFilterPreset trims name and defaults billable/priority to all', () => {
  const preset = buildLogFilterPreset({ name: '  청구 가능 업무  ', query: 'client-x', selectedTags: ['client-x'] })
  assert.equal(preset.name, '청구 가능 업무')
  assert.equal(preset.billable, 'all')
  assert.equal(preset.priority, 'all')
  assert.equal(preset.query, 'client-x')
  assert.deepEqual(preset.selectedTags, ['client-x'])
  assert.ok(preset.id.startsWith('lflt-'))
})

test('buildLogFilterPreset keeps an explicit priority', () => {
  const preset = buildLogFilterPreset({ name: '우선순위 높음', priority: 'high' })
  assert.equal(preset.priority, 'high')
})

test('addLogFilterPreset rejects unnamed presets and replaces same-name presets', () => {
  const p1 = buildLogFilterPreset({ name: '청구 가능', billable: 'billable' })
  let presets = addLogFilterPreset([], p1)
  assert.equal(presets.length, 1)
  const p2 = buildLogFilterPreset({ name: '청구 가능', billable: 'non-billable' })
  presets = addLogFilterPreset(presets, p2)
  assert.equal(presets.length, 1)
  assert.equal(presets[0].billable, 'non-billable')
  const unnamed = buildLogFilterPreset({ name: '' })
  presets = addLogFilterPreset(presets, unnamed)
  assert.equal(presets.length, 1)
})

test('removeLogFilterPreset removes preset by id', () => {
  const p1 = buildLogFilterPreset({ name: 'a' })
  const p2 = buildLogFilterPreset({ name: 'b' })
  const presets = removeLogFilterPreset([p1, p2], p1.id)
  assert.deepEqual(presets, [p2])
})

test('saveLogFilterPresets persists as JSON', () => {
  const storage = makeStorage()
  const preset = buildLogFilterPreset({ name: 'a' })
  saveLogFilterPresets([preset], storage)
  assert.deepEqual(loadLogFilterPresets(storage), [preset])
})

test('logDeepLink builds a today page URL with the log id', () => {
  assert.equal(logDeepLink('https://app.example.com', '/', 7), 'https://app.example.com/?page=today&logId=7')
})
