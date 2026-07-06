import { CalendarDays, CheckSquare2, LayoutDashboard, ListTodo, LogOut, Settings, Sparkles } from 'lucide-react'
const items = [['today',LayoutDashboard,'오늘'],['tasks',CheckSquare2,'업무'],['calendar',CalendarDays,'일정'],['ai',Sparkles,'AI'],['settings',Settings,'설정']]
export default function AppShell({ page, setPage, children, onLogout, user }) {
  const initials = (user?.name || user?.email || user?.user_id || '나').slice(0,2).toUpperCase()
  return <div className="app-shell"><aside className="sidebar">
    <div className="brand"><span className="brand-mark"><ListTodo size={20}/></span><strong>WorkManager</strong></div>
    <nav aria-label="주 메뉴">{items.map(([id,Icon,label])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
    <div className="sidebar-foot"><div className="avatar">{initials}</div><div><strong>{user?.name || '나의 작업 공간'}</strong><small>{user?.email || '개인 계정'}</small></div><button className="icon-button" onClick={onLogout} title="로그아웃"><LogOut size={18}/></button></div>
  </aside><main className="main-area">{children}</main><nav className="mobile-nav" aria-label="모바일 메뉴">{items.map(([id,Icon,label])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><Icon size={20}/><small>{label}</small></button>)}</nav></div>
}
