export const featureRequestStatuses = [
  { value: 'pending', label: '대기' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'done', label: '완료' },
  { value: 'dismissed', label: '보류' },
]

export const featureRequestStatusLabel = Object.fromEntries(featureRequestStatuses.map(item => [item.value, item.label]))

export const countPendingFeatureRequests = requests => requests.filter(item => item.status === 'pending').length

export const replaceFeatureRequestStatus = (requests, updated) =>
  requests.map(item => item.id === updated.id ? { ...item, ...updated } : item)

export const OWN_FEATURE_REQUEST_LIMIT = 200

export const addOwnFeatureRequestId = (ids, id) =>
  ids.includes(id) ? ids : [...ids, id].slice(-OWN_FEATURE_REQUEST_LIMIT)

export const isOwnFeatureRequestId = (ids, id) => ids.includes(id)
