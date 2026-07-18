export function nextRowIndex(count, currentIndex, key) {
  if (!count || currentIndex < 0) return null
  if (key === 'ArrowDown') return currentIndex + 1 < count ? currentIndex + 1 : currentIndex
  if (key === 'ArrowUp') return currentIndex > 0 ? currentIndex - 1 : currentIndex
  return null
}
