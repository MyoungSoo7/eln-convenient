# 트러블슈팅 가이드

## Redis Stream 소비자 멈춤

**증상**: 이벤트가 발행되지만 소비자 서비스에서 처리되지 않음 (예: 서명 후 노트 상태 미변경)

**원인**: eln-service의 eventConsumer가 멈추거나 연결이 끊어짐

**해결 방법**:
1. eln-service 헬스체크 확인: eventConsumer 상태가 헬스체크에 포함되어 있음
2. `docker compose logs eln-service` 로 에러 로그 확인
3. 컨테이너 재시작: `docker compose restart eln-service`
4. Redis Stream 적체 확인: `redis-cli XLEN <stream-name>`

---

## PostgreSQL connection_limit 초과

**증상**: 데이터베이스 연결 에러, "too many connections" 메시지

**원인**: 동시 연결 수가 데이터베이스 제한을 초과

**해결 방법**:
1. 현재 연결 수 확인: `SELECT count(*) FROM pg_stat_activity;`
2. `connection_limit=10`으로 증가됨 (기존 기본값 대비)
3. PostgreSQL `max_connections=100` 설정 확인
4. 각 서비스의 connection pool 설정이 적절한지 확인
5. 필요 시 `postgresql.conf`에서 `max_connections` 조정 후 재시작

---

## 내부 서비스 통신 실패

**증상**: 서비스 간 API 호출 시 인증 에러 (401/403)

**원인**: 내부 서비스 간 통신에 필요한 시크릿이 설정되지 않음

**해결 방법**:
1. `INTERNAL_SECRET` 환경변수 확인 (필수값)
2. 모든 서비스에 동일한 `INTERNAL_SECRET` 값이 설정되어 있는지 확인
3. `.env` 파일 또는 Docker Compose 환경변수 설정 확인
4. 설정 변경 후 관련 서비스 모두 재시작

---

## OpenSearch 인덱스 생성 실패

**증상**: 한국어 검색이 동작하지 않음, 인덱스 생성 시 에러

**원인**: 한국어 형태소 분석기(nori) 플러그인이 설치되지 않음

**해결 방법**:
1. nori 플러그인 설치 확인: `curl -X GET "localhost:9200/_cat/plugins?v"`
2. 플러그인 설치: `docker exec opensearch-node bin/opensearch-plugin install analysis-nori`
3. OpenSearch 재시작 후 인덱스 재생성
4. 인덱스 매핑에서 nori_tokenizer 설정 확인

---

## WebSocket 연결 실패

**증상**: 실시간 협업 기능 미작동, WebSocket 연결이 즉시 끊어짐

**원인**: JWT 토큰이 올바르게 전달되지 않음

**해결 방법**:
1. WebSocket 연결 시 JWT 토큰을 쿼리 파라미터로 전달하는지 확인
2. 빈 토큰이 전달되면 서버에서 즉시 거부함
3. 토큰 만료 여부 확인
4. 프록시(nginx 등) 설정에서 WebSocket 업그레이드 헤더가 전달되는지 확인
5. `Connection: Upgrade` 및 `Upgrade: websocket` 헤더 확인

---

## Docker Compose 시작 순서 문제

**증상**: 서비스 시작 시 의존 서비스에 연결할 수 없음

**원인**: 의존 서비스(DB, Redis 등)가 아직 준비되지 않은 상태에서 앱 서비스가 시작됨

**해결 방법**:
1. `docker-compose.yml`에서 `depends_on` + `healthcheck` 설정 확인
2. 각 인프라 서비스에 적절한 healthcheck가 정의되어 있는지 확인
3. `docker compose up -d` 후 `docker compose ps`로 상태 확인
4. 헬스체크 실패 시 개별 서비스 로그 확인

---

## Prisma 마이그레이션 충돌

**증상**: 서비스 시작 시 Prisma 마이그레이션 에러, 스키마 불일치

**원인**: 마이그레이션 파일 충돌 또는 이전 마이그레이션 실패

**해결 방법**:
1. 마이그레이션 상태 확인: `docker exec <컨테이너명> npx prisma migrate status`
2. 마이그레이션 적용: `docker exec <컨테이너명> npx prisma migrate deploy`
3. 개발 환경에서 리셋이 필요한 경우: `npx prisma migrate reset` (데이터 손실 주의)
4. 마이그레이션 히스토리와 실제 DB 스키마 비교 확인

---

## 기본 비밀번호 에러

**증상**: 서비스 시작 실패, 필수 환경변수 누락 에러

**원인**: 보안 관련 필수 환경변수가 설정되지 않음

**해결 방법**:
1. 필수 환경변수 설정 확인:
   - `ADMIN_INITIAL_PASSWORD`: 관리자 초기 비밀번호
   - 기타 서비스별 필수 환경변수
2. `.env.example` 파일을 참고하여 `.env` 파일 작성
3. Docker Compose 환경에서는 `environment` 섹션 확인
4. 보안상 기본값이 제공되지 않으므로 반드시 직접 설정

---

## 멀티테넌트 데이터 유출

**증상**: 다른 조직의 데이터가 조회됨, 데이터 격리 위반

**원인**: 쿼리에 orgId 필터가 누락됨

**해결 방법**:
1. 모든 데이터 조회 쿼리에 `orgId` 필터가 포함되어 있는지 확인
2. `withOrgScope()` 헬퍼 함수를 사용하여 자동으로 orgId 필터 적용
3. API Gateway에서 주입하는 `x-org-id` 헤더가 올바르게 전달되는지 확인
4. 새로운 쿼리 작성 시 반드시 orgId 스코프 적용 여부 코드 리뷰
