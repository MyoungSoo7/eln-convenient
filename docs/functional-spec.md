# 기능 명세서 — LabNote ELN (전자연구노트)

## 1. 개요

사내 구축형 전자연구노트(ELN) 협업 플랫폼. 온프레미스 Docker Compose 배포 기반 MSA 아키텍처 (8개 백엔드 서비스).

## 2. 사용자 역할 (RBAC)

| 역할 | 주요 권한 |
|------|----------|
| admin | 모든 권한 (와일드카드) |
| researcher | 노트 읽기/쓰기/상태변경, 템플릿, 인벤토리, 스케줄러, 파일, 내보내기 |
| reviewer | 노트 읽기/상태변경/서명, 스케줄러 관리, 감사로그 |
| viewer | 읽기 전용 |

## 3. 서비스별 기능

### 3.1 auth-service (:8001)
- 로그인/회원가입/토큰 갱신/로그아웃
- 조직/팀/사용자 CRUD
- JWT 발급 (팀 정보 포함)
- 역할 변경 시 토큰 무효화 (Redis 블랙리스트)
- 비밀번호 검증 (내부 API)

### 3.2 eln-service (:8002)
- 연구노트/프로토콜 CRUD
- 버전 관리 (NoteRevision)
- 상태 관리: draft ↔ in_progress → locked → signed
- 템플릿 관리 (생성, 사용 횟수 추적)
- 첨부파일/교차 참조 링크
- 태그 관리 (UNNEST 중복 제거)
- Redis Stream 이벤트 소비 (NOTE_SIGNED)

### 3.3 signature-audit-service (:8003)
- 전자서명 (SHA-256 해시체인)
- 감사로그 기록
- PDF/ZIP 내보내기 (Puppeteer + BullMQ)
- 알림 발송

### 3.4 inventory-service (:8004)
- 시약/샘플/장비 CRUD
- 바코드 검색
- 수량 관리 (입고/출고/조정) + 이력 추적
- 유효기간 알림, 재고 부족 알림
- 카테고리 관리 (Redis 30분 캐시)

### 3.5 scheduler-service (:8005)
- 장비/회의실 리소스 관리
- 예약 CRUD + 승인 워크플로우 (PENDING→APPROVED→COMPLETED)
- 시간 충돌 방지

### 3.6 search-service (:8006)
- OpenSearch 통합 검색 (한국어 Nori 분석)
- 검색 히스토리/즐겨찾기
- Redis 3분 캐시
- 권한 기반 필터 (owner/public/org/team)

### 3.7 file-service (:8008)
- MinIO(S3) 파일 업로드/다운로드
- Presigned URL (PUT/GET, 15분)
- MIME 차단 + 확장자 블랙리스트 + 매직바이트 탐지
- DB 롤백 (MinIO 성공 + DB 실패 시 객체 삭제)

### 3.8 collab-service (:8009)
- WebSocket 실시간 협업
- Redis pub/sub 다중 인스턴스 동기화
- JWT 인증 (쿼리 파라미터)
- 빈 토큰 즉시 거부

### 3.9 api-gateway (:8000)
- JWT 검증 + 내부 헤더 주입
- 내부 헤더 스트리핑 (스푸핑 방지)
- Rate Limiting (Redis, 엔드포인트별 차등)
- CORS 관리
- 내부 경로(/internal/) 차단

## 4. 노트 상태 흐름

```
draft ↔ in_progress → locked (Reviewer/Admin)
                    → signed (시스템, Redis Stream)
locked → draft (Admin 잠금해제, 비밀번호 검증)
signed → 불변 (수정/삭제 불가)
```

## 5. 멀티테넌시

모든 데이터 쿼리에 `orgId` 필터 필수. `getOrgId()` + `withOrgScope()` 사용.
