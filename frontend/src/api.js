const API = '/api'
export const AUTH_EXPIRED_EVENT = 'workmanager:auth-expired'
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const attachmentSizeError = file => file && file.size > MAX_ATTACHMENT_BYTES
  ? `파일 크기는 최대 ${(MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB까지 첨부할 수 있습니다. (${(file.size / (1024 * 1024)).toFixed(1)}MB)`
  : ''

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

const REQUEST_TIMEOUT_MS = 20000

export async function request(path, options = {}) {
  const { suppressAuthEvent, signal: callerSignal, ...fetchOptions } = options
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)
  const signal = callerSignal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([callerSignal, timeoutController.signal]) : callerSignal)
    : timeoutController.signal
  let response
  try {
    const isFormData = fetchOptions.body instanceof FormData
    response = await fetch(`${API}${path}`, { ...fetchOptions, credentials: 'include', signal, headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...fetchOptions.headers } })
  } catch (error) {
    if (callerSignal?.aborted) throw error
    if (error?.name === 'AbortError') throw new ApiError('요청 시간이 초과되었습니다. 다시 시도해 주세요.', 0)
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.', 0)
  } finally {
    clearTimeout(timer)
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
  revokeOtherSessions: () => request('/auth/sessions/revoke-others', { method: 'POST' }),
  startDemo: () => request('/auth/demo', { method: 'POST', suppressAuthEvent: true }),
  tasks: () => request('/tasks'), events: () => request('/events'), today: () => request('/today'),
  createTask: data => request('/tasks', json('POST', data)), updateTask: (id,data) => request(`/tasks/${id}`,json('PATCH',data)), deleteTask: id => request(`/tasks/${id}`,{method:'DELETE'}),
  skipTaskRecurrence: id => request(`/tasks/${id}/skip-recurrence`,{method:'POST'}),
  taskSeries: id => request(`/tasks/${id}/series`),
  updateTaskSeries: (groupId,fromDate,data) => request(`/tasks/series/${groupId}?from_date=${encodeURIComponent(fromDate)}`,json('PATCH',data)),
  deleteTaskSeries: (groupId,fromDate) => request(`/tasks/series/${groupId}?from_date=${encodeURIComponent(fromDate)}`,{method:'DELETE'}),
  archivedTasks: (limit,offset=0) => request(`/tasks/archived${limit?`?limit=${limit}&offset=${offset}`:''}`),
  archiveTask: id => request(`/tasks/${id}/archive`,{method:'POST'}), unarchiveTask: id => request(`/tasks/${id}/unarchive`,{method:'POST'}),
  shareTask: (id,expiresInDays,password) => request(`/tasks/${id}/share?${expiresInDays?`expires_in_days=${expiresInDays}&`:''}${password?`password=${encodeURIComponent(password)}`:''}`,{method:'POST'}), unshareTask: id => request(`/tasks/${id}/share`,{method:'DELETE'}),
  publicTask: (token,password) => request(`/public/tasks/${token}${password?`?password=${encodeURIComponent(password)}`:''}`, { suppressAuthEvent: true }),
  createEvent: data => request('/events',json('POST',data)), updateEvent: (id,data) => request(`/events/${id}`,json('PATCH',data)), deleteEvent: id => request(`/events/${id}`,{method:'DELETE'}),
  eventSeries: id => request(`/events/${id}/series`),
  updateEventSeries: (groupId,fromStartAt,data) => request(`/events/series/${groupId}?from_start_at=${encodeURIComponent(fromStartAt)}`,json('PATCH',data)),
  deleteEventSeries: (groupId,fromStartAt) => request(`/events/series/${groupId}?from_start_at=${encodeURIComponent(fromStartAt)}`,{method:'DELETE'}),
  archivedEvents: (limit,offset=0) => request(`/events/archived${limit?`?limit=${limit}&offset=${offset}`:''}`),
  archiveEvent: id => request(`/events/${id}/archive`,{method:'POST'}), unarchiveEvent: id => request(`/events/${id}/unarchive`,{method:'POST'}),
  shareEvent: (id,expiresInDays,password) => request(`/events/${id}/share?${expiresInDays?`expires_in_days=${expiresInDays}&`:''}${password?`password=${encodeURIComponent(password)}`:''}`,{method:'POST'}), unshareEvent: id => request(`/events/${id}/share`,{method:'DELETE'}),
  publicEvent: (token,password) => request(`/public/events/${token}${password?`?password=${encodeURIComponent(password)}`:''}`, { suppressAuthEvent: true }),
  createLog: data => request('/work_logs',json('POST',data)), updateLog: (id,data) => request(`/work_logs/${id}`,json('PATCH',data)), deleteLog: id => request(`/work_logs/${id}`,{method:'DELETE'}),
  workLogs: () => request('/work_logs'),
  archivedLogs: (limit,offset=0) => request(`/work_logs/archived${limit?`?limit=${limit}&offset=${offset}`:''}`),
  archiveLog: id => request(`/work_logs/${id}/archive`,{method:'POST'}), unarchiveLog: id => request(`/work_logs/${id}/unarchive`,{method:'POST'}),
  shareLog: (id,expiresInDays,password) => request(`/work_logs/${id}/share?${expiresInDays?`expires_in_days=${expiresInDays}&`:''}${password?`password=${encodeURIComponent(password)}`:''}`,{method:'POST'}), unshareLog: id => request(`/work_logs/${id}/share`,{method:'DELETE'}),
  publicWorkLog: (token,password) => request(`/public/work_logs/${token}${password?`?password=${encodeURIComponent(password)}`:''}`, { suppressAuthEvent: true }),
  todos: () => request('/todos'),
  createTodo: data => request('/todos',json('POST',data)), updateTodo: (id,data) => request(`/todos/${id}`,json('PATCH',data)), deleteTodo: id => request(`/todos/${id}`,{method:'DELETE'}),
  skipTodoRecurrence: id => request(`/todos/${id}/skip-recurrence`,{method:'POST'}),
  todoSeries: id => request(`/todos/${id}/series`),
  updateTodoSeries: (groupId,fromTodoDate,data) => request(`/todos/series/${groupId}?from_todo_date=${encodeURIComponent(fromTodoDate)}`,json('PATCH',data)),
  deleteTodoSeries: (groupId,fromTodoDate) => request(`/todos/series/${groupId}?from_todo_date=${encodeURIComponent(fromTodoDate)}`,{method:'DELETE'}),
  archivedTodos: (limit,offset=0) => request(`/todos/archived${limit?`?limit=${limit}&offset=${offset}`:''}`),
  archiveTodo: id => request(`/todos/${id}/archive`,{method:'POST'}), unarchiveTodo: id => request(`/todos/${id}/unarchive`,{method:'POST'}),
  shareTodo: (id,expiresInDays,password) => request(`/todos/${id}/share?${expiresInDays?`expires_in_days=${expiresInDays}&`:''}${password?`password=${encodeURIComponent(password)}`:''}`,{method:'POST'}), unshareTodo: id => request(`/todos/${id}/share`,{method:'DELETE'}),
  publicTodo: (token,password) => request(`/public/todos/${token}${password?`?password=${encodeURIComponent(password)}`:''}`, { suppressAuthEvent: true }),
  aiPreview: text => request('/ai/parse',json('POST',{text})), aiApply: data => request('/ai/apply',json('POST',data)), aiRecommendations: (limit=5) => request(`/ai/recommendations?limit=${limit}`), aiStatus: () => request('/ai/status'),
  aiSettings: provider => request(`/settings/ai${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`), saveAiSettings: data => request('/settings/ai',json('PUT',data)),
  testAiSettings: () => request('/settings/ai/test',json('POST',{})),
  workflowSettings: () => request('/settings/workflow'), saveWorkflowSettings: data => request('/settings/workflow',json('PUT',data)),
  calendarFeedStatus: () => request('/settings/calendar-feed'), rotateCalendarFeed: () => request('/settings/calendar-feed/rotate',{method:'POST'}), disableCalendarFeed: () => request('/settings/calendar-feed',{method:'DELETE'}),
  integrations: () => request('/settings/integrations'), googleStatus: () => request('/google/status'), googleCalendars: () => request('/google/calendars'), selectGoogleCalendar: calendar_id => request('/google/select',json('POST',{calendar_id})), syncGoogleCalendar: () => request('/google/sync',{method:'POST'}),
  exportData: () => request('/export'),
  importPreview: data => request('/import/preview',json('POST',data)),
  importData: (mode,data) => request('/import',json('POST',{mode,data})),
  wipeData: confirm => request('/data/wipe',json('POST',{confirm})),
  tags: () => request('/tags'),
  renameTag: (from,to) => request('/tags/rename',json('POST',{from,to})),
  setTagColor: (tag,color) => request('/tags/color',json('PUT',{tag,color})),
  auditLogs: (limit=100, start='', end='', offset=0) => request(`/audit-logs?limit=${limit}&offset=${offset}${start?`&start=${start}`:''}${end?`&end=${end}`:''}`),
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
  publicChangelogSummary: groups => request('/public/changelog-summary', { ...json('POST',{groups}), suppressAuthEvent: true }),
  createFeatureRequest: content => request('/feature-requests',json('POST',{content,source:'changelog'})),
  updateFeatureRequest: (id,status) => request(`/feature-requests/${id}`,json('PATCH',{status})),
  taskComments: id => request(`/tasks/${id}/comments`),
  addTaskComment: (id,body) => request(`/tasks/${id}/comments`,json('POST',{body})),
  updateTaskComment: (id,commentId,body) => request(`/tasks/${id}/comments/${commentId}`,json('PATCH',{body})),
  deleteTaskComment: (id,commentId) => request(`/tasks/${id}/comments/${commentId}`,{method:'DELETE'}),
  taskAttachments: id => request(`/tasks/${id}/attachments`),
  uploadTaskAttachment: (id,file) => { const body = new FormData(); body.append('file', file); return request(`/tasks/${id}/attachments`,{method:'POST',body}) },
  deleteTaskAttachment: (id,attachmentId) => request(`/tasks/${id}/attachments/${attachmentId}`,{method:'DELETE'}),
  taskAttachmentDownloadUrl: (id,attachmentId) => `${API}/tasks/${id}/attachments/${attachmentId}/download`,
  eventAttachments: id => request(`/events/${id}/attachments`),
  uploadEventAttachment: (id,file) => { const body = new FormData(); body.append('file', file); return request(`/events/${id}/attachments`,{method:'POST',body}) },
  deleteEventAttachment: (id,attachmentId) => request(`/events/${id}/attachments/${attachmentId}`,{method:'DELETE'}),
  eventAttachmentDownloadUrl: (id,attachmentId) => `${API}/events/${id}/attachments/${attachmentId}/download`,
  todoAttachments: id => request(`/todos/${id}/attachments`),
  uploadTodoAttachment: (id,file) => { const body = new FormData(); body.append('file', file); return request(`/todos/${id}/attachments`,{method:'POST',body}) },
  deleteTodoAttachment: (id,attachmentId) => request(`/todos/${id}/attachments/${attachmentId}`,{method:'DELETE'}),
  todoAttachmentDownloadUrl: (id,attachmentId) => `${API}/todos/${id}/attachments/${attachmentId}/download`,
  workLogAttachments: id => request(`/work_logs/${id}/attachments`),
  uploadWorkLogAttachment: (id,file) => { const body = new FormData(); body.append('file', file); return request(`/work_logs/${id}/attachments`,{method:'POST',body}) },
  deleteWorkLogAttachment: (id,attachmentId) => request(`/work_logs/${id}/attachments/${attachmentId}`,{method:'DELETE'}),
  workLogAttachmentDownloadUrl: (id,attachmentId) => `${API}/work_logs/${id}/attachments/${attachmentId}/download`,
  eventComments: id => request(`/events/${id}/comments`),
  addEventComment: (id,body) => request(`/events/${id}/comments`,json('POST',{body})),
  updateEventComment: (id,commentId,body) => request(`/events/${id}/comments/${commentId}`,json('PATCH',{body})),
  deleteEventComment: (id,commentId) => request(`/events/${id}/comments/${commentId}`,{method:'DELETE'}),
  todoComments: id => request(`/todos/${id}/comments`),
  addTodoComment: (id,body) => request(`/todos/${id}/comments`,json('POST',{body})),
  updateTodoComment: (id,commentId,body) => request(`/todos/${id}/comments/${commentId}`,json('PATCH',{body})),
  deleteTodoComment: (id,commentId) => request(`/todos/${id}/comments/${commentId}`,{method:'DELETE'}),
  workLogComments: id => request(`/work_logs/${id}/comments`),
  addWorkLogComment: (id,body) => request(`/work_logs/${id}/comments`,json('POST',{body})),
  updateWorkLogComment: (id,commentId,body) => request(`/work_logs/${id}/comments/${commentId}`,json('PATCH',{body})),
  deleteWorkLogComment: (id,commentId) => request(`/work_logs/${id}/comments/${commentId}`,{method:'DELETE'}),
}
