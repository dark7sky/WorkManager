const STORAGE_KEY = 'wm-event-badge-visibility'

export const EVENT_BADGE_OPTIONS = [
  { key: 'links', label: '관련 링크' },
  { key: 'customFields', label: '사용자 정의 필드' },
  { key: 'checklist', label: '체크리스트' },
  { key: 'estimate', label: '예상 소요시간' },
  { key: 'comments', label: '댓글' },
  { key: 'attachments', label: '첨부파일' },
  { key: 'shareLink', label: '공유 링크' },
]

const ALL_KEYS = EVENT_BADGE_OPTIONS.map(o => o.key)

export const loadEventBadgeVisibility = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return new Set(ALL_KEYS)
    return new Set(ALL_KEYS.filter(k => parsed[k] !== false))
  } catch {
    return new Set(ALL_KEYS)
  }
}

export const saveEventBadgeVisibility = (visibleKeys, storage = localStorage) => {
  const value = Object.fromEntries(ALL_KEYS.map(k => [k, visibleKeys.has(k)]))
  storage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export const toggleEventBadgeVisibility = (visibleKeys, key) => {
  const next = new Set(visibleKeys)
  next.has(key) ? next.delete(key) : next.add(key)
  return next
}
