import { useEffect, useState } from 'react'
import { Bell, Bot, CalendarSync, Check, Cloud, Download, LoaderCircle, Monitor, Moon, RefreshCw, Smartphone, Sun } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import TrashSection from '../components/TrashSection'

const themes = [['auto', Monitor, '시스템'], ['light', Sun, '라이트'], ['dark', Moon, '다크']]
const aiDefaults = {
  openai: { model: 'gpt-5-mini', base_url: 'https://api.openai.com/v1' },
  gemini: { model: 'gemini-3.5-flash', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
}
const aiModels = {
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

export default function Settings({ theme, setTheme, notify, onDataChanged, canInstall, onInstall, notificationPermission, onEnableNotifications }) {
  const [data, setData] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [workflowSettings, setWorkflowSettings] = useState(null)
  const [aiConfig, setAiConfig] = useState(null)
  const [aiDraft, setAiDraft] = useState({ provider: 'openai', api_key: '', base_url: '', model: '' })

  const applyAiConfig = ai => {
    const provider = ai?.selected_provider || ai?.provider || 'openai'
    const defaults = aiDefaults[provider] || aiDefaults.openai
    setAiConfig(ai)
    setAiDraft({
      provider,
      api_key: '',
      base_url: ai?.base_url || defaults.base_url,
      model: ai?.model || defaults.model,
    })
  }

  const load = async () => {
    setError('')
    try {
      const [integrations, ai, workflow] = await Promise.all([
        api.googleStatus(),
        api.aiSettings().catch(() => api.aiStatus()),
        api.workflowSettings().catch(() => ({ approval_workflow: true })),
      ])
      setData(integrations)
      applyAiConfig(ai)
      setWorkflowSettings(workflow)
      if (integrations.connected || integrations.google_connected || integrations.google?.connected) {
        const response = await api.googleCalendars()
        setCalendars(response.items || response.calendars || [])
        if (response.selected_calendar_id) setData(current => ({ ...current, selected_calendar_id: response.selected_calendar_id }))
      }
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { load() }, [])

  const select = async id => {
    setBusy('select')
    try {
      await api.selectGoogleCalendar(id)
      setData(d => ({ ...d, selected_calendar_id: id }))
      notify('연동 캘린더를 저장했습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const loadAiProvider = async provider => {
    const next = await api.aiSettings(provider)
    applyAiConfig(next)
  }

  const saveAi = async event => {
    event.preventDefault()
    const provider = aiDraft.provider || 'openai'
    const payload = { provider, model: aiDraft.model.trim(), base_url: aiDraft.base_url.trim() }
    const apiKey = aiDraft.api_key.trim()
    if (apiKey) payload.api_key = apiKey
    else if (!(aiConfig?.api_key_set || aiConfig?.saved_api_key)) {
      notify('API key를 입력해 주세요.', 'error')
      return
    }
    setBusy('ai-save')
    try {
      const next = await api.saveAiSettings(payload)
      applyAiConfig(next)
      notify('AI 설정을 저장했습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const sync = async () => {
    setBusy('sync')
    try {
      const r = await api.syncGoogleCalendar()
      const count = (r?.pushed || 0) + (r?.imported || 0) + (r?.updated || 0)
      notify(`동기화했습니다 · ${count}개 변경`)
      await Promise.all([load(), onDataChanged?.()])
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const exportData = async () => {
    setBusy('export')
    try {
      const exported = await api.exportData()
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `workmanager-${new Date().toLocaleDateString('en-CA')}.json`
      link.click()
      URL.revokeObjectURL(url)
      notify('내보내기 파일을 만들었습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const toggleWorkflowSettings = async e => {
    const newValue = e.target.checked
    setBusy("workflow-save")
    const previousValue = workflowSettings?.approval_workflow ?? true
    setWorkflowSettings(w => ({ ...w, approval_workflow: newValue }))
    try {
      const result = await api.saveWorkflowSettings({ approval_workflow: newValue })
      setWorkflowSettings(result)
      notify("승인 워크플로 설정을 저장했습니다.")
    } catch (e) {
      notify(e.message, "error")
      setWorkflowSettings(w => ({ ...w, approval_workflow: previousValue }))
    } finally {
      setBusy("")
    }
  }

  const connected = data?.connected ?? data?.google_connected ?? data?.google?.connected
  const selected = data?.selected_calendar_id ?? data?.google?.selected_calendar_id
  const aiProvider = aiConfig?.provider || aiDraft.provider
  const aiDefault = aiDefaults[aiProvider] || aiDefaults.openai
  const aiModelList = aiModels[aiProvider] || []
  const aiModelOptions = aiDraft.model && !aiModelList.some(option => option.value === aiDraft.model)
    ? [{ value: aiDraft.model, label: `현재값: ${aiDraft.model}` }, ...aiModelList]
    : aiModelList

  return <>
    <Header title="설정" subtitle="화면과 외부 서비스 연결을 내 작업 방식에 맞게 관리하세요." />
    <div className="content settings-page">
      <section className="settings-card">
        <div className="settings-heading"><span><Monitor /></span><div><h2>화면 테마</h2><p>시스템 설정을 따르거나 원하는 화면을 고정합니다.</p></div></div>
        <div className="theme-options">{themes.map(([id, Icon, label]) => <button className={theme === id ? 'selected' : ''} key={id} onClick={() => setTheme(id)}><Icon /><span>{label}</span>{theme === id ? <Check /> : null}</button>)}</div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Smartphone /></span><div><h2>앱으로 설치</h2><p>홈 화면에서 전체 화면 앱처럼 빠르게 실행합니다.</p></div></div>
        <div className="integration-body"><div><strong>{matchMedia('(display-mode: standalone)').matches ? '이미 앱으로 실행 중입니다' : canInstall ? '이 기기에 설치할 수 있습니다' : '브라우저 메뉴에서 홈 화면에 추가할 수 있습니다'}</strong><small>Android Chrome·Samsung Internet과 Windows Chrome·Edge를 지원합니다.</small></div>{canInstall ? <button className="primary" onClick={onInstall}><Download /> 앱 설치</button> : null}</div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Bell /></span><div><h2>오늘 업무 알림</h2><p>앱을 열었을 때 오늘 예정된 업무를 기기 알림으로 알려줍니다.</p></div><em className={`status-pill ${notificationPermission === 'granted' ? 'online' : ''}`}>{notificationPermission === 'granted' ? '허용됨' : '꺼짐'}</em></div>
        <div className="integration-body"><div><strong>알림 내용은 이 기기에서만 만들어집니다.</strong><small>브라우저가 완전히 종료된 상태의 예약 푸시는 향후 서버 알림 기능에서 지원할 수 있습니다.</small></div>{notificationPermission !== 'granted' ? <button className="secondary" disabled={notificationPermission === 'unsupported'} onClick={onEnableNotifications}><Bell /> 알림 켜기</button> : null}</div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Download /></span><div><h2>내 데이터 내보내기</h2><p>업무, 일정, Todo와 업무 기록을 JSON 파일로 보관합니다.</p></div></div>
        <div className="integration-body"><div><strong>현재 Google 계정의 데이터만 포함됩니다.</strong><small>Google access token과 API 키 같은 인증 정보는 포함되지 않습니다.</small></div><button className="secondary" disabled={!!busy} onClick={exportData}><Download /> {busy === 'export' ? '준비 중…' : 'JSON 내보내기'}</button></div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><CalendarSync /></span><div><h2>Google 캘린더</h2><p>업무용 캘린더의 일정을 WorkManager와 동기화합니다.</p></div><em className={`status-pill ${connected ? 'online' : ''}`}>{connected ? '연결됨' : '연결 안 됨'}</em></div>
        {!data ? <div className="skeleton lines" /> : connected ? <div className="integration-body"><label>연동할 캘린더<select value={selected || ''} onChange={e => select(e.target.value)} disabled={busy === 'select'}><option value="">캘린더 선택</option>{calendars.map(c => <option key={c.id} value={c.id}>{c.summary || c.name}{c.primary ? ' (기본)' : ''}</option>)}</select></label><button className="primary" disabled={!selected || !!busy} onClick={sync}>{busy === 'sync' ? <LoaderCircle className="spin" /> : <RefreshCw />} 지금 동기화</button><small>선택한 캘린더와 양방향으로 변경 사항을 맞춥니다. 중복 일정은 만들지 않습니다.</small></div> : <div className="integration-empty"><Cloud /><div><strong>Google 계정 연결이 필요합니다</strong><p>로그아웃 후 Google로 로그인하면 캘린더를 선택할 수 있습니다.</p></div><a className="secondary" href="/api/auth/google/start">Google 연결</a></div>}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Bot /></span><div><h2>승인 워크플로</h2><p>완료 업무와 일정 변경에 승인 단계를 요구합니다. 혼자 사용할 때는 꺼 두세요.</p></div></div>
        {workflowSettings ? <div className="integration-body"><label><input type="checkbox" checked={workflowSettings.approval_workflow ?? true} disabled={busy === "workflow-save"} onChange={toggleWorkflowSettings} /> <span>{workflowSettings.approval_workflow ? "승인 워크플로 켜짐" : "승인 워크플로 꺼짐"}</span></label><small>{workflowSettings.approval_workflow ? "새 완료 업무가 승인을 기다립니다." : "새 완료 업무가 바로 확정됩니다."}</small></div> : <div className="skeleton lines" />}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Bot /></span><div><h2>AI ???</h2><p>? ??? ? AI ???? ?? ?? ?????.</p></div><em className={`status-pill ${aiConfig?.configured ? 'online' : ''}`}>{aiConfig?.configured ? '???' : '???'}</em></div>
        {!aiConfig ? <div className="skeleton lines" /> : <form className="ai-settings-form" onSubmit={saveAi}>
          <div className="ai-settings-grid">
            <label>???<select value={aiDraft.provider} onChange={event => { const provider = event.target.value; const defaults = aiDefaults[provider] || aiDefaults.openai; setAiDraft(current => ({ ...current, provider, base_url: defaults.base_url, model: defaults.model })); loadAiProvider(provider).catch(() => notify('AI ??? ???? ?????.', 'error')) }}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option></select></label>
            <label>API key<input type="password" value={aiDraft.api_key} onChange={event => setAiDraft(current => ({ ...current, api_key: event.target.value }))} placeholder={aiConfig.api_key_set ? '?? ? ??' : '??'} /></label>
            <label>??<select value={aiDraft.model} onChange={event => setAiDraft(current => ({ ...current, model: event.target.value }))}>{aiModelOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Base URL<input value={aiDraft.base_url} onChange={event => setAiDraft(current => ({ ...current, base_url: event.target.value }))} placeholder={aiDefault.base_url} /></label>
          </div>
          <div className="integration-body ai-settings-footer"><div><strong>{aiConfig.provider_name || (aiProvider === 'gemini' ? 'Google Gemini' : 'OpenAI')}</strong><small>??? ?? Google ???? ?????. ?? ???? ?????.</small></div><button className="primary" disabled={busy === 'ai-save'}>{busy === 'ai-save' ? <LoaderCircle className="spin" /> : <Bot />} ??</button></div>
        </form>}
        {aiConfig ? <dl className="diagnostics"><div><dt>??</dt><dd>{aiConfig.provider_name || aiConfig.provider}</dd></div><div><dt>??</dt><dd>{aiConfig.model || 'API ???'}</dd></div><div><dt>??</dt><dd>{aiConfig.message || '?? ??'}</dd></div><div><dt>?? ??</dt><dd>{aiConfig.source_label || aiConfig.source || '?? ???'}</dd></div><div><dt>? ??</dt><dd>{aiConfig.saved_api_key ? '???' : '???'}</dd></div></dl> : null}
      </section>
      <TrashSection notify={notify} onDataChanged={onDataChanged} />
      {error ? <p className="inline-error">{error} <button onClick={load}>다시 시도</button></p> : null}
      <p className="muted app-version">WorkManager v{__APP_VERSION__}</p>
    </div>
  </>
}
