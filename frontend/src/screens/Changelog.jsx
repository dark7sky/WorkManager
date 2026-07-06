import { Clock3, History } from 'lucide-react'
import Header from '../components/Header'
import { changelogUpdates } from '../data'

const formatTimestamp = value => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
}).format(new Date(value))

export default function Changelog() {
  const updates = [...changelogUpdates].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return <><Header title="변경 이력" subtitle="WorkManager 업데이트 내역과 적용 시점을 확인하세요."/><div className="content changelog-page">
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
