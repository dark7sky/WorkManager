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

export const estimateVariancePercent = (trackedMinutes, estimatedMinutes) => {
  if (!(estimatedMinutes > 0)) return null
  return Math.round((trackedMinutes - estimatedMinutes) / estimatedMinutes * 100)
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

  const clientBreakdown = data?.client_breakdown || []
  if (clientBreakdown.length) {
    lines.push('')
    lines.push('## 고객별 소요 시간')
    clientBreakdown.forEach(c => lines.push(`- ${c.client_name}: ${formatDuration(c.tracked_minutes)}${c.billable_amount ? ` · 청구 ${Math.round(c.billable_amount).toLocaleString('ko-KR')}원` : ''}`))
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

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export const performanceReportToPrintableReport = (data, { start, end, tags = [], summary = null, generatedAt = new Date().toISOString(), title = 'WorkManager 성과 보고서' } = {}) => {
  const stats = data?.summary || {}
  const items = data?.timeline || []
  const tagBreakdown = data?.tag_breakdown || []
  const clientBreakdown = data?.client_breakdown || []

  const statRows = [
    ['완료 업무', stats.completed_tasks || 0],
    ['업무 기록', stats.work_logs || 0],
    ['기록된 소요 시간', formatDuration(stats.tracked_minutes)],
    ['청구 가능 시간', formatDuration(stats.billable_minutes)],
    ...(stats.billable_amount != null ? [['청구 예상 금액', `${Math.round(stats.billable_amount).toLocaleString('ko-KR')}원`]] : []),
    ['완료 업무 예상 소요 시간', formatDuration(stats.estimated_minutes)],
    ['일정', stats.events || 0],
    ['진행 중 업무', stats.active_tasks || 0],
    ['완료한 오늘 할 일', stats.completed_todos || 0],
  ]

  const timelineRows = items.map(item => `<tr>
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(item.type_label || item.type || '')}</td>
      <td><strong>${escapeHtml(item.title || item.content || '')}</strong></td>
      <td>${escapeHtml((item.tags || []).join(', '))}</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Segoe UI,Noto Sans KR,Arial,sans-serif;color:#202124;margin:32px}
    header{border-bottom:2px solid #202124;padding-bottom:16px;margin-bottom:20px}
    h1{font-size:24px;margin:0 0 8px}
    h2{font-size:16px;margin:24px 0 8px}
    p{margin:0;color:#5f6670}
    .stats{display:flex;flex-wrap:wrap;gap:16px;margin:18px 0}
    .stats div{min-width:140px}
    .stats strong{display:block;font-size:18px;color:#202124}
    .stats span{font-size:12px;color:#5f6670}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
    th,td{border:1px solid #dfe3e8;padding:8px;text-align:left;vertical-align:top}
    th{background:#f5f7fa}
    .summary-text{margin-top:6px;color:#202124;white-space:pre-wrap}
    @media print{body{margin:18mm}.no-print{display:none}}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>기간: ${escapeHtml(start || '-')} ~ ${escapeHtml(end || '-')}${tags.length ? ` · 태그: ${escapeHtml(tags.join(', '))}` : ''}</p>
    <p>생성 시각: ${escapeHtml(generatedAt)}</p>
  </header>
  <div class="stats">${statRows.map(([label, value]) => `<div><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
  ${tagBreakdown.length ? `<h2>태그별 소요 시간</h2><table><thead><tr><th>태그</th><th>소요 시간</th><th>완료 업무</th></tr></thead><tbody>${tagBreakdown.map(t => `<tr><td>${escapeHtml(t.tag)}</td><td>${escapeHtml(formatDuration(t.tracked_minutes))}</td><td>${escapeHtml(t.completed_tasks)}</td></tr>`).join('')}</tbody></table>` : ''}
  ${clientBreakdown.length ? `<h2>고객별 소요 시간</h2><table><thead><tr><th>고객</th><th>소요 시간</th><th>청구 금액</th></tr></thead><tbody>${clientBreakdown.map(c => `<tr><td>${escapeHtml(c.client_name)}</td><td>${escapeHtml(formatDuration(c.tracked_minutes))}</td><td>${c.billable_amount ? `${escapeHtml(Math.round(c.billable_amount).toLocaleString('ko-KR'))}원` : '-'}</td></tr>`).join('')}</tbody></table>` : ''}
  ${summary && (summary.headline || summary.narrative) ? `<h2>AI 성과 요약</h2><p><strong>${escapeHtml(summary.headline || '')}</strong><br><span class="summary-text">${escapeHtml(summary.narrative || '')}</span></p>` : ''}
  <h2>활동 타임라인 (${items.length}건)</h2>
  <table>
    <thead><tr><th>날짜</th><th>구분</th><th>내용</th><th>태그</th></tr></thead>
    <tbody>${timelineRows || '<tr><td colspan="4">선택한 기간과 태그에 해당하는 활동이 없습니다.</td></tr>'}</tbody>
  </table>
</body>
</html>`
}

export const performanceReportPrintFilename = (start, end) => `workmanager-report-${start}_${end}.html`

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
  const pct = (value, target) => (target ? Math.round((Number(value) || 0) / target * 100) : null)
  const bar = (percent) => (percent === null ? null : Math.min(100, percent))
  const taskPercent = pct(stats?.completed_tasks, goal?.taskGoal)
  const minutesPercent = pct(stats?.tracked_minutes, goal?.minutesGoal)
  const todoPercent = pct(stats?.completed_todos, goal?.todoGoal)
  const eventsPercent = pct(stats?.events, goal?.eventGoal)
  return {
    taskPercent, minutesPercent, todoPercent, eventsPercent,
    taskBarPercent: bar(taskPercent),
    minutesBarPercent: bar(minutesPercent),
    todoBarPercent: bar(todoPercent),
    eventsBarPercent: bar(eventsPercent),
  }
}
