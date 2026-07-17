import { navItems } from '../navigation.js'
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
const shortcuts = [
  { keys: [isMac ? '⌘' : 'Ctrl', 'K'], label: '빠른 입력 열기 (AI로 업무/일정/할 일 추가)' },
  { keys: [isMac ? '⌘' : 'Ctrl', 'Enter'], label: '열려 있는 입력 창 저장' },
  { keys: ['N'], label: '새 항목 만들기 (업무/일정 등록 창 열기, 오늘 화면에서는 할 일 입력창 포커스)' },
  { keys: ['Shift', 'N'], label: '오늘 화면에서 업무 기록(오늘 한 일) 입력창 포커스' },
  ...navItems.map(([,,label],i)=>({ keys: [String(i+1)], label: `${label} 화면으로 이동` })),
  { keys: ['?'], label: '이 단축키 안내 열기' },
  { keys: ['Esc'], label: '열려 있는 창/대화상자 닫기' },
]
export default function KeyboardShortcuts(){
  return <div className="shortcuts-list">
    <table>
      <tbody>
        {shortcuts.map(s=><tr key={s.label}><td className="shortcut-keys">{s.keys.map(k=><kbd key={k}>{k}</kbd>)}</td><td>{s.label}</td></tr>)}
      </tbody>
    </table>
  </div>
}
