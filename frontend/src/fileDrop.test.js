import assert from 'node:assert/strict'
import test from 'node:test'
import { dropZoneHandlers } from './fileDrop.js'

function fakeEvent(files) {
  let prevented = false, stopped = false
  return {
    dataTransfer: { files },
    preventDefault: () => { prevented = true },
    stopPropagation: () => { stopped = true },
    wasPrevented: () => prevented,
    wasStopped: () => stopped,
  }
}

test('onDrop calls onFile with the first dropped file and prevents default', () => {
  const seen = []
  const handlers = dropZoneHandlers(file => seen.push(file))
  const file = { name: 'a.png' }
  const e = fakeEvent([file])
  handlers.onDrop(e)
  assert.deepEqual(seen, [file])
  assert.equal(e.wasPrevented(), true)
  assert.equal(e.wasStopped(), true)
})

test('onDrop does nothing when no file is present', () => {
  const seen = []
  const handlers = dropZoneHandlers(file => seen.push(file))
  handlers.onDrop(fakeEvent([]))
  assert.deepEqual(seen, [])
})

test('onDragOver prevents default so drop is allowed', () => {
  const handlers = dropZoneHandlers(() => {})
  const e = fakeEvent([])
  handlers.onDragOver(e)
  assert.equal(e.wasPrevented(), true)
})
