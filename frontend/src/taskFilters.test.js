import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TASK_FILTERS, filterTasks, hasActiveTaskFilters, reminderDigestTasks, summarizeBlockedTasks, summarizeDueReminders, taskBlockingDependencies, withAddedTag } from './taskFilters.js'

const tasks = [
  { id: 1, title: '보고서 작성', status: 'todo', due_date: '2026-07-08', progress: 0, priority: 'high', tags: ['보고'] },
  { id: 2, title: '요구사항 정리', status: 'in_progress', due_date: '2026-07-09', progress: 50, priority: 'normal', tags: ['기획'] },
  { id: 3, title: '회의록 배포', status: 'done', due_date: '2026-07-06', progress: 100, priority: 'low', tags: ['운영'] },
  { id: 4, title: '검토 대기', status: 'todo', due_date: '2026-07-06', progress: 10, priority: 'high', tags: [] },
]

test('hasActiveTaskFilters is false at defaults and true once any filter is touched', () => {
  assert.equal(hasActiveTaskFilters(DEFAULT_TASK_FILTERS), false)
  assert.equal(hasActiveTaskFilters({ ...DEFAULT_TASK_FILTERS, query: '  ' }), false)
  assert.equal(hasActiveTaskFilters({ ...DEFAULT_TASK_FILTERS, query: '보고서' }), true)
  assert.equal(hasActiveTaskFilters({ ...DEFAULT_TASK_FILTERS, status: 'all' }), true)
  assert.equal(hasActiveTaskFilters({ ...DEFAULT_TASK_FILTERS, selectedTags: ['기획'] }), true)
  assert.equal(hasActiveTaskFilters({ ...DEFAULT_TASK_FILTERS, priority: 'high' }), true)
})

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

test('filterTasks status=due_this_week keeps only unfinished tasks due within the next 6 days', () => {
  const weekTasks = [
    ...tasks,
    { id: 5, title: '이번주 마감', status: 'todo', due_date: '2026-07-12', progress: 0, tags: [] },
    { id: 6, title: '다음주 마감', status: 'todo', due_date: '2026-07-20', progress: 0, tags: [] },
  ]
  const shown = filterTasks(weekTasks, { status: 'due_this_week', todayIso: '2026-07-07' })
  assert.deepEqual(shown.map(task => task.id), [1, 2, 5])
})

test('filterTasks status=no_due_date keeps only unfinished tasks with no due date', () => {
  const noDueTasks = [
    ...tasks,
    { id: 5, title: '기한 없는 업무', status: 'todo', due_date: null, progress: 0, tags: [] },
    { id: 6, title: '완료된 기한 없는 업무', status: 'done', due_date: null, progress: 100, tags: [] },
  ]
  const shown = filterTasks(noDueTasks, { status: 'no_due_date', todayIso: '2026-07-07' })
  assert.deepEqual(shown.map(task => task.id), [5])
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

test('reminderDigestTasks defaults to only tasks due today', () => {
  const due = reminderDigestTasks(tasks, '2026-07-06')
  assert.deepEqual(due.map(task => task.id), [4])
})

test('reminderDigestTasks with due_soon scope also includes tasks due within 2 days', () => {
  const due = reminderDigestTasks(tasks, '2026-07-06', 'due_soon')
  assert.deepEqual(due.map(task => task.id).sort(), [1, 4])
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
