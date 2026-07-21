const MAX_PER_GROUP = 6

function matches(text, query) {
  return typeof text === 'string' && text.toLowerCase().includes(query)
}

export function searchAll({ tasks = [], events = [], todos = [], logs = [] } = {}, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return { tasks: [], events: [], todos: [], logs: [] }
  return {
    tasks: tasks.filter(t => matches(t.title, q) || matches(t.description, q)).slice(0, MAX_PER_GROUP),
    events: events.filter(e => matches(e.title, q) || matches(e.location, q)).slice(0, MAX_PER_GROUP),
    todos: todos.filter(t => matches(t.title, q) || matches(t.memo, q)).slice(0, MAX_PER_GROUP),
    logs: logs.filter(l => matches(l.content, q)).slice(0, MAX_PER_GROUP),
  }
}

export function globalSearchResultCount(results) {
  return (results.tasks?.length || 0) + (results.events?.length || 0) + (results.todos?.length || 0) + (results.logs?.length || 0)
}
