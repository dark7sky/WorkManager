import assert from 'node:assert/strict'
import test from 'node:test'
import { auditLogReportFilename, auditLogsToPrintableReport } from './auditLogReport.js'

test('auditLogsToPrintableReport renders escaped rows and summary', () => {
  const html = auditLogsToPrintableReport([
    { created_at: '2026-07-18T10:00:00+09:00', action: 'update', entity_type: 'tasks', entity_id: 3, metadata: { fields: ['<hack>'] } },
    { created_at: '2026-07-18T11:00:00+09:00', action: 'delete', entity_type: 'events', entity_id: 5, metadata: null },
  ], {
    actionLabels: { update: '수정', delete: '삭제' },
    entityLabels: { tasks: '업무', events: '일정' },
    metadataText: metadata => metadata?.fields ? `변경 필드: ${metadata.fields.join(', ')}` : '',
    generatedAt: '2026-07-18T18:41:12+09:00',
    title: '감사 로그 보고서',
  })

  assert.match(html, /감사 로그 보고서/)
  assert.match(html, /생성 시각: 2026-07-18T18:41:12\+09:00/)
  assert.match(html, /총 2건/)
  assert.match(html, /수정/)
  assert.match(html, /업무 #3/)
  assert.match(html, /&lt;hack&gt;/)
  assert.doesNotMatch(html, /<hack>/)
})

test('auditLogsToPrintableReport shows empty state', () => {
  const html = auditLogsToPrintableReport([])
  assert.match(html, /표시할 감사 로그가 없습니다\./)
  assert.match(html, /총 0건/)
})

test('auditLogReportFilename uses the requested date', () => {
  assert.equal(auditLogReportFilename('2026-07-18'), 'workmanager-audit-log-2026-07-18.html')
})
