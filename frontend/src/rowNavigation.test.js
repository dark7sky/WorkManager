import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextRowIndex } from './rowNavigation.js'

test('ArrowDown moves to next index', () => {
  assert.equal(nextRowIndex(5, 1, 'ArrowDown'), 2)
})

test('ArrowDown clamps at last row', () => {
  assert.equal(nextRowIndex(5, 4, 'ArrowDown'), 4)
})

test('ArrowUp moves to previous index', () => {
  assert.equal(nextRowIndex(5, 2, 'ArrowUp'), 1)
})

test('ArrowUp clamps at first row', () => {
  assert.equal(nextRowIndex(5, 0, 'ArrowUp'), 0)
})

test('other keys return null', () => {
  assert.equal(nextRowIndex(5, 2, 'Enter'), null)
})

test('empty list returns null', () => {
  assert.equal(nextRowIndex(0, -1, 'ArrowDown'), null)
})
