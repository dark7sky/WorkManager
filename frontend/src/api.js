const API = '/api'
export const AUTH_EXPIRED_EVENT = 'workmanager:auth-expired'

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status }
}

const validationDetailMessage = detail => {
  if (!Array.isArray(detail)) return ''
  const parts = detail.map(item => {
    if (!item || typeof item !== 'object') return ''
    const loc = Array.isArray(item.loc) ? item.loc.filter(part => part !== 'body').join('.') : ''
    const msg = typeof item.msg === 'string' ? item.msg.trim() : ''
    if (!loc && !msg) return ''
    return loc ? `${loc}: ${msg}` : msg
  }).filter(Boolean)
  return parts.join(' / ')
}

export const apiErrorMessage = (body, status) => {
  if (typeof body?.detail === 'string' && body.detail.trim()) return body.detail
  const validationMessage = validationDetailMessage(body?.detail)
  if (validationMessage) return validationMessage
  if (typeof body?.message === 'string' && body.message.trim()) return body.message
  return `요청을 처리하지 못했습니다 (${status})`
}

export async function request(path, options = {}) {
  const { suppressAuthEvent, ...fetchOptions } = options
  let response
  try {
    response = await fetch(`${API}${path}`, { ...fetchOptions, credentials: 'include', headers: { 'Content-Type': 'application/json', ...fetchOptions.headers } })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.', 0)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401 && !suppressAuthEvent) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    throw new ApiError(apiErrorMessage(body, response.status), response.status)
  }
  return response.status === 204 ? null : response.json()
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })
export const api = {
  config: () => request('/auth/config', { suppressAuthEvent: true }),
  me: () => request('/auth/me', { suppressAuthEvent: true }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  sessions: () => request('/auth/sessions'), revokeSession: id => request(`/auth/sessions/${id}`,{method:'DELETE'}),
  startDemo: () => request('/auth/demo', { method: 'POST', suppressAuthEvent: true }),
  tasks: () => request('/tasks'), events: () => request('/events'), today: () => request('/today'),
  createTask: data => request('/tasks', json('POST', data)), updateTask: (id,data) => request(`/tasks/${id}`,json('PATCH',data)), deleteTask: id => request(`/tasks/${id}`,{method:'DELETE'}),
  skipTaskRecurrence: id => request(`/tasks/${id}/skip-recurrence`,{method:'POST'}),
  createEvent: data => request('/events',json('POST',data)), updateEvent: (id,data) => request(`/events/${id}`,json('PATCH',data)), deleteEvent: id => request(`/events/${id}`,{method:'DELETE'}),
  createLog: data => request('/work_logs',json('POST',data)), updateLog: (id,data) => request(`/work_logs/${id}`,json('PATCH',data)), deleteLog: id => request(`/work_logs/${id}`,{method:'DELETE'}),
  workLogs: () => request('/work_logs'),
  todos: () => request('/todos'),
  createTodo: data => request('/todos',json('POST',data)), updateTodo: (id,data) => request(`/todos/${id}`,json('PATCH',data)), deleteTodo: id => request(`/todos/${id}`,{method:'DELETE'}),
  skipTodoRecurrence: id => request(`/todos/${id}/skip-recurrence`,{method:'POST'}),
  aiPreview: text => request('/ai/parse',json('POST',{text})), aiApply: data => request('/ai/apply',json('POST',data)), aiRecommendations: (limit=5) => request(`/ai/recommendations?limit=${limit}`), aiStatus: () => request('/ai/status'),
  aiSettings: provider => request(`/settings/ai${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`), saveAiSettings: data => request('/settings/ai',json('PUT',data)),
  testAiSettings: () => request('/settings/ai/test',json('POST',{})),
  workflowSettings: () => request('/settings/workflow'), saveWorkflowSettings: data => request('/settings/workflow',json('PUT',data)),
  calendarFeedStatus: () => request('/settings/calendar-feed'), rotateCalendarFeed: () => request('/settings/calendar-feed/rotate',{method:'POST'}), disableCalendarFeed: () => request('/settings/calendar-feed',{method:'DELETE'}),
  integrations: () => request('/settings/integrations'), googleStatus: () => request('/google/status'), googleCalendars: () => request('/google/calendars'), selectGoogleCalendar: calendar_id => request('/google/select',json('POST',{calendar_id})), syncGoogleCalendar: () => request('/google/sync',{method:'POST'}),
  exportData: () => request('/export'),
  importPreview: data => request('/import/preview',json('POST',data)),
  importData: (mode,data) => request('/import',json('POST',{mode,data})),
  tags: () => request('/tags'),
  renameTag: (from,to) => request('/tags/rename',json('POST',{from,to})),
  auditLogs: (limit=100) => request(`/audit-logs?limit=${limit}`),
  diagnosticsErrors: (limit=5) => request(`/diagnostics/errors?limit=${limit}`),
  trash: () => request('/trash'),
  restoreTrash: (table,id) => request(`/${encodeURIComponent(table)}/${id}/restore`,{method:'POST'}),
  cleanupTrash: (days=30) => request(`/trash?older_than_days=${days}`,{method:'DELETE'}),
  purgeTrashItem: (table,id) => request(`/trash/${encodeURIComponent(table)}/${id}`,{method:'DELETE'}),
  achievements: (start,end,tags=[],signal) => request(`/achievements?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&tags=${encodeURIComponent(tags.join(','))}`, { signal }),
  resolveEventConflict: (id,strategy) => request(`/events/${id}/resolve-conflict`,json('POST',{strategy})),
  aiTagSuggestions: data => request('/ai/tag-recommendations',json('POST',data)),
  aiPeriodSummary: (start,end,tags=[]) => request(`/ai/period-summary?start_date=${start}&end_date=${end}&tags=${encodeURIComponent(tags.join(','))}`),
  aiProgressSuggestions: (start,end,tags=[]) => request(`/ai/project-suggestions?start_date=${start}&end_date=${end}&tags=${encodeURIComponent(tags.join(','))}`),
  featureRequests: (status='all') => request(`/feature-requests?status=${encodeURIComponent(status)}`),
  publicChangelog: () => request('/public/changelog', { suppressAuthEvent: true }),
  createFeatureRequest: content => request('/feature-requests',json('POST',{content,source:'changelog'})),
  updateFeatureRequest: (id,status) => request(`/feature-requests/${id}`,json('PATCH',{status})),
  taskComments: id => request(`/tasks/${id}/comments`),
  addTaskComment: (id,body) => request(`/tasks/${id}/comments`,json('POST',{body})),
  updateTaskComment: (id,commentId,body) => request(`/tasks/${id}/comments/${commentId}`,json('PATCH',{body})),
  deleteTaskComment: (id,commentId) => request(`/tasks/${id}/comments/${commentId}`,{method:'DELETE'}),
}
