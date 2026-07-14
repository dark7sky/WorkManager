const STORAGE_KEY = 'wm-event-templates'
const NAME_LIMIT = 100
const TITLE_LIMIT = 300
const TAG_LIMIT = 50

export const loadEventTemplates = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveEventTemplates = (templates, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export const buildEventTemplate = ({ name, title, location, color, tags }) => ({
  id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  title: String(title || '').trim().slice(0, TITLE_LIMIT),
  location: String(location || '').trim().slice(0, TITLE_LIMIT),
  color: color || '',
  tags: (Array.isArray(tags) ? tags : []).slice(0, TAG_LIMIT),
})

export const addEventTemplate = (templates, template) => {
  if (!template.name || !template.title) return templates
  return [...templates, template]
}

export const removeEventTemplate = (templates, id) => templates.filter(t => t.id !== id)

export const applyEventTemplate = template => ({
  title: template.title,
  location: template.location,
  color: template.color,
  tags: template.tags,
})
