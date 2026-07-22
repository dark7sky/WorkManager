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
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    api.publicTodo(token).then(result => { if (!cancelled) setTodo(result) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  return <main className="public-changelog">
    <header><span><ListChecks aria-hidden="true"/> WorkManager</span><div><h1>공유된 할 일</h1><p>로그인 없이 보는 읽기 전용 화면입니다.</p></div></header>
    <div className="content changelog-page">
      {loading ? <p className="empty-state">불러오는 중.</p> : error ? <p className="empty-state">{error}</p> : todo ? <section className="changelog-panel">
        <div className="section-title"><div><h2>{todo.title}</h2><p>상태 {todo.completed ? '완료' : '예정'} · 우선순위 {priorityLabel[todo.priority] || todo.priority}</p></div></div>
        {todo.memo ? <p>{todo.memo}</p> : null}
        <dl className="public-task-meta">
          {todo.todo_date ? <div><dt>날짜</dt><dd>{todo.todo_date}{todo.todo_time ? ` ${todo.todo_time}` : ''}</dd></div> : null}
          {todo.tags?.length ? <div><dt>태그</dt><dd>{todo.tags.join(', ')}</dd></div> : null}
        </dl>
        {todo.checklist?.length ? <div><p className="checklist-progress">체크리스트 {todo.checklist.filter(i => i.done).length}/{todo.checklist.length}</p><ul>{todo.checklist.map(item => <li key={item.id} className={item.done ? 'checklist-done-text' : undefined}>{item.text}</li>)}</ul></div> : null}
        {todo.link_url ? <a className="task-link" href={todo.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>관련 링크</a> : null}
        <p className="empty-state">생성 {formatTimestamp(todo.created_at)}</p>
      </section> : null}
    </div>
  </main>
}
