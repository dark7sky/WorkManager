# Portainer Stack 배포

## 사전 준비

1. `work.ysyoo.link`의 A/AAAA 레코드를 Portainer가 관리하는 Docker 호스트로 연결합니다.
2. 공유기와 방화벽에서 TCP 80·443을 해당 호스트로 전달합니다. HTTP/3를 사용하려면 UDP 443도 허용합니다.
3. 다른 컨테이너가 호스트의 80/443 포트를 사용하지 않는지 확인합니다.
4. Google 로그인을 쓸 경우 Google Cloud Console의 Authorized redirect URI에 `https://work.ysyoo.link/api/auth/google/callback`을 등록합니다.

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
   - `APP_LOGIN_ID`
   - `APP_LOGIN_PASSWORD`
   - `APP_SECRET` (긴 무작위 문자열)
   - `GOOGLE_CLIENT_ID` (선택)
   - `GOOGLE_CLIENT_SECRET` (선택)
   - `GOOGLE_ALLOWED_EMAIL` (선택, 본인 이메일 권장)
   - `AI_API_KEY` (선택)
   - `AI_BASE_URL` (선택)
   - `AI_MODEL` (선택)
6. **GitOps updates**를 켜고 다음 중 하나를 선택합니다.
   - Polling: 5분 간격. 가장 단순하고 GitHub 추가 설정이 필요 없습니다.
   - Webhook: 표시된 URL을 복사해 GitHub 저장소의 Actions secret `PORTAINER_WEBHOOK_URL`로 등록합니다.
7. `Re-pull image`는 꺼도 됩니다. 이 Stack은 저장소 소스로 이미지를 직접 빌드합니다.
8. `Force redeployment`는 끕니다. 커밋이 바뀐 경우에만 재배포하도록 합니다.
9. **Deploy the stack**을 누릅니다.

## push 자동 배포

- Polling을 선택하면 Portainer가 원격 `main` 커밋 해시를 주기적으로 확인해 변경 시 저장소를 다시 받고 Stack을 재배포합니다.
- Webhook을 선택하고 GitHub secret을 등록하면 `.github/workflows/portainer-deploy.yml`이 `main` push 직후 Portainer를 호출합니다.
- 사용 중인 Portainer 에디션에서 GitOps webhook을 제공하지 않으면 Polling만 사용하면 됩니다.

## 확인

1. Stack의 `api`, `web`, `caddy` 컨테이너가 Running/Healthy인지 확인합니다.
2. Caddy 로그에서 인증서 발급 성공을 확인합니다.
3. `https://work.ysyoo.link`에 접속합니다.
4. 인증서 발급이 실패하면 DNS, 포트포워딩, 방화벽, 기존 80/443 점유를 순서대로 확인합니다.

데이터는 `workmanager_data` named volume에 유지되므로 코드 재배포 시 삭제되지 않습니다. Stack 삭제 화면에서 volumes 삭제 옵션은 선택하지 마세요.
