import { useEffect, useState } from 'react'
import { ListTodo, ExternalLink } from 'lucide-react'
import { api } from '../api'

const statusLabel = { todo: '예정', doing: '진행 중', done: '완료' }
const priorityLabel = { low: '낮음', normal: '보통', high: '높음' }

const formatTimestamp = value => {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(parsed)
}

export default function PublicTask({ token }) {
  const [task, setTask] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPasswordError('')
    api.publicTask(token).then(result => { if (!cancelled) { setTask(result); setNeedsPassword(false) } })
      .catch(err => { if (!cancelled) { if (err.status === 401) setNeedsPassword(true); else setError(err.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  const submitPassword = e => {
    e.preventDefault()
    setLoading(true); setPasswordError('')
    api.publicTask(token, password).then(result => { setTask(result); setNeedsPassword(false) })
      .catch(err => { if (err.status === 401 || err.status === 403) setPasswordError(err.message); else setError(err.message) })
      .finally(() => setLoading(false))
  }
  return <main className="public-changelog">
    <header><span><ListTodo aria-hidden="true"/> WorkManager</span><div><h1>공유된 업무</h1><p>로그인 없이 보는 읽기 전용 화면입니다.</p></div></header>
    <div className="content changelog-page">
      {needsPassword ? <section className="changelog-panel"><form className="checklist-editor-add" onSubmit={submitPassword}><input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요" aria-label="공유 링크 비밀번호"/><button type="submit" className="text-button" disabled={loading}>{loading ? '확인 중…' : '확인'}</button></form>{passwordError ? <p className="empty-state">{passwordError}</p> : null}</section>
      : loading ? <p className="empty-state">불러오는 중.</p> : error ? <p className="empty-state">{error}</p> : task ? <section className="changelog-panel">
        <div className="section-title"><div><h2>{task.title}</h2><p>상태 {statusLabel[task.status] || task.status} · 우선순위 {priorityLabel[task.priority] || task.priority} · 진행률 {task.progress}%</p></div></div>
        {task.description ? <p>{task.description}</p> : null}
        <dl className="public-task-meta">
          {task.start_date ? <div><dt>시작일</dt><dd>{task.start_date}</dd></div> : null}
          {task.due_date ? <div><dt>마감일</dt><dd>{task.due_date}</dd></div> : null}
          {task.tags?.length ? <div><dt>태그</dt><dd>{task.tags.join(', ')}</dd></div> : null}
          {task.estimated_minutes ? <div><dt>예상 소요 시간</dt><dd>{task.estimated_minutes}분</dd></div> : null}
        </dl>
        {task.checklist?.length ? <div><p className="checklist-progress">체크리스트 {task.checklist.filter(i => i.done).length}/{task.checklist.length}</p><ul>{task.checklist.map(item => <li key={item.id} className={item.done ? 'checklist-done-text' : undefined}>{item.text}</li>)}</ul></div> : null}
        {task.custom_fields?.length ? <dl className="public-task-meta">{task.custom_fields.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : null}
        {task.link_url ? <a className="task-link" href={task.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>관련 링크</a> : null}
        {task.links?.length ? <ul className="public-task-links">{task.links.map(l => <li key={l.id}><a className="task-link" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>{l.label || l.url}</a></li>)}</ul> : null}
        <p className="empty-state">최종 수정 {formatTimestamp(task.updated_at)}</p>
      </section> : null}
    </div>
  </main>
}
