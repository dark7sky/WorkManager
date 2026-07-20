const TARGETS = [
  ['tasks', 'tasks', '업무'],
  ['events', 'calendar', '일정'],
  ['todos', 'today', '할 일'],
  ['work_logs', 'today', '업무 기록'],
]

export function pickTagTarget(tables = {}) {
  let best = TARGETS[0]
  for (const entry of TARGETS) if ((tables[entry[0]] || 0) > (tables[best[0]] || 0)) best = entry
  return { page: best[1], label: best[2] }
}
