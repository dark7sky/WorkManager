import test from 'node:test'
import assert from 'node:assert/strict'
import { lastClientRate } from './logClientRate.js'

const logs = [
  { id: 1, client_name: 'Acme', hourly_rate_override: 50000, log_date: '2026-07-01' },
  { id: 2, client_name: 'Acme', hourly_rate_override: 60000, log_date: '2026-07-15' },
  { id: 3, client_name: 'Other', hourly_rate_override: 30000, log_date: '2026-07-20' },
  { id: 4, client_name: 'Acme', hourly_rate_override: 70000, log_date: '2026-06-01', deleted_at: '2026-06-02' },
]

test('returns most recent rate for matching client, case-insensitive', () => {
  assert.equal(lastClientRate('acme', logs), 60000)
})

test('ignores deleted logs', () => {
  assert.equal(lastClientRate('Acme', logs.filter(l => l.id === 4)), null)
})

test('returns null when no match', () => {
  assert.equal(lastClientRate('Unknown', logs), null)
})

test('returns null for empty client name', () => {
  assert.equal(lastClientRate('', logs), null)
})
