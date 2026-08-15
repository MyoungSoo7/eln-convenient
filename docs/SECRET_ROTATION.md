# INTERNAL_SECRET 회전 절차

서비스 간 호출 인증에 사용되는 `INTERNAL_SECRET`의 무중단 회전 절차.

## 동작 원리

`@lab/shared`의 `requireInternalSecretFastify`는 두 개의 환경변수를 동시에 허용한다:

- `INTERNAL_SECRET` — 신규(현재) 시크릿. 필수.
- `INTERNAL_SECRET_PREVIOUS` — 직전 시크릿. 회전 진행 중에만 설정. 빈 문자열이면 무시.

호출 측(publisher)은 `INTERNAL_SECRET`만 사용해서 호출하므로, 양쪽 다 새 값으로 배포가 끝나면 `_PREVIOUS`는 안전하게 제거할 수 있다.

## 회전 절차 (무중단)

1. **새 시크릿 생성**
   ```bash
   NEW_SECRET=$(openssl rand -hex 32)
   ```

2. **`.env`에 dual-secret 설정**
   ```bash
   # services/.env
   INTERNAL_SECRET_PREVIOUS=<현재 운영 중인 값>
   INTERNAL_SECRET=<NEW_SECRET>
   ```

3. **전 서비스 재기동** — 양쪽 모두 신규 + 직전 값 둘 다 허용
   ```bash
   cd services && docker compose up -d
   ```
   - 이 시점에서 publisher가 점진적으로 신규 값을 사용하기 시작 → 수신측은 둘 다 OK라 401 발생 X

4. **검증** — 모든 서비스가 신규 값으로 호출하고 있는지 확인
   ```bash
   docker logs labnote-signature 2>&1 | grep INTERNAL_AUTH_FAILED  # 비어있어야 함
   ```
   최소 1시간(또는 1개 deploy 주기) 관찰.

5. **`_PREVIOUS` 제거 후 재기동**
   ```bash
   # services/.env
   INTERNAL_SECRET=<NEW_SECRET>
   # INTERNAL_SECRET_PREVIOUS 줄 제거 또는 빈 값
   ```
   ```bash
   cd services && docker compose up -d
   ```

6. **회전 완료 기록** — 회전 일시·수행자·이전/신규 해시(앞 8자) 운영 로그에 기록.

## 회전 트리거

- 분기별 정기 회전 (권장)
- 시크릿 노출 의심 시 즉시 회전
- 운영자 이탈 시

## 비상시 즉시 회전 (다운타임 허용)

dual-secret 단계를 생략하고 한 번에 교체:
```bash
# .env에 INTERNAL_SECRET 새 값만 설정
cd services && docker compose up -d
```
- 재기동 동안 수십 초간 내부 호출 401 발생 가능 → 운영시 사용 금지, 비상시에만.
