import { useEffect, useState } from 'react'
import { Clock3, History, LoaderCircle, Send, Lightbulb } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { changelogUpdates } from '../data'

const formatTimestamp = value => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
}).format(new Date(value))

const statusLabel = { pending: '대기', in_progress: '진행 중', done: '완료', dismissed: '보류' }

export default function Changelog({ notify }) {
  const updates = [...changelogUpdates].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const [text, setText] = useState('')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const loadRequests = async () => {
    setLoading(true)
    try { setRequests((await api.featureRequests('all')).items || []) }
    catch (error) { notify?.(error.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadRequests() }, [])
  const submit = async event => {
    event.preventDefault()
    const content = text.trim()
    if (!content) return
    setSaving(true)
    try {
      const created = await api.createFeatureRequest(content)
      setRequests(items => [created, ...items])
      setText('')
      notify?.('요청사항을 Codex 개선 큐에 추가했습니다.')
    } catch (error) {
      notify?.(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  const pendingCount = requests.filter(item => item.status === 'pending').length
  return <><Header title="변경 이력" subtitle="WorkManager 업데이트 내역과 Codex 개선 요청을 관리하세요."/><div className="content changelog-page">
    <section className="changelog-panel feature-request-panel" aria-labelledby="feature-request-title">
      <div className="section-title"><div><h2 id="feature-request-title">기능 개선 요청</h2><p>여러 사용자의 요청을 모아 Codex 자동 개선 루프가 하나씩 참고합니다. 현재 대기 {pendingCount}건</p></div><Lightbulb aria-hidden="true"/></div>
      <form className="feature-request-form" onSubmit={submit}>
        <label htmlFor="feature-request-input">요청사항 입력</label>
        <textarea id="feature-request-input" value={text} maxLength={5000} onChange={event => setText(event.target.value)} placeholder="예: 프로젝트별 칸반 보드를 추가하고 담당자별 업무량을 같이 보여주세요."/>
        <footer><small>{text.trim().length}/5000자 · 제출된 요청은 pending 상태로 저장됩니다.</small><button className="primary" disabled={!text.trim() || saving}>{saving ? <LoaderCircle className="spin"/> : <Send/>} 요청 추가</button></footer>
      </form>
      <div className="feature-request-list" aria-live="polite">
        {loading ? <p className="empty-state">요청사항을 불러오는 중입니다…</p> : requests.length ? requests.slice(0, 8).map(item => <article key={item.id} className={`feature-request ${item.status}`}>
          <div><strong>{item.content}</strong><time dateTime={item.created_at}>{formatTimestamp(item.created_at)}</time></div><span>{statusLabel[item.status] || item.status}</span>
        </article>) : <p className="empty-state">아직 등록된 개선 요청이 없습니다.</p>}
      </div>
    </section>
    <section className="changelog-panel" aria-labelledby="changelog-title">
      <div className="section-title"><div><h2 id="changelog-title">업데이트 기록</h2><p>각 변경은 배포 시각과 함께 기록됩니다.</p></div><History aria-hidden="true"/></div>
      <ol className="changelog-list">
        {updates.map(update => <li key={update.id}>
          <time dateTime={update.timestamp}><Clock3 aria-hidden="true"/>{formatTimestamp(update.timestamp)}</time>
          <p>{update.description}</p>
        </li>)}
      </ol>
    </section>
  </div></>
}
