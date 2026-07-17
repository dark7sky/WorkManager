import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addTaskTemplate,
  applyTaskTemplate,
  buildTaskTemplate,
  durationDaysBetween,
  loadTaskTemplates,
  removeTaskTemplate,
  saveTaskTemplates,
} from './taskTemplates.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
}

test('loadTaskTemplates returns an empty array when nothing is stored', () => {
  assert.deepEqual(loadTaskTemplates(new MemoryStorage()), [])
})

test('loadTaskTemplates tolerates corrupted storage content', () => {
  const storage = new MemoryStorage()
  storage.setItem('wm-task-templates', '{not json')
  assert.deepEqual(loadTaskTemplates(storage), [])
})

test('saveTaskTemplates round-trips through loadTaskTemplates', () => {
  const storage = new MemoryStorage()
  const template = buildTaskTemplate({ name: '주간 보고', title: '주간 보고서 작성', priority: 'high', tags: ['보고'], durationDays: 2 })
  saveTaskTemplates([template], storage)
  assert.deepEqual(loadTaskTemplates(storage), [template])
})

test('buildTaskTemplate trims fields and defaults invalid duration to zero', () => {
  const template = buildTaskTemplate({ name: '  이름  ', title: '  제목  ', durationDays: '-3' })
  assert.equal(template.name, '이름')
  assert.equal(template.title, '제목')
  assert.equal(template.priority, 'normal')
  assert.equal(template.durationDays, 0)
  assert.deepEqual(template.tags, [])
})

test('addTaskTemplate rejects templates missing a name or title', () => {
  const templates = []
  assert.equal(addTaskTemplate(templates, buildTaskTemplate({ name: '', title: '제목' })), templates)
  assert.equal(addTaskTemplate(templates, buildTaskTemplate({ name: '이름', title: '' })), templates)
})

test('addTaskTemplate appends a valid template', () => {
  const template = buildTaskTemplate({ name: '이름', title: '제목' })
  assert.deepEqual(addTaskTemplate([], template), [template])
})

test('removeTaskTemplate filters out the matching id only', () => {
  const a = buildTaskTemplate({ name: 'A', title: 'A' })
  const b = buildTaskTemplate({ name: 'B', title: 'B' })
  assert.deepEqual(removeTaskTemplate([a, b], a.id), [b])
})

test('applyTaskTemplate prefills start/due dates from today using the saved duration', () => {
  const template = buildTaskTemplate({ name: '이름', title: '분기 보고서', priority: 'high', recurrence_rule: 'monthly', tags: ['보고'], durationDays: 3 })
  const result = applyTaskTemplate(template, '2026-07-10')
  assert.equal(result.title, '분기 보고서')
  assert.equal(result.priority, 'high')
  assert.equal(result.recurrence_rule, 'monthly')
  assert.deepEqual(result.tags, ['보고'])
  assert.equal(result.start_date, '2026-07-10')
  assert.equal(result.due_date, '2026-07-13')
})

test('applyTaskTemplate uses today for both dates when the template has no duration', () => {
  const template = buildTaskTemplate({ name: '이름', title: '제목' })
  const result = applyTaskTemplate(template, '2026-07-10')
  assert.equal(result.start_date, '2026-07-10')
  assert.equal(result.due_date, '2026-07-10')
})

test('buildTaskTemplate carries checklist text, resets done to false, drops blanks, and caps length', () => {
  const checklist = [
    { id: 'a', text: '설계 검토', done: true },
    { id: 'b', text: '  ', done: false },
    { id: 'c', text: 'QA', done: false },
  ]
  const template = buildTaskTemplate({ name: '이름', title: '제목', checklist })
  assert.deepEqual(template.checklist.map(i => ({ text: i.text, done: i.done })), [
    { text: '설계 검토', done: false },
    { text: 'QA', done: false },
  ])
  assert.equal(new Set(template.checklist.map(i => i.id)).size, 2)
})

test('applyTaskTemplate carries the template checklist with reset done state and fresh ids', () => {
  const template = buildTaskTemplate({ name: '이름', title: '제목', checklist: [{ text: '단계 1', done: true }] })
  const result = applyTaskTemplate(template, '2026-07-10')
  assert.equal(result.checklist.length, 1)
  assert.equal(result.checklist[0].text, '단계 1')
  assert.equal(result.checklist[0].done, false)
  assert.notEqual(result.checklist[0].id, template.checklist[0].id)
})

test('durationDaysBetween computes whole days and floors negative spans to zero', () => {
  assert.equal(durationDaysBetween('2026-07-10', '2026-07-13'), 3)
  assert.equal(durationDaysBetween('2026-07-10', '2026-07-10'), 0)
  assert.equal(durationDaysBetween('2026-07-13', '2026-07-10'), 0)
  assert.equal(durationDaysBetween('', '2026-07-10'), 0)
})
