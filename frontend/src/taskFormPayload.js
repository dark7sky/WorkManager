export const buildTaskPayload = (data, { tags = [], task = null } = {}) => {
  const payload = {
    title: data.title.trim(),
    description: data.description.trim(),
    assignee_name: data.assignee_name.trim(),
    start_date: data.start_date || null,
    due_date: data.due_date || null,
    status: data.status === 'in_progress' ? 'doing' : data.status,
    priority: data.priority,
    progress: Number(data.progress),
    recurrence_rule: data.recurrence_rule || null,
    tags,
  }

  const parentId = data.parent_id ? Number(data.parent_id) : null
  const previousParentId = task?.parent_id || null
  if (!task || parentId !== previousParentId) payload.parent_id = parentId

  return payload
}
