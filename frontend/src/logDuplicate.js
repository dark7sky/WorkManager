export const buildLogDuplicatePayload = log => ({
  content: `${(log?.content || '').trim()} (사본)`,
  log_date: new Date().toLocaleDateString('en-CA'),
  task_id: log?.task_id || null,
  tags: Array.isArray(log?.tags) ? log.tags : [],
  duration_minutes: log?.duration_minutes || null,
  link_url: log?.link_url || null,
  links: Array.isArray(log?.links) ? log.links : [],
  color: log?.color || null,
  log_time: log?.log_time || null,
  billable: !!log?.billable,
})

export const buildTaskFromLogPayload = log => ({
  title: (log?.content || '').trim(),
  tags: Array.isArray(log?.tags) ? log.tags : [],
  priority: 'normal',
  due_date: log?.log_date || null,
  status: 'done',
  progress: 100,
  link_url: log?.link_url || null,
})
