import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTaskDuplicatePayload, buildTaskPayload, checklistProgress, clampedTaskProgress, initialTaskDateValue, moveChecklistItem, normalizedEstimatedMinutes } from './taskFormPayload.js'

const baseData = {
  title: ' 업무 수정 ',
  description: ' 메모 ',
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

test('clampedTaskProgress keeps out-of-range legacy values inside the 0-100 input bounds', () => {
  assert.equal(clampedTaskProgress(150), 100)
  assert.equal(clampedTaskProgress(-10), 0)
  assert.equal(clampedTaskProgress(40), 40)
  assert.equal(clampedTaskProgress(null), 0)
})

test('normalizedEstimatedMinutes accepts values not divisible by 5, matching the backend integer field (no step constraint)', () => {
  assert.equal(normalizedEstimatedMinutes(37), 37)
  assert.equal(normalizedEstimatedMinutes('123'), 123)
  assert.equal(normalizedEstimatedMinutes(''), null)
})

test('buildTaskPayload never sends the edited task as its own parent', () => {
  const payload = buildTaskPayload({ ...baseData, parent_id: '1' }, { task: { id: 1, parent_id: null } })

  assert.equal(Object.hasOwn(payload, 'parent_id'), false)
})

test('buildTaskPayload tolerates missing optional text fields during edit save', () => {
  const payload = buildTaskPayload({ ...baseData, description: undefined }, { task: { id: 1 } })

  assert.equal(payload.description, '')
})

test('buildTaskPayload caps legacy task text fields to backend limits during edit save', () => {
  const payload = buildTaskPayload({
    ...baseData,
    title: `  ${'제'.repeat(305)}  `,
    description: ` ${'메'.repeat(20005)} `,
  }, { task: { id: 1 } })

  assert.equal(payload.title.length, 300)
  assert.equal(payload.description.length, 20000)
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

test('buildTaskPayload normalizes selected dependency IDs and excludes self/duplicates', () => {
  const payload = buildTaskPayload({ ...baseData, dependency_ids: ['3', '1', '3', 'x', '0'] }, { task: { id: 1, dependency_ids: [] } })

  assert.deepEqual(payload.dependency_ids, [3])
})

test('buildTaskPayload sends no dependencies for a new task when none are selected', () => {
  const payload = buildTaskPayload(baseData, {})

  assert.deepEqual(payload.dependency_ids, [])
})

test('buildTaskPayload omits unchanged dependency_ids when editing an existing task', () => {
  const payload = buildTaskPayload({ ...baseData, dependency_ids: ['2'] }, { task: { id: 1, dependency_ids: [2] } })

  assert.equal(Object.hasOwn(payload, 'dependency_ids'), false)
})

test('buildTaskPayload omits unchanged dependency_ids regardless of stored order', () => {
  const payload = buildTaskPayload({ ...baseData, dependency_ids: ['2', '4'] }, { task: { id: 1, dependency_ids: [4, 2] } })

  assert.equal(Object.hasOwn(payload, 'dependency_ids'), false)
})

test('buildTaskPayload does not re-trigger cycle validation for an unrelated edit on a task with pre-existing cyclic dependencies', () => {
  const payload = buildTaskPayload({ ...baseData, title: '제목만 변경', dependency_ids: ['2'] }, { task: { id: 1, dependency_ids: [2] } })

  assert.equal(Object.hasOwn(payload, 'dependency_ids'), false)
  assert.equal(payload.title, '제목만 변경')
})

test('buildTaskPayload sends dependency_ids when the selection actually changes', () => {
  const payload = buildTaskPayload({ ...baseData, dependency_ids: ['2', '3'] }, { task: { id: 1, dependency_ids: [2] } })

  assert.deepEqual(payload.dependency_ids, [2, 3])
})

test('buildTaskPayload only keeps recurrence_end_date when a recurrence rule is set', () => {
  const withoutRule = buildTaskPayload({ ...baseData, recurrence_rule: '', recurrence_end_date: '2026-08-01' }, { task: { id: 1 } })
  assert.equal(withoutRule.recurrence_end_date, null)

  const withRule = buildTaskPayload({ ...baseData, recurrence_rule: 'weekly', recurrence_end_date: '2026-08-01' }, { task: { id: 1 } })
  assert.equal(withRule.recurrence_end_date, '2026-08-01')
})

test('buildTaskPayload passes through start_time/due_time or nulls them when blank', () => {
  const withTimes = buildTaskPayload({ ...baseData, start_time: '09:00', due_time: '18:00' }, { task: { id: 1 } })
  assert.equal(withTimes.start_time, '09:00')
  assert.equal(withTimes.due_time, '18:00')

  const withoutTimes = buildTaskPayload(baseData, { task: { id: 1 } })
  assert.equal(withoutTimes.start_time, null)
  assert.equal(withoutTimes.due_time, null)
})

test('buildTaskDuplicatePayload copies start_time/due_time', () => {
  const payload = buildTaskDuplicatePayload({ id: 1, title: '업무', start_time: '09:00', due_time: '18:00' })
  assert.equal(payload.start_time, '09:00')
  assert.equal(payload.due_time, '18:00')
})

test('initialTaskDateValue keeps blank dates blank when editing an existing task', () => {
  assert.equal(initialTaskDateValue({ id: 1, start_date: '', due_date: null }, 'start_date', '2026-07-08'), '')
  assert.equal(initialTaskDateValue({ id: 1, start_date: '', due_date: null }, 'due_date', '2026-07-08'), '')
})

test('initialTaskDateValue still defaults new task dates to today', () => {
  assert.equal(initialTaskDateValue(null, 'start_date', '2026-07-08'), '2026-07-08')
  assert.equal(initialTaskDateValue(undefined, 'due_date', '2026-07-08'), '2026-07-08')
})

test('buildTaskDuplicatePayload copies schedule/priority/tags and resets progress to a fresh todo', () => {
  const payload = buildTaskDuplicatePayload({
    id: 5, title: '분기 보고서', description: '메모', start_date: '2026-07-10', due_date: '2026-07-12',
    status: 'done', priority: 'high', progress: 100, recurrence_rule: 'monthly', tags: ['보고', '#보고'],
    parent_id: 2, dependency_ids: [3, 5, 5],
  })

  assert.equal(payload.title, '분기 보고서 (복사본)')
  assert.equal(payload.status, 'todo')
  assert.equal(payload.progress, 0)
  assert.equal(payload.priority, 'high')
  assert.deepEqual(payload.tags, ['보고'])
  assert.equal(payload.parent_id, 2)
  assert.deepEqual(payload.dependency_ids, [3])
})

test('buildTaskDuplicatePayload caps a duplicated title to the backend text limit', () => {
  const payload = buildTaskDuplicatePayload({ id: 1, title: '제'.repeat(300) })

  assert.equal(payload.title.length, 300)
})

test('buildTaskPayload normalizes estimated_minutes to a non-negative integer or null', () => {
  assert.equal(buildTaskPayload({ ...baseData, estimated_minutes: '90' }, { task: { id: 1 } }).estimated_minutes, 90)
  assert.equal(buildTaskPayload({ ...baseData, estimated_minutes: '' }, { task: { id: 1 } }).estimated_minutes, null)
  assert.equal(buildTaskPayload({ ...baseData, estimated_minutes: '-5' }, { task: { id: 1 } }).estimated_minutes, null)
})

test('buildTaskPayload clamps estimated_minutes to the backend max so save does not 422', () => {
  assert.equal(buildTaskPayload({ ...baseData, estimated_minutes: '200000' }, { task: { id: 1 } }).estimated_minutes, 100000)
  assert.equal(buildTaskPayload({ ...baseData, estimated_minutes: '100000' }, { task: { id: 1 } }).estimated_minutes, 100000)
})

test('buildTaskPayload keeps non-multiple-of-5 estimated_minutes so editing a task saved via AI/CSV does not get rejected', () => {
  assert.equal(buildTaskPayload({ ...baseData, estimated_minutes: '47' }, { task: { id: 1 } }).estimated_minutes, 47)
})

test('buildTaskDuplicatePayload copies estimated_minutes', () => {
  const payload = buildTaskDuplicatePayload({ id: 1, title: '업무', estimated_minutes: 60 })

  assert.equal(payload.estimated_minutes, 60)
})

test('buildTaskPayload normalizes link_url, rejecting blank or non-http values', () => {
  assert.equal(buildTaskPayload({ ...baseData, link_url: 'https://example.com/doc' }, { task: { id: 1 } }).link_url, 'https://example.com/doc')
  assert.equal(buildTaskPayload({ ...baseData, link_url: '' }, { task: { id: 1 } }).link_url, null)
  assert.equal(buildTaskPayload({ ...baseData, link_url: 'javascript:alert(1)' }, { task: { id: 1 } }).link_url, null)
})

test('buildTaskDuplicatePayload copies link_url', () => {
  const payload = buildTaskDuplicatePayload({ id: 1, title: '업무', link_url: 'https://example.com/doc' })

  assert.equal(payload.link_url, 'https://example.com/doc')
})

test('buildTaskPayload normalizes checklist items, dropping blanks and capping text length', () => {
  const payload = buildTaskPayload({
    ...baseData,
    checklist: [{ id: '1', text: '  초안 작성  ', done: true }, { id: '2', text: '   ', done: false }, { id: '3', text: '가'.repeat(310), done: false }],
  }, { task: { id: 1 } })

  assert.deepEqual(payload.checklist.map(i => i.text), ['초안 작성', '가'.repeat(300)])
  assert.equal(payload.checklist[0].done, true)
})

test('buildTaskDuplicatePayload copies checklist items but resets done state', () => {
  const payload = buildTaskDuplicatePayload({
    id: 1, title: '업무', checklist: [{ id: '1', text: '초안 작성', done: true }],
  })

  assert.equal(payload.checklist[0].text, '초안 작성')
  assert.equal(payload.checklist[0].done, false)
})

test('buildTaskPayload normalizes attachment links, dropping non-http entries', () => {
  const payload = buildTaskPayload({
    ...baseData,
    links: [{ id: '1', url: 'https://example.com/spec', label: ' 기획서 ' }, { id: '2', url: 'not-a-url', label: 'bad' }],
  }, { task: { id: 1 } })

  assert.deepEqual(payload.links, [{ id: '1', url: 'https://example.com/spec', label: '기획서' }])
})

test('buildTaskDuplicatePayload copies attachment links', () => {
  const payload = buildTaskDuplicatePayload({
    id: 1, title: '업무', links: [{ id: '1', url: 'https://example.com/spec', label: '기획서' }],
  })

  assert.equal(payload.links[0].url, 'https://example.com/spec')
  assert.equal(payload.links[0].label, '기획서')
})

test('buildTaskPayload normalizes custom fields, dropping blank labels', () => {
  const payload = buildTaskPayload({
    ...baseData,
    custom_fields: [{ id: '1', label: ' 고객사 ', value: ' Acme ' }, { id: '2', label: '   ', value: 'ignored' }],
  }, { task: { id: 1 } })

  assert.deepEqual(payload.custom_fields, [{ id: '1', label: '고객사', value: 'Acme' }])
})

test('buildTaskDuplicatePayload copies custom fields', () => {
  const payload = buildTaskDuplicatePayload({
    id: 1, title: '업무', custom_fields: [{ id: '1', label: '고객사', value: 'Acme' }],
  })

  assert.equal(payload.custom_fields[0].label, '고객사')
  assert.equal(payload.custom_fields[0].value, 'Acme')
})

test('moveChecklistItem swaps a checklist item with its neighbor', () => {
  const items = [{ id: 'a', text: '첫번째' }, { id: 'b', text: '두번째' }, { id: 'c', text: '세번째' }]

  assert.deepEqual(moveChecklistItem(items, 'b', 'up').map(i => i.id), ['b', 'a', 'c'])
  assert.deepEqual(moveChecklistItem(items, 'b', 'down').map(i => i.id), ['a', 'c', 'b'])
})

test('moveChecklistItem is a no-op at the boundaries or for an unknown id', () => {
  const items = [{ id: 'a', text: '첫번째' }, { id: 'b', text: '두번째' }]

  assert.deepEqual(moveChecklistItem(items, 'a', 'up').map(i => i.id), ['a', 'b'])
  assert.deepEqual(moveChecklistItem(items, 'b', 'down').map(i => i.id), ['a', 'b'])
  assert.deepEqual(moveChecklistItem(items, 'z', 'up').map(i => i.id), ['a', 'b'])
})

test('checklistProgress computes the rounded completion percentage', () => {
  assert.equal(checklistProgress([{ done: true }, { done: false }, { done: false }]), 33)
  assert.equal(checklistProgress([{ done: true }, { done: true }]), 100)
  assert.equal(checklistProgress([{ done: false }]), 0)
})

test('checklistProgress returns null for an empty or missing checklist', () => {
  assert.equal(checklistProgress([]), null)
  assert.equal(checklistProgress(undefined), null)
})
