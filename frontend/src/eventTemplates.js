const STORAGE_KEY = 'wm-event-templates'
const NAME_LIMIT = 100
const TITLE_LIMIT = 300
const TAG_LIMIT = 50
const CHECKLIST_LIMIT = 50
const CHECKLIST_TEXT_LIMIT = 300

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

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

export const buildEventTemplate = ({ name, title, location, color, tags, priority, checklist, estimated_minutes }) => ({
  id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  title: String(title || '').trim().slice(0, TITLE_LIMIT),
  location: String(location || '').trim().slice(0, TITLE_LIMIT),
  color: color || '',
  priority: priority || '',
  tags: (Array.isArray(tags) ? tags : []).slice(0, TAG_LIMIT),
  estimated_minutes: Number.isFinite(Number(estimated_minutes)) && Number(estimated_minutes) > 0 ? Math.round(Number(estimated_minutes)) : '',
  checklist: (Array.isArray(checklist) ? checklist : [])
    .filter(i => i && String(i.text || '').trim())
    .slice(0, CHECKLIST_LIMIT)
    .map(i => ({ id: genId(), text: String(i.text).trim().slice(0, CHECKLIST_TEXT_LIMIT), done: false })),
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
  priority: template.priority,
  tags: template.tags,
  estimated_minutes: template.estimated_minutes || '',
  checklist: (Array.isArray(template.checklist) ? template.checklist : []).map(i => ({ id: genId(), text: i.text, done: false })),
})
