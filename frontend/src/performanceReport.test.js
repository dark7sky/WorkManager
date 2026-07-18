import { test } from 'node:test'
import assert from 'node:assert'
import { performanceReportMarkdown, performanceReportFilename, loadReportPresets, saveReportPreset, deleteReportPreset, presetRange, formatDuration, dailyActivityTrend, loadPerformanceGoal, savePerformanceGoal, goalProgress } from './performanceReport.js'

test('formatDuration: formats minutes as hours/minutes in Korean', () => {
  assert.strictEqual(formatDuration(0), '0분')
  assert.strictEqual(formatDuration(45), '45분')
  assert.strictEqual(formatDuration(60), '1시간')
  assert.strictEqual(formatDuration(125), '2시간 5분')
  assert.strictEqual(formatDuration(null), '0분')
})

test('performanceReportMarkdown: includes tracked duration in summary', () => {
  const data = { summary: { tracked_minutes: 125 }, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('기록된 소요 시간: 2시간 5분'))
})

test('performanceReportMarkdown: includes billable amount when present', () => {
  const data = { summary: { billable_minutes: 120, billable_amount: 40000 }, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('청구 가능 시간: 2시간'))
  assert(md.includes('청구 예상 금액: 40,000원'))
})

test('performanceReportMarkdown: omits billable amount when hourly rate is not set', () => {
  const data = { summary: { billable_minutes: 120, billable_amount: null }, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(!md.includes('청구 예상 금액'))
})

test('performanceReportMarkdown: generates basic structure', () => {
  const data = { summary: { completed_tasks: 5, work_logs: 10, events: 3, active_tasks: 2, completed_todos: 8 }, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('# WorkManager 성과 보고서'))
  assert(md.includes('기간: 2026-01-01 ~ 2026-01-31'))
  assert(md.includes('## 요약'))
  assert(md.includes('완료 업무: 5'))
  assert(md.includes('업무 기록: 10'))
  assert(md.includes('일정: 3'))
  assert(md.includes('진행 중 업무: 2'))
  assert(md.includes('완료한 오늘 할 일: 8'))
})

test('performanceReportMarkdown: includes tag breakdown section when present', () => {
  const data = { summary: {}, timeline: [], tag_breakdown: [{ tag: 'Reporting', tracked_minutes: 90, completed_tasks: 3 }] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('## 태그별 소요 시간'))
  assert(md.includes('- Reporting: 1시간 30분 · 완료 3건'))
})

test('performanceReportMarkdown: omits tag breakdown section when empty', () => {
  const data = { summary: {}, timeline: [], tag_breakdown: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(!md.includes('## 태그별 소요 시간'))
})

test('performanceReportMarkdown: includes tags in period line', () => {
  const data = { summary: {}, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: ['sprint', 'Q1'], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('태그: #sprint #Q1'))
})

test('performanceReportMarkdown: includes AI summary when provided', () => {
  const data = { summary: {}, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: { headline: '좋은 진전', narrative: '이번 달 많은 업무를 완료했습니다.' }, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('## AI 요약'))
  assert(md.includes('**좋은 진전**'))
  assert(md.includes('이번 달 많은 업무를 완료했습니다.'))
})

test('performanceReportMarkdown: handles empty timeline', () => {
  const data = { summary: {}, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('## 활동 타임라인'))
  assert(md.includes('활동이 없습니다.'))
})

test('performanceReportMarkdown: groups timeline entries by date', () => {
  const data = {
    summary: {},
    timeline: [
      { type: 'task', type_label: '업무', date: '2026-01-15', title: 'Task 1', content: '', tags: [] },
      { type: 'task', type_label: '업무', date: '2026-01-15', title: 'Task 2', content: '', tags: [] },
      { type: 'work_log', type_label: '기록', date: '2026-01-16', title: '', content: 'Did something', tags: [] }
    ]
  }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('### 2026-01-15'))
  assert(md.includes('### 2026-01-16'))
  const idx15 = md.indexOf('### 2026-01-15')
  const idx16 = md.indexOf('### 2026-01-16')
  assert(idx15 < idx16)
})

test('performanceReportMarkdown: formats timeline entries with tags', () => {
  const data = {
    summary: {},
    timeline: [
      { type: 'task', type_label: '업무', date: '2026-01-15', title: 'Deploy', content: '', tags: ['release', 'critical'] }
    ]
  }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('- [업무] Deploy #release #critical'))
})

test('performanceReportMarkdown: uses content when title is missing', () => {
  const data = {
    summary: {},
    timeline: [
      { type: 'work_log', type_label: '기록', date: '2026-01-15', title: '', content: 'Some work', tags: [] }
    ]
  }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('- [기록] Some work'))
})

