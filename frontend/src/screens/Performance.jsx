import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, CheckCircle2, Clock3, LoaderCircle, Sparkles } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { TagChips, TagFilter } from '../components/TagsInput'

const iso = date => date.toLocaleDateString('en-CA')
const range = preset => {
  const end = new Date(), start = new Date(end)
  if (preset === 'month') start.setDate(1)
  else if (preset === 'quarter') start.setMonth(Math.floor(end.getMonth() / 3) * 3, 1)
  else start.setMonth(0, 1)
  return [iso(start), iso(end)]
}

export default function Performance({ notify, onDataChanged }) {
  const [preset, setPreset] = useState('month')
  const [dates, setDates] = useState(() => range('month'))
  const [selected, setSelected] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [pending, setPending] = useState(null)
  const selectedKey = selected.join('|')
  const allTags = useMemo(() => data?.tags || [], [data])
  const load = async () => {
    setLoading(true)
    try { setData(await api.achievements(dates[0], dates[1], selected)) }
    catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [dates[0], dates[1], selectedKey])
  const choose = value => { setPreset(value); if (value !== 'custom') setDates(range(value)) }
  const summarize = async () => {
    setLoading(true)
    try {
      const result = await api.aiPeriodSummary(dates[0], dates[1], selected)
      setSummary([result.headline, result.narrative].filter(Boolean).join('\n') || '요약 결과가 없습니다.')
    } catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  const suggest = async () => {
    setLoading(true)
    try { const result = await api.aiProgressSuggestions(dates[0], dates[1], selected); setSuggestions(result.items || []) }
    catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  const apply = async item => {
    setLoading(true)
    try {
      await api.aiApply({ action: item.action, entity: item.entity, id: item.id, data: item.data })
      setSuggestions(current => current.filter(value => value !== item)); setPending(null)
      notify('선택한 AI 제안을 적용했습니다.'); await onDataChanged?.(); await load()
    } catch (error) { notify(error.message, 'error') }
    finally { setLoading(false) }
  }
  const items = data?.timeline || [], stats = data?.summary || {}
  return <><Header title="성과" subtitle="기간별 완료 업무와 활동 기록을 되돌아보세요."/><div className="content performance-page">
    <section className="performance-toolbar"><div className="view-switch">{[['year','올해'],['quarter','분기'],['month','월'],['custom','직접 선택']].map(([value,label]) => <button className={preset===value?'active':''} key={value} onClick={()=>choose(value)}>{label}</button>)}</div><div className="date-range"><input aria-label="시작일" type="date" value={dates[0]} onChange={event=>{setPreset('custom');setDates([event.target.value,dates[1]])}}/><span>–</span><input aria-label="종료일" type="date" value={dates[1]} onChange={event=>{setPreset('custom');setDates([dates[0],event.target.value])}}/></div></section>
    <TagFilter tags={allTags} selected={selected} onChange={setSelected}/>
    {loading&&!data?<div className="ai-empty"><LoaderCircle className="spin"/> 불러오는 중…</div>:<><section className="performance-stats"><div><CheckCircle2/><strong>{stats.completed_tasks||0}</strong><span>완료 업무</span></div><div><Clock3/><strong>{stats.work_logs||0}</strong><span>업무 기록</span></div><div><CalendarRange/><strong>{stats.events||0}</strong><span>일정</span></div></section>
      <section className="performance-summary"><div><h2>AI 기간 요약</h2><button className="secondary" disabled={loading} onClick={summarize}><Sparkles/> 요약 만들기</button></div><p className="summary-text">{summary||'선택한 기간의 성과를 AI가 간결하게 정리해 드립니다.'}</p></section>
      <section className="performance-summary"><div><h2>AI 진행 제안</h2><button className="secondary" disabled={loading} onClick={suggest}><Sparkles/> 제안 받기</button></div>{suggestions.length?<div className="suggestion-list">{suggestions.map((item,index)=><article key={`${item.id}-${index}`}><div><strong>업무 #{item.id} 진행 제안</strong><p>{item.reason}</p><small>진행률 {item.data?.progress??'변경 없음'} · 완료일 {item.data?.due_date||'변경 없음'}</small></div>{pending===item?<span className="confirm-inline"><button className="secondary" onClick={()=>setPending(null)}>취소</button><button className="primary" onClick={()=>apply(item)}>적용 확인</button></span>:<button className="secondary" onClick={()=>setPending(item)}>검토 후 적용</button>}</article>)}</div>:<p>제안을 받아도 자동 저장되지 않습니다.</p>}</section>
      <section className="performance-timeline"><h2>활동 타임라인</h2>{items.length?items.map((item,index)=><article key={`${item.type}-${item.id}-${index}`}><time>{item.date}</time><div><small>{item.type_label||item.type}</small><strong>{item.title||item.content}</strong><TagChips tags={item.tags}/></div></article>):<p className="empty-state">선택한 기간에 기록된 활동이 없습니다.</p>}</section></>}
  </div></>
}
