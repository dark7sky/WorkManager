import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addTeamMember, loadTeamMembers, normalizeTeamMembers, removeTeamMember, saveTeamMembers, TEAM_MEMBERS_KEY } from './teamMembers.js'

const memoryStorage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('normalizeTeamMembers trims, deduplicates, and sorts member names', () => {
  assert.deepEqual(normalizeTeamMembers([' 이서연 ', '', '김민준', '이서연', null]), ['김민준', '이서연'])
})

test('addTeamMember and removeTeamMember keep roster normalized', () => {
  const added = addTeamMember(['김민준'], ' 이서연 ')

  assert.deepEqual(added, ['김민준', '이서연'])
  assert.deepEqual(removeTeamMember(added, '김민준'), ['이서연'])
})

test('loadTeamMembers tolerates corrupt storage and saveTeamMembers persists normalized roster', () => {
  const storage = memoryStorage()
  storage.setItem(TEAM_MEMBERS_KEY, '{broken')

  assert.deepEqual(loadTeamMembers(storage), [])
  assert.deepEqual(saveTeamMembers(storage, [' 박지훈 ', '박지훈']), ['박지훈'])
  assert.deepEqual(JSON.parse(storage.getItem(TEAM_MEMBERS_KEY)), ['박지훈'])
})
