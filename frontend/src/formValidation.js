export function validateTaskForm(data) {
  const errors = {}
  if (!String(data.title || '').trim()) errors.title = '업무 제목을 입력하세요.'
  if (data.start_date && data.due_date && data.due_date < data.start_date) {
    errors.due_date = '완료 예정일은 시작일보다 빠를 수 없습니다.'
  }
  return errors
}

export function validateEventForm(data) {
  const errors = {}
  if (!String(data.title || '').trim()) errors.title = '일정 제목을 입력하세요.'
  if (data.start_at && data.end_at && new Date(data.end_at) <= new Date(data.start_at)) {
    errors.end_at = '종료 시간은 시작 시간보다 늦어야 합니다.'
  }
  return errors
}
