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
  assert.deepEqual(applyEventTemplate(template), { title: '주간 팀 회의', location: '회의실 A', color: 'blue', priority: '', tags: ['정기'], estimated_minutes: '', checklist: [], link_url: '', links: [] })
})

test('buildEventTemplate and applyEventTemplate round-trip link_url and links', () => {
  const links = [{ id: 'x', url: 'https://example.com', label: '참고' }]
  const template = buildEventTemplate({ name: '주간 회의', title: '주간 팀 회의', link_url: 'https://a.com', links })
  assert.equal(template.link_url, 'https://a.com')
  const applied = applyEventTemplate(template)
  assert.equal(applied.link_url, 'https://a.com')
  assert.equal(applied.links[0].url, 'https://example.com')
  assert.notEqual(applied.links[0].id, links[0].id)
})

test('buildEventTemplate and applyEventTemplate carry the estimate', () => {
  const template = buildEventTemplate({ name: '주간 회의', title: '주간 팀 회의', estimated_minutes: '30' })
  assert.equal(template.estimated_minutes, 30)
  assert.equal(applyEventTemplate(template).estimated_minutes, 30)
})

test('buildEventTemplate captures priority and checklist like task/todo templates', () => {
  const template = buildEventTemplate({ name: '주간 회의', title: '주간 팀 회의', priority: 'high', checklist: [{ text: '자료 준비' }, { text: '  ' }] })
  assert.equal(template.priority, 'high')
  assert.equal(template.checklist.length, 1)
  assert.equal(template.checklist[0].text, '자료 준비')
  assert.equal(template.checklist[0].done, false)
})

test('applyEventTemplate restores priority and a fresh checklist copy', () => {
  const template = buildEventTemplate({ name: '주간 회의', title: '주간 팀 회의', priority: 'high', checklist: [{ text: '자료 준비' }] })
  const applied = applyEventTemplate(template)
  assert.equal(applied.priority, 'high')
  assert.deepEqual(applied.checklist.map(i => i.text), ['자료 준비'])
  assert.notEqual(applied.checklist[0].id, template.checklist[0].id)
})
