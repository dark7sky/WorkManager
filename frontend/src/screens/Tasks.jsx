import { ChevronDown, Filter, MoreHorizontal, Search } from 'lucide-react'
import Header from '../components/Header'

const days = Array.from({length: 14},(_,i)=>i+1)
const statusLabel = { todo:'할 일', doing:'진행 중', in_progress:'진행 중', done:'완료' }

export default function Tasks({ tasks, onNew, onProgress }) {
  return <><Header title="업무 관리" subtitle="업무 흐름과 일정을 한눈에 관리하세요." action="새 업무" onAction={onNew}/><div className="content"><div className="toolbar"><div className="search"><Search/><input placeholder="업무 검색"/></div><button className="secondary"><Filter/> 필터</button><button className="secondary">2026년 7월 <ChevronDown/></button></div><section className="gantt"><div className="gantt-head"><div>업무</div><div className="timeline-days">{days.map(d=><span key={d} className={d===6?'today':''}>{d}<small>{['수','목','금','토','일','월','화'][d%7]}</small></span>)}</div></div>{tasks.map((task,index)=><div className="gantt-row" key={task.id}><div className="task-info"><button className="more"><MoreHorizontal/></button><div><strong>{task.title}</strong><small><span className={`status-dot ${task.status}`}></span>{statusLabel[task.status]}</small></div><label className="progress-control"><input aria-label="진행도" type="range" min="0" max="100" value={task.progress} onChange={e=>onProgress(task,Number(e.target.value))}/><b>{task.progress}%</b></label></div><div className="timeline-cells">{days.map(d=><i key={d}></i>)}<span className={`gantt-bar bar-${index%4}`} style={{left:`${Math.max(0,index*7+2)}%`,width:`${Math.max(14, 20+index*5)}%`}}><b style={{width:`${task.progress}%`}}></b></span></div></div>)}</section></div></>
}
