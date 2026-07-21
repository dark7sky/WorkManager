import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchAll, globalSearchResultCount } from './globalSearch.js'

const data = {
  tasks: [{ id: 1, title: '분기 보고서 작성', description: '' }, { id: 2, title: '회의 준비', description: '분기 자료 정리' }],
  events: [{ id: 1, title: '팀 회의', location: '' }],
  todos: [{ id: 1, title: '이메일 답장', memo: '' }],
  logs: [{ id: 1, content: '분기 보고서 초안 완료' }],
}

test('searchAll matches title and secondary fields case-insensitively across entities', () => {
  const result = searchAll(data, '분기')
  assert.deepEqual(result.tasks.map(t => t.id), [1, 2])
  assert.deepEqual(result.events.map(e => e.id), [])
  assert.deepEqual(result.logs.map(l => l.id), [1])
})

test('searchAll returns empty groups for blank query', () => {
  const result = searchAll(data, '  ')
  assert.equal(globalSearchResultCount(result), 0)
})

test('searchAll returns empty groups when nothing matches', () => {
  const result = searchAll(data, '없는단어')
  assert.equal(globalSearchResultCount(result), 0)
})

test('globalSearchResultCount sums all groups', () => {
  assert.equal(globalSearchResultCount(searchAll(data, '회의')), 2)
})

test('searchAll matches tags across entities', () => {
  const tagged = {
    tasks: [{ id: 1, title: '작업', tags: ['긴급'] }],
    events: [{ id: 1, title: '일정', tags: ['긴급'] }],
    todos: [{ id: 1, title: '할일', tags: ['긴급'] }],
    logs: [{ id: 1, content: '기록', tags: ['긴급'] }],
  }
  const result = searchAll(tagged, '긴급')
  assert.equal(globalSearchResultCount(result), 4)
})
