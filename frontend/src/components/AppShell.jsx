import { CalendarDays, CheckSquare2, LayoutDashboard, ListTodo, LogOut, Sparkles } from 'lucide-react'

const items = [
  ['today', LayoutDashboard, '오늘의 일'], ['tasks', CheckSquare2, '업무 관리'],
  ['calendar', CalendarDays, '일정'], ['ai', Sparkles, 'AI 도우미'],
]

export default function AppShell({ page, setPage, children, onLogout }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><ListTodo size={20}/></span><strong>WorkManager</strong></div>
      <nav>{items.map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-foot"><div className="avatar">YS</div><div><strong>나의 작업 공간</strong><small>개인 계정</small></div><button className="icon-button" onClick={onLogout} title="로그아웃"><LogOut size={18}/></button></div>
    </aside>
    <main className="main-area">{children}</main>
    <nav className="mobile-nav">{items.map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={21}/><small>{label}</small></button>)}</nav>
  </div>
}
