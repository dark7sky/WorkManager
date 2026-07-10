import { BarChart3, CalendarDays, CheckSquare2, ClipboardList, History, LayoutDashboard, ListTodo, LogOut, Search, Settings, Sparkles } from 'lucide-react'
const items = [['today',LayoutDashboard,'오늘'],['tasks',CheckSquare2,'업무'],['calendar',CalendarDays,'일정'],['performance',BarChart3,'성과'],['ai',Sparkles,'AI'],['audit',ClipboardList,'감사'],['changelog',History,'변경'],['settings',Settings,'설정']]
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
export default function AppShell({ page, setPage, children, onLogout, user, onQuickCapture }) {
  const initials = (user?.display_name || user?.email || user?.id || '나').slice(0,2).toUpperCase()
  const navigate = id => {
    setPage(id)
    document.querySelector('.main-area')?.focus({ preventScroll: true })
  }
  const navigation = (mobile = false) => items.map(([id,Icon,label]) => <button
    key={id}
    type="button"
    className={page === id ? 'active' : ''}
    aria-current={page === id ? 'page' : undefined}
    aria-label={mobile ? label : undefined}
    title={mobile ? label : undefined}
    onClick={() => navigate(id)}
  ><Icon size={mobile ? 20 : 19} aria-hidden="true"/><span>{label}</span></button>)

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><ListTodo size={20} aria-hidden="true"/></span><strong>WorkManager</strong></div>
      <button type="button" className="quick-capture-trigger" onClick={onQuickCapture} aria-label="빠른 입력 열기"><Search size={16} aria-hidden="true"/><span>빠른 입력</span><kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd></button>
      <nav aria-label="주 메뉴">{navigation()}</nav>
      <div className="sidebar-foot"><div className="avatar" aria-hidden="true">{initials}</div><div><strong>{user?.display_name || '나의 작업 공간'}</strong><small title={user?.email}>{user?.email || '개인 계정'}</small></div><button type="button" className="icon-button" onClick={onLogout} aria-label="로그아웃" title="로그아웃"><LogOut size={18} aria-hidden="true"/></button></div>
    </aside>
    <main id="main-content" className="main-area" tabIndex="-1">{children}</main>
    <nav className="mobile-nav" aria-label="모바일 메뉴">{navigation(true)}</nav>
  </div>
}
