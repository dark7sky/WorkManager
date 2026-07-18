import { useEffect, useRef, useState } from 'react'
import { Bell, Bot, CalendarSync, Check, ClipboardList, Cloud, Download, LoaderCircle, Monitor, Moon, RefreshCw, Smartphone, Sun, Trash2, Upload } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import TrashSection from '../components/TrashSection'
import TagManager from '../components/TagManager'
import { aiDefaults, aiModels, describeAiBinding, getAiDraft, normalizeAiProvider, upsertAiConfig } from '../aiSettings'
import { REMINDER_DIGEST_STORAGE_KEY } from '../taskFilters'
import { EVENT_ALERT_LEAD_OPTIONS, EVENT_ALERT_LEAD_STORAGE_KEY, loadEventAlertLeadMinutes, QUIET_HOURS_STORAGE_KEY, loadQuietHours } from '../eventAlerts'
import { TODO_ALERT_LEAD_OPTIONS, TODO_ALERT_LEAD_STORAGE_KEY, loadTodoAlertLeadMinutes } from '../todoAlerts'
import { clearNotificationHistory, loadNotificationHistory } from '../notificationHistory'

const themes = [['auto', Monitor, '시스템'], ['light', Sun, '라이트'], ['dark', Moon, '다크']]

export default function Settings({ theme, setTheme, notify, onDataChanged, canInstall, onInstall, notificationPermission, onEnableNotifications, onOpenAudit, onNavigateToTag }) {
  const [data, setData] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [workflowSettings, setWorkflowSettings] = useState(null)
  const [billingRateDraft, setBillingRateDraft] = useState('')
  const [billingClientNameDraft, setBillingClientNameDraft] = useState('')
  const [calendarFeed, setCalendarFeed] = useState(null)
  const [calendarFeedUrl, setCalendarFeedUrl] = useState('')
  const [sessions, setSessions] = useState(null)
  const [serverErrors, setServerErrors] = useState(null)
  const [aiConfigs, setAiConfigs] = useState({})
  const [aiDrafts, setAiDrafts] = useState({})
  const [aiTestResult, setAiTestResult] = useState(null)
  const [aiProvider, setAiProvider] = useState('openai')
  const [errorsRefreshing, setErrorsRefreshing] = useState(false)
  const [importPlan, setImportPlan] = useState(null)
  const [importMode, setImportMode] = useState('merge')
  const [wipeText, setWipeText] = useState('')
  const [reminderDigestScope, setReminderDigestScope] = useState(() => (localStorage.getItem(REMINDER_DIGEST_STORAGE_KEY) === 'due_soon' ? 'due_soon' : 'today'))
  const [eventAlertLead, setEventAlertLead] = useState(loadEventAlertLeadMinutes)
  const [todoAlertLead, setTodoAlertLead] = useState(loadTodoAlertLeadMinutes)
  const [quietHours, setQuietHours] = useState(loadQuietHours)
  const [notificationHistory, setNotificationHistory] = useState(loadNotificationHistory)
  const aiLoadSeq = useRef(0)
  const importFileRef = useRef(null)

  const applyAiConfig = ai => {
    const provider = normalizeAiProvider(ai?.provider || ai?.selected_provider || 'openai')
    setAiConfigs(current => upsertAiConfig(current, ai))
    setAiProvider(provider)
    setAiDrafts(current => ({ ...current, [provider]: getAiDraft(provider, current, ai) }))
  }

  const load = async () => {
    setError('')
    try {
      const [integrations, ai, workflow, errors, sessionList, feed] = await Promise.all([
        api.googleStatus(),
        api.aiSettings().catch(() => api.aiStatus()),
        api.workflowSettings().catch(() => ({ approval_workflow: false })),
        api.diagnosticsErrors(5).catch(() => ({ items: [] })),
        api.sessions().catch(() => ({ sessions: [] })),
        api.calendarFeedStatus().catch(() => ({ enabled: false })),
      ])
      setData(integrations)
      applyAiConfig(ai)
      setWorkflowSettings(workflow)
      setBillingRateDraft(workflow?.billing_hourly_rate != null ? String(workflow.billing_hourly_rate) : '')
      setBillingClientNameDraft(workflow?.billing_client_name || '')
      setCalendarFeed(feed)
      setServerErrors(errors.items || [])
      setSessions(sessionList.sessions || [])
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

  const refreshServerErrors = async () => {
    setErrorsRefreshing(true)
    try {
      const errors = await api.diagnosticsErrors(5)
      setServerErrors(errors.items || [])
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setErrorsRefreshing(false)
    }
  }

  const revokeSession = async id => {
    setBusy(`session-${id}`)
    try {
      await api.revokeSession(id)
      setSessions(list => (list || []).filter(s => s.id !== id))
      notify('세션을 로그아웃했습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

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
    const loadSeq = ++aiLoadSeq.current
    const next = await api.aiSettings(provider)
    if (loadSeq !== aiLoadSeq.current) return
    applyAiConfig(next)
  }

  const saveAi = async event => {
    event.preventDefault()
    const provider = aiProvider || 'openai'
    const currentDraft = getAiDraft(provider, aiDrafts, aiConfigs[provider])
    const payload = { provider, model: currentDraft.model.trim(), base_url: currentDraft.base_url.trim() }
    const apiKey = currentDraft.api_key.trim()
    if (apiKey) payload.api_key = apiKey
    else if (!(aiConfigs[provider]?.api_key_set || aiConfigs[provider]?.saved_api_key)) {
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

  const testAi = async () => {
    setBusy('ai-test')
    setAiTestResult(null)
    try {
      const result = await api.testAiSettings()
      setAiTestResult(result)
    } catch (e) {
      setAiTestResult({ ok: false, message: e.message })
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

  const pickImportFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('import-preview')
    try {
      const parsed = JSON.parse(await file.text())
      const preview = await api.importPreview(parsed)
      setImportPlan({ data: parsed, preview, name: file.name })
      setImportMode('merge')
    } catch (err) {
      notify(err instanceof SyntaxError ? 'JSON 파일을 읽을 수 없습니다.' : err.message, 'error')
      setImportPlan(null)
    } finally {
      setBusy('')
    }
  }

  const applyImport = async () => {
    if (!importPlan) return
    if (importMode === 'replace' && !confirm('기존 데이터를 모두 지우고 파일 내용으로 교체합니다. 계속할까요?')) return
    setBusy('import-apply')
    try {
      const result = await api.importData(importMode, importPlan.data)
      const total = Object.values(result.imported || {}).reduce((a, b) => a + b, 0)
      notify(`복원했습니다 · ${total}개 항목`)
      setImportPlan(null)
      await onDataChanged?.()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const wipeAllData = async () => {
    if (wipeText !== 'DELETE') return
    if (!confirm('업무, 일정, 할 일, 업무 기록과 그에 딸린 댓글·첨부파일이 모두 삭제됩니다. 되돌릴 수 없습니다. 계속할까요?')) return
    setBusy('wipe')
    try {
      const result = await api.wipeData(wipeText)
      const total = Object.values(result.deleted || {}).reduce((a, b) => a + b, 0)
      notify(`삭제했습니다 · ${total}개 항목`)
      setWipeText('')
      await onDataChanged?.()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const toggleWorkflowSettings = async e => {
    const newValue = e.target.checked
    setBusy("workflow-save")
    const previousValue = workflowSettings?.approval_workflow ?? false
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

  const saveBillingHourlyRate = async e => {
    e.preventDefault()
    const raw = billingRateDraft.trim()
    const rate = raw === '' ? null : Number(raw)
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) { notify('시급은 0 이상의 숫자여야 합니다.', 'error'); return }
    setBusy('billing-rate-save')
    try {
      const result = await api.saveWorkflowSettings({ billing_hourly_rate: rate })
      setWorkflowSettings(result)
      setBillingRateDraft(result.billing_hourly_rate != null ? String(result.billing_hourly_rate) : '')
      notify('청구 시급을 저장했습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const saveBillingClientName = async e => {
    e.preventDefault()
    setBusy('billing-client-save')
    try {
      const result = await api.saveWorkflowSettings({ billing_client_name: billingClientNameDraft.trim() || null })
      setWorkflowSettings(result)
      setBillingClientNameDraft(result.billing_client_name || '')
      notify('청구 대상 이름을 저장했습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const rotateCalendarFeed = async () => {
    setBusy('feed-rotate')
    try {
      const result = await api.rotateCalendarFeed()
      setCalendarFeed({ enabled: result.enabled })
      setCalendarFeedUrl(result.feed_url)
      notify('구독 주소를 새로 만들었습니다. 지금 복사해 두세요.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const disableCalendarFeed = async () => {
    setBusy('feed-disable')
    try {
      await api.disableCalendarFeed()
      setCalendarFeed({ enabled: false })
      setCalendarFeedUrl('')
      notify('캘린더 구독을 껐습니다.')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const copyCalendarFeedUrl = async () => {
    try {
      await navigator.clipboard.writeText(calendarFeedUrl)
      notify('구독 주소를 복사했습니다.')
    } catch {
      notify('복사에 실패했습니다. 주소를 직접 선택해 복사해 주세요.', 'error')
    }
  }

  const connected = data?.connected ?? data?.google_connected ?? data?.google?.connected
  const selected = data?.selected_calendar_id ?? data?.google?.selected_calendar_id
  const aiConfig = aiConfigs[aiProvider] || null
  const aiDraft = getAiDraft(aiProvider, aiDrafts, aiConfig)
  const aiFormReady = !!aiDrafts[aiProvider] || !!aiConfig
  const aiDefault = aiDefaults[aiProvider] || aiDefaults.openai
  const aiModelList = aiModels[aiProvider] || []
  const aiBindingLabel = aiConfig?.binding?.label || describeAiBinding(aiProvider, aiDraft, aiConfig)
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
        <label><input type="checkbox" checked={reminderDigestScope === 'due_soon'} onChange={e => { const scope = e.target.checked ? 'due_soon' : 'today'; setReminderDigestScope(scope); localStorage.setItem(REMINDER_DIGEST_STORAGE_KEY, scope) }}/> <span>지연·2일 내 마감 업무까지 알림에 포함 (기본: 오늘 마감만)</span></label>
        <label>일정 시작 전 알림 시점<select value={eventAlertLead} onChange={e => { const minutes = Number(e.target.value); setEventAlertLead(minutes); localStorage.setItem(EVENT_ALERT_LEAD_STORAGE_KEY, String(minutes)) }}>{EVENT_ALERT_LEAD_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{minutes}분 전</option>)}</select></label>
        <label>할 일 예정 시간 전 알림 시점<select value={todoAlertLead} onChange={e => { const minutes = Number(e.target.value); setTodoAlertLead(minutes); localStorage.setItem(TODO_ALERT_LEAD_STORAGE_KEY, String(minutes)) }}>{TODO_ALERT_LEAD_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{minutes}분 전</option>)}</select></label>
        <label><input type="checkbox" checked={quietHours.enabled} onChange={e => { const next = { ...quietHours, enabled: e.target.checked }; setQuietHours(next); localStorage.setItem(QUIET_HOURS_STORAGE_KEY, JSON.stringify(next)) }}/> <span>무음 시간대 사용 (지정한 시간에는 알림을 보내지 않음)</span></label>
        {quietHours.enabled ? <label className="quiet-hours-range">무음 시간<input type="time" value={quietHours.start} onChange={e => { const next = { ...quietHours, start: e.target.value }; setQuietHours(next); localStorage.setItem(QUIET_HOURS_STORAGE_KEY, JSON.stringify(next)) }}/><span>~</span><input type="time" value={quietHours.end} onChange={e => { const next = { ...quietHours, end: e.target.value }; setQuietHours(next); localStorage.setItem(QUIET_HOURS_STORAGE_KEY, JSON.stringify(next)) }}/></label> : null}
        {notificationHistory.length ? <div className="notification-history">
          <div className="notification-history-head"><h3>최근 알림 기록</h3><button type="button" className="link-button" onClick={() => { clearNotificationHistory(); setNotificationHistory([]) }}>기록 지우기</button></div>
          <ul>{notificationHistory.map((entry, i) => <li key={i}><strong>{entry.title}</strong><span>{entry.body}</span><time>{new Date(entry.firedAt).toLocaleString('ko-KR')}</time></li>)}</ul>
        </div> : null}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Download /></span><div><h2>내 데이터 내보내기</h2><p>업무, 일정, Todo, 업무 기록과 그에 딸린 댓글·첨부파일까지 JSON 파일로 보관합니다.</p></div></div>
        <div className="integration-body"><div><strong>현재 Google 계정의 데이터만 포함됩니다.</strong><small>Google access token과 API 키 같은 인증 정보는 포함되지 않습니다.</small></div><button className="secondary" disabled={!!busy} onClick={exportData}><Download /> {busy === 'export' ? '준비 중…' : 'JSON 내보내기'}</button></div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Upload /></span><div><h2>백업에서 복원</h2><p>내보내기로 만든 JSON 파일을 불러와 데이터를 되살립니다.</p></div></div>
        <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={pickImportFile} />
        {!importPlan ? <div className="integration-body"><div><strong>먼저 파일을 선택하면 반영 전에 내용을 확인할 수 있습니다.</strong><small>복원된 일정은 Google 캘린더와 연결되지 않은 로컬 일정으로 들어옵니다.</small></div><button className="secondary" disabled={!!busy} onClick={() => importFileRef.current?.click()}><Upload /> {busy === 'import-preview' ? '확인 중…' : 'JSON 파일 선택'}</button></div>
        : <div className="integration-body import-plan"><div><strong>{importPlan.name}</strong><small>{importPlan.preview.exported_at ? `내보낸 시각 ${importPlan.preview.exported_at}` : '내보낸 시각 정보 없음'} · 업무 {importPlan.preview.importable.tasks} · 일정 {importPlan.preview.importable.events} · 할 일 {importPlan.preview.importable.todos} · 기록 {importPlan.preview.importable.work_logs}건 (현재 보유: 업무 {importPlan.preview.existing.tasks} · 일정 {importPlan.preview.existing.events} · 할 일 {importPlan.preview.existing.todos} · 기록 {importPlan.preview.existing.work_logs}건) · 댓글·첨부 {Object.entries(importPlan.preview.importable).filter(([k]) => k.endsWith('_comments') || k.endsWith('_attachments')).reduce((sum, [, v]) => sum + v, 0)}건</small>
          <label><input type="radio" name="import-mode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} /> 기존 데이터에 추가 (merge)</label>
          <label><input type="radio" name="import-mode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /> 기존 데이터를 지우고 교체 (replace)</label></div>
          <div className="import-plan-actions"><button className="primary" disabled={!!busy} onClick={applyImport}>{busy === 'import-apply' ? <LoaderCircle className="spin" /> : <Upload />} 복원 실행</button><button className="secondary" disabled={!!busy} onClick={() => setImportPlan(null)}>취소</button></div></div>}
      </section>
      <section className="settings-card settings-card-danger">
        <div className="settings-heading"><span><Trash2 /></span><div><h2>모든 데이터 삭제</h2><p>업무, 일정, 할 일, 업무 기록과 그에 딸린 댓글·첨부파일을 모두 삭제합니다. 되돌릴 수 없으니 먼저 백업을 내려받으세요.</p></div></div>
        <div className="integration-body import-plan"><div><strong>확인을 위해 아래 칸에 DELETE를 입력하세요.</strong><small>삭제 후에는 복구할 수 없습니다.</small></div>
          <input value={wipeText} onChange={e => setWipeText(e.target.value)} placeholder="DELETE" />
          <div className="import-plan-actions"><button className="danger-button" disabled={!!busy || wipeText !== 'DELETE'} onClick={wipeAllData}>{busy === 'wipe' ? <LoaderCircle className="spin" /> : <Trash2 />} 모두 삭제</button></div>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><CalendarSync /></span><div><h2>Google 캘린더</h2><p>업무용 캘린더의 일정을 WorkManager와 동기화합니다.</p></div><em className={`status-pill ${connected ? 'online' : ''}`}>{connected ? '연결됨' : '연결 안 됨'}</em></div>
        {!data ? <div className="skeleton lines" /> : connected ? <div className="integration-body"><label>연동할 캘린더<select value={selected || ''} onChange={e => select(e.target.value)} disabled={busy === 'select'}><option value="">캘린더 선택</option>{calendars.map(c => <option key={c.id} value={c.id}>{c.summary || c.name}{c.primary ? ' (기본)' : ''}</option>)}</select></label><button className="primary" disabled={!selected || !!busy} onClick={sync}>{busy === 'sync' ? <LoaderCircle className="spin" /> : <RefreshCw />} 지금 동기화</button><small>선택한 캘린더와 양방향으로 변경 사항을 맞춥니다. 중복 일정은 만들지 않습니다. {data.last_sync_at ? `마지막 동기화: ${new Date(data.last_sync_at).toLocaleString('ko-KR')}` : '아직 동기화한 적이 없습니다.'}</small></div> : <div className="integration-empty"><Cloud /><div><strong>Google 계정 연결이 필요합니다</strong><p>로그아웃 후 Google로 로그인하면 캘린더를 선택할 수 있습니다.</p></div><a className="secondary" href="/api/auth/google/start">Google 연결</a></div>}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Bot /></span><div><h2>승인 워크플로</h2><p>완료 업무와 일정 변경에 승인 단계를 요구합니다. 혼자 사용할 때는 꺼 두세요.</p></div></div>
        {workflowSettings ? <div className="integration-body"><label><input type="checkbox" checked={workflowSettings.approval_workflow ?? false} disabled={busy === "workflow-save"} onChange={toggleWorkflowSettings} /> <span>{workflowSettings.approval_workflow ? "승인 워크플로 켜짐" : "승인 워크플로 꺼짐"}</span></label><small>{workflowSettings.approval_workflow ? "새 완료 업무가 승인을 기다립니다." : "새 완료 업무가 바로 확정됩니다."}</small></div> : <div className="skeleton lines" />}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><ClipboardList /></span><div><h2>청구 시급</h2><p>시급을 설정하면 성과 화면에서 청구 가능 시간을 금액으로 환산해 보여줍니다.</p></div></div>
        {workflowSettings ? <form className="integration-body" onSubmit={saveBillingHourlyRate}><label>시급 (원)<input type="number" min="0" step="1000" placeholder="예: 50000" value={billingRateDraft} disabled={busy === 'billing-rate-save'} onChange={e => setBillingRateDraft(e.target.value)} /></label><button type="submit" className="secondary" disabled={busy === 'billing-rate-save'}>{busy === 'billing-rate-save' ? <LoaderCircle className="spin" /> : null} 저장</button><small>{workflowSettings.billing_hourly_rate != null ? `현재 시급: ${workflowSettings.billing_hourly_rate.toLocaleString('ko-KR')}원` : '시급을 설정하지 않으면 금액은 표시되지 않습니다.'}</small></form> : <div className="skeleton lines" />}
        {workflowSettings ? <form className="integration-body" onSubmit={saveBillingClientName}><label>청구 대상 이름<input type="text" maxLength={200} placeholder="예: (주)에이스컴퍼니" value={billingClientNameDraft} disabled={busy === 'billing-client-save'} onChange={e => setBillingClientNameDraft(e.target.value)} /></label><button type="submit" className="secondary" disabled={busy === 'billing-client-save'}>{busy === 'billing-client-save' ? <LoaderCircle className="spin" /> : null} 저장</button><small>{workflowSettings.billing_client_name ? `청구서에 "${workflowSettings.billing_client_name}" 앞으로 표시됩니다.` : '설정하면 청구서 PDF 상단에 청구 대상으로 표시됩니다.'}</small></form> : null}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><CalendarSync /></span><div><h2>캘린더 구독 피드</h2><p>Google·Apple·Outlook 캘린더에 구독 주소를 등록하면 업무 마감일과 일정이 자동으로 최신 상태를 유지합니다.</p></div><em className={`status-pill ${calendarFeed?.enabled ? 'online' : ''}`}>{calendarFeed?.enabled ? '켜짐' : '꺼짐'}</em></div>
        {!calendarFeed ? <div className="skeleton lines" /> : <div className="integration-body">
          {calendarFeedUrl ? <div className="import-plan"><small>주소는 다시 보여주지 않으니 지금 복사해 두세요.</small><input className="feed-url-input" readOnly value={calendarFeedUrl} onFocus={e => e.target.select()} /></div> : null}
          <div className="import-plan-actions">
            {calendarFeedUrl ? <button className="secondary" onClick={copyCalendarFeedUrl}>주소 복사</button> : null}
            <button className="secondary" disabled={!!busy} onClick={rotateCalendarFeed}>{busy === 'feed-rotate' ? <LoaderCircle className="spin" /> : <RefreshCw />} {calendarFeed.enabled ? '주소 재발급' : '구독 주소 만들기'}</button>
            {calendarFeed.enabled ? <button className="secondary" disabled={!!busy} onClick={disableCalendarFeed}>구독 끄기</button> : null}
          </div>
        </div>}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Smartphone /></span><div><h2>활성 세션</h2><p>현재 로그인된 세션 목록입니다. 낯선 세션은 로그아웃할 수 있습니다.</p></div></div>
        {!sessions ? <div className="skeleton lines" /> : sessions.length ? <ul className="error-log-list session-list">{sessions.map(s => <li key={s.id}><time>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(s.last_seen_at * 1000))}</time><div><strong>{s.current ? '현재 세션' : '다른 세션'}</strong><p>생성: {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(s.created_at * 1000))} · 만료: {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(s.expires_at * 1000))}</p></div>{!s.current ? <button className="secondary" disabled={busy === `session-${s.id}`} onClick={() => revokeSession(s.id)}>로그아웃</button> : null}</li>)}</ul> : <p className="empty-state">활성 세션이 없습니다.</p>}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><ClipboardList /></span><div><h2>감사 로그</h2><p>업무 공간에서 발생한 변경 이력을 확인합니다.</p></div></div>
        <button className="secondary" onClick={onOpenAudit}>감사 로그 보기</button>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><ClipboardList /></span><div><h2>서버 오류 진단</h2><p>처리되지 않은 서버 오류 중 최근 5건을 보여줍니다.</p></div><button className="secondary" disabled={errorsRefreshing} onClick={refreshServerErrors}>{errorsRefreshing ? <LoaderCircle className="spin" /> : <RefreshCw />} 새로고침</button></div>
        {!serverErrors ? <div className="skeleton lines" /> : serverErrors.length ? <ul className="error-log-list">{serverErrors.map(item => <li key={item.id}><time dateTime={item.created_at}>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(item.created_at))}</time><div><strong>{item.method} {item.path}</strong><p>{item.summary}</p></div></li>)}</ul> : <p className="empty-state">최근 서버 오류가 없습니다.</p>}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span><Bot /></span><div><h2>AI 설정</h2><p>OpenAI 또는 Gemini API 키를 등록하면 이 계정에서 AI 기능을 사용할 수 있습니다.</p></div><em className={`status-pill ${aiConfig?.configured ? 'online' : ''}`}>{aiConfig?.configured ? '설정됨' : '미설정'}</em></div>
        {!aiFormReady ? <div className="skeleton lines" /> : <form className="ai-settings-form" onSubmit={saveAi}>
          <div className="ai-settings-grid">
            <label>제공자<select value={aiProvider} onChange={event => { const provider = event.target.value; setAiProvider(provider); setAiTestResult(null); setAiDrafts(current => ({ ...current, [provider]: current[provider] || getAiDraft(provider, current, aiConfigs[provider]) })); loadAiProvider(provider).catch(() => notify('AI 설정을 불러오지 못했습니다.', 'error')) }}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option></select></label>
            <label>API key<input type="password" value={aiDraft.api_key} onChange={event => setAiDrafts(current => ({ ...current, [aiProvider]: { ...aiDraft, provider: aiProvider, api_key: event.target.value } }))} placeholder={aiConfig?.api_key_set ? '변경하려면 새 키 입력' : 'API 키 입력'} /></label>
            <label>모델<select value={aiDraft.model} onChange={event => setAiDrafts(current => ({ ...current, [aiProvider]: { ...aiDraft, provider: aiProvider, model: event.target.value } }))}>{aiModelOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Base URL<input value={aiDraft.base_url} onChange={event => setAiDrafts(current => ({ ...current, [aiProvider]: { ...aiDraft, provider: aiProvider, base_url: event.target.value } }))} placeholder={aiDefault.base_url} /></label>
          </div>
          <div className="integration-body ai-settings-footer"><div><strong>{aiBindingLabel}</strong><small>제공자별로 모델과 API 키를 따로 저장합니다. 선택한 제공자에 맞는 설정만 불러옵니다.</small></div><div className="ai-settings-actions"><button type="button" className="secondary" disabled={!!busy || !(aiConfig?.api_key_set || aiConfig?.saved_api_key)} onClick={testAi}>{busy === 'ai-test' ? <LoaderCircle className="spin" /> : <RefreshCw />} 연결 테스트</button><button className="primary" disabled={busy === 'ai-save'}>{busy === 'ai-save' ? <LoaderCircle className="spin" /> : <Bot />} 저장</button></div></div>
        </form>}
        {aiTestResult ? <p className={`ai-test-result ${aiTestResult.ok ? 'ok' : 'error'}`}>{aiTestResult.ok ? <Check /> : null} {aiTestResult.message}</p> : null}
        {aiConfig ? <dl className="diagnostics"><div><dt>제공자</dt><dd>{aiConfig.binding?.provider_name || aiConfig.provider_name || aiConfig.provider}</dd></div><div><dt>모델</dt><dd>{aiConfig.binding?.model || aiConfig.model || 'API 키 필요'}</dd></div><div><dt>매칭</dt><dd>{aiConfig.binding?.label || aiConfig.binding_label || aiConfig.message || '정보 없음'}</dd></div><div><dt>상태</dt><dd>{aiConfig.message || '정보 없음'}</dd></div><div><dt>설정 출처</dt><dd>{aiConfig.source_label || aiConfig.source || '알 수 없음'}</dd></div><div><dt>저장된 키</dt><dd>{aiConfig.binding?.api_key_set || aiConfig.saved_api_key ? '있음' : '없음'}</dd></div></dl> : null}
      </section>
      <TagManager notify={notify} onDataChanged={onDataChanged} onTagClick={onNavigateToTag} />
      <TrashSection notify={notify} onDataChanged={onDataChanged} />
      {error ? <p className="inline-error">{error} <button onClick={load}>다시 시도</button></p> : null}
      <p className="muted app-version">WorkManager v{__APP_VERSION__}</p>
    </div>
  </>
}
