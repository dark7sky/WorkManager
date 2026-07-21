const MAX_PER_GROUP = 6

function matches(text, query) {
  return typeof text === 'string' && text.toLowerCase().includes(query)
}

function matchesTags(item, query) {
  return Array.isArray(item.tags) && item.tags.some(tag => matches(tag, query))
}

export function searchAll({ tasks = [], events = [], todos = [], logs = [] } = {}, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return { tasks: [], events: [], todos: [], logs: [] }
  return {
    tasks: tasks.filter(t => matches(t.title, q) || matches(t.description, q) || matchesTags(t, q)).slice(0, MAX_PER_GROUP),
    events: events.filter(e => matches(e.title, q) || matches(e.location, q) || matchesTags(e, q)).slice(0, MAX_PER_GROUP),
    todos: todos.filter(t => matches(t.title, q) || matches(t.memo, q) || matchesTags(t, q)).slice(0, MAX_PER_GROUP),
    logs: logs.filter(l => matches(l.content, q) || matchesTags(l, q)).slice(0, MAX_PER_GROUP),
  }
}

export function globalSearchResultCount(results) {
  return (results.tasks?.length || 0) + (results.events?.length || 0) + (results.todos?.length || 0) + (results.logs?.length || 0)
}
