import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, History, LoaderCircle, Send, Lightbulb, ListTodo } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { changelogUpdates } from '../data'
import { countPendingFeatureRequests, featureRequestStatusLabel } from '../featureRequests'

const formatTimestamp = value => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', hour12: false,
}).format(new Date(value))

export default function Changelog({ notify, publicMode = false }) {
  const [text, setText] = useState('')
  const [requests, setRequests] = useState([])
  const [serverUpdates, setServerUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.publicChangelog()
      setRequests(result.requests || [])
      setServerUpdates(result.entries || [])
    } catch (error) { notify?.(error.message, 'error') }
    finally { setLoading(false) }
  }, [notify])
  useEffect(() => { load() }, [load])
  const updates = useMemo(() => [
    ...serverUpdates.map(item => ({
      id: `request-${item.feature_request_id || item.id}`,
      timestamp: item.released_at,
      description: item.description,
      requestContent: item.request_content,
      requestedAt: item.requested_at,
    })),
    ...changelogUpdates,
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [serverUpdates])
  const submit = async event => {
    event.preventDefault()
    const content = text.trim()
    if (!content) return
    setSaving(true)
    try {
      await api.createFeatureRequest(content)
      setText('')
      await load()
      notify?.('요청사항을 Codex 개선 큐에 추가했습니다.')
    } catch (error) { notify?.(error.message, 'error') }
    finally { setSaving(false) }
  }
  const pendingCount = countPendingFeatureRequests(requests)
  const content = <div className={`content changelog-page ${publicMode ? 'public-changelog-content' : ''}`}>
    <section className="changelog-panel feature-request-panel" aria-labelledby="feature-request-title">
      <div className="section-title"><div><h2 id="feature-request-title">기능 개선 요청</h2><p>모든 사용자의 공개 개선 큐입니다. 대기 {pendingCount}건 · 진행 중 {requests.filter(item => item.status === 'in_progress').length}건</p></div><Lightbulb aria-hidden="true"/></div>
      {!publicMode ? <form className="feature-request-form" onSubmit={submit}>
        <label htmlFor="feature-request-input">요청사항 입력</label>
        <textarea id="feature-request-input" value={text} maxLength={5000} onChange={event => setText(event.target.value)} placeholder="예: 프로젝트별 칸반 보드를 추가하고 담당자별 업무량을 같이 보여주세요."/>
        <footer><small>{text.trim().length}/5000자 · 등록 후 공개 개선 큐에서 함께 확인할 수 있습니다.</small><button className="primary" disabled={!text.trim() || saving}>{saving ? <LoaderCircle className="spin"/> : <Send/>} 요청 추가</button></footer>
      </form> : null}
      <div className="feature-request-list" aria-live="polite">
        {loading ? <p className="empty-state">요청사항을 불러오는 중입니다…</p> : requests.length ? requests.map(item => <article key={item.id} className={`feature-request ${item.status}`}>
          <div><strong>{item.content}</strong><time dateTime={item.created_at}>요청일 {formatTimestamp(item.created_at)}</time></div><span className="request-status">{featureRequestStatusLabel[item.status] || item.status}</span>
        </article>) : <p className="empty-state">현재 대기 중인 개선 요청이 없습니다.</p>}
      </div>
    </section>
    <section className="changelog-panel" aria-labelledby="changelog-title">
      <div className="section-title"><div><h2 id="changelog-title">업데이트 기록</h2><p>완료된 개선 요청은 요청 내용과 요청일을 보존해 기록합니다.</p></div><History aria-hidden="true"/></div>
      <ol className="changelog-list">
        {updates.map(update => <li key={update.id}>
          <time dateTime={update.timestamp}><Clock3 aria-hidden="true"/>{formatTimestamp(update.timestamp)}</time>
          <div>{update.requestContent ? <p className="changelog-request"><b>요청</b> {update.requestContent}<small>요청일 {formatTimestamp(update.requestedAt)}</small></p> : null}<p>{update.description}</p></div>
        </li>)}
      </ol>
    </section>
  </div>
  if (!publicMode) return <><Header title="변경 이력" subtitle="WorkManager 업데이트 내역과 Codex 개선 요청을 확인하세요."/>{content}</>
  return <main className="public-changelog"><header><span><ListTodo aria-hidden="true"/> WorkManager</span><div><h1>변경 이력과 개선 요청</h1><p>로그인 없이 확인할 수 있는 공개 제품 업데이트 페이지입니다.</p></div></header>{content}</main>
}
