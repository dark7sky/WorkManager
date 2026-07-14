const STORAGE_KEY = 'wm-todo-templates'
const NAME_LIMIT = 100
const TITLE_LIMIT = 300
const TAG_LIMIT = 50

export const loadTodoTemplates = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveTodoTemplates = (templates, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export const buildTodoTemplate = ({ name, title, priority, recurrence_rule, tags }) => ({
  id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  title: String(title || '').trim().slice(0, TITLE_LIMIT),
  priority: priority || 'normal',
  recurrence_rule: recurrence_rule || '',
  tags: (Array.isArray(tags) ? tags : []).slice(0, TAG_LIMIT),
})

export const addTodoTemplate = (templates, template) => {
  if (!template.name || !template.title) return templates
  return [...templates, template]
}

export const removeTodoTemplate = (templates, id) => templates.filter(t => t.id !== id)

export const applyTodoTemplate = template => ({
  title: template.title,
  priority: template.priority,
  recurrence_rule: template.recurrence_rule,
  tags: template.tags,
})
