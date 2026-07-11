import test from 'node:test'
import assert from 'node:assert/strict'
import { searchItems, searchScreens } from './commandPalette.js'

test('searchScreens matches korean labels and english keywords', () => {
  assert.equal(searchScreens('일정')[0].id, 'calendar')
  assert.equal(searchScreens('cal')[0].id, 'calendar')
  assert.equal(searchScreens('설')[0].id, 'settings')
  assert.deepEqual(searchScreens(''), [])
})

const data = {
  tasks: [
    { id: 1, title: '분기 보고서 작성', status: 'doing', due_date: '2026-07-20', tags: ['보고'] },
    { id: 2, title: '서버 점검', status: 'todo', tags: [] },
  ],
  events: [{ id: 3, title: '보고서 리뷰 미팅', start_at: '2026-07-12T10:00:00', tags: [] }],
  todos: [{ id: 4, title: '보고서 초안 넘기기', todo_date: '2026-07-11', tags: [] }],
  work_logs: [{ id: 5, content: 'GND 노이즈 회의', log_date: '2026-07-10', tags: ['BLSHF'] }],
}

test('searchItems finds matches across all four tables', () => {
  const results = searchItems('보고서', data)
  assert.deepEqual(results.map(r => r.type).sort(), ['event', 'task', 'todo'])
  const task = results.find(r => r.type === 'task')
  assert.equal(task.page, 'tasks')
  assert.equal(task.detail, '마감 2026-07-20')
})

test('searchItems matches tags case-insensitively', () => {
  const results = searchItems('blshf', data)
  assert.equal(results.length, 1)
  assert.equal(results[0].type, 'log')
  assert.equal(results[0].page, 'today')
})

test('searchItems ranks title-prefix matches first and respects limit', () => {
  const many = { tasks: Array.from({ length: 20 }, (_, i) => ({ id: i, title: i === 7 ? '점검 서버' : `서버 점검 ${i}`, tags: [] })) }
  const results = searchItems('점검', many, 5)
  assert.equal(results.length, 5)
  assert.equal(results[0].title, '점검 서버')
})

test('searchItems handles empty query and missing tables', () => {
  assert.deepEqual(searchItems('', data), [])
  assert.deepEqual(searchItems('보고서', {}), [])
})
