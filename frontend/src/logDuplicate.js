export const buildLogDuplicatePayload = log => ({
  content: `${(log?.content || '').trim()} (사본)`,
  log_date: new Date().toLocaleDateString('en-CA'),
  task_id: log?.task_id || null,
  tags: Array.isArray(log?.tags) ? log.tags : [],
  duration_minutes: log?.duration_minutes || null,
  link_url: log?.link_url || null,
  links: Array.isArray(log?.links) ? log.links : [],
  color: log?.color || null,
})
