import { useEffect, useState } from 'react'
import { ListChecks, ExternalLink } from 'lucide-react'
import { api } from '../api'

const priorityLabel = { low: '낮음', normal: '보통', high: '높음' }

const formatTimestamp = value => {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(parsed)
}

export default function PublicTodo({ token }) {
  const [todo, setTodo] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPasswordError('')
    api.publicTodo(token).then(result => { if (!cancelled) { setTodo(result); setNeedsPassword(false) } })
      .catch(err => { if (!cancelled) { if (err.status === 401) setNeedsPassword(true); else setError(err.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  const submitPassword = e => {
    e.preventDefault()
    setLoading(true); setPasswordError('')
    api.publicTodo(token, password).then(result => { setTodo(result); setNeedsPassword(false) })
      .catch(err => { if (err.status === 401 || err.status === 403) setPasswordError(err.message); else setError(err.message) })
      .finally(() => setLoading(false))
  }
  return <main className="public-changelog">
    <header><span><ListChecks aria-hidden="true"/> WorkManager</span><div><h1>공유된 할 일</h1><p>로그인 없이 보는 읽기 전용 화면입니다.</p></div></header>
    <div className="content changelog-page">
      {needsPassword ? <section className="changelog-panel"><form className="checklist-editor-add" onSubmit={submitPassword}><input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" aria-label="공유 링크 비밀번호"/><button type="submit" className="text-button" disabled={loading}>{loading ? '확인 중…' : '확인'}</button></form>{passwordError ? <p className="empty-state">{passwordError}</p> : null}</section>
      : loading ? <p className="empty-state">불러오는 중.</p> : error ? <p className="empty-state">{error}</p> : todo ? <section className="changelog-panel">
        <div className="section-title"><div><h2>{todo.title}</h2><p>상태 {todo.completed ? '완료' : '예정'} · 우선순위 {priorityLabel[todo.priority] || todo.priority}</p></div></div>
        {todo.memo ? <p>{todo.memo}</p> : null}
        <dl className="public-task-meta">
          {todo.todo_date ? <div><dt>날짜</dt><dd>{todo.todo_date}{todo.todo_time ? ` ${todo.todo_time}` : ''}</dd></div> : null}
          {todo.tags?.length ? <div><dt>태그</dt><dd>{todo.tags.join(', ')}</dd></div> : null}
        </dl>
        {todo.checklist?.length ? <div><p className="checklist-progress">체크리스트 {todo.checklist.filter(i => i.done).length}/{todo.checklist.length}</p><ul>{todo.checklist.map(item => <li key={item.id} className={item.done ? 'checklist-done-text' : undefined}>{item.text}</li>)}</ul></div> : null}
        {todo.custom_fields?.length ? <dl className="public-task-meta">{todo.custom_fields.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : null}
        {todo.link_url ? <a className="task-link" href={todo.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>관련 링크</a> : null}
        {todo.links?.length ? <ul className="public-task-links">{todo.links.map(l => <li key={l.id}><a className="task-link" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>{l.label || l.url}</a></li>)}</ul> : null}
        <p className="empty-state">생성 {formatTimestamp(todo.created_at)}</p>
      </section> : null}
    </div>
  </main>
}
