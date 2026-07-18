const STORAGE_KEY = 'wm-log-filter-presets'
const NAME_LIMIT = 100

export const loadLogFilterPresets = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveLogFilterPresets = (presets, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export const buildLogFilterPreset = ({ name, query, selectedTags, billable, priority }) => ({
  id: `lflt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  query: String(query || ''),
  selectedTags: Array.isArray(selectedTags) ? selectedTags : [],
  billable: billable || 'all',
  priority: priority || 'all',
})

export const addLogFilterPreset = (presets, preset) => {
  if (!preset.name) return presets
  return [...presets.filter(p => p.name !== preset.name), preset]
}

export const removeLogFilterPreset = (presets, id) => presets.filter(p => p.id !== id)
