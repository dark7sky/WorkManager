export const aiDefaults = {
  openai: { model: 'gpt-5-mini', base_url: 'https://api.openai.com/v1' },
  gemini: { model: 'gemini-3.5-flash', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
}

export const aiModels = {
  openai: [
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  gemini: [
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
}

export const normalizeAiProvider = provider => (provider === 'gemini' ? 'gemini' : 'openai')

export const getAiDraft = (provider, drafts = {}, config = null) => {
  const normalized = normalizeAiProvider(provider)
  const defaults = aiDefaults[normalized] || aiDefaults.openai
  const current = drafts[normalized]
  if (current && current.provider === normalized) {
    return {
      provider: normalized,
      api_key: typeof current.api_key === 'string' ? current.api_key : '',
      base_url: current.base_url || config?.base_url || defaults.base_url,
      model: current.model || config?.model || defaults.model,
    }
  }
  return {
    provider: normalized,
    api_key: '',
    base_url: config?.base_url || defaults.base_url,
    model: config?.model || defaults.model,
  }
}

export const upsertAiConfig = (configs = {}, ai = null) => {
  const provider = normalizeAiProvider(ai?.provider || ai?.selected_provider || 'openai')
  return { ...configs, [provider]: ai }
}
