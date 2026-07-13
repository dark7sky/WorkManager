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
  const state = { startedAt: new Date().toISOString(), taskId: taskId || null }
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
  return state
}

export const clearWorkLogTimer = (storage = localStorage) => {
  storage.removeItem(STORAGE_KEY)
}

export const elapsedMinutes = (startedAt, now = new Date()) => {
  const start = new Date(startedAt)
  if (Number.isNaN(start.getTime())) return 0
  const diffMs = new Date(now).getTime() - start.getTime()
  return Math.max(0, Math.round(diffMs / 60000))
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
