export const SCREEN_COMMANDS = [
  { id: 'today', label: '오늘', keywords: ['today', '오늘', '홈', 'home'] },
  { id: 'tasks', label: '업무', keywords: ['tasks', '업무', '간트', 'gantt'] },
  { id: 'calendar', label: '일정', keywords: ['calendar', '일정', '달력', '캘린더'] },
  { id: 'performance', label: '성과', keywords: ['performance', '성과', '보고서', '리포트'] },
  { id: 'ai', label: 'AI 도우미', keywords: ['ai', '도우미', '어시스턴트'] },
  { id: 'audit', label: '감사 로그', keywords: ['audit', '감사', '로그'] },
  { id: 'changelog', label: '변경 이력', keywords: ['changelog', '변경', '이력', '요청'] },
  { id: 'settings', label: '설정', keywords: ['settings', '설정', '환경'] },
]

const norm = value => String(value || '').trim().toLowerCase()

export function searchScreens(query) {
  const q = norm(query)
  if (!q) return []
  return SCREEN_COMMANDS.filter(screen =>
    screen.label.toLowerCase().includes(q) || screen.keywords.some(k => k.startsWith(q)))
}

const ITEM_SOURCES = [
  ['task', 'tasks', item => item.title, item => item.due_date ? `마감 ${item.due_date}` : item.status, 'tasks',
    item => `${item.description || ''} ${(item.checklist || []).map(c => c?.text || '').join(' ')}`],
  ['event', 'events', item => item.title, item => (item.start_at || '').slice(0, 16).replace('T', ' '), 'calendar',
    item => `${item.description || ''} ${(item.checklist || []).map(c => c?.text || '').join(' ')}`],
  ['todo', 'todos', item => item.title, item => item.todo_date, 'today',
    item => `${item.memo || ''} ${(item.checklist || []).map(c => c?.text || '').join(' ')}`],
  ['log', 'work_logs', item => item.content, item => item.log_date, 'today',
    item => (item.checklist || []).map(c => c?.text || '').join(' ')],
]

export function searchItems(query, data, limit = 8) {
  const q = norm(query)
  if (!q) return []
  const results = []
  for (const [type, key, getTitle, getDetail, page, getBody] of ITEM_SOURCES) {
    for (const item of data?.[key] || []) {
      const title = String(getTitle(item) || '')
      const tags = (item.tags || []).map(x => String(x).toLowerCase())
      const body = String((getBody ? getBody(item) : '') || '').toLowerCase()
      const haystack = title.toLowerCase()
      if (haystack.includes(q) || tags.some(t => t.includes(q)) || body.includes(q)) {
        results.push({ type, id: item.id, title, detail: getDetail(item) || '', page,
          rank: haystack.startsWith(q) ? 0 : haystack.includes(q) || tags.some(t => t.includes(q)) ? 1 : 2 })
      }
    }
  }
  return results.sort((a, b) => a.rank - b.rank).slice(0, limit)
}
