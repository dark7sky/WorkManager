export const seedTasks = [
  { id: 1, title: '분기 업무 보고서 작성', category: '기획', start_date: '2026-07-06', due_date: '2026-07-10', progress: 65, status: 'in_progress', priority: 'high' },
  { id: 2, title: '신규 프로젝트 요구사항 정리', category: '프로젝트', start_date: '2026-07-07', due_date: '2026-07-14', progress: 30, status: 'in_progress', priority: 'medium' },
  { id: 3, title: '거래처 제안서 검토', category: '영업', start_date: '2026-07-08', due_date: '2026-07-09', progress: 0, status: 'todo', priority: 'high' },
  { id: 4, title: '지난주 회의록 배포', category: '운영', start_date: '2026-07-04', due_date: '2026-07-06', progress: 100, status: 'done', priority: 'low' },
]
export const seedEvents = [
  { id: 1, title: '주간 팀 회의', start: '2026-07-06T10:00:00', end: '2026-07-06T11:00:00', color: 'blue' },
  { id: 2, title: '고객사 미팅', start: '2026-07-08T14:00:00', end: '2026-07-08T15:30:00', color: 'purple' },
  { id: 3, title: '보고서 제출', start: '2026-07-10T17:00:00', end: '2026-07-10T18:00:00', color: 'orange' },
]

export const changelogUpdates = [
  {
    id: '2026-07-07-overdue-task-filter',
    timestamp: '2026-07-07T08:58:35+09:00',
    description: '업무 관리 화면에서 기한이 지난 미완료 업무만 빠르게 확인할 수 있는 지연 업무 필터를 추가했습니다.',
  },
  {
    id: '2026-07-07-changelog-screen',
    timestamp: '2026-07-07T08:54:01+09:00',
    description: '사용자가 앱 안에서 릴리스 변경 이력을 확인할 수 있는 변경 이력 화면과 메뉴를 추가했습니다.',
  },
]
