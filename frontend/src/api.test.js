import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiErrorMessage } from './api.js'

test('apiErrorMessage keeps plain backend messages intact', () => {
  assert.equal(apiErrorMessage({ detail: 'Active or completed tasks require an assignee' }, 422), 'Active or completed tasks require an assignee')
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
