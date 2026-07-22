import { useEffect, useState } from 'react'
import { NotebookPen, ExternalLink } from 'lucide-react'
import { api } from '../api'

const priorityLabel = { low: '낮음', normal: '보통', high: '높음' }

const formatTimestamp = value => {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(parsed)
}

export default function PublicWorkLog({ token }) {
  const [log, setLog] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPasswordError('')
    api.publicWorkLog(token).then(result => { if (!cancelled) { setLog(result); setNeedsPassword(false) } })
      .catch(err => { if (!cancelled) { if (err.status === 401) setNeedsPassword(true); else setError(err.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  const submitPassword = e => {
    e.preventDefault()
    setLoading(true); setPasswordError('')
    api.publicWorkLog(token, password).then(result => { setLog(result); setNeedsPassword(false) })
      .catch(err => { if (err.status === 401 || err.status === 403) setPasswordError(err.message); else setError(err.message) })
      .finally(() => setLoading(false))
  }
  return <main className="public-changelog">
    <header><span><NotebookPen aria-hidden="true"/> WorkManager</span><div><h1>공유된 업무 기록</h1><p>로그인 없이 보는 읽기 전용 화면입니다.</p></div></header>
    <div className="content changelog-page">
      {needsPassword ? <section className="changelog-panel"><form className="checklist-editor-add" onSubmit={submitPassword}><input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" aria-label="공유 링크 비밀번호"/><button type="submit" className="text-button" disabled={loading}>{loading ? '확인 중…' : '확인'}</button></form>{passwordError ? <p className="empty-state">{passwordError}</p> : null}</section>
      : loading ? <p className="empty-state">불러오는 중.</p> : error ? <p className="empty-state">{error}</p> : log ? <section className="changelog-panel">
        <div className="section-title"><div><h2>{log.content}</h2><p>우선순위 {priorityLabel[log.priority] || log.priority}{log.billable ? ' · 청구 가능' : ''}</p></div></div>
        <dl className="public-task-meta">
          {log.log_date ? <div><dt>날짜</dt><dd>{log.log_date}{log.log_time ? ` ${log.log_time}` : ''}</dd></div> : null}
          {log.duration_minutes ? <div><dt>소요 시간</dt><dd>{log.duration_minutes}분</dd></div> : null}
          {log.tags?.length ? <div><dt>태그</dt><dd>{log.tags.join(', ')}</dd></div> : null}
        </dl>
        {log.checklist?.length ? <div><p className="checklist-progress">체크리스트 {log.checklist.filter(i => i.done).length}/{log.checklist.length}</p><ul>{log.checklist.map(item => <li key={item.id} className={item.done ? 'checklist-done-text' : undefined}>{item.text}</li>)}</ul></div> : null}
        {log.link_url ? <a className="task-link" href={log.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>관련 링크</a> : null}
        <p className="empty-state">생성 {formatTimestamp(log.created_at)}</p>
      </section> : null}
    </div>
  </main>
}
