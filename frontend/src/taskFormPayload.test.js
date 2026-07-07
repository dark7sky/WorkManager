import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTaskPayload, validateTaskOwnership } from './taskFormPayload.js'

const baseData = {
  title: ' 업무 수정 ',
  description: ' 메모 ',
  assignee_name: ' 담당자 ',
  start_date: '2026-07-07',
  due_date: '2026-07-09',
  status: 'in_progress',
  priority: 'normal',
  progress: '40',
  recurrence_rule: '',
  parent_id: '',
}

test('buildTaskPayload omits unchanged parent_id when editing an existing task', () => {
  const payload = buildTaskPayload(baseData, { tags: ['운영'], task: { id: 1, parent_id: null } })

  assert.equal(Object.hasOwn(payload, 'parent_id'), false)
  assert.equal(payload.status, 'doing')
  assert.equal(payload.progress, 40)
  assert.deepEqual(payload.tags, ['운영'])
})

test('buildTaskPayload sends parent_id when hierarchy changes', () => {
  assert.equal(buildTaskPayload({ ...baseData, parent_id: '7' }, { task: { id: 1, parent_id: null } }).parent_id, 7)
  assert.equal(buildTaskPayload(baseData, { task: { id: 1, parent_id: 7 } }).parent_id, null)
})

test('buildTaskPayload treats numeric and string parent IDs as unchanged on edit', () => {
  const payload = buildTaskPayload({ ...baseData, parent_id: '7' }, { task: { id: 1, parent_id: '7' } })

  assert.equal(Object.hasOwn(payload, 'parent_id'), false)
})

test('buildTaskPayload never sends the edited task as its own parent', () => {
  const payload = buildTaskPayload({ ...baseData, parent_id: '1' }, { task: { id: 1, parent_id: null } })

  assert.equal(Object.hasOwn(payload, 'parent_id'), false)
})

test('buildTaskPayload tolerates missing optional text fields during edit save', () => {
  const payload = buildTaskPayload({ ...baseData, description: undefined, assignee_name: null }, { task: { id: 1 } })

  assert.equal(payload.description, '')
  assert.equal(payload.assignee_name, '')
})

test('buildTaskPayload defaults missing select and invalid progress values during edit save', () => {
  const payload = buildTaskPayload({ ...baseData, status: '', priority: '', progress: 'not-a-number' }, { task: { id: 1 } })

  assert.equal(payload.status, 'todo')
  assert.equal(payload.priority, 'normal')
  assert.equal(payload.progress, 0)
})

test('validateTaskOwnership requires an assignee for active owned work', () => {
  assert.equal(validateTaskOwnership({ ...baseData, status: 'in_progress', assignee_name: '   ' }), '진행 중이거나 완료된 업무에는 담당자를 지정해 주세요.')
  assert.equal(validateTaskOwnership({ ...baseData, status: 'done', assignee_name: '' }), '진행 중이거나 완료된 업무에는 담당자를 지정해 주세요.')
  assert.equal(validateTaskOwnership({ ...baseData, status: 'todo', progress: '25', assignee_name: '' }), '진행 중이거나 완료된 업무에는 담당자를 지정해 주세요.')
})

test('validateTaskOwnership allows unassigned backlog work', () => {
  assert.equal(validateTaskOwnership({ ...baseData, status: 'todo', progress: '0', assignee_name: ' ' }), '')
  assert.equal(validateTaskOwnership({ ...baseData, status: 'in_progress', progress: '40', assignee_name: '담당자' }), '')
})
