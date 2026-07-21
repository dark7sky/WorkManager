const STORAGE_KEY = 'wm-comment-last-viewed'

export const loadCommentLastViewed = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export const saveCommentLastViewed = (map, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(map))
}

const key = (entity, id) => `${entity}:${id}`

export const markCommentsViewed = (map, entity, id, viewedAt = new Date().toISOString()) => ({
  ...map, [key(entity, id)]: viewedAt,
})

export const hasUnseenComments = (item, entity, map) => {
  if (!item?.latest_comment_at) return false
  const lastViewed = map[key(entity, item.id)]
  return !lastViewed || item.latest_comment_at > lastViewed
}
