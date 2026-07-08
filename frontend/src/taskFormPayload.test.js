import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTaskPayload, initialTaskDateValue, validateTaskOwnership } from './taskFormPayload.js'

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

test('buildTaskPayload caps legacy task text fields to backend limits during edit save', () => {
  const payload = buildTaskPayload({
    ...baseData,
    title: `  ${'제'.repeat(305)}  `,
    description: ` ${'메'.repeat(20005)} `,
    assignee_name: ` ${'김'.repeat(125)} `,
  }, { task: { id: 1 } })

  assert.equal(payload.title.length, 300)
  assert.equal(payload.description.length, 20000)
  assert.equal(payload.assignee_name.length, 120)
})

test('buildTaskPayload normalizes legacy task tags during edit save', () => {
  const payload = buildTaskPayload(baseData, {
    tags: ['  운영  ', '#운영', ` ${'태'.repeat(60)} `, '', '  '],
    task: { id: 1 },
  })

  assert.deepEqual(payload.tags, ['운영', '태'.repeat(50)])
})

test('buildTaskPayload caps legacy tag count during edit save', () => {
  const payload = buildTaskPayload(baseData, {
    tags: Array.from({ length: 60 }, (_, index) => `태그-${index + 1}`),
    task: { id: 1 },
  })

  assert.equal(payload.tags.length, 50)
  assert.deepEqual(payload.tags.slice(0, 3), ['태그-1', '태그-2', '태그-3'])
  assert.equal(payload.tags.at(-1), '태그-50')
})

test('buildTaskPayload defaults missing select and invalid progress values during edit save', () => {
  const payload = buildTaskPayload({ ...baseData, status: '', priority: '', progress: 'not-a-number' }, { task: { id: 1 } })

  assert.equal(payload.status, 'todo')
  assert.equal(payload.priority, 'normal')
  assert.equal(payload.progress, 0)
})

test('initialTaskDateValue keeps blank dates blank when editing an existing task', () => {
  assert.equal(initialTaskDateValue({ id: 1, start_date: '', due_date: null }, 'start_date', '2026-07-08'), '')
  assert.equal(initialTaskDateValue({ id: 1, start_date: '', due_date: null }, 'due_date', '2026-07-08'), '')
})

test('initialTaskDateValue still defaults new task dates to today', () => {
  assert.equal(initialTaskDateValue(null, 'start_date', '2026-07-08'), '2026-07-08')
  assert.equal(initialTaskDateValue(undefined, 'due_date', '2026-07-08'), '2026-07-08')
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

test('validateTaskOwnership allows editing a legacy active task that is already unassigned', () => {
  assert.equal(
    validateTaskOwnership(
      { ...baseData, title: '제목만 수정', status: 'in_progress', progress: '40', assignee_name: '' },
      { id: 1, status: 'in_progress', progress: 40, assignee_name: '' },
    ),
    '',
  )
})

test('validateTaskOwnership still blocks creating a new active unassigned state during edit', () => {
  assert.equal(
    validateTaskOwnership(
      { ...baseData, status: 'in_progress', progress: '40', assignee_name: '' },
      { id: 1, status: 'todo', progress: 0, assignee_name: '' },
    ),
    '진행 중이거나 완료된 업무에는 담당자를 지정해 주세요.',
  )
})
