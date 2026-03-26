# LabNote ELN 테스트 실행 가이드

## 1. 개요

LabNote ELN 플랫폼의 API 테스트 가이드 문서입니다.
9개 백엔드 서비스에 대해 **187개 테스트 케이스**(TC)를 자동/수동으로 실행하고 결과를 관리합니다.

### 테스트 범위

| No | 시트명 | 서비스 | TC 수 | 주요 영역 |
|----|--------|--------|-------|-----------|
| 1 | 인증_사용자 | auth-service | 31 | 로그인, JWT, 회원가입, RBAC, 조직, 팀 |
| 2 | 연구노트 | eln-service | 35 | 노트 CRUD, 상태전환, 리비전, 링크, 템플릿 |
| 3 | 전자서명_감사 | signature-audit | 23 | 서명, 해시체인, 감사로그, PDF/ZIP, 알림 |
| 4 | 인벤토리 | inventory-service | 18 | 시약/샘플 CRUD, 바코드, 수량/이력 |
| 5 | 예약 | scheduler-service | 18 | 자원 관리, 예약 CRUD, 승인/거절/취소 |
| 6 | 검색 | search-service | 13 | 통합검색, 자동완성, 히스토리, 즐겨찾기 |
| 7 | 파일 | file-service | 15 | 파일 업/다운로드, presigned URL, 내보내기 |
| 8 | API Gateway | api-gateway | 22 | JWT 프록시, Rate Limit, SSE, 대시보드 |
| 9 | 실시간협업 | collab-service | 12 | WebSocket 연결, Yjs 동기화, awareness |

### 테스트 유형 분포

| 유형 | TC 수 | 설명 |
|------|-------|------|
| 기능 | 142 | 정상 동작 확인 (CRUD, 상태전환 등) |
| 보안 | 29 | 인증 우회, 데이터 격리, 입력 차단 등 |
| 권한 | 11 | RBAC 역할별 접근 제어 검증 |
| 통합 | 2 | 서비스 간 이벤트 흐름 (Redis Stream) |
| 성능 | 2 | Rate Limit, 캐시 TTL 검증 |
| 장애허용 | 1 | 서비스 다운 시 에러 핸들링 |

---

## 2. 테스트 환경 준비

### 2.1 사전 요구사항

- Docker Desktop 실행 중
- Node.js 18+ 설치
- Git 클론 완료

### 2.2 서비스 기동

```bash
cd services
docker compose up -d
```

전체 서비스 기동 후 헬스체크 통과까지 대기 (약 30~60초):

```bash
docker compose ps   # 모든 서비스 healthy 확인
```

### 2.3 시드 데이터 확인

테스트는 아래 시드 계정을 사용합니다:

| 역할 | 이메일 | 비밀번호 | 권한 |
|------|--------|----------|------|
| Admin | admin@labnote.local | Admin1234! | 전체 권한 |
| Researcher | researcher@labnote.local | Researcher1234! | 노트 CRUD, 인벤토리, 예약 |
| Reviewer | reviewer@labnote.local | Reviewer1234! | 노트 CRUD + 서명(note:sign) |
| Viewer | viewer@labnote.local | Researcher1234! | 읽기 전용 |

시드 데이터가 없으면 각 서비스 컨테이너에서 실행:

```bash
docker exec <컨테이너명> npx prisma db seed
```

### 2.4 서비스 URL 확인

| 서비스 | URL | 용도 |
|--------|-----|------|
| API Gateway | http://localhost:8000 | 테스트 Base URL |
| MinIO 콘솔 | http://localhost:9001 | 파일 업로드 확인 |
| OpenSearch | http://localhost:9200 | 검색 인덱스 확인 |
| Jaeger UI | http://localhost:16686 | 요청 트레이싱 |
| Dozzle | http://localhost:9999 | 실시간 로그 |

---

## 3. 테스트 실행

### 3.1 자동 테스트 실행

```bash
# 프로젝트 루트에서
node tests/run-test-plan.mjs
```

