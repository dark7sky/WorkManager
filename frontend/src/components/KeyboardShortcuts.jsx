import { navItems } from '../navigation.js'
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
const shortcuts = [
  { keys: [isMac ? '⌘' : 'Ctrl', 'K'], label: '빠른 입력 열기 (AI로 업무/일정/할 일 추가)' },
  { keys: [isMac ? '⌘' : 'Ctrl', '/'], label: '전체 검색 열기 (업무/일정/할 일/업무 기록 통합 검색)' },
  { keys: [isMac ? '⌘' : 'Ctrl', 'Enter'], label: '열려 있는 입력 창 저장 (오늘 화면의 할 일/업무 기록 수정 중에도 동작)' },
  { keys: [isMac ? '⌘' : 'Ctrl', 'Z'], label: '방금 작업 실행 취소 (실행 취소 가능한 알림이 떠 있을 때)' },
  { keys: ['N'], label: '새 항목 만들기 (업무/일정 등록 창 열기, 오늘 화면에서는 할 일 입력창 포커스)' },
  { keys: ['Shift', 'N'], label: '오늘 화면에서 업무 기록(오늘 한 일) 입력창 포커스' },
  { keys: ['/'], label: '현재 화면의 검색창 포커스' },
  { keys: ['↑'], label: '업무 관리 화면 또는 오늘 화면의 할 일/업무 기록 목록에서 이전 행으로 이동 (행 수정 버튼에 포커스된 상태), 캘린더 일정 목록 보기에서 이전 일정으로 이동, 전체 검색 결과에서 이전 항목 선택' },
  { keys: ['↓'], label: '업무 관리 화면 또는 오늘 화면의 할 일/업무 기록 목록에서 다음 행으로 이동 (행 수정 버튼에 포커스된 상태), 캘린더 일정 목록 보기에서 다음 일정으로 이동, 전체 검색 결과에서 다음 항목 선택' },
  { keys: ['←'], label: '캘린더 화면에서 이전 일/주/달/년으로 이동 (선택된 보기에 따라)' },
  { keys: ['→'], label: '캘린더 화면에서 다음 일/주/달/년으로 이동 (선택된 보기에 따라)' },
  { keys: ['T'], label: '캘린더 화면에서 오늘로 이동' },
  { keys: ['Esc'], label: '검색창에 포커스된 상태에서 검색어 지우고 벗어나기' },
  ...navItems.map(([,,label],i)=>({ keys: [String(i+1)], label: `${label} 화면으로 이동` })),
  { keys: ['?'], label: '이 단축키 안내 열기' },
  { keys: ['Esc'], label: '열려 있는 창/대화상자 닫기 (오늘 화면의 할 일/업무 기록 수정 중이면 수정 취소)' },
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
