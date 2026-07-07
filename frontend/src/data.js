export const seedTasks = [
  { id: 1, title: '분기 업무 보고서 작성', category: '기획', start_date: '2026-07-06', due_date: '2026-07-10', progress: 65, status: 'in_progress', priority: 'high', assignee_name: '김민준' },
  { id: 2, title: '신규 프로젝트 요구사항 정리', category: '프로젝트', start_date: '2026-07-07', due_date: '2026-07-14', progress: 30, status: 'in_progress', priority: 'medium', assignee_name: '이서연' },
  { id: 3, title: '거래처 제안서 검토', category: '영업', start_date: '2026-07-08', due_date: '2026-07-09', progress: 0, status: 'todo', priority: 'high', assignee_name: '박지훈' },
  { id: 4, title: '지난주 회의록 배포', category: '운영', start_date: '2026-07-04', due_date: '2026-07-06', progress: 100, status: 'done', priority: 'low', assignee_name: '최유진' },
]
export const seedEvents = [
  { id: 1, title: '주간 팀 회의', start: '2026-07-06T10:00:00', end: '2026-07-06T11:00:00', color: 'blue' },
  { id: 2, title: '고객사 미팅', start: '2026-07-08T14:00:00', end: '2026-07-08T15:30:00', color: 'purple' },
  { id: 3, title: '보고서 제출', start: '2026-07-10T17:00:00', end: '2026-07-10T18:00:00', color: 'orange' },
]

