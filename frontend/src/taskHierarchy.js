const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'ko')

export const childTaskIds = (tasks, taskId) => {
  if (!taskId) return new Set()
  const children = new Map()
  for (const task of tasks) {
    if (!task.parent_id) continue
    const group = children.get(task.parent_id) || []
    group.push(task.id)
    children.set(task.parent_id, group)
  }
  const result = new Set()
  const stack = [...(children.get(taskId) || [])]
  while (stack.length) {
    const id = stack.pop()
    if (result.has(id)) continue
    result.add(id)
    stack.push(...(children.get(id) || []))
  }
  return result
}

export const taskParentOptions = (tasks, currentTaskId) => {
  const blocked = childTaskIds(tasks, currentTaskId)
  if (currentTaskId) blocked.add(currentTaskId)
  return orderTasksHierarchically(tasks, tasks)
    .filter(({ task }) => !blocked.has(task.id))
    .map(({ task, depth }) => ({ id: task.id, label: `${'-- '.repeat(depth)}${task.title || `#${task.id}`}` }))
}

export const taskHierarchyDepths = tasks => {
  const parents = new Map(tasks.map(task => [task.id, task.parent_id || null]))
  const depths = new Map()
  const depthOf = id => {
    if (!parents.has(id)) return 0
    if (depths.has(id)) return depths.get(id)
    const seen = new Set([id])
    let parent = parents.get(id)
    let depth = 0
    while (parent && parents.has(parent) && !seen.has(parent)) {
      depth += 1
      seen.add(parent)
      parent = parents.get(parent)
    }
    depths.set(id, depth)
    return depth
  }
  tasks.forEach(task => depthOf(task.id))
  return depths
}

export const orderTasksHierarchically = (visibleTasks, allTasks = visibleTasks) => {
  const visible = new Set(visibleTasks.map(task => task.id))
  const children = new Map()
  for (const task of visibleTasks) {
    const parent = visible.has(task.parent_id) ? task.parent_id : null
    const group = children.get(parent) || []
    group.push(task)
    children.set(parent, group)
  }
  for (const group of children.values()) group.sort(byTitle)
  const ordered = []
  const visit = task => {
    ordered.push(task)
    for (const child of children.get(task.id) || []) visit(child)
  }
  for (const task of children.get(null) || []) visit(task)

  const depths = taskHierarchyDepths(allTasks)
  return ordered.map(task => ({ task, depth: depths.get(task.id) || 0 }))
}
