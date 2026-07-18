import test from 'node:test'
import assert from 'node:assert/strict'
import { dayAtOffset, ganttDragDates, ganttDragPreview, postponeTaskDates, postponeTodoDate, postponeLogDate } from './ganttDrag.js'

test('dayAtOffset maps pixels to day cells and clamps to the window', () => {
  assert.equal(dayAtOffset(0, 1400), 0)
  assert.equal(dayAtOffset(150, 1400), 1)
  assert.equal(dayAtOffset(1399, 1400), 13)
  assert.equal(dayAtOffset(-50, 1400), 0)
  assert.equal(dayAtOffset(9999, 1400), 13)
  assert.equal(dayAtOffset(100, 0), 0)
})

const task = { start_date: '2026-07-10', due_date: '2026-07-12' }

test('move shifts both dates by the dragged day delta', () => {
  assert.deepEqual(ganttDragDates('move', task, { grabDay: 2, dropDay: 5 }),
    { start_date: '2026-07-13', due_date: '2026-07-15' })
  assert.deepEqual(ganttDragDates('move', task, { grabDay: 5, dropDay: 2 }),
    { start_date: '2026-07-07', due_date: '2026-07-09' })
  assert.equal(ganttDragDates('move', task, { grabDay: 3, dropDay: 3 }), null)
})

test('move crosses month boundaries correctly', () => {
  const eom = { start_date: '2026-07-30', due_date: '2026-07-31' }
  assert.deepEqual(ganttDragDates('move', eom, { grabDay: 0, dropDay: 2 }),
    { start_date: '2026-08-01', due_date: '2026-08-02' })
})

test('resize-end sets due date from the window and never before start', () => {
  assert.deepEqual(ganttDragDates('resize-end', task, { dropDay: 6, windowStartIso: '2026-07-09' }),
    { start_date: '2026-07-10', due_date: '2026-07-15' })
  assert.deepEqual(ganttDragDates('resize-end', task, { dropDay: 0, windowStartIso: '2026-07-09' }),
    { start_date: '2026-07-10', due_date: '2026-07-10' })
  assert.equal(ganttDragDates('resize-end', task, { dropDay: 3, windowStartIso: '2026-07-09' }), null)
})

test('resize-start sets start date from the window and never after due', () => {
  assert.deepEqual(ganttDragDates('resize-start', task, { dropDay: 6, windowStartIso: '2026-07-09' }),
    { start_date: '2026-07-12', due_date: '2026-07-12' })
})

test('resize-start clamps start to the due date and no-ops when unchanged', () => {
  assert.deepEqual(ganttDragDates('resize-start', task, { dropDay: 0, windowStartIso: '2026-07-08' }),
    { start_date: '2026-07-08', due_date: '2026-07-12' })
  assert.equal(ganttDragDates('resize-start', task, { dropDay: 1, windowStartIso: '2026-07-09' }), null)
})

test('tasks without explicit dates are not draggable', () => {
  assert.equal(ganttDragDates('move', { start_date: null, due_date: '2026-07-12' }, { grabDay: 0, dropDay: 1 }), null)
  assert.equal(ganttDragDates('move', { start_date: '2026-07-10' }, { grabDay: 0, dropDay: 1 }), null)
})

test('postponeTaskDates shifts due date (and start date, keeping duration) by a day', () => {
  assert.deepEqual(postponeTaskDates(task), { start_date: '2026-07-11', due_date: '2026-07-13' })
  assert.deepEqual(postponeTaskDates({ due_date: '2026-07-12' }), { due_date: '2026-07-13' })
  assert.equal(postponeTaskDates({ start_date: '2026-07-10' }), null)
  assert.equal(postponeTaskDates(null), null)
})

test('postponeTodoDate shifts todo_date by the given number of days', () => {
  assert.deepEqual(postponeTodoDate({ todo_date: '2026-07-12' }), { todo_date: '2026-07-13' })
  assert.deepEqual(postponeTodoDate({ todo_date: '2026-07-12' }, 3), { todo_date: '2026-07-15' })
  assert.equal(postponeTodoDate({ title: 'no date' }), null)
  assert.equal(postponeTodoDate(null), null)
})

test('postponeLogDate shifts log_date by the given number of days', () => {
  assert.deepEqual(postponeLogDate({ log_date: '2026-07-12' }), { log_date: '2026-07-13' })
  assert.deepEqual(postponeLogDate({ log_date: '2026-07-12' }, 3), { log_date: '2026-07-15' })
  assert.equal(postponeLogDate({ content: 'no date' }), null)
  assert.equal(postponeLogDate(null), null)
})

test('preview clamps to the visible window', () => {
  assert.deepEqual(ganttDragPreview('move', { left: 2, width: 3 }, { grabDay: 3, dropDay: 6 }), { left: 5, width: 3 })
  assert.deepEqual(ganttDragPreview('move', { left: 0, width: 3 }, { grabDay: 5, dropDay: 0 }), { left: -2, width: 3 })
  assert.deepEqual(ganttDragPreview('resize-end', { left: 2, width: 3 }, { dropDay: 9 }), { left: 2, width: 8 })
  assert.deepEqual(ganttDragPreview('resize-end', { left: 2, width: 3 }, { dropDay: 0 }), { left: 2, width: 1 })
  assert.deepEqual(ganttDragPreview('resize-start', { left: 2, width: 3 }, { dropDay: 0 }), { left: 0, width: 5 })
  assert.deepEqual(ganttDragPreview('resize-start', { left: 2, width: 3 }, { dropDay: 6 }), { left: 4, width: 1 })
})

test('dayAtOffset and preview respect a custom window size (zoom)', () => {
  assert.equal(dayAtOffset(0, 700, 7), 0)
  assert.equal(dayAtOffset(699, 700, 7), 6)
  assert.equal(dayAtOffset(9999, 700, 7), 6)
  assert.equal(dayAtOffset(9999, 3000, 30), 29)
  assert.deepEqual(ganttDragPreview('move', { left: 5, width: 2 }, { grabDay: 3, dropDay: 6 }, 7), { left: 6, width: 2 })
  assert.deepEqual(ganttDragPreview('resize-end', { left: 2, width: 3 }, { dropDay: 29 }, 30), { left: 2, width: 28 })
})
