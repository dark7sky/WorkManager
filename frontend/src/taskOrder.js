const STORAGE_KEY = 'wm-task-manual-order'

export const loadTaskManualOrder = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export const saveTaskManualOrder = (order, storage = localStorage) => {
  storage.setItem(STORAGE_KEY, JSON.stringify(order))
}

export const applyManualOrder = (ids, order) =>
  [...ids].sort((a, b) => (order[a] ?? Number.MAX_SAFE_INTEGER) - (order[b] ?? Number.MAX_SAFE_INTEGER))

export const moveTaskBefore = (siblingIds, order, draggedId, targetId) => {
  if (draggedId === targetId) return order
  const currentOrder = applyManualOrder(siblingIds, order)
  const from = currentOrder.indexOf(draggedId), to = currentOrder.indexOf(targetId)
  if (from === -1 || to === -1) return order
  currentOrder.splice(to, 0, currentOrder.splice(from, 1)[0])
  const next = { ...order }
  currentOrder.forEach((id, index) => { next[id] = index })
  return next
}
