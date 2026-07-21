const STORAGE_KEY = 'wm-task-badge-visibility'

export const TASK_BADGE_OPTIONS = [
  { key: 'subtasks', label: '하위 업무' },
  { key: 'checklist', label: '체크리스트' },
  { key: 'estimate', label: '예상 소요시간' },
  { key: 'recurrence', label: '반복' },
  { key: 'links', label: '관련 링크' },
  { key: 'customFields', label: '사용자 정의 필드' },
  { key: 'comments', label: '댓글' },
  { key: 'attachments', label: '첨부파일' },
  { key: 'blocked', label: '선행 업무 대기' },
  { key: 'dependents', label: '후속 업무 영향' },
  { key: 'criticalPath', label: '핵심 경로' },
]

const ALL_KEYS = TASK_BADGE_OPTIONS.map(o => o.key)

export const loadTaskBadgeVisibility = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return new Set(ALL_KEYS)
    return new Set(ALL_KEYS.filter(k => parsed[k] !== false))
  } catch {
    return new Set(ALL_KEYS)
  }
}

export const saveTaskBadgeVisibility = (visibleKeys, storage = localStorage) => {
  const value = Object.fromEntries(ALL_KEYS.map(k => [k, visibleKeys.has(k)]))
  storage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export const toggleTaskBadgeVisibility = (visibleKeys, key) => {
  const next = new Set(visibleKeys)
  next.has(key) ? next.delete(key) : next.add(key)
  return next
}
