const API = '/api'

export async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `요청을 처리하지 못했습니다 (${response.status})`)
  }
  return response.status === 204 ? null : response.json()
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })
export const api = {
  config: () => request('/auth/config'), me: () => request('/auth/me'),
  login: (user_id, password) => request('/auth/login', json('POST', { user_id, password })),
  logout: () => request('/auth/logout', { method: 'POST' }),
  tasks: () => request('/tasks'), events: () => request('/events'), today: () => request('/today'),
  createTask: data => request('/tasks', json('POST', data)),
  updateTask: (id, data) => request(`/tasks/${id}`, json('PATCH', data)),
  deleteTask: id => request(`/tasks/${id}`, { method: 'DELETE' }),
  createEvent: data => request('/events', json('POST', data)),
  updateEvent: (id, data) => request(`/events/${id}`, json('PATCH', data)),
  deleteEvent: id => request(`/events/${id}`, { method: 'DELETE' }),
  createLog: data => request('/work_logs', json('POST', data)),
  updateLog: (id, data) => request(`/work_logs/${id}`, json('PATCH', data)),
  deleteLog: id => request(`/work_logs/${id}`, { method: 'DELETE' }),
  createTodo: data => request('/todos', json('POST', data)),
  updateTodo: (id, data) => request(`/todos/${id}`, json('PATCH', data)),
  deleteTodo: id => request(`/todos/${id}`, { method: 'DELETE' }),
  aiPreview: text => request('/ai/parse', json('POST', { text })),
  aiApply: data => request('/ai/apply', json('POST', data)),
  aiRecommendations: (limit = 5) => request(`/ai/recommendations?limit=${limit}`),
  aiStatus: () => request('/ai/status'),
  integrations: () => request('/settings/integrations'),
  googleStatus: () => request('/google/status'),
  googleCalendars: () => request('/google/calendars'),
  selectGoogleCalendar: calendar_id => request('/google/select', json('POST', { calendar_id })),
  syncGoogleCalendar: () => request('/google/sync', { method: 'POST' }),
}
