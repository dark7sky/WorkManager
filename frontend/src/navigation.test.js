import assert from 'node:assert/strict'
import { test } from 'node:test'

import { navItems } from './navigation.js'

test('mobile navigation includes the audit tab as an eighth item', () => {
  const labels = navItems.map(([, , label]) => label)

  assert.equal(navItems.length, 8)
  assert.deepEqual(labels, ['오늘', '업무', '일정', '성과', 'AI', '감사', '변경', '설정'])
})
