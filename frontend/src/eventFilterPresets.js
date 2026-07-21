const STORAGE_KEY = 'wm-event-filter-presets'
const NAME_LIMIT = 100

export const eventDeepLink = (origin, pathname, eventId) => `${origin}${pathname}?page=calendar&eventId=${eventId}`

export const loadEventFilterPresets = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveEventFilterPresets = (presets, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export const buildEventFilterPreset = ({ name, query, selectedTags, priority }) => ({
  id: `eflt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  query: String(query || ''),
  selectedTags: Array.isArray(selectedTags) ? selectedTags : [],
  priority: priority || 'all',
})

export const addEventFilterPreset = (presets, preset) => {
  if (!preset.name) return presets
  return [...presets.filter(p => p.name !== preset.name), preset]
}

export const removeEventFilterPreset = (presets, id) => presets.filter(p => p.id !== id)