test('performanceReportMarkdown: handles null/undefined fields gracefully', () => {
  const data = { summary: null, timeline: null }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T10:00:00Z' })

  assert(md.includes('# WorkManager 성과 보고서'))
  assert(md.includes('완료 업무: 0'))
  assert(!md.includes('NaN'))
  assert(!md.includes('undefined'))
})

test('performanceReportMarkdown: includes generated timestamp', () => {
  const data = { summary: {}, timeline: [] }
  const md = performanceReportMarkdown(data, { start: '2026-01-01', end: '2026-01-31', tags: [], summary: null, generatedAt: '2026-01-31T15:30:45Z' })

  assert(md.includes('생성: 2026-01-31T15:30:45Z'))
})

test('performanceReportFilename: generates correct format', () => {
  const filename = performanceReportFilename('2026-01-01', '2026-01-31')
  assert.strictEqual(filename, 'workmanager-report-2026-01-01_2026-01-31.md')
})

test('loadReportPresets: returns empty array for missing key', () => {
  const storage = { getItem: () => null }
  const presets = loadReportPresets(storage)
  assert.deepStrictEqual(presets, [])
})

test('loadReportPresets: returns empty array for corrupt JSON', () => {
  const storage = { getItem: () => 'not json' }
  const presets = loadReportPresets(storage)
  assert.deepStrictEqual(presets, [])
})

test('loadReportPresets: returns empty array for non-array JSON', () => {
  const storage = { getItem: () => '{"name":"test"}' }
  const presets = loadReportPresets(storage)
  assert.deepStrictEqual(presets, [])
})

test('loadReportPresets: filters out entries without name', () => {
  const data = JSON.stringify([
    { name: 'preset1', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: [] },
    { preset: 'month', start: '2026-01-01', end: '2026-01-31' },
    null
  ])
  const storage = { getItem: () => data }
  const presets = loadReportPresets(storage)
  assert.strictEqual(presets.length, 1)
  assert.strictEqual(presets[0].name, 'preset1')
})

test('saveReportPreset: ignores empty name', () => {
  const storage = { getItem: () => null, setItem: () => {} }
  const presets = loadReportPresets(storage)
  const result = saveReportPreset(storage, presets, { name: '  ', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: [] })
  assert.deepStrictEqual(result, presets)
})

test('saveReportPreset: saves new preset', () => {
  const saved = {}
  const storage = { getItem: () => null, setItem: (k, v) => { saved.key = k; saved.value = v } }
  const presets = loadReportPresets(storage)
  const result = saveReportPreset(storage, presets, { name: 'monthly', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: ['sprint'] })

  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].name, 'monthly')
  assert.strictEqual(result[0].preset, 'month')
  assert.deepStrictEqual(result[0].tags, ['sprint'])
  assert.strictEqual(saved.key, 'workmanager.reportPresets')
})

test('saveReportPreset: replaces existing preset with same name', () => {
  const initialData = JSON.stringify([
    { name: 'monthly', preset: 'quarter', start: '2026-01-01', end: '2026-03-31', tags: [] }
  ])
  const saved = {}
  const storage = {
    getItem: () => initialData,
    setItem: (k, v) => { saved.key = k; saved.value = v }
  }
  const presets = loadReportPresets(storage)
  const result = saveReportPreset(storage, presets, { name: 'monthly', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: [] })

  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].preset, 'month')
  assert.strictEqual(result[0].start, '2026-01-01')
  assert.strictEqual(result[0].end, '2026-01-31')
})

test('saveReportPreset: trims preset name', () => {
  const saved = {}
  const storage = { getItem: () => null, setItem: (k, v) => { saved.value = v } }
  const presets = []
  const result = saveReportPreset(storage, presets, { name: '  my preset  ', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: [] })

  assert.strictEqual(result[0].name, 'my preset')
})

test('deleteReportPreset: removes preset by name', () => {
  const initialData = JSON.stringify([
    { name: 'preset1', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: [] },
    { name: 'preset2', preset: 'quarter', start: '2026-01-01', end: '2026-03-31', tags: [] }
  ])
  const saved = {}
  const storage = {
    getItem: () => initialData,
    setItem: (k, v) => { saved.value = v }
  }
  const presets = loadReportPresets(storage)
  const result = deleteReportPreset(storage, presets, 'preset1')

  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].name, 'preset2')
})

test('deleteReportPreset: handles deleting non-existent preset', () => {
  const initialData = JSON.stringify([
    { name: 'preset1', preset: 'month', start: '2026-01-01', end: '2026-01-31', tags: [] }
  ])
  const saved = {}
  const storage = {
    getItem: () => initialData,
    setItem: (k, v) => { saved.value = v }
  }
  const presets = loadReportPresets(storage)
  const result = deleteReportPreset(storage, presets, 'nonexistent')

  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].name, 'preset1')
})

