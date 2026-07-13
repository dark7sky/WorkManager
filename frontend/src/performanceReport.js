const REPORT_PRESETS_KEY = 'workmanager.reportPresets'

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
    `- 완료 업무 예상 소요 시간: ${formatDuration(stats.estimated_minutes)}`,
    `- 일정: ${stats.events || 0}`,
    `- 진행 중 업무: ${stats.active_tasks || 0}`,
    `- 완료한 오늘 할 일: ${stats.completed_todos || 0}`,
  ]

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
