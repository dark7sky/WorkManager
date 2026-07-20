const STORAGE_KEY = 'wm-worklog-timer'

export const loadWorkLogTimer = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null')
    return parsed && typeof parsed.startedAt === 'string' ? parsed : null
  } catch {
    return null
  }
}

export const startWorkLogTimer = (taskId, storage = localStorage) => {
  const state = { startedAt: new Date().toISOString(), taskId: taskId || null, pausedAt: null, totalPausedMs: 0 }
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
  return state
}

export const clearWorkLogTimer = (storage = localStorage) => {
  storage.removeItem(STORAGE_KEY)
}

export const pauseWorkLogTimer = (storage = localStorage) => {
  const timer = loadWorkLogTimer(storage)
  if (!timer || timer.pausedAt) return timer
  const next = { ...timer, pausedAt: new Date().toISOString() }
  storage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const resumeWorkLogTimer = (storage = localStorage) => {
  const timer = loadWorkLogTimer(storage)
  if (!timer || !timer.pausedAt) return timer
  const pausedMs = Math.max(0, new Date().getTime() - new Date(timer.pausedAt).getTime())
  const next = { ...timer, pausedAt: null, totalPausedMs: (timer.totalPausedMs || 0) + pausedMs }
  storage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const timerElapsedMs = (timer, now = new Date()) => {
  const start = new Date(timer.startedAt)
  if (Number.isNaN(start.getTime())) return 0
  const end = timer.pausedAt ? new Date(timer.pausedAt) : new Date(now)
  return Math.max(0, end.getTime() - start.getTime() - (timer.totalPausedMs || 0))
}

export const timerElapsedMinutes = (timer, now = new Date()) => Math.round(timerElapsedMs(timer, now) / 60000)

export const formatTimerElapsed = (timer, now = new Date()) => {
  const totalSeconds = Math.floor(timerElapsedMs(timer, now) / 1000)
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export const elapsedMinutes = (startedAt, now = new Date()) => {
  const start = new Date(startedAt)
  if (Number.isNaN(start.getTime())) return 0
  const diffMs = new Date(now).getTime() - start.getTime()
  return Math.max(0, Math.round(diffMs / 60000))
}

export const startTimeString = (startedAt) => {
  const start = new Date(startedAt)
  if (Number.isNaN(start.getTime())) return ''
  const h = String(start.getHours()).padStart(2, '0')
  const m = String(start.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export const formatElapsed = (startedAt, now = new Date()) => {
  const start = new Date(startedAt)
  if (Number.isNaN(start.getTime())) return '00:00:00'
  const totalSeconds = Math.max(0, Math.floor((new Date(now).getTime() - start.getTime()) / 1000))
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}
