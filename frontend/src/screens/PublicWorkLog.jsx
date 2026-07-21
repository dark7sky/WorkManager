import { useEffect, useState } from 'react'
import { NotebookPen } from 'lucide-react'
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
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    api.publicWorkLog(token).then(result => { if (!cancelled) setLog(result) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])
  return <main className="public-changelog">
    <header><span><NotebookPen aria-hidden="true"/> WorkManager</span><div><h1>공유된 업무 기록</h1><p>로그인 없이 보는 읽기 전용 화면입니다.</p></div></header>
    <div className="content changelog-page">
      {loading ? <p className="empty-state">불러오는 중.</p> : error ? <p className="empty-state">{error}</p> : log ? <section className="changelog-panel">
        <div className="section-title"><div><h2>{log.content}</h2><p>우선순위 {priorityLabel[log.priority] || log.priority}{log.billable ? ' · 청구 가능' : ''}</p></div></div>
        <dl className="public-task-meta">
          {log.log_date ? <div><dt>날짜</dt><dd>{log.log_date}{log.log_time ? ` ${log.log_time}` : ''}</dd></div> : null}
          {log.duration_minutes ? <div><dt>소요 시간</dt><dd>{log.duration_minutes}분</dd></div> : null}
          {log.tags?.length ? <div><dt>태그</dt><dd>{log.tags.join(', ')}</dd></div> : null}
        </dl>
        <p className="empty-state">생성 {formatTimestamp(log.created_at)}</p>
      </section> : null}
    </div>
  </main>
}
