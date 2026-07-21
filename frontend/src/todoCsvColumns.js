import { todoHeaders } from './csv.js'

const STORAGE_KEY = 'wm-todo-csv-columns'

export const TODO_CSV_COLUMN_OPTIONS = todoHeaders.map((label, index) => ({ index, label }))

const ALL_INDICES = TODO_CSV_COLUMN_OPTIONS.map(o => o.index)

export const loadTodoCsvColumns = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null')
    if (!Array.isArray(parsed)) return new Set(ALL_INDICES)
    const kept = parsed.filter(i => ALL_INDICES.includes(i))
    return kept.length ? new Set(kept) : new Set(ALL_INDICES)
  } catch {
    return new Set(ALL_INDICES)
  }
}

export const saveTodoCsvColumns = (selectedIndices, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...selectedIndices]))
}

export const toggleTodoCsvColumn = (selectedIndices, index) => {
  const next = new Set(selectedIndices)
  next.has(index) ? next.delete(index) : next.add(index)
  return next
}
