import assert from 'node:assert/strict'
import test from 'node:test'
import { filterTasks, summarizeAssigneeAssignmentLoad, summarizeAssigneeCapacity, summarizeAssigneeWorkload, summarizeBlockedTasks, summarizeDueReminders, summarizeOwnershipGaps, taskAssigneeOptions, taskBlockingDependencies } from './taskFilters.js'

const tasks = [
  { id: 1, title: '보고서 작성', status: 'todo', due_date: '2026-07-08', progress: 0, priority: 'high', assignee_name: '김민준', tags: ['보고'] },
  { id: 2, title: '요구사항 정리', status: 'in_progress', due_date: '2026-07-09', progress: 50, priority: 'normal', assignee_name: '이서연', tags: ['기획'] },
  { id: 3, title: '회의록 배포', status: 'done', due_date: '2026-07-06', progress: 100, priority: 'low', assignee_name: '김민준', tags: ['운영'] },
  { id: 4, title: '검토 대기', status: 'todo', due_date: '2026-07-06', progress: 10, priority: 'high', tags: [] },
]

test('filterTasks narrows tasks by assignee without losing status and tag filters', () => {
  const shown = filterTasks(tasks, {
    query: '',
    status: 'active',
    selectedTags: ['보고'],
    assignee: '김민준',
    todayIso: '2026-07-07',
  })

  assert.deepEqual(shown.map(task => task.id), [1])
})

test('taskAssigneeOptions includes saved team members and task assignees', () => {
  assert.deepEqual(taskAssigneeOptions([
    { assignee_name: '이서연' },
    { assignee_name: ' 김민준 ' },
  ], ['박지훈', '이서연']), ['김민준', '박지훈', '이서연'])
})

test('filterTasks narrows active tasks by priority without losing assignee filters', () => {
  const shown = filterTasks(tasks, {
    query: '',
    status: 'active',
    selectedTags: [],
    assignee: 'all',
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

test('taskAssigneeOptions returns trimmed unique owner names for form suggestions', () => {
  assert.deepEqual(taskAssigneeOptions([
    { assignee_name: ' 이서연 ' },
    { assignee_name: '김민준' },
    { assignee_name: '이서연' },
    { assignee_name: '' },
    {},
  ]), ['김민준', '이서연'])
})

test('summarizeAssigneeWorkload counts active overdue and completed work by owner', () => {
  const workload = summarizeAssigneeWorkload(tasks, '2026-07-07')

  assert.deepEqual(workload, [
    { assignee: '김민준', active: 1, overdue: 0, done: 1, total: 2 },
    { assignee: '미지정', active: 1, overdue: 1, done: 0, total: 1 },
    { assignee: '이서연', active: 1, overdue: 0, done: 0, total: 1 },
  ])
})

test('summarizeAssigneeAssignmentLoad excludes the edited task and highlights due risk', () => {
  const summary = summarizeAssigneeAssignmentLoad([
    ...tasks,
    { id: 5, title: '긴급 검토', status: 'doing', due_date: '2026-07-10', priority: 'high', assignee_name: '김민준' },
  ], ' 김민준 ', '2026-07-07', 1)

  assert.deepEqual(summary, {
    assignee: '김민준',
    active: 1,
    overdue: 0,
    dueSoon: 1,
    highPriority: 1,
  })
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

test('summarizeOwnershipGaps counts active unassigned and overdue ownership gaps', () => {
  assert.deepEqual(summarizeOwnershipGaps(tasks, '2026-07-07'), {
    activeUnassigned: 1,
    overdueUnassigned: 1,
  })
})

test('summarizeAssigneeCapacity counts scheduled load inside the planning window', () => {
  const capacity = summarizeAssigneeCapacity([
    ...tasks,
    { id: 5, title: '동시 작업 A', status: 'todo', start_date: '2026-07-07', due_date: '2026-07-08', assignee_name: '김민준' },
    { id: 6, title: '동시 작업 B', status: 'doing', start_date: '2026-07-08', due_date: '2026-07-08', assignee_name: '김민준' },
    { id: 7, title: '완료 작업', status: 'done', start_date: '2026-07-08', due_date: '2026-07-08', assignee_name: '김민준' },
    { id: 8, title: '기간 밖 작업', status: 'todo', start_date: '2026-08-01', due_date: '2026-08-02', assignee_name: '이서연' },
  ], '2026-07-07', 14, 2)

  assert.deepEqual(capacity[0], {
    assignee: '김민준',
    scheduledTasks: 3,
    scheduledDays: 2,
    peakDailyLoad: 3,
    overloadDays: 1,
  })
  assert.equal(capacity.some(row => row.assignee === '이서연' && row.scheduledTasks === 1), true)
})
