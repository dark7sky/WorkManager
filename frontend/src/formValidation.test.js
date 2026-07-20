import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateEventForm, validateLogForm, validateTaskForm, validateTodoForm } from './formValidation.js'

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

test('flags recurrence end date before due date', () => {
  const errors = validateTaskForm({ title: '업무', due_date: '2026-07-10', recurrence_rule: 'daily', recurrence_end_date: '2026-07-05' })
  assert.equal(errors.recurrence_end_date, '반복 종료일은 시작일/완료 예정일보다 빠를 수 없습니다.')
})

test('allows recurrence end date on or after due date', () => {
  const errors = validateTaskForm({ title: '업무', due_date: '2026-07-10', recurrence_rule: 'daily', recurrence_end_date: '2026-07-10' })
  assert.deepEqual(errors, {})
})

test('ignores recurrence end date when no recurrence rule set', () => {
  const errors = validateTaskForm({ title: '업무', due_date: '2026-07-10', recurrence_end_date: '2026-07-05' })
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

test('todo form flags empty title', () => {
  const errors = validateTodoForm({ title: '   ' })
  assert.equal(errors.title, 'Todo 내용을 입력하세요.')
})

test('todo form passes valid input with no errors', () => {
  const errors = validateTodoForm({ title: '보고서 작성' })
  assert.deepEqual(errors, {})
})

test('todo form flags recurrence end date before todo date', () => {
  const errors = validateTodoForm({ title: '보고서 작성', todo_date: '2026-07-10', recurrence_rule: 'weekly', recurrence_end_date: '2026-07-05' })
  assert.equal(errors.recurrence_end_date, '반복 종료일은 날짜보다 빠를 수 없습니다.')
})

test('todo form allows recurrence end date on or after todo date', () => {
  const errors = validateTodoForm({ title: '보고서 작성', todo_date: '2026-07-10', recurrence_rule: 'weekly', recurrence_end_date: '2026-07-10' })
  assert.deepEqual(errors, {})
})

test('log form flags empty content', () => {
  const errors = validateLogForm({ content: '' })
  assert.equal(errors.content, '업무 기록 내용을 입력하세요.')
})

test('log form passes valid input with no errors', () => {
  const errors = validateLogForm({ content: '회의 진행' })
  assert.deepEqual(errors, {})
})
