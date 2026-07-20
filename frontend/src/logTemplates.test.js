import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addLogTemplate,
  applyLogTemplate,
  buildLogTemplate,
  loadLogTemplates,
  removeLogTemplate,
  saveLogTemplates,
} from './logTemplates.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadLogTemplates returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadLogTemplates(new MemoryStorage()), [])
})

test('loadLogTemplates tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-log-templates', '{not json')
  assert.deepEqual(loadLogTemplates(storage), [])
})

test('saveLogTemplates round-trips through loadLogTemplates', () => {
  const storage = new MemoryStorage()
  const template = buildLogTemplate({ name: '스탠드업', content: '데일리 스탠드업 참석', tags: ['미팅'], color: 'blue', duration_minutes: 15 })
  saveLogTemplates([template], storage)
  assert.deepEqual(loadLogTemplates(storage), [template])
})

test('buildLogTemplate trims fields and defaults', () => {
  const template = buildLogTemplate({ name: '  이름  ', content: '  내용  ' })
  assert.equal(template.name, '이름')
  assert.equal(template.content, '내용')
  assert.deepEqual(template.tags, [])
  assert.equal(template.color, '')
  assert.equal(template.duration_minutes, '')
  assert.equal(template.priority, 'normal')
})

test('addLogTemplate rejects templates missing a name or content', () => {
  const templates = []
  assert.equal(addLogTemplate(templates, buildLogTemplate({ name: '', content: '내용' })), templates)
  assert.equal(addLogTemplate(templates, buildLogTemplate({ name: '이름', content: '' })), templates)
})

test('addLogTemplate appends a valid template', () => {
  const template = buildLogTemplate({ name: '이름', content: '내용' })
  assert.deepEqual(addLogTemplate([], template), [template])
})

test('removeLogTemplate filters out the matching id only', () => {
  const a = buildLogTemplate({ name: 'A', content: 'A' })
  const b = buildLogTemplate({ name: 'B', content: 'B' })
  assert.deepEqual(removeLogTemplate([a, b], a.id), [b])
})

test('applyLogTemplate maps template fields onto a draft', () => {
  const template = buildLogTemplate({ name: '스탠드업', content: '데일리 스탠드업 참석', tags: ['미팅'], color: 'blue', duration_minutes: 15 })
  assert.deepEqual(applyLogTemplate(template), { content: '데일리 스탠드업 참석', tags: ['미팅'], color: 'blue', duration_minutes: 15, estimated_minutes: '', priority: 'normal', link_url: '', links: [] })
})

test('buildLogTemplate and applyLogTemplate round-trip link_url and links', () => {
  const links = [{ id: 'x', url: 'https://example.com', label: '참고' }]
  const template = buildLogTemplate({ name: '스탠드업', content: '데일리 스탠드업 참석', link_url: 'https://a.com', links })
  assert.equal(template.link_url, 'https://a.com')
  const applied = applyLogTemplate(template)
  assert.equal(applied.link_url, 'https://a.com')
  assert.equal(applied.links[0].url, 'https://example.com')
  assert.notEqual(applied.links[0].id, links[0].id)
})

test('buildLogTemplate and applyLogTemplate carry the priority', () => {
  const template = buildLogTemplate({ name: '스탠드업', content: '데일리 스탠드업 참석', priority: 'high' })
  assert.equal(template.priority, 'high')
  assert.equal(applyLogTemplate(template).priority, 'high')
})

test('buildLogTemplate and applyLogTemplate carry the estimate', () => {
  const template = buildLogTemplate({ name: '스탠드업', content: '데일리 스탠드업 참석', estimated_minutes: 10 })
  assert.equal(template.estimated_minutes, 10)
  assert.equal(applyLogTemplate(template).estimated_minutes, 10)
})
