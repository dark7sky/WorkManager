import assert from 'node:assert/strict'
import test from 'node:test'
import { filterTasks, summarizeAssigneeWorkload, summarizeDueReminders } from './taskFilters.js'

const tasks = [
  { id: 1, title: '보고서 작성', status: 'todo', due_date: '2026-07-08', progress: 0, assignee_name: '김민준', tags: ['보고'] },
  { id: 2, title: '요구사항 정리', status: 'in_progress', due_date: '2026-07-09', progress: 50, assignee_name: '이서연', tags: ['기획'] },
  { id: 3, title: '회의록 배포', status: 'done', due_date: '2026-07-06', progress: 100, assignee_name: '김민준', tags: ['운영'] },
  { id: 4, title: '검토 대기', status: 'todo', due_date: '2026-07-06', progress: 10, tags: [] },
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

test('summarizeAssigneeWorkload counts active overdue and completed work by owner', () => {
  const workload = summarizeAssigneeWorkload(tasks, '2026-07-07')

  assert.deepEqual(workload, [
    { assignee: '김민준', active: 1, overdue: 0, done: 1, total: 2 },
    { assignee: '미지정', active: 1, overdue: 1, done: 0, total: 1 },
    { assignee: '이서연', active: 1, overdue: 0, done: 0, total: 1 },
  ])
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
