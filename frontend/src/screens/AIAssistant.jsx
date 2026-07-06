import { AlertTriangle, CalendarDays, CheckCircle2, CornerDownLeft, LoaderCircle, Sparkles, Target } from 'lucide-react'
import Header from '../components/Header'
import { TagChips } from '../components/TagsInput'

const ACTION_LABELS = { create: '새 항목 등록', update: '기존 항목 수정' }
const ENTITY_LABELS = { task: '업무', event: '일정', todo: '오늘 할 일', work_log: '업무 기록' }

export default function AIAssistant({ text, setText, preview, recommendations, mode, loading, onPreview, onRecommend, onApply }) {
  const data = preview?.data || {}, isRemote = preview?.source === 'remote-ai'
  return <><Header title="AI 도우미" subtitle="자연어로 업무를 정리하고, 지금 집중할 일을 추천받으세요."/><div className="content ai-layout">
    <section className="assistant-panel"><div className="assistant-heading"><span><Sparkles/></span><div><h2>무엇을 도와드릴까요?</h2><p>등록·수정 요청은 적용 전에 미리 보여드리며, 추천만으로 데이터가 바뀌지 않습니다.</p></div></div>
      <div className="suggestions"><button onClick={() => setText('금요일까지 주간 보고서 초안을 작성하는 높은 우선순위 업무를 만들어줘.')}><Target size={16}/> 업무 만들기</button><button onClick={() => setText('다음 주 화요일 오후 2시에 고객 미팅 일정을 추가해줘.')}><CalendarDays size={16}/> 일정 만들기</button><button onClick={onRecommend}><Sparkles size={16}/> 오늘 할 일 추천</button></div>
      <div className="prompt-box"><textarea aria-label="AI에게 요청할 내용" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && text.trim() && !loading) onPreview() }} placeholder="예: 기획서 작성 업무의 진행률을 60%로 수정해줘."/><footer><span>Ctrl/⌘ + Enter로 분석 · 결과 확인 후에만 반영</span><button className="primary" disabled={!text.trim() || loading} onClick={onPreview}>{loading && mode === 'parse' ? <LoaderCircle className="spin"/> : <CornerDownLeft/>} 분석하기</button></footer></div>
      <div className="ai-privacy-note"><CheckCircle2/> 추천은 현재 업무의 완료일, 우선순위, 진행률과 최근 기록을 기준으로 계산합니다.</div>
    </section>
    <section className="ai-result" aria-live="polite"><div className="section-title"><div><h2>{mode === 'recommend' ? '오늘의 추천' : '분석 결과'}</h2><p>{mode === 'recommend' ? '추천 결과는 업무를 자동으로 변경하지 않습니다.' : '적용 전 해석이 정확한지 확인하세요.'}</p></div></div>
      {loading && mode === 'recommend' ? <div className="ai-empty"><LoaderCircle className="spin"/><strong>업무 우선순위를 분석하고 있습니다.</strong></div> : null}
      {!loading && mode === 'recommend' ? <RecommendationList items={recommendations}/> : null}
      {!loading && mode !== 'recommend' && preview ? <>{preview.warning ? <div className="ai-warning"><AlertTriangle/><span>{preview.warning}</span></div> : null}<div className="ai-source"><span className={isRemote ? 'online' : ''}>{isRemote ? 'AI API 분석' : '로컬 규칙 분석'}</span>{preview.confidence != null ? <span>신뢰도 {Math.round(preview.confidence * 100)}%</span> : null}</div><div className="preview-item"><span className="preview-icon"><Sparkles/></span><div><small>{ACTION_LABELS[preview.action] || preview.action} · {ENTITY_LABELS[preview.entity] || preview.entity}</small><h3>{data.title || data.content || '제목 없음'}</h3><p>{data.description || (data.content ? '' : text)}</p><TagChips tags={data.tags}/><dl><div><dt>시작</dt><dd>{data.start_date || data.start_at || data.log_date || '-'}</dd></div><div><dt>완료</dt><dd>{data.due_date || data.end_at || '-'}</dd></div><div><dt>우선순위 / 진행률</dt><dd>{data.priority || (data.progress != null ? `${data.progress}%` : '보통')}</dd></div></dl></div></div><div className="result-actions"><button className="primary" onClick={onApply}>확인하고 적용</button></div></> : null}
      {!loading && mode !== 'recommend' && !preview ? <div className="ai-empty"><Sparkles/><strong>요청을 분석하거나 오늘의 추천을 받아보세요.</strong><p>AI가 만든 내용은 확인 없이 저장되지 않습니다.</p></div> : null}
    </section></div></>
}

function RecommendationList({ items = [] }) {
  if (!items.length) return <div className="ai-empty"><CheckCircle2/><strong>추천할 진행 중 업무가 없습니다.</strong><p>새 업무를 등록하거나 완료된 업무의 상태를 확인해 보세요.</p></div>
  return <ol className="recommendation-list">{items.map((item, index) => <li key={item.task_id}><span className="recommendation-rank">{index + 1}</span><div><h3>{item.title}</h3><p>{item.reason}</p><div className="recommendation-meta"><span>권장 진행률 <b>{item.suggested_progress}%</b></span><span>권장 완료일 <b>{item.suggested_due_date || item.due_date || '미정'}</b></span></div></div></li>)}</ol>
}
