import assert from 'node:assert/strict'
import test from 'node:test'
import { filterTasks, summarizeBlockedTasks, summarizeDueReminders, taskBlockingDependencies, withAddedTag } from './taskFilters.js'

const tasks = [
  { id: 1, title: '보고서 작성', status: 'todo', due_date: '2026-07-08', progress: 0, priority: 'high', tags: ['보고'] },
  { id: 2, title: '요구사항 정리', status: 'in_progress', due_date: '2026-07-09', progress: 50, priority: 'normal', tags: ['기획'] },
  { id: 3, title: '회의록 배포', status: 'done', due_date: '2026-07-06', progress: 100, priority: 'low', tags: ['운영'] },
  { id: 4, title: '검토 대기', status: 'todo', due_date: '2026-07-06', progress: 10, priority: 'high', tags: [] },
]

test('filterTasks narrows active tasks by tag without losing status filters', () => {
  const shown = filterTasks(tasks, {
    query: '',
    status: 'active',
    selectedTags: ['보고'],
    todayIso: '2026-07-07',
  })

  assert.deepEqual(shown.map(task => task.id), [1])
})

test('filterTasks narrows active tasks by priority', () => {
  const shown = filterTasks(tasks, {
    query: '',
    status: 'active',
    selectedTags: [],
    priority: 'high',
    todayIso: '2026-07-07',
  })

  assert.deepEqual(shown.map(task => task.id), [1, 4])
})

test('filterTasks can isolate completion and schedule approval queues', () => {
  const approvalTasks = [
    ...tasks,
    { id: 5, title: '완료 승인', status: 'done', approval_status: 'pending', due_date: '2026-07-07', priority: 'normal' },
    { id: 6, title: '일정 승인', status: 'doing', schedule_approval_status: 'pending', due_date: '2026-07-08', priority: 'normal' },
    { id: 7, title: '승인 완료', status: 'done', approval_status: 'approved', schedule_approval_status: 'approved', due_date: '2026-07-08', priority: 'normal' },
  ]

  assert.deepEqual(filterTasks(approvalTasks, { status: 'approval_pending' }).map(task => task.id), [5])
  assert.deepEqual(filterTasks(approvalTasks, { status: 'schedule_pending' }).map(task => task.id), [6])
})

test('summarizeDueReminders counts overdue today and upcoming unfinished tasks', () => {
  const reminderTasks = [
    ...tasks,
    { id: 5, title: '오늘 마감', status: 'todo', due_date: '2026-07-07', progress: 0, tags: [] },
  ]
  const summary = summarizeDueReminders(reminderTasks, '2026-07-07', 2)

  assert.deepEqual(summary, {
    overdue: 1,
    dueToday: 1,
    dueSoon: 2,
    total: 4,
    nextDueDate: '2026-07-06',
  })
})

test('taskBlockingDependencies returns unfinished dependency blockers only', () => {
  const blockers = taskBlockingDependencies(
    { id: 5, title: '출시', status: 'todo', dependency_ids: [1, 3, 999] },
    tasks,
  )

  assert.deepEqual(blockers.map(task => task.id), [1])
})

test('summarizeBlockedTasks counts unfinished tasks blocked by incomplete dependencies', () => {
  const summary = summarizeBlockedTasks([
    ...tasks,
    { id: 5, title: '출시', status: 'todo', due_date: '2026-07-10', dependency_ids: [1, 3] },
    { id: 6, title: '완료된 후속', status: 'done', due_date: '2026-07-09', dependency_ids: [1] },
  ])

  assert.equal(summary.total, 1)
  assert.equal(summary.blockerTotal, 1)
  assert.equal(summary.nextDueDate, '2026-07-10')
  assert.deepEqual(summary.items[0].blockers.map(task => task.id), [1])
})

test('withAddedTag appends a new tag to an existing list', () => {
  assert.deepEqual(withAddedTag(['기획'], '긴급'), ['기획', '긴급'])
})

test('withAddedTag skips duplicates case-insensitively and trims whitespace', () => {
  const tags = ['기획', 'Urgent']
  assert.equal(withAddedTag(tags, 'urgent '), tags)
})

test('withAddedTag ignores a blank tag and handles a missing tag list', () => {
  assert.deepEqual(withAddedTag(undefined, '  '), [])
  assert.deepEqual(withAddedTag(undefined, '긴급'), ['긴급'])
})
