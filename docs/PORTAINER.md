# Portainer Stack 배포

## 사전 준비

1. `work.ysyoo.link`의 A/AAAA 레코드를 Portainer가 관리하는 Docker 호스트로 연결합니다.
2. 기존 리버스 프록시에서 `work.ysyoo.link`를 Docker 호스트의 `APP_HTTP_PORT`로 전달합니다. 기본 포트는 `18080`입니다.
3. 방화벽에서는 이 포트를 외부에 직접 공개하지 말고 리버스 프록시에서만 접근하게 하는 것을 권장합니다.
4. Google 로그인을 쓸 경우 Google Cloud Console의 Authorized redirect URI에 `https://work.ysyoo.link/api/auth/google/callback`을 등록합니다.
5. Google Cloud Console에서 Google Calendar API를 활성화하고 본인 계정을 OAuth 테스트 사용자로 추가합니다.

## Stack 생성

1. Portainer에서 Docker Standalone 환경을 선택합니다.
2. **Stacks → Add stack → Git repository**를 선택합니다.
3. 아래 값을 입력합니다.
   - Name: `workmanager`
   - Repository URL: `https://github.com/dark7sky/WorkManager.git`
   - Repository reference: `refs/heads/main`
   - Compose path: `portainer-stack.yml`
4. 저장소가 private이면 Authentication을 켜고 GitHub 사용자명과 `Contents: Read-only` 권한의 fine-grained PAT를 입력합니다.
5. 아래 환경변수를 Portainer UI에서 추가합니다. 비밀값은 저장소 파일에 넣지 않습니다.
   - `APP_SECRET` (긴 무작위 문자열)
   - `CODEX_ADMIN_TOKEN` (Codex 개선 요청 상태 변경용 별도의 긴 무작위 문자열)
   - `APP_HTTP_PORT` (선택, 기본값 `18080`)
   - `GOOGLE_CLIENT_ID` (필수)
   - `GOOGLE_CLIENT_SECRET` (필수)
   - `GOOGLE_ALLOWED_EMAIL` (필수, 여러 계정은 쉼표 구분)
   - `LEGACY_OWNER_EMAIL` (기존 DB 업그레이드 시 필수, 기존 데이터 소유 Google 이메일)
   - `GOOGLE_CALENDAR_HISTORY_DAYS` (선택, 최초 동기화 이력 기본 3650일)
   - `AI_API_KEY` (선택)
   - `AI_BASE_URL` (선택)
   - `AI_MODEL` (선택)
   - `AI_TIMEOUT_SECONDS` (선택, 기본 `30`)
   - `BACKUP_INTERVAL_SECONDS` (선택, 기본 `21600`)
   - `BACKUP_RETENTION_DAYS` (선택, 기본 `30`)
6. **GitOps updates**를 켜고 다음 중 하나를 선택합니다.
   - Polling: 5분 간격. 가장 단순하고 GitHub 추가 설정이 필요 없습니다.
   - Webhook: 표시된 URL을 복사해 GitHub 저장소의 Actions secret `PORTAINER_WEBHOOK_URL`로 등록합니다.
7. `Re-pull image`는 꺼도 됩니다. 이 Stack은 `workmanager-api` 같은 로컬 이미지 이름을 쓰지 않고 저장소 소스로 이미지를 직접 빌드합니다.
8. `Force redeployment`는 끕니다. 커밋이 바뀐 경우에만 재배포하도록 합니다.
9. **Deploy the stack**을 누릅니다.

## push 자동 배포

- Polling을 선택하면 Portainer가 원격 `main` 커밋 해시를 주기적으로 확인해 변경 시 저장소를 다시 받고 Stack을 재배포합니다.
- Webhook을 선택하고 GitHub secret을 등록하면 `.github/workflows/portainer-deploy.yml`이 `main` push 직후 Portainer를 호출합니다.
- 사용 중인 Portainer 에디션에서 GitOps webhook을 제공하지 않으면 Polling만 사용하면 됩니다.
- `portainer-stack.yml`의 `api`와 `backup` 서비스는 모두 `./backend`에서 빌드합니다. `image: workmanager-api` 같은 로컬 태그를 추가하면 Portainer의 pull 단계가 Docker Hub에서 해당 이미지를 찾으려다 실패할 수 있습니다.

## 확인

1. Stack의 `api`, `web`, `backup` 컨테이너가 Running/Healthy인지 확인합니다.
2. 먼저 `http://Docker호스트IP:18080`으로 앱 응답을 확인합니다.
3. 기존 리버스 프록시에서 `work.ysyoo.link`의 upstream을 `Docker호스트IP:18080`으로 설정하고 WebSocket 지원을 켭니다.
4. `https://work.ysyoo.link`에 접속합니다.
5. 접속이 실패하면 DNS, 리버스 프록시 upstream, 방화벽, `APP_HTTP_PORT` 점유를 순서대로 확인합니다.

데이터는 `workmanager_data`, 자동 백업은 `workmanager_backups` named volume에 유지됩니다. Stack 삭제 화면에서 volumes 삭제 옵션은 선택하지 마세요. 디스크 고장에 대비해 `workmanager_backups`를 다른 장치나 암호화된 원격 저장소에도 복제하십시오.

## 공개 변경 이력과 Codex 개선 큐

- `https://work.ysyoo.link/changelog`는 로그인 없이 읽을 수 있습니다.
- 공개 페이지에는 모든 사용자의 `pending`, `in_progress` 요청이 표시되며 사용자 계정 정보는 노출하지 않습니다.
- Codex가 작업을 시작할 때 아래 관리 API로 `in_progress` 상태를 지정합니다.
- 완료할 때 `done`과 변경 설명을 함께 보내면 서버가 요청 원문과 요청일을 변경 이력에 보존하고 공개 개선 큐에서는 제거합니다.
- 토큰을 명령문에 직접 쓰지 말고 Codex 실행 환경의 `CODEX_ADMIN_TOKEN`으로 전달합니다.

```powershell
$headers = @{ Authorization = "Bearer $env:CODEX_ADMIN_TOKEN" }
Invoke-RestMethod -Method Patch -Uri "https://work.ysyoo.link/api/admin/feature-requests/요청ID" -Headers $headers -ContentType "application/json" -Body '{"status":"in_progress"}'
Invoke-RestMethod -Method Patch -Uri "https://work.ysyoo.link/api/admin/feature-requests/요청ID" -Headers $headers -ContentType "application/json" -Body '{"status":"done","description":"구현하고 배포한 내용을 기록합니다."}'
```

## 업그레이드 주의사항

- 기존 ID/PW 로그인은 제거되었습니다. 배포 전에 Google OAuth 환경변수가 반드시 있어야 합니다.
- 기존 단일 사용자 데이터가 있다면 첫 재배포 전에 `LEGACY_OWNER_EMAIL`을 정확히 설정하십시오. 값이 없거나 로그인 계정과 다르면 데이터는 안전하게 legacy 상태로 남습니다.
- `APP_SECRET`을 변경하면 기존 Google refresh token을 복호화할 수 없으므로 다시 연결해야 합니다.
- 배포 후 `https://work.ysyoo.link/api/ready`가 `database: ready`를 반환하는지 확인합니다.
- 삭제 항목은 즉시 제거되지 않고 휴지통으로 이동합니다. 설정에서 복원하거나 30일이 지난 항목을 영구 정리할 수 있습니다.
