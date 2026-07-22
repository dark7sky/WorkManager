import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addTodoTemplate,
  applyTodoTemplate,
  buildTodoTemplate,
  loadTodoTemplates,
  removeTodoTemplate,
  saveTodoTemplates,
} from './todoTemplates.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadTodoTemplates returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadTodoTemplates(new MemoryStorage()), [])
})

test('loadTodoTemplates tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-todo-templates', '{not json')
  assert.deepEqual(loadTodoTemplates(storage), [])
})

test('saveTodoTemplates round-trips through loadTodoTemplates', () => {
  const storage = new MemoryStorage()
  const template = buildTodoTemplate({ name: '아침 루틴', title: '메일 확인', priority: 'high', recurrence_rule: 'daily', tags: ['루틴'] })
  saveTodoTemplates([template], storage)
  assert.deepEqual(loadTodoTemplates(storage), [template])
})

test('buildTodoTemplate trims fields and defaults priority', () => {
  const template = buildTodoTemplate({ name: '  이름  ', title: '  제목  ' })
  assert.equal(template.name, '이름')
  assert.equal(template.title, '제목')
  assert.equal(template.priority, 'normal')
  assert.equal(template.recurrence_rule, '')
  assert.deepEqual(template.tags, [])
})

test('addTodoTemplate rejects templates missing a name or title', () => {
  const templates = []
  assert.equal(addTodoTemplate(templates, buildTodoTemplate({ name: '', title: '제목' })), templates)
  assert.equal(addTodoTemplate(templates, buildTodoTemplate({ name: '이름', title: '' })), templates)
})

test('addTodoTemplate appends a valid template', () => {
  const template = buildTodoTemplate({ name: '이름', title: '제목' })
  assert.deepEqual(addTodoTemplate([], template), [template])
})

test('removeTodoTemplate filters out the matching id only', () => {
  const a = buildTodoTemplate({ name: 'A', title: 'A' })
  const b = buildTodoTemplate({ name: 'B', title: 'B' })
  assert.deepEqual(removeTodoTemplate([a, b], a.id), [b])
})

test('applyTodoTemplate maps template fields onto a draft', () => {
  const template = buildTodoTemplate({ name: '아침 루틴', title: '메일 확인', priority: 'high', recurrence_rule: 'daily', tags: ['루틴'] })
  assert.deepEqual(applyTodoTemplate(template), { title: '메일 확인', priority: 'high', recurrence_rule: 'daily', tags: ['루틴'], estimated_minutes: '', checklist: [], color: '', link_url: '', links: [], custom_fields: [] })
})

test('buildTodoTemplate and applyTodoTemplate round-trip color and link_url', () => {
  const template = buildTodoTemplate({ name: '아침 루틴', title: '메일 확인', color: 'green', link_url: 'https://a.com' })
  assert.equal(template.color, 'green')
  assert.equal(template.link_url, 'https://a.com')
  const applied = applyTodoTemplate(template)
  assert.equal(applied.color, 'green')
  assert.equal(applied.link_url, 'https://a.com')
})

test('buildTodoTemplate and applyTodoTemplate round-trip links and custom_fields', () => {
  const links = [{ id: 'x', url: 'https://example.com', label: '참고' }]
  const custom_fields = [{ id: 'y', label: '고객사', value: '삼성' }]
  const template = buildTodoTemplate({ name: '아침 루틴', title: '메일 확인', links, custom_fields })
  assert.equal(template.links[0].url, 'https://example.com')
  assert.equal(template.custom_fields[0].label, '고객사')
  assert.notEqual(template.custom_fields[0].id, custom_fields[0].id)
  const applied = applyTodoTemplate(template)
  assert.equal(applied.links[0].url, 'https://example.com')
  assert.notEqual(applied.links[0].id, links[0].id)
  assert.equal(applied.custom_fields[0].value, '삼성')
  assert.notEqual(applied.custom_fields[0].id, template.custom_fields[0].id)
})

test('buildTodoTemplate and applyTodoTemplate carry the estimate', () => {
  const template = buildTodoTemplate({ name: '아침 루틴', title: '메일 확인', estimated_minutes: '20' })
  assert.equal(template.estimated_minutes, 20)
  assert.equal(applyTodoTemplate(template).estimated_minutes, 20)
})

test('buildTodoTemplate normalizes checklist items, dropping blanks and forcing done:false', () => {
  const template = buildTodoTemplate({ name: '출장', title: '출장 준비', checklist: [{ text: '항공권 확인', done: true }, { text: '  ' }, { text: '숙소 확인' }] })
  assert.deepEqual(template.checklist.map(i => ({ text: i.text, done: i.done })), [{ text: '항공권 확인', done: false }, { text: '숙소 확인', done: false }])
})

test('applyTodoTemplate carries the checklist onto the draft with fresh ids', () => {
  const template = buildTodoTemplate({ name: '출장', title: '출장 준비', checklist: [{ text: '항공권 확인' }] })
  const filled = applyTodoTemplate(template)
  assert.equal(filled.checklist.length, 1)
  assert.equal(filled.checklist[0].text, '항공권 확인')
  assert.equal(filled.checklist[0].done, false)
})