실행 결과는 콘솔에 서비스별로 출력됩니다:

```
══ 1. 인증/사용자 (auth-service) ══
  PASS [1.인증] TC-001 정상 로그인
  PASS [1.인증] TC-002 잘못된 비밀번호
  SKIP [1.인증] TC-004 비활성 계정 로그인 — inactive 상태 사용자 시드 데이터 없음
  ...

══ 최종 결과 ══
PASS: 126  |  FAIL: 0  |  SKIP: 61  |  합계: 187
```

### 3.2 결과를 xlsx에 반영

```bash
node tests/update-test-results.mjs
```

- 입력: `docs/LabNote_ELN_테스트계획서.xlsx`
- 출력: `docs/LabNote_ELN_테스트결과보고서.xlsx`
- 각 시트에 **결과**(K열)와 **비고**(L열) 컬럼이 추가됩니다.

### 3.3 수동 테스트 (SKIP TC 보완)

자동 테스트에서 SKIP된 TC는 수동으로 보완합니다.
`docs/LabNote_ELN_테스트가이드.xlsx`의 **결과/비고** 컬럼에 직접 기입하세요.

---

## 4. TC 상세 가이드 (xlsx)

TC 관리는 `docs/LabNote_ELN_테스트가이드.xlsx`를 사용합니다.

### 시트 구조

| 시트 | 내용 |
|------|------|
| 요약 | 서비스별 TC 수, 우선순위/유형 분포 |
| 1~9번 시트 | 서비스별 TC (ID, 절차, 기대결과, 결과 기록) |
| 사용 가이드 | xlsx 사용법, 컬럼 설명, 환경 정보 |

### TC 컬럼 설명

| 컬럼 | 설명 |
|------|------|
| ID | `TC-001` 형식 고유 식별자 |
| 서비스 | 대상 백엔드 서비스명 |
| 기능 분류 | 기능 영역 (로그인, 노트 CRUD 등) |
| 테스트 항목 | TC 제목 |
| 테스트 상세 | 목적과 시나리오 설명 |
| 사전 조건 | 필요한 데이터/상태 |
| 테스트 절차 | 단계별 API 호출/조작 |
| 기대 결과 | 예상 응답/상태 |
| 우선순위 | 상(필수) / 중(권장) / 하(선택) |
| 유형 | 기능/보안/권한/통합/성능/장애허용 |
| 결과 | PASS / FAIL / SKIP |
| 비고 | 실제 결과, 오류 메시지, 특이사항 |

---

## 5. SKIP TC 분류 및 보완 방안

총 61개 TC가 SKIP 상태이며, 사유별 분류는 다음과 같습니다:

### 5.1 사전 데이터 부족 (18건)

사전에 특정 상태의 데이터가 필요한 TC들입니다.

| TC | 시트 | 항목 | 보완 방법 |
|----|------|------|-----------|
| TC-002 | 2.연구노트 | 템플릿 기반 노트 생성 | 템플릿 먼저 생성 후 테스트 |
| TC-010 | 2.연구노트 | signed 노트 수정 차단 | 서명 프로세스 완료 후 테스트 |
| TC-013 | 2.연구노트 | signed 노트 삭제 차단 | 서명 프로세스 완료 후 테스트 |
| TC-007 | 3.전자서명 | 서명 상세 조회 | 서명 ID 추출 후 테스트 |
| TC-002 | 5.예약 | 활성 예약 자원 비활성화 | 예약 데이터 사전 구성 |

**보완**: 테스트 스크립트에 시드 데이터 생성 로직 추가, 또는 수동으로 사전 데이터 생성 후 테스트

### 5.2 환경/인프라 제약 (12건)

WebSocket 클라이언트, Docker 내부 API 등 특수 환경이 필요한 TC들입니다.

| TC | 시트 | 항목 | 보완 방법 |
|----|------|------|-----------|
| TC-001~012 | 9.실시간협업 | WebSocket 전체 | ws 클라이언트 테스트 스크립트 작성 |
| TC-030 | 1.인증 | 내부 API 직접 호출 | Docker exec로 컨테이너 내부 curl |
| TC-015 | 3.전자서명 | 내부 이벤트 API | Docker exec로 컨테이너 내부 curl |

