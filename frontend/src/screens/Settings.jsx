import { useEffect, useMemo, useState } from 'react'
import { Bell, Bot, CalendarSync, Check, Cloud, Download, LoaderCircle, Monitor, Moon, Plus, RefreshCw, Smartphone, Sun, UserPlus, X } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import TrashSection from '../components/TrashSection'
import { addTeamMember, removeTeamMember, teamMemberReassignmentOptions } from '../teamMembers'
import { DEFAULT_TEAM_MEMBER_DAILY_CAPACITY } from '../teamMemberCapacity'
import { summarizeTeamMemberRoster } from '../taskFilters'

const themes = [['auto', Monitor, '시스템'], ['light', Sun, '라이트'], ['dark', Moon, '다크']]
const capacityOptions = Array.from({ length: 9 }, (_, index) => index + 1)
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

export default function Settings({ theme, setTheme, teamMembers = [], tasks = [], teamMemberCapacities = {}, setTeamMemberCapacity, setTeamMembers, notify, onDataChanged, canInstall, onInstall, notificationPermission, onEnableNotifications }) {
  const [data, setData] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [workflowSettings, setWorkflowSettings] = useState(null)
  const [aiConfig, setAiConfig] = useState(null)
  const [aiDraft, setAiDraft] = useState({ provider: 'openai', api_key: '', base_url: '', model: '' })
  const [memberName, setMemberName] = useState('')
  const [reassignmentTargets, setReassignmentTargets] = useState({})

  const todayIso = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const memberRoster = useMemo(() => summarizeTeamMemberRoster(tasks, teamMembers, todayIso, 14, DEFAULT_TEAM_MEMBER_DAILY_CAPACITY, teamMemberCapacities), [tasks, teamMembers, todayIso, teamMemberCapacities])
  const memberRosterMap = useMemo(() => new Map(memberRoster.map(member => [member.assignee, member])), [memberRoster])

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

  const addMember = event => {
    event.preventDefault()
    if (!memberName.trim()) return
    const next = addTeamMember(teamMembers, memberName)
    setTeamMembers?.(next)
    setMemberName('')
    notify('팀원을 저장했습니다.')
  }

  const deleteMember = name => {
    const summary = memberRosterMap.get(name)
    if (summary?.total) {
      notify(`‘${name}’ 담당 업무 ${summary.total}건을 먼저 다른 팀원에게 옮겨 주세요.`, 'error')
      return
    }
    setTeamMembers?.(removeTeamMember(teamMembers, name))
    notify('팀원을 제거했습니다.')
  }

  const reassignMemberTasks = async from => {
    const to = String(reassignmentTargets[from] ?? '').trim()
    const assignedTasks = tasks.filter(task => task.assignee_name?.trim() === from)
    if (!to || to === from) {
      notify('업무를 옮길 다른 팀원을 먼저 선택해 주세요.', 'error')
      return
    }
    if (!assignedTasks.length) {
      notify(`‘${from}’에게 배정된 업무가 없습니다.`)
      return
    }
    setBusy(`reassign-${from}`)
    try {
      const results = await Promise.allSettled(assignedTasks.map(task => api.updateTask(task.id, { assignee_name: to })))
      const succeeded = results.filter(result => result.status === 'fulfilled').length
      const failed = results.length - succeeded
      await onDataChanged?.()
      if (failed) {
        notify(`‘${from}’ 담당 업무 ${succeeded}건을 ‘${to}’에게 옮겼고 ${failed}건은 다시 확인이 필요합니다.`, 'error')
      } else {
        notify(`‘${from}’ 담당 업무 ${succeeded}건을 ‘${to}’에게 옮겼습니다.`)
      }
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
        <div className="settings-heading"><span><UserPlus /></span><div><h2>팀원 명단</h2><p>업무 담당자 입력과 필터에서 반복 사용할 이름을 관리합니다.</p></div><em className="status-pill">{teamMembers.length}명</em></div>
        <form className="member-form" onSubmit={addMember}><label htmlFor="team-member-name">팀원 이름</label><input id="team-member-name" value={memberName} maxLength="120" onChange={e => setMemberName(e.target.value)} placeholder="예: 김민준" /><button className="secondary" disabled={!memberName.trim()}><Plus /> 추가</button></form>
        {teamMembers.length ? <>
          <div className="member-list" aria-label="저장된 팀원">{teamMembers.map(name => { const summary = memberRosterMap.get(name); const assignedCount = summary?.total || 0; const locked = assignedCount > 0; return <span key={name} className={locked ? 'member-tag locked' : 'member-tag'}>{name}{assignedCount ? <small>배정 {assignedCount}건</small> : null}<button type="button" aria-label={locked ? `${name} 제거 불가` : `${name} 제거`} disabled={locked} title={locked ? `담당 업무 ${assignedCount}건을 다른 팀원에게 옮긴 뒤 제거할 수 있습니다.` : `${name} 제거`} onClick={() => deleteMember(name)}><X /></button></span> })}</div>
          <p className="member-list-note">업무가 배정된 팀원은 담당 업무를 먼저 재배정한 뒤 명단에서 제거할 수 있습니다.</p>
        </> : <p className="empty-state settings-empty">저장된 팀원이 없습니다.</p>}
        {memberRoster.length ? <div className="member-roster" aria-label="팀원별 업무 현황">{memberRoster.map(member => { const options = teamMemberReassignmentOptions(teamMembers, tasks, member.assignee); const target = reassignmentTargets[member.assignee] ?? options[0] ?? ''; const reassignBusy = busy === `reassign-${member.assignee}`; return <article key={member.assignee} className={member.overloadDays || member.overdue ? 'has-risk' : undefined}><strong>{member.assignee}</strong><span>진행 {member.active}건</span><span>완료 {member.done}건</span><span>배정 {member.total}건</span>{member.overdue ? <em>지연 {member.overdue}건</em> : <small>지연 없음</small>}{member.scheduledTasks ? <small>14일 부하 최대 {member.peakDailyLoad}건/일</small> : <small>예정 업무 없음</small>}<label className="member-capacity"><span>일일 한도</span><select value={member.dailyLimit || DEFAULT_TEAM_MEMBER_DAILY_CAPACITY} onChange={event => setTeamMemberCapacity?.(member.assignee, event.target.value)}>{capacityOptions.map(limit => <option key={limit} value={limit}>{limit}건</option>)}</select></label>{member.overloadDays ? <em>초과 {member.overloadDays}일</em> : null}{member.total ? options.length ? <div className="member-reassign"><label><span>업무 옮기기</span><select value={target} disabled={reassignBusy} onChange={event => setReassignmentTargets(current => ({ ...current, [member.assignee]: event.target.value }))}>{options.map(name => <option key={name} value={name}>{name}</option>)}</select></label><button type="button" className="secondary" disabled={!target || reassignBusy} onClick={() => reassignMemberTasks(member.assignee)}>{reassignBusy ? <LoaderCircle className="spin" /> : null}{reassignBusy ? '이동 중…' : '재배정'}</button></div> : <small>업무를 옮길 다른 팀원이 아직 없습니다.</small> : null}</article>})}</div> : null}
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
    </div>
  </>
}
