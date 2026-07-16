import assert from 'node:assert/strict'
import test from 'node:test'
import { CHANGELOG_SUMMARY_AGE_DAYS, changelogSummaryCacheKey, groupChangelogByMonth, splitChangelogByAge } from './changelogSummary.js'

const now = new Date('2026-07-16T12:00:00+09:00')

test('splitChangelogByAge keeps recent items and buckets older ones', () => {
  const updates = [
    { id: 'a', timestamp: '2026-07-16T09:00:00+09:00' },
    { id: 'b', timestamp: '2026-07-08T09:00:00+09:00' },
    { id: 'c', timestamp: '2026-06-01T09:00:00+09:00' },
  ]
  const { recent, older } = splitChangelogByAge(updates, now)
  assert.deepEqual(recent.map(x => x.id), ['a'])
  assert.deepEqual(older.map(x => x.id), ['b', 'c'])
})

test('splitChangelogByAge respects a custom age threshold', () => {
  const updates = [{ id: 'a', timestamp: '2026-07-08T09:00:00+09:00' }]
  assert.equal(splitChangelogByAge(updates, now, 30).older.length, 0)
  assert.equal(CHANGELOG_SUMMARY_AGE_DAYS, 7)
})

test('groupChangelogByMonth groups by year-month, newest first', () => {
  const older = [
    { id: 'b', timestamp: '2026-06-01T09:00:00+09:00' },
    { id: 'c', timestamp: '2026-05-15T09:00:00+09:00' },
    { id: 'd', timestamp: '2026-06-20T09:00:00+09:00' },
  ]
  const groups = groupChangelogByMonth(older)
  assert.deepEqual(groups.map(g => g.period), ['2026-06', '2026-05'])
  assert.equal(groups[0].entries.length, 2)
})

test('groupChangelogByMonth skips entries with invalid timestamps', () => {
  const groups = groupChangelogByMonth([{ id: 'x', timestamp: 'not-a-date' }])
  assert.deepEqual(groups, [])
})

test('changelogSummaryCacheKey is stable for the same groups and changes when content changes', () => {
  const groups = groupChangelogByMonth([
    { id: 'b', timestamp: '2026-06-01T09:00:00+09:00' },
  ])
  const key1 = changelogSummaryCacheKey(groups)
  const key2 = changelogSummaryCacheKey(groupChangelogByMonth([
    { id: 'b', timestamp: '2026-06-01T09:00:00+09:00' },
  ]))
  assert.equal(key1, key2)
  const key3 = changelogSummaryCacheKey(groupChangelogByMonth([
    { id: 'b', timestamp: '2026-06-01T09:00:00+09:00' },
    { id: 'e', timestamp: '2026-06-05T09:00:00+09:00' },
  ]))
  assert.notEqual(key1, key3)
})
