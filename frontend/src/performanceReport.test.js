import { test } from 'node:test'
import assert from 'node:assert'
import { performanceReportMarkdown, performanceReportFilename, loadReportPresets, saveReportPreset, deleteReportPreset } from './performanceReport.js'

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
