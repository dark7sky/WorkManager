import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_TEAM_MEMBER_DAILY_CAPACITY, loadTeamMemberCapacities, normalizeTeamMemberCapacities, saveTeamMemberCapacities, saveTeamMemberCapacity, TEAM_MEMBER_CAPACITY_KEY } from './teamMemberCapacity.js'

const memoryStorage = () => {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('normalizeTeamMemberCapacities trims names and clamps daily limits', () => {
  assert.deepEqual(normalizeTeamMemberCapacities({ ' 김민준 ': 0, 이서연: 12 }), {
    김민준: 1,
    이서연: 9,
  })
})

test('loadTeamMemberCapacities tolerates corrupt storage and save helpers persist normalized limits', () => {
  const storage = memoryStorage()
  storage.setItem(TEAM_MEMBER_CAPACITY_KEY, '{broken')

  assert.deepEqual(loadTeamMemberCapacities(storage), {})
  assert.deepEqual(saveTeamMemberCapacities(storage, { ' 박지훈 ': 2 }), { 박지훈: 2 })
  assert.deepEqual(saveTeamMemberCapacity(storage, { 박지훈: 2 }, '김민준', 'bad'), {
    박지훈: 2,
    김민준: DEFAULT_TEAM_MEMBER_DAILY_CAPACITY,
  })
})
