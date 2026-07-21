import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deriveTagColorMap } from './tagColors.js'

test('deriveTagColorMap keeps only tags with a color set', () => {
  const items = [{ tag: 'urgent', color: '#ff0000' }, { tag: 'later', color: null }, { tag: 'client-a', color: '#00ff00' }]
  assert.deepEqual(deriveTagColorMap(items), { urgent: '#ff0000', 'client-a': '#00ff00' })
})

test('deriveTagColorMap returns an empty object for no items', () => {
  assert.deepEqual(deriveTagColorMap(), {})
})
