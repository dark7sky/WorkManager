const STORAGE_KEY = 'wm-log-templates'
const NAME_LIMIT = 100
const CONTENT_LIMIT = 500
const TAG_LIMIT = 50

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const loadLogTemplates = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveLogTemplates = (templates, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export const buildLogTemplate = ({ name, content, tags, color, duration_minutes, estimated_minutes, priority, link_url, links, custom_fields }) => ({
  id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  content: String(content || '').trim().slice(0, CONTENT_LIMIT),
  tags: (Array.isArray(tags) ? tags : []).slice(0, TAG_LIMIT),
  color: color || '',
  duration_minutes: duration_minutes || '',
  estimated_minutes: estimated_minutes || '',
  priority: priority || 'normal',
  link_url: String(link_url || '').trim().slice(0, 2000),
  links: (Array.isArray(links) ? links : []).slice(0, 50),
  custom_fields: (Array.isArray(custom_fields) ? custom_fields : [])
    .filter(i => i && String(i.label || '').trim())
    .slice(0, 50)
    .map(i => ({ id: genId(), label: String(i.label).trim().slice(0, 100), value: String(i.value || '').trim().slice(0, 500) })),
})

export const addLogTemplate = (templates, template) => {
  if (!template.name || !template.content) return templates
  return [...templates, template]
}

export const removeLogTemplate = (templates, id) => templates.filter(t => t.id !== id)

export const applyLogTemplate = template => ({
  content: template.content,
  tags: template.tags,
  color: template.color,
  duration_minutes: template.duration_minutes,
  estimated_minutes: template.estimated_minutes || '',
  priority: template.priority || 'normal',
  link_url: template.link_url || '',
  links: (Array.isArray(template.links) ? template.links : []).map(i => ({ ...i, id: genId() })),
  custom_fields: (Array.isArray(template.custom_fields) ? template.custom_fields : []).map(i => ({ ...i, id: genId() })),
})
