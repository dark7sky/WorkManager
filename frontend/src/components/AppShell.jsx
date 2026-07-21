import { useEffect, useState } from 'react'
import { ListTodo, LogOut, Search, Timer, WifiOff } from 'lucide-react'
import { mobileNavColumns, mobileNavItems, navItems } from '../navigation.js'
import { formatElapsed, loadWorkLogTimer } from '../workLogTimer.js'
import { useOnlineStatus } from '../networkStatus.js'
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
export default function AppShell({ page, setPage, children, onLogout, user, onQuickCapture, onGlobalSearch, onShortcuts, navBadges = {} }) {
  const initials = (user?.display_name || user?.email || user?.id || '나').slice(0,2).toUpperCase()
  const [timer, setTimer] = useState(() => loadWorkLogTimer())
  const [now, setNow] = useState(() => new Date())
  const online = useOnlineStatus()
  useEffect(() => {
    const id = setInterval(() => { setTimer(loadWorkLogTimer()); setNow(new Date()) }, 1000)
    return () => clearInterval(id)
  }, [])
  const navigate = id => {
    setPage(id)
    document.querySelector('.main-area')?.focus({ preventScroll: true })
  }
  const navigation = (items = navItems, mobile = false) => items.map(([id,Icon,label]) => {
    const badge = navBadges[id]
    const count = badge?.count || 0
    return <button
      key={id}
      type="button"
      className={page === id ? 'active' : ''}
      aria-current={page === id ? 'page' : undefined}
      aria-label={mobile ? (count ? `${label} (${count}건 ${badge.label})` : label) : undefined}
      title={mobile ? label : undefined}
      onClick={() => navigate(id)}
    ><Icon size={mobile ? 20 : 19} aria-hidden="true"/><span>{label}</span>{count ? <span className="nav-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null}</button>
  })

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><ListTodo size={20} aria-hidden="true"/></span><strong>WorkManager</strong></div>
      <button type="button" className="quick-capture-trigger" onClick={onQuickCapture} aria-label="빠른 입력 열기"><Search size={16} aria-hidden="true"/><span>빠른 입력</span><kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd></button>
      {onGlobalSearch ? <button type="button" className="quick-capture-trigger" onClick={onGlobalSearch} aria-label="전체 검색 열기"><Search size={16} aria-hidden="true"/><span>전체 검색</span><kbd>{isMac ? '⌘/' : 'Ctrl /'}</kbd></button> : null}
      <nav aria-label="주 메뉴">{navigation()}</nav>
      <div className="sidebar-foot"><div className="avatar" aria-hidden="true">{initials}</div><div><strong>{user?.display_name || '나의 작업 공간'}</strong><small title={user?.email}>{user?.email || '개인 계정'}</small></div>{onShortcuts?<button type="button" className="icon-button" onClick={onShortcuts} aria-label="단축키 안내" title="단축키 안내 (?)">?</button>:null}<button type="button" className="icon-button" onClick={onLogout} aria-label="로그아웃" title="로그아웃"><LogOut size={18} aria-hidden="true"/></button></div>
    </aside>
    <main id="main-content" className="main-area" tabIndex="-1">
      {!online ? <div className="offline-banner" role="status" aria-live="polite"><WifiOff size={16} aria-hidden="true"/><span>오프라인 상태입니다 · 변경 사항이 저장되지 않을 수 있습니다</span></div> : null}
      {timer && page !== 'today' ? <div className="worklog-timer-banner" role="status"><Timer size={16} aria-hidden="true"/><span>업무 기록 타이머 진행 중 · {formatElapsed(timer.startedAt, now)}</span><button type="button" className="text-button" onClick={() => navigate('today')}>오늘 화면에서 정지</button></div> : null}
      {children}
    </main>
    <nav className="mobile-nav" aria-label="모바일 메뉴" style={{ '--mobile-nav-columns': mobileNavColumns }}>{navigation(mobileNavItems, true)}</nav>
  </div>
}
