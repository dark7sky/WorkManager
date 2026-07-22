import { useEffect, useState } from 'react'
import { CalendarDays, ExternalLink } from 'lucide-react'
import { api } from '../api'

const formatTimestamp = value => {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(parsed)
}

export default function PublicEvent({ token }) {
  const [event, setEvent] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPasswordError('')
    api.publicEvent(token).then(result => { if (!cancelled) { setEvent(result); setNeedsPassword(false) } })
      .catch(err => { if (!cancelled) { if (err.status === 401) setNeedsPassword(true); else setError(err.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  const submitPassword = e => {
    e.preventDefault()
    setLoading(true); setPasswordError('')
    api.publicEvent(token, password).then(result => { setEvent(result); setNeedsPassword(false) })
      .catch(err => { if (err.status === 401 || err.status === 403) setPasswordError(err.message); else setError(err.message) })
      .finally(() => setLoading(false))
  }
  return <main className="public-changelog">
    <header><span><CalendarDays aria-hidden="true"/> WorkManager</span><div><h1>공유된 일정</h1><p>로그인 없이 보는 읽기 전용 화면입니다.</p></div></header>
    <div className="content changelog-page">
      {needsPassword ? <section className="changelog-panel"><form className="checklist-editor-add" onSubmit={submitPassword}><input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" aria-label="공유 링크 비밀번호"/><button type="submit" className="text-button" disabled={loading}>{loading ? '확인 중…' : '확인'}</button></form>{passwordError ? <p className="empty-state">{passwordError}</p> : null}</section>
      : loading ? <p className="empty-state">불러오는 중.</p> : error ? <p className="empty-state">{error}</p> : event ? <section className="changelog-panel">
        <div className="section-title"><div><h2>{event.title}</h2></div></div>
        {event.description ? <p>{event.description}</p> : null}
        <dl className="public-task-meta">
          {event.location ? <div><dt>장소</dt><dd>{event.location}</dd></div> : null}
          {event.start_at ? <div><dt>시작</dt><dd>{formatTimestamp(event.start_at)}</dd></div> : null}
          {event.end_at ? <div><dt>종료</dt><dd>{formatTimestamp(event.end_at)}</dd></div> : null}
          {event.tags?.length ? <div><dt>태그</dt><dd>{event.tags.join(', ')}</dd></div> : null}
        </dl>
        {event.checklist?.length ? <div><p className="checklist-progress">체크리스트 {event.checklist.filter(i => i.done).length}/{event.checklist.length}</p><ul>{event.checklist.map(item => <li key={item.id} className={item.done ? 'checklist-done-text' : undefined}>{item.text}</li>)}</ul></div> : null}
        {event.custom_fields?.length ? <dl className="public-task-meta">{event.custom_fields.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : null}
        {event.link_url ? <a className="task-link" href={event.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>관련 링크</a> : null}
        {event.links?.length ? <ul className="public-task-links">{event.links.map(l => <li key={l.id}><a className="task-link" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>{l.label || l.url}</a></li>)}</ul> : null}
        <p className="empty-state">최종 수정 {formatTimestamp(event.updated_at)}</p>
      </section> : null}
    </div>
  </main>
}
