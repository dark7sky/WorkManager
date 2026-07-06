import { useEffect, useState } from 'react'
import { Bot, CalendarSync, Check, Cloud, LoaderCircle, Monitor, Moon, RefreshCw, Sun } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'

const themes = [['auto',Monitor,'시스템'],['light',Sun,'라이트'],['dark',Moon,'다크']]
export default function Settings({ theme, setTheme, notify, onDataChanged }) {
  const [data,setData] = useState(null), [calendars,setCalendars] = useState([]), [busy,setBusy] = useState(''), [error,setError] = useState('')
  const load = async () => {
    setError('')
    try {
      const [integrations, ai] = await Promise.all([api.googleStatus(), api.aiStatus().catch(()=>({enabled:false,source:'local-rules'}))])
      setData({...integrations,ai})
      if (integrations.connected || integrations.google_connected || integrations.google?.connected) {
        const response = await api.googleCalendars()
        setCalendars(response.items || response.calendars || [])
        if (response.selected_calendar_id) setData(current=>({...current,selected_calendar_id:response.selected_calendar_id}))
      }
    } catch(e) { setError(e.message) }
  }
  useEffect(()=>{ load() },[])
  const select = async id => { setBusy('select'); try { await api.selectGoogleCalendar(id); setData(d=>({...d,selected_calendar_id:id})); notify('연동 캘린더를 저장했습니다.') } catch(e){notify(e.message,'error')} finally{setBusy('')} }
  const sync = async()=>{setBusy('sync');try{const r=await api.syncGoogleCalendar();const count=(r?.pushed||0)+(r?.imported||0)+(r?.updated||0);notify(`동기화했습니다 · ${count}개 변경`);await Promise.all([load(),onDataChanged?.()])}catch(e){notify(e.message,'error')}finally{setBusy('')}}
  const connected = data?.connected ?? data?.google_connected ?? data?.google?.connected
  const selected = data?.selected_calendar_id ?? data?.google?.selected_calendar_id
  return <><Header title="설정" subtitle="화면과 외부 서비스 연결을 내 작업 방식에 맞게 관리하세요."/><div className="content settings-page">
    <section className="settings-card"><div className="settings-heading"><span><Monitor/></span><div><h2>화면 테마</h2><p>시스템 설정을 따르거나 원하는 화면을 고정합니다.</p></div></div><div className="theme-options">{themes.map(([id,Icon,label])=><button className={theme===id?'selected':''} key={id} onClick={()=>setTheme(id)}><Icon/><span>{label}</span>{theme===id?<Check/>:null}</button>)}</div></section>
    <section className="settings-card"><div className="settings-heading"><span><CalendarSync/></span><div><h2>Google 캘린더</h2><p>업무용 캘린더의 일정을 WorkManager와 동기화합니다.</p></div><em className={`status-pill ${connected?'online':''}`}>{connected?'연결됨':'연결 안 됨'}</em></div>
      {!data?<div className="skeleton lines"/>:connected?<div className="integration-body"><label>연동할 캘린더<select value={selected||''} onChange={e=>select(e.target.value)} disabled={busy==='select'}><option value="">캘린더 선택</option>{calendars.map(c=><option key={c.id} value={c.id}>{c.summary||c.name}{c.primary?' (기본)':''}</option>)}</select></label><button className="primary" disabled={!selected||!!busy} onClick={sync}>{busy==='sync'?<LoaderCircle className="spin"/>:<RefreshCw/>} 지금 동기화</button><small>선택한 캘린더와 양방향으로 변경 사항을 맞춥니다. 중복 일정은 만들지 않습니다.</small></div>:<div className="integration-empty"><Cloud/><div><strong>Google 계정 연결이 필요합니다</strong><p>로그아웃 후 Google로 로그인하면 캘린더를 선택할 수 있습니다.</p></div><a className="secondary" href="/api/auth/google/start">Google 연결</a></div>}
    </section>
    <section className="settings-card"><div className="settings-heading"><span><Bot/></span><div><h2>AI 서비스</h2><p>자연어 업무 등록과 추천에 사용하는 엔진 상태입니다.</p></div><em className={`status-pill ${(data?.ai?.enabled??data?.ai?.configured)?'online':''}`}>{(data?.ai?.enabled??data?.ai?.configured)?'API 설정됨':'로컬 규칙'}</em></div>{data?<dl className="diagnostics"><div><dt>엔진</dt><dd>{data.ai?.provider||data.ai?.source||data.ai?.mode||'local-rules'}</dd></div><div><dt>모델</dt><dd>{data.ai?.model||'API 미설정'}</dd></div><div><dt>상태</dt><dd>{data.ai?.message||'사용 가능'}</dd></div></dl>:<div className="skeleton lines"/>}</section>
    {error?<p className="inline-error">{error} <button onClick={load}>다시 시도</button></p>:null}
  </div></>
}
