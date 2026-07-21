import { AlertTriangle, CalendarDays, CheckCircle2, CornerDownLeft, LoaderCircle, Sparkles, Target, X } from 'lucide-react'
import Header from '../components/Header'
import { TagChips } from '../components/TagsInput'

const ACTION_LABELS = { create: '새 항목 등록', update: '기존 항목 수정' }
const ENTITY_LABELS = { task: '업무', event: '일정', todo: '오늘 할 일', work_log: '업무 기록' }

export default function AIAssistant({ text, setText, items, recommendations, mode, loading, onPreview, onRecommend, onApplyItem, onDismissItem, history = [], onRemoveHistory }) {
  const hasItems = items && items.length > 0
  const warning = items?.[0]?.warning
  return <><Header title="AI 도우미" subtitle="자연어로 업무를 정리하고, 지금 집중할 일을 추천받으세요."/><div className="content ai-layout">
    <section className="assistant-panel"><div className="assistant-heading"><span><Sparkles/></span><div><h2>무엇을 도와드릴까요?</h2><p>등록·수정 요청은 적용 전에 미리 보여드리며, 추천만으로 데이터가 바뀌지 않습니다. 줄마다 다른 요청을 입력하면 한 번에 여러 건을 분석합니다.</p></div></div>
      <div className="suggestions"><button onClick={() => setText('금요일까지 주간 보고서 초안을 작성하는 높은 우선순위 업무를 만들어줘.')}><Target size={16}/> 업무 만들기</button><button onClick={() => setText('다음 주 화요일 오후 2시에 고객 미팅 일정을 추가해줘.')}><CalendarDays size={16}/> 일정 만들기</button><button onClick={onRecommend}><Sparkles size={16}/> 오늘 할 일 추천</button></div>
      <div className="prompt-box"><textarea aria-label="AI에게 요청할 내용" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && text.trim() && !loading) onPreview() }} placeholder={'예: 기획서 작성 업무의 진행률을 60%로 수정해줘.\n여러 건은 줄바꿈으로 구분해 입력하세요.'}/><footer><span>Ctrl/⌘ + Enter로 분석 · 결과 확인 후에만 반영</span><button className="primary" disabled={!text.trim() || loading} onClick={onPreview}>{loading && mode === 'parse' ? <LoaderCircle className="spin"/> : <CornerDownLeft/>} 분석하기</button></footer></div>
      {history.length ? <div className="ai-history"><span className="ai-history-label">최근 요청</span><div className="ai-history-list">{history.map(item => <span key={item} className="ai-history-chip"><button type="button" onClick={() => setText(item)} title={item}>{item.length > 24 ? `${item.slice(0, 24)}…` : item}</button><button type="button" className="ai-history-remove" aria-label={`'${item}' 기록 삭제`} onClick={() => onRemoveHistory?.(item)}>×</button></span>)}</div></div> : null}
      <div className="ai-privacy-note"><CheckCircle2/> 추천은 현재 업무의 완료일, 우선순위, 진행률과 최근 기록을 기준으로 계산합니다.</div>
    </section>
    <section className="ai-result" aria-live="polite"><div className="section-title"><div><h2>{mode === 'recommend' ? '오늘의 추천' : hasItems ? `분석 결과 (${items.length}건)` : '분석 결과'}</h2><p>{mode === 'recommend' ? '추천 결과는 업무를 자동으로 변경하지 않습니다.' : '건마다 확인 후 개별적으로 적용하세요.'}</p></div></div>
      {loading && mode === 'recommend' ? <div className="ai-empty"><LoaderCircle className="spin"/><strong>업무 우선순위를 분석하고 있습니다.</strong></div> : null}
      {!loading && mode === 'recommend' ? <RecommendationList items={recommendations}/> : null}
      {!loading && mode !== 'recommend' && hasItems ? <>{warning ? <div className="ai-warning"><AlertTriangle/><span>{warning}</span></div> : null}{items.map((item, index) => <PreviewItem key={`${item.action}-${item.entity}-${index}`} item={item} onApply={() => onApplyItem(index)} onDismiss={() => onDismissItem(index)}/>)}</> : null}
      {!loading && mode !== 'recommend' && !hasItems ? <div className="ai-empty"><Sparkles/><strong>요청을 분석하거나 오늘의 추천을 받아보세요.</strong><p>AI가 만든 내용은 확인 없이 저장되지 않습니다.</p></div> : null}
    </section></div></>
}

function PreviewItem({ item, onApply, onDismiss }) {
  const data = item?.data || {}, isRemote = item?.source === 'remote-ai'
  return <div className="preview-card">
    <div className="ai-source"><span className={isRemote ? 'online' : ''}>{isRemote ? 'AI API 분석' : '로컬 규칙 분석'}</span>{item.confidence != null ? <span>신뢰도 {Math.round(item.confidence * 100)}%</span> : null}<button type="button" className="preview-dismiss" title="이 제안 무시" aria-label="이 제안 무시" onClick={onDismiss}><X aria-hidden="true"/></button></div>
    <div className="preview-item"><span className="preview-icon"><Sparkles/></span><div><small>{ACTION_LABELS[item.action] || item.action} · {ENTITY_LABELS[item.entity] || item.entity}</small><h3>{data.title || data.content || '제목 없음'}</h3><p>{data.content ? '' : data.description}</p><TagChips tags={data.tags}/><dl><div><dt>시작</dt><dd>{data.start_date || data.start_at || data.log_date || '-'}</dd></div><div><dt>완료</dt><dd>{data.due_date || data.end_at || '-'}</dd></div><div><dt>우선순위 / 진행률</dt><dd>{data.priority || (data.progress != null ? `${data.progress}%` : '보통')}</dd></div></dl></div></div>
    <div className="result-actions"><button type="button" className="secondary" onClick={onDismiss}>무시</button><button className="primary" onClick={onApply}>확인하고 적용</button></div>
  </div>
}

function RecommendationList({ items = [] }) {
  if (!items.length) return <div className="ai-empty"><CheckCircle2/><strong>추천할 업무나 할 일이 없습니다.</strong><p>새 업무·할 일을 등록하거나 완료된 항목의 상태를 확인해 보세요.</p></div>
  return <ol className="recommendation-list">{items.map((item, index) => <li key={`${item.entity}-${item.task_id || item.todo_id || item.event_id}`}><span className="recommendation-rank">{index + 1}</span><div><h3>{item.title}<span className="recommendation-entity">{ENTITY_LABELS[item.entity] || '업무'}</span></h3><p>{item.reason}</p><div className="recommendation-meta">{item.entity === 'todo' ? <span>예정일 <b>{item.due_date || '미정'}</b></span> : item.entity === 'event' ? <span>시작 <b>{item.start_at ? item.start_at.replace('T', ' ').slice(0, 16) : '미정'}</b></span> : <><span>권장 진행률 <b>{item.suggested_progress}%</b></span><span>권장 완료일 <b>{item.suggested_due_date || item.due_date || '미정'}</b></span></>}</div></div></li>)}</ol>
}
