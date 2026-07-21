export function validateTaskForm(data) {
  const errors = {}
  if (!String(data.title || '').trim()) errors.title = '업무 제목을 입력하세요.'
  else if (String(data.title).length > 300) errors.title = '업무 제목은 300자를 넘을 수 없습니다.'
  if (data.start_date && data.due_date && data.due_date < data.start_date) {
    errors.due_date = '완료 예정일은 시작일보다 빠를 수 없습니다.'
  }
  const baseDate = data.due_date || data.start_date
  if (data.recurrence_rule && data.recurrence_end_date && baseDate && data.recurrence_end_date < baseDate) {
    errors.recurrence_end_date = '반복 종료일은 시작일/완료 예정일보다 빠를 수 없습니다.'
  }
  return errors
}

export function validateEventForm(data) {
  const errors = {}
  if (!String(data.title || '').trim()) errors.title = '일정 제목을 입력하세요.'
  else if (String(data.title).length > 300) errors.title = '일정 제목은 300자를 넘을 수 없습니다.'
  if (data.start_at && data.end_at && new Date(data.end_at) <= new Date(data.start_at)) {
    errors.end_at = '종료 시간은 시작 시간보다 늦어야 합니다.'
  }
  return errors
}

export function validateTodoForm(data) {
  const errors = {}
  if (!String(data.title || '').trim()) errors.title = 'Todo 내용을 입력하세요.'
  else if (String(data.title).length > 500) errors.title = 'Todo 내용은 500자를 넘을 수 없습니다.'
  if (data.recurrence_rule && data.recurrence_end_date && data.todo_date && data.recurrence_end_date < data.todo_date) {
    errors.recurrence_end_date = '반복 종료일은 날짜보다 빠를 수 없습니다.'
  }
  return errors
}

export function validateLogForm(data) {
  const errors = {}
  if (!String(data.content || '').trim()) errors.content = '업무 기록 내용을 입력하세요.'
  else if (String(data.content).length > 20000) errors.content = '업무 기록 내용은 20000자를 넘을 수 없습니다.'
  return errors
}
