export const buildTodoDuplicatePayload = todo => ({
  title: `${(todo?.title || '').trim()} (사본)`,
  todo_date: new Date().toLocaleDateString('en-CA'),
  completed: false,
  tags: Array.isArray(todo?.tags) ? todo.tags : [],
  recurrence_rule: todo?.recurrence_rule || null,
  priority: todo?.priority || 'normal',
})
