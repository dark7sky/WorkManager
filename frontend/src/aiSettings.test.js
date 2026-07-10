import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAiDraft, upsertAiConfig } from './aiSettings.js'

test('getAiDraft keeps separate draft state per provider', () => {
  const drafts = {
    openai: { provider: 'openai', api_key: 'openai-key', base_url: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  }
  const openai = getAiDraft('openai', drafts, { provider: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-5' })
  const gemini = getAiDraft('gemini', drafts, { provider: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.5-flash' })

  assert.equal(openai.api_key, 'openai-key')
  assert.equal(openai.model, 'gpt-5-mini')
  assert.equal(gemini.api_key, '')
  assert.equal(gemini.model, 'gemini-3.5-flash')
  assert.equal(gemini.base_url, 'https://generativelanguage.googleapis.com/v1beta/openai/')
})

test('getAiDraft ignores a draft that was stored under the wrong provider label', () => {
  const drafts = {
    gemini: { provider: 'openai', api_key: 'openai-key', base_url: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  }
  const gemini = getAiDraft('gemini', drafts, { provider: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.5-flash' })

  assert.equal(gemini.provider, 'gemini')
  assert.equal(gemini.api_key, '')
  assert.equal(gemini.base_url, 'https://generativelanguage.googleapis.com/v1beta/openai/')
  assert.equal(gemini.model, 'gemini-3.5-flash')
})

test('upsertAiConfig stores provider configs under the normalized provider key', () => {
  const configs = upsertAiConfig({}, { provider: 'gemini', model: 'gemini-2.5-flash' })
  assert.deepEqual(Object.keys(configs), ['gemini'])
  assert.equal(configs.gemini.model, 'gemini-2.5-flash')
})

test('upsertAiConfig prefers the explicit provider over selected_provider', () => {
  const configs = upsertAiConfig({}, {
    provider: 'gemini',
    selected_provider: 'openai',
    model: 'gemini-3.5-flash',
    api_key: 'gemini-key',
  })

  assert.deepEqual(Object.keys(configs), ['gemini'])
  assert.equal(configs.gemini.provider, 'gemini')
  assert.equal(configs.gemini.selected_provider, 'gemini')
})
