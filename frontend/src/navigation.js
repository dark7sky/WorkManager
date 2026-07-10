import { BarChart3, CalendarDays, CheckSquare2, ClipboardList, History, LayoutDashboard, Settings, Sparkles } from 'lucide-react'

export const navItems = [
  ['today', LayoutDashboard, '오늘'],
  ['tasks', CheckSquare2, '업무'],
  ['calendar', CalendarDays, '일정'],
  ['performance', BarChart3, '성과'],
  ['ai', Sparkles, 'AI'],
  ['audit', ClipboardList, '감사'],
  ['changelog', History, '변경'],
  ['settings', Settings, '설정'],
]

export const mobileNavItems = navItems.filter(([id]) => id !== 'audit')
