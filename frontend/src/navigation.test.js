import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mobileNavColumns, mobileNavItems, navItems } from './navigation.js'

test('desktop navigation still includes audit, but mobile navigation does not', () => {
  const labels = navItems.map(([, , label]) => label)
  const mobileLabels = mobileNavItems.map(([, , label]) => label)

  assert.equal(navItems.length, 8)
  assert.equal(mobileNavItems.length, 7)
  assert.equal(mobileNavColumns, mobileNavItems.length)
  assert.deepEqual(labels, ['오늘', '업무', '일정', '성과', 'AI', '감사', '변경', '설정'])
  assert.deepEqual(mobileLabels, ['오늘', '업무', '일정', '성과', 'AI', '변경', '설정'])
})
