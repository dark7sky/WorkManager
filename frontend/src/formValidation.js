export function validateTaskForm(data) {
  const errors = {}
  if (!String(data.title || '').trim()) errors.title = '업무 제목을 입력하세요.'
  if (data.start_date && data.due_date && data.due_date < data.start_date) {
    errors.due_date = '완료 예정일은 시작일보다 빠를 수 없습니다.'
  }
  return errors
}
