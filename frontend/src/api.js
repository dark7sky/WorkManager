const API = '/api'

export async function request(path, options = {}) {
  const token = localStorage.getItem('wm-token')
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || '요청을 처리하지 못했습니다.')
  return response.status === 204 ? null : response.json()
}

export const api = {
  config: () => request('/auth/config'),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ user_id: username, password }) }),
  tasks: () => request('/tasks'),
  events: () => request('/events'),
  todos: () => request('/todos'),
  today: () => request('/today'),
  createTask: data => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createLog: data => request('/work_logs', { method: 'POST', body: JSON.stringify(data) }),
  createTodo: data => request('/todos', { method: 'POST', body: JSON.stringify(data) }),
  aiPreview: text => request('/ai/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  aiApply: data => request('/ai/apply', { method: 'POST', body: JSON.stringify(data) }),
}