**보완**: WebSocket 전용 테스트 스크립트(ws 라이브러리) 별도 작성, internal API는 docker exec 활용

### 5.3 부작용/환경 오염 위험 (8건)

실행 시 다른 테스트에 영향을 주거나 되돌리기 어려운 TC들입니다.

| TC | 시트 | 항목 | 보완 방법 |
|----|------|------|-----------|
| TC-011 | 1.인증 | 역할 변경 후 토큰 무효화 | 격리된 테스트 계정 사용 |
| TC-023 | 1.인증 | 비밀번호 변경 | 전용 테스트 사용자 생성 |
| TC-008~010 | 8.API_GW | Rate Limit 트리거 | 테스트 후 대기 또는 격리 환경 |

**보완**: 전용 테스트 계정 시드 추가, Rate Limit 테스트는 마지막에 실행

### 5.4 비동기/BullMQ 작업 (5건)

| TC | 시트 | 항목 | 보완 방법 |
|----|------|------|-----------|
| TC-017~018 | 3.전자서명 | PDF/ZIP 생성 완료 확인 | 폴링으로 작업 상태 확인 |
| TC-013~015 | 7.파일 | ZIP 내보내기, 진행률 | 폴링으로 작업 상태 확인 |

**보완**: BullMQ 작업 완료까지 폴링 로직 추가

---

## 6. E2E 시나리오 테스트 (추가 권장)

현재 TC는 서비스별 단위 API 테스트입니다. 아래 크로스서비스 시나리오를 추가로 검증하는 것을 권장합니다.

### 시나리오 1: 노트 생성 → 서명 → PDF 내보내기

```
1. Researcher: POST /api/notes (노트 생성, draft)
2. Researcher: PATCH /api/notes/:id/status (draft → in_progress)
3. Reviewer: POST /api/signatures/sign/:noteId (서명 → signed)
4. Reviewer: POST /api/export/pdf/:noteId (PDF 생성 요청)
5. 확인: GET /api/export/list (작업 완료 확인)
```

### 시나리오 2: 인벤토리 → 검색 인덱싱

```
1. Admin: POST /api/inventory/items (시약 생성)
2. 대기: Redis Stream 이벤트 → search-service 인덱싱
3. 확인: GET /api/search?q=시약이름 (검색 결과 노출)
```

### 시나리오 3: 예약 승인 흐름

```
1. Admin: POST /api/scheduler/resources (장비 생성)
2. Researcher: POST /api/scheduler/bookings (예약 요청, PENDING)
3. Admin: POST /api/scheduler/bookings/:id/approve (승인)
4. Researcher: POST /api/scheduler/bookings/:id/complete (완료)
5. 확인: GET /api/scheduler/bookings/calendar (캘린더 반영)
```

### 시나리오 4: 노트 잠금 해제 흐름

```
1. Reviewer: PATCH /api/notes/:id/status (in_progress → locked)
2. Researcher: PATCH /api/notes/:id (수정 시도 → 403 확인)
3. Admin: POST /api/notes/:id/admin-unlock (잠금 해제 → draft)
4. Researcher: PATCH /api/notes/:id (수정 성공 확인)
```

---

## 7. 관련 파일

| 파일 | 용도 |
|------|------|
| `docs/LabNote_ELN_테스트가이드.xlsx` | TC 관리 (이 가이드의 xlsx 버전) |
| `docs/LabNote_ELN_테스트계획서.xlsx` | 원본 테스트 계획서 |
| `docs/LabNote_ELN_테스트결과보고서.xlsx` | 결과 반영 보고서 (자동 생성) |
| `tests/run-test-plan.mjs` | 187개 TC 자동 실행 스크립트 |
| `tests/update-test-results.mjs` | 결과를 xlsx에 반영하는 스크립트 |
