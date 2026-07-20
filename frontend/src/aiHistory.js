const STORAGE_KEY = 'wm-ai-history'
const TEXT_LIMIT = 500
const HISTORY_LIMIT = 8

export const loadAiHistory = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const saveAiHistory = (history, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export const addAiHistoryEntry = (history, text) => {
  const trimmed = String(text || '').trim().slice(0, TEXT_LIMIT)
  if (!trimmed) return history
  return [trimmed, ...history.filter(item => item !== trimmed)].slice(0, HISTORY_LIMIT)
}

export const removeAiHistoryEntry = (history, text) => history.filter(item => item !== text)
