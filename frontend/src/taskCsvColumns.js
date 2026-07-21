import { taskHeaders } from './csv.js'

const STORAGE_KEY = 'wm-task-csv-columns'

export const TASK_CSV_COLUMN_OPTIONS = taskHeaders.map((label, index) => ({ index, label }))

const ALL_INDICES = TASK_CSV_COLUMN_OPTIONS.map(o => o.index)

export const loadTaskCsvColumns = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null')
    if (!Array.isArray(parsed)) return new Set(ALL_INDICES)
    const kept = parsed.filter(i => ALL_INDICES.includes(i))
    return kept.length ? new Set(kept) : new Set(ALL_INDICES)
  } catch {
    return new Set(ALL_INDICES)
  }
}

export const saveTaskCsvColumns = (selectedIndices, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify([...selectedIndices]))
}

export const toggleTaskCsvColumn = (selectedIndices, index) => {
  const next = new Set(selectedIndices)
  next.has(index) ? next.delete(index) : next.add(index)
  return next
}
