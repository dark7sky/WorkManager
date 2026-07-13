export const buildTodoDuplicatePayload = todo => ({
  title: `${(todo?.title || '').trim()} (사본)`,
  todo_date: new Date().toLocaleDateString('en-CA'),
  completed: false,
  tags: Array.isArray(todo?.tags) ? todo.tags : [],
  recurrence_rule: todo?.recurrence_rule || null,
  recurrence_end_date: todo?.recurrence_rule ? todo?.recurrence_end_date || null : null,
  priority: todo?.priority || 'normal',
  link_url: todo?.link_url || null,
  memo: todo?.memo || null,
})

const TODO_PRIORITY_TO_TASK = { high: 'high', normal: 'normal', low: 'low' }

export const buildTaskFromTodoPayload = todo => ({
  title: (todo?.title || '').trim(),
  tags: Array.isArray(todo?.tags) ? todo.tags : [],
  priority: TODO_PRIORITY_TO_TASK[todo?.priority] || 'normal',
  due_date: todo?.todo_date || null,
  status: todo?.completed ? 'done' : 'todo',
  progress: todo?.completed ? 100 : 0,
  link_url: todo?.link_url || null,
  description: todo?.memo || null,
})
