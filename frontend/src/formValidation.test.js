import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEventForm, validateTaskForm } from './formValidation.js'

test('flags empty title', () => {
  const errors = validateTaskForm({ title: '  ', start_date: '', due_date: '' })
  assert.equal(errors.title, '업무 제목을 입력하세요.')
  assert.equal(errors.due_date, undefined)
})

test('flags due date before start date', () => {
  const errors = validateTaskForm({ title: '업무', start_date: '2026-07-10', due_date: '2026-07-05' })
  assert.equal(errors.due_date, '완료 예정일은 시작일보다 빠를 수 없습니다.')
  assert.equal(errors.title, undefined)
})

test('passes valid input with no errors', () => {
  const errors = validateTaskForm({ title: '업무', start_date: '2026-07-05', due_date: '2026-07-10' })
  assert.deepEqual(errors, {})
})

test('allows equal start and due date', () => {
  const errors = validateTaskForm({ title: '업무', start_date: '2026-07-05', due_date: '2026-07-05' })
  assert.deepEqual(errors, {})
})

test('event form flags empty title', () => {
  const errors = validateEventForm({ title: ' ', start_at: '2026-07-05T09:00', end_at: '2026-07-05T10:00' })
  assert.equal(errors.title, '일정 제목을 입력하세요.')
  assert.equal(errors.end_at, undefined)
})

test('event form flags end time before or equal to start time', () => {
  const errors = validateEventForm({ title: '회의', start_at: '2026-07-05T10:00', end_at: '2026-07-05T09:00' })
  assert.equal(errors.end_at, '종료 시간은 시작 시간보다 늦어야 합니다.')
  const equalErrors = validateEventForm({ title: '회의', start_at: '2026-07-05T10:00', end_at: '2026-07-05T10:00' })
  assert.equal(equalErrors.end_at, '종료 시간은 시작 시간보다 늦어야 합니다.')
})

test('event form passes valid input with no errors', () => {
  const errors = validateEventForm({ title: '회의', start_at: '2026-07-05T09:00', end_at: '2026-07-05T10:00' })
  assert.deepEqual(errors, {})
})
