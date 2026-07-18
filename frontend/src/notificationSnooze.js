export const SNOOZE_MINUTES = 10
export const snoozeStorageKey = tag => `${tag}-snooze-until`

export const isSnoozed = (tag, now, storage = localStorage) => {
  const until = Number(storage.getItem(snoozeStorageKey(tag)))
  return Number.isFinite(until) && until > 0 && now < until
}

export const snoozeAlert = (tag, now = Date.now(), storage = localStorage, minutes = SNOOZE_MINUTES) => {
  storage.removeItem(tag)
  storage.setItem(snoozeStorageKey(tag), String(now + minutes * 60 * 1000))
}

export const clearSnooze = (tag, storage = localStorage) => storage.removeItem(snoozeStorageKey(tag))
