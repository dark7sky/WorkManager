export const EVENT_COLORS = [
  { value: '', label: '기본' },
  { value: 'red', label: '빨강', hex: '#e5484d' },
  { value: 'orange', label: '주황', hex: '#e69138' },
  { value: 'yellow', label: '노랑', hex: '#d4a017' },
  { value: 'green', label: '초록', hex: '#2f9e44' },
  { value: 'purple', label: '보라', hex: '#8e44ad' },
  { value: 'gray', label: '회색', hex: '#6b7280' },
]

export function eventColorHex(color) {
  return EVENT_COLORS.find(c => c.value === color)?.hex || null
}
