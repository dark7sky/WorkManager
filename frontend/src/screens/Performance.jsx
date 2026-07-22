import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, CheckCircle2, Clipboard, Clock3, Download, FileText, LoaderCircle, RotateCcw, Sparkles, Target, Wallet, X } from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'
import { TagChips, TagFilter } from '../components/TagsInput'
import { deriveTagColorMap } from '../tagColors'
import { performanceReportMarkdown, performanceReportFilename, performanceReportToPrintableReport, performanceReportPrintFilename, loadReportPresets, saveReportPreset, deleteReportPreset, presetRange, formatDuration, dailyActivityTrend, activityStreak, loadPerformanceGoal, savePerformanceGoal, goalProgress, previousPeriodRange, periodComparison, estimateVariancePercent } from '../performanceReport'
import { timelineToCsv, timelineCsvFilename } from '../csv'
import { timelineToExcelXml, timelineExcelFilename } from '../xlsx'
import { billableWorkLogs, invoicedWorkLogs, workLogsToPrintableInvoice, invoiceFilename } from '../invoiceReport'

const getRange = presetRange
const PRESETS = [['lastweek', '지난주 리뷰'], ['month', '이번 달'], ['quarter', '이번 분기'], ['year', '올해'], ['custom', '직접 선택']]

export default function Performance({ notify, onDataChanged }) {
  const [preset, setPreset] = useState('month')
  const [dates, setDates] = useState(() => getRange('month'))
  const [selected, setSelected] = useState([])
  const [knownTags, setKnownTags] = useState([])
  const [tagColors, setTagColors] = useState({})
  const [data, setData] = useState(null)
  const [prevData, setPrevData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState('')
  const [summary, setSummary] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [pendingId, setPendingId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [savedPresets, setSavedPresets] = useState(() => loadReportPresets(localStorage))
  const [presetName, setPresetName] = useState('')
  const [goal, setGoal] = useState(() => loadPerformanceGoal(localStorage))
  const [goalDraft, setGoalDraft] = useState(() => ({ taskGoal: goal.taskGoal ?? '', minutesGoal: goal.minutesGoal ?? '', todoGoal: goal.todoGoal ?? '', eventGoal: goal.eventGoal ?? '' }))
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

  useEffect(() => { api.tags().then(r => setTagColors(deriveTagColorMap(r.items))).catch(() => {}) }, [])

  const [prevStart, prevEnd] = useMemo(() => previousPeriodRange(dates[0], dates[1]), [dates[0], dates[1]])
  useEffect(() => {
    if (invalidRange || !prevStart || !prevEnd) { setPrevData(null); return undefined }
    const controller = new AbortController()
    api.achievements(prevStart, prevEnd, selected, controller.signal)
      .then(result => setPrevData(result))
      .catch(error => { if (error.name !== 'AbortError') setPrevData(null) })
    return () => controller.abort()
  }, [prevStart, prevEnd, selectedKey, invalidRange, refreshKey])

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
      await api.aiApply({ action: item.action, entity: item.entity, id: item.id, data: item.data, reason: item.reason })
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

  const exportMarkdown = useCallback(() => {
    if (!data || invalidRange) return
    const md = performanceReportMarkdown(data, { start: dates[0], end: dates[1], tags: selected, summary, generatedAt: new Date().toISOString() })
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = performanceReportFilename(dates[0], dates[1])
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notify('성과 보고서를 Markdown으로 내려받았습니다.')
  }, [data, invalidRange, dates, selected, summary, notify])

  const exportCsv = useCallback(() => {
    if (!data || invalidRange) return
    const csv = timelineToCsv(data.timeline || [])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = timelineCsvFilename(dates[0], dates[1])
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notify('활동 타임라인을 CSV로 내려받았습니다.')
  }, [data, invalidRange, dates, notify])

  const exportExcel = useCallback(() => {
    if (!data || invalidRange) return
    const xml = timelineToExcelXml(data.timeline || [])
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = timelineExcelFilename(dates[0], dates[1])
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notify('활동 타임라인을 Excel로 내려받았습니다.')
  }, [data, invalidRange, dates, notify])

  const printReport = useCallback(() => {
    if (!data || invalidRange) return
    const html = performanceReportToPrintableReport(data, { start: dates[0], end: dates[1], tags: selected, summary, generatedAt: new Date().toISOString() })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.open(); win.document.write(html); win.document.close()
    win.document.title = performanceReportPrintFilename(dates[0], dates[1])
    win.focus(); win.print()
  }, [data, invalidRange, dates, selected, summary])

  const printInvoice = useCallback(() => {
    if (!data || invalidRange) return
    const html = workLogsToPrintableInvoice(data.work_logs || [], { start: dates[0], end: dates[1], hourlyRate: data.summary?.billing_hourly_rate, clientName: data.summary?.billing_client_name, bizRegNumber: data.summary?.billing_biz_reg_number, vatIncluded: data.summary?.billing_vat_included, generatedAt: new Date().toISOString() })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.open(); win.document.write(html); win.document.close()
    win.document.title = invoiceFilename(dates[0], dates[1])
    win.focus(); win.print()
  }, [data, invalidRange, dates])

  const markInvoiced = useCallback(async () => {
    const pending = billableWorkLogs(data?.work_logs || [])
    if (!pending.length) return
    const now = new Date().toISOString()
    try {
      await Promise.all(pending.map(log => api.updateLog(log.id, { invoiced_at: now })))
      notify(`업무 기록 ${pending.length}건을 청구 완료로 표시했습니다.`)
      setRefreshKey(value => value + 1)
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
  }, [data, notify, onDataChanged])

  const unmarkInvoiced = useCallback(async () => {
    const invoiced = invoicedWorkLogs(data?.work_logs || [])
    if (!invoiced.length) return
    if (!window.confirm(`업무 기록 ${invoiced.length}건의 청구 완료 표시를 취소할까요?`)) return
    try {
      await Promise.all(invoiced.map(log => api.updateLog(log.id, { invoiced_at: null })))
      notify(`업무 기록 ${invoiced.length}건의 청구 완료 표시를 취소했습니다.`)
      setRefreshKey(value => value + 1)
      await onDataChanged?.()
    } catch (error) { notify(error.message, 'error') }
  }, [data, notify, onDataChanged])

  const saveCurrentPreset = useCallback(() => {
    if (!presetName.trim()) return
    const newPresets = saveReportPreset(localStorage, savedPresets, { name: presetName, preset, start: dates[0], end: dates[1], tags: selected })
    setSavedPresets(newPresets)
    setPresetName('')
    notify('프리셋을 저장했습니다.')
  }, [presetName, preset, dates, selected, savedPresets, notify])

  const applyPreset = useCallback(savedPreset => {
    setPreset(savedPreset.preset)
    setDates([savedPreset.start, savedPreset.end])
    setSelected(savedPreset.tags || [])
  }, [])

  const deletePreset = useCallback(name => {
    const newPresets = deleteReportPreset(localStorage, savedPresets, name)
    setSavedPresets(newPresets)
    notify('프리셋을 삭제했습니다.')
  }, [savedPresets, notify])

  const saveGoal = useCallback(event => {
    event.preventDefault()
    const saved = savePerformanceGoal(localStorage, { taskGoal: goalDraft.taskGoal, minutesGoal: goalDraft.minutesGoal, todoGoal: goalDraft.todoGoal, eventGoal: goalDraft.eventGoal })
    setGoal(saved)
    setGoalDraft({ taskGoal: saved.taskGoal ?? '', minutesGoal: saved.minutesGoal ?? '', todoGoal: saved.todoGoal ?? '', eventGoal: saved.eventGoal ?? '' })
    notify('기간 목표를 저장했습니다.')
  }, [goalDraft, notify])

  const items = data?.timeline || [], stats = data?.summary || {}
  const statItems = useMemo(() => [[CheckCircle2, stats.completed_tasks || 0, '완료 업무', 'taskDelta'], [Clock3, stats.work_logs || 0, '업무 기록'], [Clock3, formatDuration(stats.tracked_minutes), '기록된 소요 시간', 'minutesDelta'], [Clock3, formatDuration(stats.billable_minutes), '청구 가능 시간'], ...(stats.billable_amount != null ? [[Wallet, `${Math.round(stats.billable_amount).toLocaleString('ko-KR')}원`, '청구 예상 금액']] : []), [Clock3, formatDuration(stats.estimated_minutes), '완료 업무 예상 소요 시간'], [CalendarRange, stats.events || 0, '일정', 'eventsDelta'], [Target, stats.active_tasks || 0, '진행 중 업무'], [CheckCircle2, stats.completed_todos || 0, '완료한 오늘 할 일', 'todoDelta']], [stats])
  const tagBreakdown = data?.tag_breakdown || []
  const maxTagMinutes = Math.max(1, ...tagBreakdown.map(t => t.tracked_minutes))
  const clientBreakdown = data?.client_breakdown || []
  const maxClientMinutes = Math.max(1, ...clientBreakdown.map(c => c.tracked_minutes))
  const trend = useMemo(() => dailyActivityTrend(items, dates[0], dates[1]), [items, dates])
  const maxTrendCount = Math.max(1, ...trend.map(d => d.count))
  const streak = useMemo(() => activityStreak(trend), [trend])
  const progress = useMemo(() => goalProgress(stats, goal), [stats, goal])
  const comparison = useMemo(() => prevData ? periodComparison(stats, prevData.summary || {}) : null, [stats, prevData])
  const deltaLabel = delta => !delta ? '' : `${delta.diff > 0 ? '▲' : delta.diff < 0 ? '▼' : '–'} ${Math.abs(delta.percent)}%`
  const deltaClass = delta => !delta || delta.diff === 0 ? '' : delta.diff > 0 ? 'delta-up' : 'delta-down'

  return <><Header title="성과" subtitle="기간별 업무 기록을 모아보고, 평가 자료와 다음 행동으로 연결하세요."/><div className="content performance-page">
    <section className="performance-toolbar" aria-label="조회 기간"><div className="view-switch">{PRESETS.map(([value, label]) => <button type="button" className={preset === value ? 'active' : ''} key={value} onClick={() => choosePreset(value)}>{label}</button>)}</div><div className="date-range"><input aria-label="시작일" type="date" value={dates[0]} onChange={event => { setPreset('custom'); setDates([event.target.value, dates[1]]) }}/><span>–</span><input aria-label="종료일" type="date" value={dates[1]} onChange={event => { setPreset('custom'); setDates([dates[0], event.target.value]) }}/></div><button type="button" className="secondary" disabled={reportLoading || invalidRange || !data} onClick={exportMarkdown}><Download size={17}/> Markdown 내보내기</button><button type="button" className="secondary" disabled={reportLoading || invalidRange || !data} onClick={exportCsv}><Download size={17}/> CSV 내보내기</button><button type="button" className="secondary" disabled={reportLoading || invalidRange || !data} onClick={exportExcel}><Download size={17}/> Excel 내보내기</button><button type="button" className="secondary" disabled={reportLoading || invalidRange || !data} onClick={printReport}><FileText size={17}/> PDF 내보내기</button>{data && billableWorkLogs(data.work_logs || []).length ? <button type="button" className="secondary" disabled={reportLoading || invalidRange} onClick={printInvoice}><Wallet size={17}/> 청구서 PDF</button> : null}{data && billableWorkLogs(data.work_logs || []).length ? <button type="button" className="secondary" disabled={reportLoading || invalidRange} onClick={markInvoiced}><CheckCircle2 size={17}/> 청구 완료 표시</button> : null}{data && invoicedWorkLogs(data.work_logs || []).length ? <button type="button" className="secondary" disabled={reportLoading || invalidRange} onClick={unmarkInvoiced}><RotateCcw size={17}/> 청구 완료 취소</button> : null}</section>
    {invalidRange ? <p className="inline-error">종료일은 시작일 이후여야 합니다.</p> : null}
    <div className="performance-tag-filter"><TagFilter tags={knownTags} selected={selected} onChange={setSelected} colors={tagColors}/>{selected.length ? <button type="button" className="text-button" onClick={() => setSelected([])}>필터 초기화</button> : null}</div>
    <div className="report-presets">
      <div className="report-presets-chips">
        {savedPresets.map(p => (
          <div key={p.name} className="preset-chip">
            <span onClick={() => applyPreset(p)}>{p.name}</span>
            <button type="button" className="preset-delete" onClick={() => deletePreset(p.name)} aria-label={p.name + ' 삭제'}><X size={14}/></button>
          </div>
        ))}
      </div>
      <form className="preset-form" onSubmit={event => { event.preventDefault(); saveCurrentPreset() }}>
        <input type="text" placeholder="프리셋 이름" value={presetName} onChange={e => setPresetName(e.target.value)}/>
        <button type="submit" className="secondary" disabled={!presetName.trim()}>저장</button>
      </form>
    </div>
    {reportLoading && !data ? <div className="ai-empty"><LoaderCircle className="spin"/> 기록을 모으는 중입니다.</div> : <>
      <section className="performance-stats">{statItems.map(([Icon, value, label, deltaKey]) => <div key={label}><Icon/><strong>{value}</strong><span>{label}</span>{deltaKey && comparison ? <small className={`stat-delta ${deltaClass(comparison[deltaKey])}`} title="직전 동일 기간 대비">{deltaLabel(comparison[deltaKey])}</small> : null}</div>)}</section>
      <section className="performance-timeline goal-tracker"><h2>기간 목표</h2>
        <form className="preset-form" onSubmit={saveGoal}>
          <label>완료 업무 목표 <input type="number" min="1" placeholder="예: 20" value={goalDraft.taskGoal} onChange={e => setGoalDraft(d => ({ ...d, taskGoal: e.target.value }))}/></label>
          <label>기록 시간 목표(분) <input type="number" min="1" placeholder="예: 1200" value={goalDraft.minutesGoal} onChange={e => setGoalDraft(d => ({ ...d, minutesGoal: e.target.value }))}/></label>
          <label>완료 할 일 목표 <input type="number" min="1" placeholder="예: 30" value={goalDraft.todoGoal} onChange={e => setGoalDraft(d => ({ ...d, todoGoal: e.target.value }))}/></label>
          <label>일정 목표 <input type="number" min="1" placeholder="예: 15" value={goalDraft.eventGoal} onChange={e => setGoalDraft(d => ({ ...d, eventGoal: e.target.value }))}/></label>
          <button type="submit" className="secondary">목표 저장</button>
        </form>
        {goal.taskGoal ? <div className={`tag-breakdown-row${progress.taskPercent >= 100 ? ' goal-achieved' : ''}`}><span className="tag-breakdown-name">완료 업무</span><span className="tag-breakdown-bar"><i style={{width: `${progress.taskBarPercent}%`}}/></span><span className="tag-breakdown-figures">{stats.completed_tasks || 0} / {goal.taskGoal} ({progress.taskPercent}%)</span></div> : null}
        {goal.minutesGoal ? <div className={`tag-breakdown-row${progress.minutesPercent >= 100 ? ' goal-achieved' : ''}`}><span className="tag-breakdown-name">기록 시간</span><span className="tag-breakdown-bar"><i style={{width: `${progress.minutesBarPercent}%`}}/></span><span className="tag-breakdown-figures">{formatDuration(stats.tracked_minutes)} / {formatDuration(goal.minutesGoal)} ({progress.minutesPercent}%)</span></div> : null}
        {goal.todoGoal ? <div className={`tag-breakdown-row${progress.todoPercent >= 100 ? ' goal-achieved' : ''}`}><span className="tag-breakdown-name">완료 할 일</span><span className="tag-breakdown-bar"><i style={{width: `${progress.todoBarPercent}%`}}/></span><span className="tag-breakdown-figures">{stats.completed_todos || 0} / {goal.todoGoal} ({progress.todoPercent}%)</span></div> : null}
        {goal.eventGoal ? <div className={`tag-breakdown-row${progress.eventsPercent >= 100 ? ' goal-achieved' : ''}`}><span className="tag-breakdown-name">일정</span><span className="tag-breakdown-bar"><i style={{width: `${progress.eventsBarPercent}%`}}/></span><span className="tag-breakdown-figures">{stats.events || 0} / {goal.eventGoal} ({progress.eventsPercent}%)</span></div> : null}
        {!goal.taskGoal && !goal.minutesGoal && !goal.todoGoal && !goal.eventGoal ? <p className="empty-state">선택한 기간에 대한 목표를 설정하면 진행률을 볼 수 있습니다.</p> : null}
      </section>
      {trend.length ? <section className="performance-timeline activity-trend"><h2>일별 활동 추이 <small>{trend.reduce((sum, d) => sum + d.count, 0)}건</small></h2>{streak.best ? <p className="activity-streak">🔥 현재 연속 {streak.current}일 · 최고 연속 {streak.best}일</p> : null}<div className="activity-trend-chart">{trend.map(d => <div key={d.date} className="activity-trend-bar" title={`${d.date} · ${d.count}건`}><i style={{height: `${Math.round(d.count / maxTrendCount * 100)}%`}}/></div>)}</div></section> : null}
      <section className="performance-timeline tag-breakdown"><h2>태그별 소요 시간 <small>{tagBreakdown.length}개 태그</small></h2>{tagBreakdown.length ? tagBreakdown.map(t => { const variance = estimateVariancePercent(t.tracked_minutes, t.estimated_minutes); return <div className="tag-breakdown-row" key={t.tag}><span className="tag-breakdown-name">{t.tag}</span><span className="tag-breakdown-bar"><i style={{width: `${Math.round(t.tracked_minutes / maxTagMinutes * 100)}%`}}/></span><span className="tag-breakdown-figures">{formatDuration(t.tracked_minutes)} · 완료 {t.completed_tasks}건{variance !== null ? <span className={`estimate-variance ${variance > 0 ? 'estimate-over' : 'estimate-under'}`}> · 예상 {formatDuration(t.estimated_minutes)} 대비 {variance > 0 ? '+' : ''}{variance}%</span> : null}</span></div> }) : <p className="empty-state">선택한 기간과 태그에 해당하는 기록이 없습니다.</p>}</section>
      {clientBreakdown.length ? <section className="performance-timeline tag-breakdown"><h2>고객별 소요 시간 <small>{clientBreakdown.length}개 고객</small></h2>{clientBreakdown.map(c => <div className="tag-breakdown-row" key={c.client_name}><span className="tag-breakdown-name">{c.client_name}</span><span className="tag-breakdown-bar"><i style={{width: `${Math.round(c.tracked_minutes / maxClientMinutes * 100)}%`}}/></span><span className="tag-breakdown-figures">{formatDuration(c.tracked_minutes)}{c.billable_amount ? ` · 청구 ${Math.round(c.billable_amount).toLocaleString('ko-KR')}원` : ''}</span></div>)}</section> : null}
      <section className="performance-summary"><div><span><h2>AI 성과 요약</h2><small>선택한 기간과 태그만 사용하며 자동 저장하지 않습니다.</small></span><span className="performance-actions">{summary ? <button className="secondary" onClick={copySummary}><Clipboard/> 복사</button> : null}<button className="secondary" disabled={!!aiLoading || invalidRange} onClick={runSummary}>{aiLoading === 'summary' ? <LoaderCircle className="spin"/> : <Sparkles/>} 요약 만들기</button></span></div>{summary ? <div className="summary-result"><strong>{summary.headline}</strong><p className="summary-text">{summary.narrative}</p>{summary.highlights?.length ? <div className="summary-highlights"><small>근거 {summary.highlights.length}건</small><ul>{summary.highlights.map(item => <li key={`${item.type}-${item.id}`}><span className="summary-highlight-type">{item.type_label || item.type}</span><span>{item.title}</span>{item.date ? <time>{item.date}</time> : null}</li>)}</ul></div> : null}<small>{summary.source === 'remote-ai' ? 'AI API 분석' : '개인정보를 외부로 보내지 않는 규칙 기반 요약'}</small></div> : <p>회의나 평가 전에 바로 복사해 사용할 수 있는 기간 요약을 만들어 보세요.</p>}</section>
      <section className="performance-summary"><div><span><h2>AI 진행률 제안</h2><small>업무 기록과 공통 태그를 근거로 제안합니다.</small></span><button className="secondary" disabled={!!aiLoading || invalidRange} onClick={runSuggestions}>{aiLoading === 'suggestions' ? <LoaderCircle className="spin"/> : <Sparkles/>} 제안 받기</button></div>{suggestions.length ? <div className="suggestion-list">{suggestions.map((item, index) => <article key={`${item.id}-${index}`}><div><strong>업무 #{item.id} 진행 업데이트</strong><p>{item.reason}</p><small>{item.data?.progress != null ? `진행률 ${item.data.progress}%` : ''}{item.data?.progress != null && item.data?.due_date ? ' · ' : ''}{item.data?.due_date ? `완료일 ${item.data.due_date}` : ''}</small></div>{pendingId === item.id ? <span className="confirm-inline"><button className="secondary" onClick={() => setPendingId(null)}>취소</button><button className="primary" disabled={aiLoading === `apply-${item.id}`} onClick={() => applySuggestion(item)}>{aiLoading === `apply-${item.id}` ? <LoaderCircle className="spin"/> : null} 적용 확인</button></span> : <button className="secondary" onClick={() => setPendingId(item.id)}>검토 후 적용</button>}</article>)}</div> : <p>제안을 받아도 확인하기 전에는 업무가 변경되지 않습니다.</p>}</section>
      <section className="performance-timeline"><h2>활동 타임라인 <small>{items.length}건</small></h2>{items.length ? items.map((item, index) => <article key={`${item.type}-${item.id}-${index}`}><time>{item.date}</time><div><small>{item.type_label || item.type}</small><strong>{item.title || item.content}</strong><TagChips tags={item.tags}/></div></article>) : <p className="empty-state">선택한 기간과 태그에 해당하는 활동이 없습니다.</p>}</section>
    </>}
  </div></>
}
