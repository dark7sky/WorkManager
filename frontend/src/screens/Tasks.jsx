import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import Header from '../components/Header'

const labels={todo:'할 일',doing:'진행 중',in_progress:'진행 중',done:'완료'}
const iso=d=>d.toLocaleDateString('en-CA')
const dayMs=86400000

export default function Tasks({tasks,onNew,onEdit,onProgress}){
  const [query,setQuery]=useState(''),[status,setStatus]=useState('active'),[draft,setDraft]=useState({})
  const start=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return d},[])
  const days=useMemo(()=>Array.from({length:14},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return d}),[start])
  const shown=tasks.filter(t=>{
    const q=query.trim().toLowerCase(), matches=!q||`${t.title} ${t.description||''} ${(t.tags||[]).join(' ')}`.toLowerCase().includes(q)
    const matchesStatus=status==='all'||(status==='active'?t.status!=='done':status==='in_progress'?['in_progress','doing'].includes(t.status):t.status===status)
    return matches&&matchesStatus
  })
  const saveProgress=t=>{const value=Number(draft[t.id]??t.progress);if(value!==t.progress)onProgress(t,value);setDraft(x=>{const n={...x};delete n[t.id];return n})}
  return <><Header title="업무 관리" subtitle="업무 일정과 진행률을 한눈에 관리하세요." action="새 업무" onAction={onNew}/><div className="content">
    <div className="toolbar task-toolbar"><div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="제목, 메모, 분류 검색" /></div><label className="filter-select"><SlidersHorizontal/><span>상태</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="active">진행 업무</option><option value="all">전체</option><option value="todo">할 일</option><option value="in_progress">진행 중</option><option value="done">완료</option></select></label></div>
    <section className="gantt"><div className="gantt-head"><div>업무 <small>{shown.length}개</small></div><div className="timeline-days">{days.map(d=><span className={iso(d)===iso(new Date())?'today':''} key={iso(d)}>{d.getDate()}<small>{['일','월','화','수','목','금','토'][d.getDay()]}</small></span>)}</div></div>
      {shown.length?shown.map((t,i)=>{const s=t.start_date?new Date(`${t.start_date}T00:00:00`):start,e=t.due_date?new Date(`${t.due_date}T00:00:00`):s;const left=Math.max(0,Math.floor((s-start)/dayMs)),right=Math.min(13,Math.floor((e-start)/dayMs)),visible=right>=0&&left<=13,width=Math.max(1,right-left+1);return <div className="gantt-row" key={t.id}><button className="task-info task-open" onClick={()=>onEdit(t)} aria-label={`${t.title} 수정`}><span className={`task-priority priority-${t.priority}`}/><div><strong>{t.title}</strong><small>{labels[t.status]||t.status} · {t.due_date||'기한 없음'}</small></div></button><label className="progress-control" onClick={e=>e.stopPropagation()}><input aria-label={`${t.title} 진행률`} type="range" min="0" max="100" value={draft[t.id]??t.progress} onChange={e=>setDraft(x=>({...x,[t.id]:+e.target.value}))} onPointerUp={()=>saveProgress(t)} onKeyUp={e=>['ArrowLeft','ArrowRight','Home','End'].includes(e.key)&&saveProgress(t)} onBlur={()=>saveProgress(t)}/><b>{draft[t.id]??t.progress}%</b></label><div className="timeline-cells">{days.map(d=><i key={iso(d)}/>)}{visible?<span className={`gantt-bar bar-${i%4}`} style={{left:`${left/14*100}%`,width:`${width/14*100}%`}} title={`${t.start_date||''} ~ ${t.due_date||''}`}><b style={{width:`${t.progress}%`}}/></span>:null}</div></div>})
      :<p className="empty-state">조건에 맞는 업무가 없습니다. 새 업무를 등록해 계획을 시작해 보세요.</p>}</section>
  </div></>
}
