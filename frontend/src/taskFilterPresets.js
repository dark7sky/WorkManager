const STORAGE_KEY = 'wm-task-filter-presets'
const NAME_LIMIT = 100

export const loadFilterPresets = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveFilterPresets = (presets, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export const buildFilterPreset = ({ name, query, status, selectedTags, priority }) => ({
  id: `flt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  query: String(query || ''),
  status: status || 'active',
  selectedTags: Array.isArray(selectedTags) ? selectedTags : [],
  priority: priority || 'all',
})

export const addFilterPreset = (presets, preset) => {
  if (!preset.name) return presets
  return [...presets.filter(p => p.name !== preset.name), preset]
}

export const removeFilterPreset = (presets, id) => presets.filter(p => p.id !== id)
