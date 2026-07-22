export const isShareActive = (item, nowMs = Date.now()) => {
  if (!item?.public_token) return false
  if (!item.public_token_expires_at) return true
  return new Date(item.public_token_expires_at).getTime() > nowMs
}
