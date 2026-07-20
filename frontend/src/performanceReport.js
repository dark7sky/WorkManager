const REPORT_PRESETS_KEY = 'workmanager.reportPresets'
const PERFORMANCE_GOAL_KEY = 'workmanager.performanceGoal'

const isoDay = date => date.toLocaleDateString('en-CA')

export const presetRange = (preset, today = new Date()) => {
  const end = new Date(today), start = new Date(end)
  if (preset === 'month') start.setDate(1)
  else if (preset === 'quarter') start.setMonth(Math.floor(end.getMonth() / 3) * 3, 1)
  else if (preset === 'lastweek') { const dow = end.getDay() || 7; end.setDate(end.getDate() - dow); start.setTime(end.getTime()); start.setDate(end.getDate() - 6) }
  else start.setMonth(0, 1)
  return [isoDay(start), isoDay(end)]
}

export const formatDuration = minutes => {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60), m = total % 60
  if (!total) return '0분'
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ')
}

export const dailyActivityTrend = (timeline, start, end) => {
  if (!start || !end || start > end) return []
  const cursor = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  const dayCount = Math.round((last - cursor) / 86400000) + 1
  if (dayCount > 62) return []
  const counts = {}
  ;(timeline || []).forEach(item => { if (item?.date) counts[item.date] = (counts[item.date] || 0) + 1 })
  const days = []
  while (cursor <= last) {
    const date = isoDay(cursor)
    days.push({ date, count: counts[date] || 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export const previousPeriodRange = (start, end) => {
  if (!start || !end || start > end) return [null, null]
  const s = new Date(`${start}T00:00:00`), e = new Date(`${end}T00:00:00`)
  const dayCount = Math.round((e - s) / 86400000) + 1
  const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - dayCount + 1)
  return [isoDay(prevStart), isoDay(prevEnd)]
}

export const periodComparison = (current, previous) => {
  const metrics = [['completed_tasks', 'taskDelta'], ['tracked_minutes', 'minutesDelta'], ['completed_todos', 'todoDelta'], ['events', 'eventsDelta']]
  const result = {}
  metrics.forEach(([key, out]) => {
    const cur = Number(current?.[key]) || 0, prev = Number(previous?.[key]) || 0
    const percent = prev ? Math.round((cur - prev) / prev * 100) : (cur ? 100 : 0)
    result[out] = { current: cur, previous: prev, diff: cur - prev, percent }
  })
  return result
}

export const activityStreak = (days, todayIso = isoDay(new Date())) => {
  if (!days || !days.length) return { current: 0, best: 0 }
  let best = 0, run = 0
  days.forEach(d => { run = d.count > 0 ? run + 1 : 0; best = Math.max(best, run) })
  let current = 0
  if (days[days.length - 1].date === todayIso) {
    for (let i = days.length - 1; i >= 0 && days[i].count > 0; i--) current++
  }
  return { current, best }
}

export const performanceReportMarkdown = (data, { start, end, tags = [], summary = null, generatedAt }) => {
  const stats = data?.summary || {}
  const items = data?.timeline || []

  const lines = [
    '# WorkManager 성과 보고서',
    '',
    `기간: ${start} ~ ${end}${tags.length ? ` · 태그: ${tags.map(t => `#${t}`).join(' ')}` : ''}`,
    '',
    '## 요약',
    `- 완료 업무: ${stats.completed_tasks || 0}`,
    `- 업무 기록: ${stats.work_logs || 0}`,
    `- 기록된 소요 시간: ${formatDuration(stats.tracked_minutes)}`,
    `- 청구 가능 시간: ${formatDuration(stats.billable_minutes)}`,
    ...(stats.billable_amount != null ? [`- 청구 예상 금액: ${Math.round(stats.billable_amount).toLocaleString('ko-KR')}원`] : []),
    `- 완료 업무 예상 소요 시간: ${formatDuration(stats.estimated_minutes)}`,
    `- 일정: ${stats.events || 0}`,
    `- 진행 중 업무: ${stats.active_tasks || 0}`,
    `- 완료한 오늘 할 일: ${stats.completed_todos || 0}`,
  ]

  const tagBreakdown = data?.tag_breakdown || []
  if (tagBreakdown.length) {
    lines.push('')
    lines.push('## 태그별 소요 시간')
    tagBreakdown.forEach(t => lines.push(`- ${t.tag}: ${formatDuration(t.tracked_minutes)} · 완료 ${t.completed_tasks}건`))
  }

  if (summary && (summary.headline || summary.narrative)) {
    lines.push('')
    lines.push('## AI 요약')
    if (summary.headline) lines.push(`**${summary.headline}**`)
    if (summary.narrative) lines.push(`${summary.narrative}`)
  }

  lines.push('')
  lines.push('## 활동 타임라인')

  if (items.length === 0) {
    lines.push('활동이 없습니다.')
  } else {
    const grouped = {}
    items.forEach(item => {
      if (!grouped[item.date]) grouped[item.date] = []
      grouped[item.date].push(item)
    })

    Object.keys(grouped).sort().forEach(date => {
      lines.push(`### ${date}`)
      grouped[date].forEach(item => {
        const label = item.type_label || item.type || ''
        const title = item.title || item.content || ''
        const tagsStr = item.tags && item.tags.length ? ` ${item.tags.map(t => `#${t}`).join(' ')}` : ''
        lines.push(`- [${label}] ${title}${tagsStr}`)
      })
    })
  }

  lines.push('')
  lines.push(`생성: ${generatedAt}`)

  return lines.join('\n')
}

export const performanceReportFilename = (start, end) => `workmanager-report-${start}_${end}.md`

export const loadReportPresets = storage => {
  try {
    const data = storage.getItem(REPORT_PRESETS_KEY)
    if (!data) return []
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => item && typeof item === 'object' && item.name)
  } catch {
    return []
  }
}

export const saveReportPreset = (storage, presets, entry) => {
  const name = String(entry?.name ?? '').trim()
  if (!name) return presets

  const preset = entry.preset || 'custom'
  const start = entry.start || ''
  const end = entry.end || ''
  const tags = Array.isArray(entry.tags) ? entry.tags : []

  const newPresets = presets.filter(p => p.name !== name)
  newPresets.push({ name, preset, start, end, tags })

  storage.setItem(REPORT_PRESETS_KEY, JSON.stringify(newPresets))
  return newPresets
}

export const deleteReportPreset = (storage, presets, name) => {
  const newPresets = presets.filter(p => p.name !== name)
  storage.setItem(REPORT_PRESETS_KEY, JSON.stringify(newPresets))
  return newPresets
}

export const loadPerformanceGoal = storage => {
  const empty = { taskGoal: null, minutesGoal: null, todoGoal: null, eventGoal: null }
  try {
    const data = storage.getItem(PERFORMANCE_GOAL_KEY)
    if (!data) return empty
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object') return empty
    const clean = n => (Number.isFinite(n) && n > 0 ? n : null)
    return { taskGoal: clean(Number(parsed.taskGoal)), minutesGoal: clean(Number(parsed.minutesGoal)), todoGoal: clean(Number(parsed.todoGoal)), eventGoal: clean(Number(parsed.eventGoal)) }
  } catch {
    return empty
  }
}

export const savePerformanceGoal = (storage, goal) => {
  const clean = n => (Number.isFinite(n) && n > 0 ? n : null)
  const saved = { taskGoal: clean(Number(goal?.taskGoal)), minutesGoal: clean(Number(goal?.minutesGoal)), todoGoal: clean(Number(goal?.todoGoal)), eventGoal: clean(Number(goal?.eventGoal)) }
  storage.setItem(PERFORMANCE_GOAL_KEY, JSON.stringify(saved))
  return saved
}

export const goalProgress = (stats, goal) => {
  const pct = (value, target) => (target ? Math.min(100, Math.round((Number(value) || 0) / target * 100)) : null)
  return {
    taskPercent: pct(stats?.completed_tasks, goal?.taskGoal),
    minutesPercent: pct(stats?.tracked_minutes, goal?.minutesGoal),
    todoPercent: pct(stats?.completed_todos, goal?.todoGoal),
    eventsPercent: pct(stats?.events, goal?.eventGoal),
  }
}
