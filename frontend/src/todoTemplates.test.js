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
  assert.deepEqual(applyTodoTemplate(template), { title: '메일 확인', priority: 'high', recurrence_rule: 'daily', tags: ['루틴'] })
})
