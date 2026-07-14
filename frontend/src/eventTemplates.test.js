import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addEventTemplate,
  applyEventTemplate,
  buildEventTemplate,
  loadEventTemplates,
  removeEventTemplate,
  saveEventTemplates,
} from './eventTemplates.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadEventTemplates returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadEventTemplates(new MemoryStorage()), [])
})

test('loadEventTemplates tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-event-templates', '{not json')
  assert.deepEqual(loadEventTemplates(storage), [])
})

test('saveEventTemplates round-trips through loadEventTemplates', () => {
  const storage = new MemoryStorage()
  const template = buildEventTemplate({ name: '주간 회의', title: '주간 팀 회의', location: '회의실 A', color: 'blue', tags: ['정기'] })
  saveEventTemplates([template], storage)
  assert.deepEqual(loadEventTemplates(storage), [template])
})

test('buildEventTemplate trims fields and defaults color', () => {
  const template = buildEventTemplate({ name: '  이름  ', title: '  제목  ' })
  assert.equal(template.name, '이름')
  assert.equal(template.title, '제목')
  assert.equal(template.location, '')
  assert.equal(template.color, '')
  assert.deepEqual(template.tags, [])
})

test('addEventTemplate rejects templates missing a name or title', () => {
  const templates = []
  assert.equal(addEventTemplate(templates, buildEventTemplate({ name: '', title: '제목' })), templates)
  assert.equal(addEventTemplate(templates, buildEventTemplate({ name: '이름', title: '' })), templates)
})

test('addEventTemplate appends a valid template', () => {
  const template = buildEventTemplate({ name: '이름', title: '제목' })
  assert.deepEqual(addEventTemplate([], template), [template])
})

test('removeEventTemplate filters out the matching id only', () => {
  const a = buildEventTemplate({ name: 'A', title: 'A' })
  const b = buildEventTemplate({ name: 'B', title: 'B' })
  assert.deepEqual(removeEventTemplate([a, b], a.id), [b])
})

test('applyEventTemplate maps template fields onto a draft', () => {
  const template = buildEventTemplate({ name: '주간 회의', title: '주간 팀 회의', location: '회의실 A', color: 'blue', tags: ['정기'] })
  assert.deepEqual(applyEventTemplate(template), { title: '주간 팀 회의', location: '회의실 A', color: 'blue', tags: ['정기'] })
})
