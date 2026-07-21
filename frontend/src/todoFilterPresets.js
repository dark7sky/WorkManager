const STORAGE_KEY = 'wm-todo-filter-presets'
const NAME_LIMIT = 100

export const todoDeepLink = (origin, pathname, todoId) => `${origin}${pathname}?page=today&todoId=${todoId}`

export const loadTodoFilterPresets = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveTodoFilterPresets = (presets, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export const buildTodoFilterPreset = ({ name, query, selectedTags, priority }) => ({
  id: `tflt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  query: String(query || ''),
  selectedTags: Array.isArray(selectedTags) ? selectedTags : [],
  priority: priority || 'all',
})

export const addTodoFilterPreset = (presets, preset) => {
  if (!preset.name) return presets
  return [...presets.filter(p => p.name !== preset.name), preset]
}

export const removeTodoFilterPreset = (presets, id) => presets.filter(p => p.id !== id)
