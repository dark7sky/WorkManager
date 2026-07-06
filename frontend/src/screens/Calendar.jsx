import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Header from '../components/Header'

const weekdays=['일','월','화','수','목','금','토']
const cells=Array.from({length:35},(_,i)=>({day:i<3?28+i:i-2, current:i>=3&&i<34}))

export default function Calendar({ events }) {
  const eventAt = day => events.filter(e=>new Date(e.start).getDate()===day)
  return <><Header title="일정" subtitle="업무와 약속을 캘린더에서 확인하세요." action="새 일정"/><div className="content"><div className="calendar-tools"><div className="month-switch"><button className="icon-button"><ChevronLeft/></button><h2>2026년 7월</h2><button className="icon-button"><ChevronRight/></button><button className="secondary">오늘</button></div><div className="view-switch"><button className="active">월</button><button>주</button><button>일</button></div></div><section className="calendar"><div className="weekdays">{weekdays.map(d=><div key={d}>{d}</div>)}</div><div className="calendar-grid">{cells.map((c,i)=><div className={`${c.current?'':'outside'} ${c.day===6&&c.current?'today-cell':''}`} key={i}><span>{c.day}</span>{c.current&&eventAt(c.day).map(e=><button key={e.id} className={`cal-event ${e.color}`}><b>{e.title}</b><small>{new Date(e.start).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</small></button>)}{c.day===7&&c.current?<button className="cell-add"><Plus/> 일정 추가</button>:null}</div>)}</div></section></div></>
}
