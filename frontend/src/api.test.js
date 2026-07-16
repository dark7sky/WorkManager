import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiErrorMessage, ApiError, request } from './api.js'

test('apiErrorMessage keeps plain backend messages intact', () => {
  assert.equal(apiErrorMessage({ detail: 'due_date must not be before start_date' }, 422), 'due_date must not be before start_date')
})

test('apiErrorMessage flattens FastAPI validation arrays into readable field messages', () => {
  assert.equal(
    apiErrorMessage({
      detail: [
        { loc: ['body', 'title'], msg: 'String should have at least 1 character' },
        { loc: ['body', 'due_date'], msg: 'Value error, due_date must not be before start_date' },
      ],
    }, 422),
    'title: String should have at least 1 character / due_date: Value error, due_date must not be before start_date',
  )
})

test('apiErrorMessage falls back to generic status text when the backend body is empty', () => {
  assert.equal(apiErrorMessage({}, 500), '요청을 처리하지 못했습니다 (500)')
})

test('request() surfaces a timeout-specific message when the internal timeout aborts the fetch', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { const err = new Error('aborted'); err.name = 'AbortError'; throw err }
  try {
    await assert.rejects(
      request('/tasks'),
      err => err instanceof ApiError && err.message === '요청 시간이 초과되었습니다. 다시 시도해 주세요.' && err.status === 0,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('request() rethrows the original AbortError when the caller cancelled the request itself', async () => {
  const originalFetch = globalThis.fetch
  const controller = new AbortController()
  controller.abort()
  globalThis.fetch = async () => { const err = new Error('aborted'); err.name = 'AbortError'; throw err }
  try {
    await assert.rejects(
      request('/tasks', { signal: controller.signal }),
      err => err.name === 'AbortError',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
