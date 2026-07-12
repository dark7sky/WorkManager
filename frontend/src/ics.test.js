import assert from 'node:assert/strict'
import test from 'node:test'
import { eventsToIcs, icsFilename } from './ics.js'

test('eventsToIcs emits a VEVENT per event with escaped text fields', () => {
  const ics = eventsToIcs([
    { id: 1, title: '기획, 회의', description: '1차 논의\n결론 없음', location: '회의실 A', start_at: '2026-07-06T10:00:00+09:00', end_at: '2026-07-06T11:00:00+09:00' },
  ])
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0/)
  assert.match(ics, /BEGIN:VEVENT[\s\S]*UID:1@workmanager[\s\S]*END:VEVENT/)
  assert.match(ics, /SUMMARY:기획\\, 회의/)
  assert.match(ics, /DESCRIPTION:1차 논의\\n결론 없음/)
  assert.match(ics, /LOCATION:회의실 A/)
  assert.match(ics, /DTSTART:20260706T010000Z/)
  assert.match(ics, /END:VCALENDAR$/)
})

test('eventsToIcs skips events missing start or end', () => {
  const ics = eventsToIcs([{ id: 2, title: '미완성', start_at: '2026-07-06T10:00:00+09:00' }])
  assert.doesNotMatch(ics, /BEGIN:VEVENT/)
})

test('icsFilename uses the requested date', () => {
  assert.equal(icsFilename('2026-07-12'), 'workmanager-events-2026-07-12.ics')
})
