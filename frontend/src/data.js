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
    id: '2026-07-08-task-edit-legacy-tag-backend-clamp',
    timestamp: '2026-07-08T15:07:21+09:00',
    description: '기존 업무에 50개를 넘는 레거시 태그가 남아 있어도 서버가 수정 저장 시 허용 개수까지만 정리해 반영하도록 보강해, 업무 화면의 변경사항 저장이 다른 저장 경로나 후속 클라이언트에서도 같은 태그 검증 오류에 다시 막히지 않도록 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-dependency-count-clamp',
    timestamp: '2026-07-08T14:59:15+09:00',
    description: '기존 업무에 허용 개수보다 많은 의존 업무가 남아 있어도 수정 저장 시 상위 100개만 안전하게 유지하도록 정리해, 업무 화면에서 기존 항목의 변경사항 저장 버튼이 숨은 의존 관계 검증 오류에 다시 막히지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-tag-count-clamp',
    timestamp: '2026-07-08T14:56:11+09:00',
    description: '기존 업무에 50개를 넘는 레거시 태그가 남아 있어도 수정 저장 요청에서 허용 개수까지만 정리해 보내, 업무 화면에서 변경사항 저장 버튼이 태그 개수 검증 오류에 다시 막히지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-team-roster-removal-guard',
    timestamp: '2026-07-08T14:53:38+09:00',
    description: '설정 화면에서 아직 업무가 배정된 팀원은 배정 건수를 함께 보여주고 명단 제거를 막아, 담당자 재배정 전에 팀원 이름이 실수로 사라져 업무 소유권 관리가 흐려지지 않도록 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-stale-dependency-repair',
    timestamp: '2026-07-08T10:36:01+09:00',
    description: '기존 업무의 의존 업무 목록에 삭제됐거나 자기 자신을 가리키는 레거시 참조가 남아 있어도 수정 저장 시 유효한 의존 업무만 남기도록 정리해, 업무 화면에서 기존 항목을 저장한 뒤에도 깨진 선행 업무 연결이 남지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-inline-owner-requirement',
    timestamp: '2026-07-08T10:30:33+09:00',
    description: '업무 관리 화면의 진행률 슬라이더나 빠른 상태 변경으로 담당자 없는 업무가 새로 진행 중 또는 완료 상태가 되지 않도록 서버 검증을 보강해, 소유자 없는 활성 업무가 다시 생기지 않게 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-tag-member-repair',
    timestamp: '2026-07-08T10:26:59+09:00',
    description: '기존 업무의 태그 값이 JSON 배열 형태라도 문자열이 아닌 항목이나 중복 공백 태그가 섞여 있으면 수정 저장이 실패하던 문제를 보완해, 업무 화면에서 제목만 바꾸는 편집도 저장하면서 태그를 안전하게 정리하도록 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-blank-legacy-date-repair',
    timestamp: '2026-07-08T10:22:56+09:00',
    description: '기존 업무의 시작일이나 완료 예정일이 빈 문자열 레거시 값으로 남아 있어도 수정 저장 시 빈 일정으로 안전하게 정리해, 업무 화면에서 제목만 바꾸는 편집이 날짜 검증 오류에 다시 막히지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-tag-payload-normalization',
    timestamp: '2026-07-08T10:19:42+09:00',
    description: '기존 업무에 허용 길이를 넘거나 공백이 섞인 레거시 태그가 남아 있어도 수정 저장 요청에서 태그를 정리해 보내, 업무 화면의 변경사항 저장 버튼이 기존 태그 검증 오류에 다시 막히지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-text-payload-clamp',
    timestamp: '2026-07-08T10:17:12+09:00',
    description: '기존 업무의 제목, 메모, 담당자 값이 화면에 남아 있는 레거시 초과 길이 텍스트여도 수정 저장 요청을 보낼 때 허용 길이로 잘라 보내, 업무 화면의 변경사항 저장 버튼이 다시 검증 오류에 막히지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-text-repair',
    timestamp: '2026-07-08T10:11:46+09:00',
    description: '기존 업무의 제목, 메모, 담당자 값이 허용 길이를 넘는 레거시 데이터여도 수정 저장 시 안전한 길이로 자동 복구해, 업무 화면에서 변경사항 저장 버튼을 눌렀을 때 다시 오류가 나지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-date-repair',
    timestamp: '2026-07-08T10:11:08+09:00',
    description: '기존 업무의 시작일이나 완료 예정일이 잘못된 날짜 문자열로 남아 있어도 수정 저장 시 빈 일정으로 안전하게 복구해, 업무 화면에서 제목만 바꿔도 저장 오류가 나던 편집 경로를 막았습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-recurrence-repair',
    timestamp: '2026-07-08T10:05:27+09:00',
    description: '기존 업무에 지원되지 않는 반복 규칙 값이 남아 있어도 수정 저장 시 반복 없음으로 안전하게 복구해, 일반 편집에서 저장 오류가 다시 나지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-progress-repair',
    timestamp: '2026-07-08T10:01:03+09:00',
    description: '기존 업무의 진행률 값이 0~100 범위를 벗어난 레거시 데이터여도 수정 저장 시 정상 범위와 상태로 자동 복구해, 제목만 바꾸는 편집에서도 저장 오류가 다시 나지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-form-state-reset',
    timestamp: '2026-07-08T09:57:34+09:00',
    description: '업무 수정 창이 다른 업무나 새 업무 작성으로 전환될 때 이전 항목의 담당자, 태그, 오류 상태가 남아 저장을 방해하지 않도록 폼 상태를 항상 새로 초기화했습니다.',
  },
  {
    id: '2026-07-08-task-edit-stale-parent-reference-repair',
    timestamp: '2026-07-08T09:52:32+09:00',
    description: '기존 업무의 상위 업무가 이미 삭제됐거나 더 이상 같은 사용자에게 보이지 않는 레거시 참조로 남아 있어도 수정 저장 시 해당 부모 연결을 자동으로 해제해, 저장 후에도 깨진 업무 계층이 남지 않도록 보완했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-parent-id-repair',
    timestamp: '2026-07-08T09:48:41+09:00',
    description: '기존 최상위 업무의 상위 업무 값이 0 같은 잘못된 레거시 값으로 남아 있어 수정 저장이 막히던 문제를 보완해, 편집 저장 시 상위 업무 값을 안전하게 최상위 상태로 복구하도록 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-stale-approval-repair',
    timestamp: '2026-07-08T06:27:31+09:00',
    description: '완료 상태에서 되돌아온 기존 업무에 승인 완료 값이 남아 있어 수정 저장이 막히던 문제를 보완해, 일반 편집 저장 시 승인 상태를 안전하게 초기화하도록 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-json-array-repair',
    timestamp: '2026-07-08T06:24:33+09:00',
    description: '기존 업무의 태그나 의존 업무 값이 깨진 JSON 문자열로 남아 있어도 수정 저장 시 빈 목록으로 안전하게 복구해, 제목만 바꾸는 편집에서도 서버 오류가 나지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-enum-repair',
    timestamp: '2026-07-08T06:21:55+09:00',
    description: '기존 업무에 비표준 상태값이나 우선순위값이 남아 있어도 수정 저장 시 표준값으로 자동 복구해, 제목만 바꾸는 편집에서도 저장 오류가 다시 나지 않도록 보강했습니다.',
  },
  {
    id: '2026-07-08-task-edit-blank-approval-fields',
    timestamp: '2026-07-08T06:14:27+09:00',
    description: '기존 업무의 완료 승인 상태나 일정 승인 상태가 비어 있는 레거시 데이터도 수정 저장 시 자동으로 none 값으로 복구해, 제목만 바꿔도 저장 오류가 나던 편집 경로를 막았습니다.',
  },
  {
    id: '2026-07-08-task-edit-regression-test-entrypoint',
    timestamp: '2026-07-08T06:12:04+09:00',
    description: '업무 수정 저장 회귀 테스트가 저장소 루트에서 바로 실행되도록 백엔드 테스트 경로를 보강해, 기존 업무 편집 저장 오류가 다시 섞여 들어와도 기본 점검에서 바로 잡을 수 있게 했습니다.',
  },
  {
    id: '2026-07-08-task-edit-legacy-unassigned-save',
    timestamp: '2026-07-08T06:09:01+09:00',
    description: '기존에 담당자 없이 진행 중이던 업무도 제목이나 메모를 수정해 저장할 수 있도록 편집 검증을 보완해, 새 소유자 누락은 계속 막으면서 기존 업무 수정 차단 문제를 해소했습니다.',
  },
  {
    id: '2026-07-08-task-edit-preserve-blank-dates',
    timestamp: '2026-07-08T06:06:39+09:00',
    description: '기존 업무에 시작일이나 완료 예정일이 비어 있을 때 수정 창이 오늘 날짜를 임의로 채우지 않도록 바꿔 저장만 눌러도 일정이 바뀌거나 날짜 검증 오류가 나던 문제를 막았습니다.',
  },
  {
    id: '2026-07-08-team-roster-workload-summary',
    timestamp: '2026-07-08T06:02:00+09:00',
    description: '설정 화면의 팀원 명단에 진행, 완료, 지연, 14일 부하 요약을 추가해 저장된 담당자별 업무 분산 상태를 배정 전에 바로 확인할 수 있게 했습니다.',
  },
  {
    id: '2026-07-08-task-ownership-save-guard',
    timestamp: '2026-07-08T05:59:04+09:00',
    description: '업무 등록과 수정 화면에서 진행 중이거나 완료된 업무를 저장할 때 담당자가 비어 있으면 바로 안내해 소유자 없는 활성 업무가 쌓이지 않도록 했습니다.',
  },
  {
    id: '2026-07-08-task-approval-queue-filters',
    timestamp: '2026-07-08T00:18:03+09:00',
    description: '업무 관리 화면의 상태 필터에 완료 승인 대기와 일정 승인 대기를 추가하고 알림에서 해당 검토 대기 업무만 바로 좁혀 볼 수 있게 했습니다.',
  },
  {
    id: '2026-07-08-local-team-roster',
    timestamp: '2026-07-08T00:14:49+09:00',
    description: '설정 화면에 기기별 팀원 명단을 추가하고 업무 등록과 수정 화면의 담당자 추천에 저장된 팀원을 함께 표시하도록 했습니다.',
  },
  {
    id: '2026-07-08-task-schedule-change-approval',
    timestamp: '2026-07-08T00:09:55+09:00',
    description: '업무 시작일이나 완료 예정일이 바뀌면 일정 승인 대기 상태로 표시하고 업무 관리 화면에서 일정 변경을 승인하거나 재검토로 표시할 수 있게 했습니다.',
  },
  {
    id: '2026-07-08-task-completion-approval',
    timestamp: '2026-07-08T00:00:26+09:00',
    description: '완료된 업무가 승인 대기 상태로 남고 업무 관리 화면에서 승인하거나 재작업으로 되돌릴 수 있는 기본 완료 승인 흐름을 추가했습니다.',
  },
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