test('presetRange lastweek returns previous Monday through Sunday', () => {
  // 2026-07-11 is a Saturday: last week = 6/29(Mon) ~ 7/5(Sun)
  assert.deepEqual(presetRange('lastweek', new Date(2026, 6, 11)), ['2026-06-29', '2026-07-05'])
  // On a Sunday (7/12), last week is still 6/29 ~ 7/5? No: 7/12 dow=0→7, end=7/5, start=6/29
  assert.deepEqual(presetRange('lastweek', new Date(2026, 6, 12)), ['2026-06-29', '2026-07-05'])
  // On a Monday (7/13), last week = 7/6 ~ 7/12
  assert.deepEqual(presetRange('lastweek', new Date(2026, 6, 13)), ['2026-07-06', '2026-07-12'])
})

test('dailyActivityTrend: buckets timeline items by date across the full range, including empty days', () => {
  const timeline = [{ date: '2026-07-01' }, { date: '2026-07-01' }, { date: '2026-07-03' }]
  const result = dailyActivityTrend(timeline, '2026-07-01', '2026-07-03')

  assert.deepEqual(result, [
    { date: '2026-07-01', count: 2 },
    { date: '2026-07-02', count: 0 },
    { date: '2026-07-03', count: 1 },
  ])
})

test('dailyActivityTrend: returns empty array for invalid or missing range', () => {
  assert.deepEqual(dailyActivityTrend([], '', ''), [])
  assert.deepEqual(dailyActivityTrend([], '2026-07-03', '2026-07-01'), [])
})

test('dailyActivityTrend: returns empty array when the range spans more than 62 days', () => {
  assert.deepEqual(dailyActivityTrend([], '2026-01-01', '2026-12-31'), [])
})

test('loadPerformanceGoal: returns nulls for missing key', () => {
  const storage = { getItem: () => null }
  assert.deepStrictEqual(loadPerformanceGoal(storage), { taskGoal: null, minutesGoal: null, todoGoal: null, eventGoal: null })
})

test('loadPerformanceGoal: returns nulls for corrupt JSON', () => {
  const storage = { getItem: () => 'not json' }
  assert.deepStrictEqual(loadPerformanceGoal(storage), { taskGoal: null, minutesGoal: null, todoGoal: null, eventGoal: null })
})

test('loadPerformanceGoal: discards non-positive or non-numeric values', () => {
  const storage = { getItem: () => JSON.stringify({ taskGoal: -5, minutesGoal: 'abc', todoGoal: 0, eventGoal: -1 }) }
  assert.deepStrictEqual(loadPerformanceGoal(storage), { taskGoal: null, minutesGoal: null, todoGoal: null, eventGoal: null })
})

test('savePerformanceGoal: persists positive numeric goals', () => {
  const saved = {}
  const storage = { setItem: (k, v) => { saved.key = k; saved.value = v } }
  const result = savePerformanceGoal(storage, { taskGoal: '20', minutesGoal: '600', todoGoal: '30', eventGoal: '15' })
  assert.deepStrictEqual(result, { taskGoal: 20, minutesGoal: 600, todoGoal: 30, eventGoal: 15 })
  assert.strictEqual(saved.key, 'workmanager.performanceGoal')
  assert.deepStrictEqual(JSON.parse(saved.value), { taskGoal: 20, minutesGoal: 600, todoGoal: 30, eventGoal: 15 })
})

test('savePerformanceGoal: clears invalid/empty entries to null', () => {
  const storage = { setItem: () => {} }
  const result = savePerformanceGoal(storage, { taskGoal: '', minutesGoal: '-3', todoGoal: '', eventGoal: '' })
  assert.deepStrictEqual(result, { taskGoal: null, minutesGoal: null, todoGoal: null, eventGoal: null })
})

test('goalProgress: computes clamped percentages against each goal', () => {
  const stats = { completed_tasks: 15, tracked_minutes: 900, completed_todos: 45, events: 20 }
  const result = goalProgress(stats, { taskGoal: 20, minutesGoal: 600, todoGoal: 30, eventGoal: 10 })
  assert.strictEqual(result.taskPercent, 75)
  assert.strictEqual(result.minutesPercent, 100)
  assert.strictEqual(result.todoPercent, 100)
  assert.strictEqual(result.eventsPercent, 100)
})

test('goalProgress: returns null percent when a goal is unset', () => {
  const stats = { completed_tasks: 5, tracked_minutes: 100, completed_todos: 2, events: 3 }
  const result = goalProgress(stats, { taskGoal: null, minutesGoal: null, todoGoal: null, eventGoal: null })
  assert.deepStrictEqual(result, { taskPercent: null, minutesPercent: null, todoPercent: null, eventsPercent: null })
})
