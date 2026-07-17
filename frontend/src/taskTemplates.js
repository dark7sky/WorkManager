const STORAGE_KEY = 'wm-task-templates'
const NAME_LIMIT = 100
const TITLE_LIMIT = 300
const TAG_LIMIT = 50
const CHECKLIST_LIMIT = 50
const CHECKLIST_TEXT_LIMIT = 300

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const loadTaskTemplates = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveTaskTemplates = (templates, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export const buildTaskTemplate = ({ name, title, priority, recurrence_rule, tags, durationDays, checklist }) => ({
  id: `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  name: String(name || '').trim().slice(0, NAME_LIMIT),
  title: String(title || '').trim().slice(0, TITLE_LIMIT),
  priority: priority || 'normal',
  recurrence_rule: recurrence_rule || '',
  tags: (Array.isArray(tags) ? tags : []).slice(0, TAG_LIMIT),
  durationDays: Number.isFinite(Number(durationDays)) && Number(durationDays) > 0 ? Math.round(Number(durationDays)) : 0,
  checklist: (Array.isArray(checklist) ? checklist : [])
    .filter(i => i && String(i.text || '').trim())
    .slice(0, CHECKLIST_LIMIT)
    .map(i => ({ id: genId(), text: String(i.text).trim().slice(0, CHECKLIST_TEXT_LIMIT), done: false })),
})

export const addTaskTemplate = (templates, template) => {
  if (!template.name || !template.title) return templates
  return [...templates, template]
}

export const removeTaskTemplate = (templates, id) => templates.filter(t => t.id !== id)

const addDays = (dateStr, days) => {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

export const applyTaskTemplate = (template, today) => ({
  title: template.title,
  priority: template.priority,
  recurrence_rule: template.recurrence_rule,
  tags: template.tags,
  start_date: today,
  due_date: template.durationDays > 0 ? addDays(today, template.durationDays) : today,
  checklist: (Array.isArray(template.checklist) ? template.checklist : []).map(i => ({ id: genId(), text: i.text, done: false })),
})

export const durationDaysBetween = (startDate, dueDate) => {
  if (!startDate || !dueDate) return 0
  const start = new Date(`${startDate}T00:00:00`)
  const due = new Date(`${dueDate}T00:00:00`)
  const days = Math.round((due - start) / 86400000)
  return days > 0 ? days : 0
}
