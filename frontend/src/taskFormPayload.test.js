import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTaskPayload } from './taskFormPayload.js'

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
