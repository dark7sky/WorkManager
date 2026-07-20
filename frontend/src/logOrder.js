const STORAGE_KEY = 'wm-log-manual-order'

export const loadLogManualOrder = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export const saveLogManualOrder = (order, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(order))
}

export const applyManualOrder = (logs, order) =>
  [...logs].sort((a, b) => (order[a.id] ?? Number.MAX_SAFE_INTEGER) - (order[b.id] ?? Number.MAX_SAFE_INTEGER))

export const moveLogBefore = (shownIds, order, draggedId, targetId) => {
  if (draggedId === targetId) return order
  const currentOrder = applyManualOrder(shownIds.map(id => ({ id })), order).map(l => l.id)
  const from = currentOrder.indexOf(draggedId), to = currentOrder.indexOf(targetId)
  if (from === -1 || to === -1) return order
  currentOrder.splice(to, 0, currentOrder.splice(from, 1)[0])
  const next = { ...order }
  currentOrder.forEach((id, index) => { next[id] = index })
  return next
}