export const changelogUpdates = [
  {
    id: '2026-07-07-task-edit-parent-id-normalization',
    timestamp: '2026-07-07T23:58:33+09:00',
    description: '업무 수정 저장 시 상위 업무 ID의 문자열/숫자 차이와 자기 자신을 상위 업무로 보내는 잘못된 값 때문에 저장 오류가 나지 않도록 요청 생성을 보강했습니다.',
  },
  {
    id: '2026-07-07-task-edit-clear-empty-fields',
    timestamp: '2026-07-07T23:53:13+09:00',
    description: '업무 수정 저장 시 비워 둔 시작일, 완료 예정일, 반복, 상위 업무 값이 빈 문자열로 전달되어도 서버에서 해제 값으로 처리해 저장 오류를 막았습니다.',
  },
  {
    id: '2026-07-07-task-parent-selector-hierarchy-labels',
    timestamp: '2026-07-07T23:50:51+09:00',
    description: '업무 수정 화면의 상위 업무 선택 목록을 실제 부모-자식 순서와 깊이 표시로 정리해 계층 이동 대상을 더 명확히 고를 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-edit-save-payload-defaults',
    timestamp: '2026-07-07T23:49:11+09:00',
    description: '업무 수정 저장 요청에서 상태, 우선순위, 진행률 입력값이 비어 있거나 손상되어도 안전한 기본값으로 정규화해 저장 오류 가능성을 줄였습니다.',
  },
  {
    id: '2026-07-07-task-priority-filter',
    timestamp: '2026-07-07T23:43:44+09:00',
    description: '업무 관리 화면에 우선순위 필터를 추가해 높은, 보통, 낮은 우선순위 업무만 빠르게 좁혀 볼 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-parent-move-promote-regression',
    timestamp: '2026-07-07T19:16:26+09:00',
    description: '업무 계층 편집에서 기존 업무를 다른 상위 업무로 이동하고 다시 최상위로 승격하는 API 경로를 회귀 테스트로 보강했습니다.',
  },
  {
    id: '2026-07-07-task-dependency-blocker-visibility',
    timestamp: '2026-07-07T19:13:14+09:00',
    description: '업무 관리 화면에서 완료되지 않은 선행 업무 때문에 대기 중인 업무를 알림과 행별 표시로 확인할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-edit-save-merged-aliases',
    timestamp: '2026-07-07T19:08:34+09:00',
    description: '기존 업무 수정 저장 시 이전 데이터의 상태와 우선순위 별칭을 병합 검증 전에 표준값으로 맞춰 저장 경로를 더 견고하게 했습니다.',
  },
  {
    id: '2026-07-07-task-edit-save-optional-text-fields',
    timestamp: '2026-07-07T19:06:33+09:00',
    description: '업무 수정 저장 시 선택 입력값이 비어 있거나 누락되어도 저장 요청 생성이 중단되지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-07-feature-request-status-management',
    timestamp: '2026-07-07T19:03:34+09:00',
    description: '변경 이력 화면에서 제출된 기능 개선 요청의 상태를 대기, 진행 중, 완료, 보류로 바로 관리할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-form-assignee-load-preview',
    timestamp: '2026-07-07T19:00:59+09:00',
    description: '업무 등록과 수정 화면에서 선택한 담당자의 진행 업무, 임박 마감, 지연, 높은 우선순위 업무 수를 저장 전에 확인할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-edit-save-error-detail',
    timestamp: '2026-07-07T18:56:37+09:00',
    description: '업무 수정 저장이 실패할 때 저장 창 안에서도 API 검증 오류를 그대로 보여주도록 개선해 기존 업무 수정 문제를 더 빠르게 진단할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-assignee-reuse-suggestions',
    timestamp: '2026-07-07T18:54:47+09:00',
    description: '업무 등록과 수정 화면의 담당자 입력에 기존 담당자 이름 추천을 추가해 팀원 이름 표기 흔들림을 줄였습니다.',
  },
  {
    id: '2026-07-07-task-edit-parent-payload',
    timestamp: '2026-07-07T18:50:25+09:00',
    description: '업무 수정 저장 시 상위 업무가 바뀌지 않은 경우 계층 필드를 다시 보내지 않도록 조정해 기존 업무 저장 경로를 더 안정화했습니다.',
  },
  {
    id: '2026-07-07-unassigned-task-ownership-alert',
    timestamp: '2026-07-07T18:47:46+09:00',
    description: '업무 관리 화면에 담당자가 없는 진행 업무를 알려주는 소유자 미지정 알림과 빠른 필터를 추가했습니다.',
  },
  {
    id: '2026-07-07-task-edit-save-json-fields',
    timestamp: '2026-07-07T18:43:38+09:00',
    description: '업무 수정 저장 시 태그와 의존 업무 같은 JSON 필드가 API 재검증에서 문자열로 처리되어 저장이 실패하던 문제를 수정했습니다.',
  },
  {
    id: '2026-07-07-task-pdf-report-export',
    timestamp: '2026-07-07T18:41:12+09:00',
    description: '업무 관리 화면의 현재 검색, 상태, 담당자, 태그 필터 결과를 인쇄 또는 PDF 저장용 업무 보고서로 출력할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-assignee-capacity-strip',
    timestamp: '2026-07-07T17:29:51+09:00',
    description: '업무 관리 화면에 14일 기준 담당자별 일정 부하 요약을 추가해 특정 담당자에게 업무가 몰리는 날짜를 빠르게 확인할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-hierarchy-roadmap-reconciled',
    timestamp: '2026-07-07T17:27:11+09:00',
    description: '업무 계층 편집 기능이 실제 화면과 API에 반영된 상태를 제품 로드맵과 변경 이력에 맞춰 정리했습니다.',
  },
  {
    id: '2026-07-07-task-hierarchy-editing',
    timestamp: '2026-07-07T17:20:01+09:00',
    description: '업무 수정 화면에서 상위 업무를 선택하거나 최상위로 승격할 수 있게 하고, 업무 목록을 부모-자식 순서로 표시하도록 개선했습니다.',
  },
  {
    id: '2026-07-07-task-edit-save-legacy-values',
    timestamp: '2026-07-07T17:15:59+09:00',
    description: '기존 업무를 수정해 저장할 때 이전 데이터의 진행 상태와 우선순위 값이 엄격한 API 검증에서 오류를 내던 문제를 수정했습니다.',
  },
  {
    id: '2026-07-07-feature-request-queue',
    timestamp: '2026-07-07T13:43:14+09:00',
    description: '변경 이력 화면에 사용자 개선 요청 입력 칸과 요청 목록을 추가하고, Codex 자동 개선 루프가 pending 요청을 우선 제안으로 반영할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-due-reminders',
    timestamp: '2026-07-07T09:19:48+09:00',
    description: '업무 관리 화면에 지연, 오늘 마감, 2일 내 마감 업무를 요약하는 마감 알림을 추가해 놓치기 쉬운 일정 확인을 빠르게 했습니다.',
  },
  {
    id: '2026-07-07-assignee-workload-filter',
    timestamp: '2026-07-07T09:15:59+09:00',
    description: '업무 관리 화면에 담당자별 필터와 업무량 요약을 추가해 팀원별 진행, 지연, 완료 업무를 빠르게 확인할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-csv-export',
    timestamp: '2026-07-07T09:13:03+09:00',
    description: '업무 관리 화면의 현재 검색, 상태, 태그 필터 결과를 고객 보고용 CSV 파일로 내려받을 수 있는 내보내기 버튼을 추가했습니다.',
  },
  {
    id: '2026-07-07-audit-log-screen',
    timestamp: '2026-07-07T09:08:21+09:00',
    description: '감사 로그 화면을 추가해 생성, 수정, 삭제, 동기화 같은 주요 변경 이력을 앱에서 검색하고 대상별로 확인할 수 있게 했습니다.',
  },
  {
    id: '2026-07-07-task-assignee',
    timestamp: '2026-07-07T09:01:09+09:00',
    description: '업무에 담당자 이름을 저장하고 업무 목록에서 소유자를 확인할 수 있도록 담당자 필드를 추가했습니다.',
  },
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
