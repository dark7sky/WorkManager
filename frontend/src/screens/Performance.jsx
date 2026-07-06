import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, CheckCircle2, Clipboard, Clock3, LoaderCircle, Sparkles, Target } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { TagChips, TagFilter } from '../components/TagsInput'

const iso = date => date.toLocaleDateString('en-CA')
const getRange = preset => {
  const end = new Date(), start = new Date(end)
  if (preset === 'month') start.setDate(1)
  else if (preset === 'quarter') start.setMonth(Math.floor(end.getMonth() / 3) * 3, 1)
  else start.setMonth(0, 1)
  return [iso(start), iso(end)]
}
const PRESETS = [['year', '올해'], ['quarter', '이번 분기'], ['month', '이번 달'], ['custom', '직접 선택']]

export default function Performance({ notify, onDataChanged }) {
  const [preset, setPreset] = useState('month')
  const [dates, setDates] = useState(() => getRange('month'))
  const [selected, setSelected] = useState([])
  const [knownTags, setKnownTags] = useState([])
  const [data, setData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState('')
  const [summary, setSummary] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [pendingId, setPendingId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const invalidRange = !dates[0] || !dates[1] || dates[0] > dates[1]
  const selectedKey = selected.join('|')

  useEffect(() => {
    if (invalidRange) return undefined
    const controller = new AbortController()
    setReportLoading(true)
    api.achievements(dates[0], dates[1], selected, controller.signal)
      .then(result => { setData(result); setKnownTags(current => [...new Set([...current, ...(result.tags || [])])]) })
      .catch(error => { if (error.name !== 'AbortError') notify(error.message, 'error') })
      .finally(() => { if (!controller.signal.aborted) setReportLoading(false) })
    return () => controller.abort()
  }, [dates[0], dates[1], selectedKey, invalidRange, notify, refreshKey])

  const choosePreset = value => { setPreset(value); if (value !== 'custom') setDates(getRange(value)) }
  const runSummary = async () => {
    if (invalidRange) return
    setAiLoading('summary')
    try { setSummary(await api.aiPeriodSummary(dates[0], dates[1], selected)) }
    catch (error) { notify(error.message, 'error') }
    finally { setAiLoading('') }
  }
  const runSuggestions = async () => {
    if (invalidRange) return
    setAiLoading('suggestions')
    try {
      const result = await api.aiProgressSuggestions(dates[0], dates[1], selected)
      setSuggestions(result.items || [])
      if (!(result.items || []).length) notify('현재 기록에서 적용할 만한 진행률 제안을 찾지 못했습니다.')
    } catch (error) { notify(error.message, 'error') }
    finally { setAiLoading('') }
  }
  const applySuggestion = async item => {
    setAiLoading(`apply-${item.id}`)
    try {
      await api.aiApply({ action: item.action, entity: item.entity, id: item.id, data: item.data })
      setSuggestions(current => current.filter(value => value !== item)); setPendingId(null)
      notify('검토한 AI 제안을 적용했습니다.'); setRefreshKey(value => value + 1); await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
    finally { setAiLoading('') }
  }
  const copySummary = useCallback(async () => {
    const text = [summary?.headline, summary?.narrative].filter(Boolean).join('\n\n')
    if (!text) return
    try { await navigator.clipboard.writeText(text); notify('성과 요약을 클립보드에 복사했습니다.') }
    catch { notify('클립보드에 복사하지 못했습니다.', 'error') }
  }, [summary, notify])

  const items = data?.timeline || [], stats = data?.summary || {}
  const statItems = useMemo(() => [[CheckCircle2, stats.completed_tasks || 0, '완료 업무'], [Clock3, stats.work_logs || 0, '업무 기록'], [CalendarRange, stats.events || 0, '일정'], [Target, stats.active_tasks || 0, '진행 중 업무'], [CheckCircle2, stats.completed_todos || 0, '완료한 오늘 할 일']], [stats])

  return <><Header title="성과" subtitle="기간별 업무 기록을 모아보고, 평가 자료와 다음 행동으로 연결하세요."/><div className="content performance-page">
    <section className="performance-toolbar" aria-label="조회 기간"><div className="view-switch">{PRESETS.map(([value, label]) => <button type="button" className={preset === value ? 'active' : ''} key={value} onClick={() => choosePreset(value)}>{label}</button>)}</div><div className="date-range"><input aria-label="시작일" type="date" value={dates[0]} onChange={event => { setPreset('custom'); setDates([event.target.value, dates[1]]) }}/><span>–</span><input aria-label="종료일" type="date" value={dates[1]} onChange={event => { setPreset('custom'); setDates([dates[0], event.target.value]) }}/></div></section>
    {invalidRange ? <p className="inline-error">종료일은 시작일 이후여야 합니다.</p> : null}
    <TagFilter tags={knownTags} selected={selected} onChange={setSelected}/>
    {reportLoading && !data ? <div className="ai-empty"><LoaderCircle className="spin"/> 기록을 모으는 중입니다.</div> : <>
      <section className="performance-stats">{statItems.map(([Icon, value, label]) => <div key={label}><Icon/><strong>{value}</strong><span>{label}</span></div>)}</section>
      <section className="performance-summary"><div><span><h2>AI 성과 요약</h2><small>선택한 기간과 태그만 사용하며 자동 저장하지 않습니다.</small></span><span className="performance-actions">{summary ? <button className="secondary" onClick={copySummary}><Clipboard/> 복사</button> : null}<button className="secondary" disabled={!!aiLoading || invalidRange} onClick={runSummary}>{aiLoading === 'summary' ? <LoaderCircle className="spin"/> : <Sparkles/>} 요약 만들기</button></span></div>{summary ? <div className="summary-result"><strong>{summary.headline}</strong><p className="summary-text">{summary.narrative}</p><small>{summary.source === 'remote-ai' ? 'AI API 분석' : '개인정보를 외부로 보내지 않는 규칙 기반 요약'}</small></div> : <p>회의나 평가 전에 바로 복사해 사용할 수 있는 기간 요약을 만들어 보세요.</p>}</section>
      <section className="performance-summary"><div><span><h2>AI 진행률 제안</h2><small>업무 기록과 공통 태그를 근거로 제안합니다.</small></span><button className="secondary" disabled={!!aiLoading || invalidRange} onClick={runSuggestions}>{aiLoading === 'suggestions' ? <LoaderCircle className="spin"/> : <Sparkles/>} 제안 받기</button></div>{suggestions.length ? <div className="suggestion-list">{suggestions.map((item, index) => <article key={`${item.id}-${index}`}><div><strong>업무 #{item.id} 진행 업데이트</strong><p>{item.reason}</p><small>{item.data?.progress != null ? `진행률 ${item.data.progress}%` : ''}{item.data?.progress != null && item.data?.due_date ? ' · ' : ''}{item.data?.due_date ? `완료일 ${item.data.due_date}` : ''}</small></div>{pendingId === item.id ? <span className="confirm-inline"><button className="secondary" onClick={() => setPendingId(null)}>취소</button><button className="primary" disabled={aiLoading === `apply-${item.id}`} onClick={() => applySuggestion(item)}>{aiLoading === `apply-${item.id}` ? <LoaderCircle className="spin"/> : null} 적용 확인</button></span> : <button className="secondary" onClick={() => setPendingId(item.id)}>검토 후 적용</button>}</article>)}</div> : <p>제안을 받아도 확인하기 전에는 업무가 변경되지 않습니다.</p>}</section>
      <section className="performance-timeline"><h2>활동 타임라인 <small>{items.length}건</small></h2>{items.length ? items.map((item, index) => <article key={`${item.type}-${item.id}-${index}`}><time>{item.date}</time><div><small>{item.type_label || item.type}</small><strong>{item.title || item.content}</strong><TagChips tags={item.tags}/></div></article>) : <p className="empty-state">선택한 기간과 태그에 해당하는 활동이 없습니다.</p>}</section>
    </>}
  </div></>
}
