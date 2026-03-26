# LabNote ELN 요구사항명세서

> **프로젝트명**: LabNote ELN (전자연구노트 협업 플랫폼)
> **작성일**: 2026-03-24
> **버전**: 1.0.0
> **배포 형태**: 사내 구축형 (On-Premise), Docker Compose 기반 MSA

---

## 1. 문서 개요

### 1.1 목적

본 문서는 LabNote ELN 시스템의 기능/비기능 요구사항을 체계적으로 정의한다. 시스템 설계, 개발, 테스트, 검수의 기준 문서로 활용한다.

### 1.2 범위

- 전자연구노트(ELN) 작성/편집/버전관리
- 전자서명 및 감사추적
- 시약/샘플/장비 인벤토리 관리
- 장비/회의실 예약 관리
- 통합검색
- 파일 관리 및 내보내기
- 실시간 협업 편집
- 사용자/조직/권한 관리
- 대시보드 및 모니터링

### 1.3 용어 정의

| 용어 | 정의 |
|------|------|
| ELN | Electronic Lab Notebook, 전자연구노트 |
| RBAC | Role-Based Access Control, 역할 기반 접근 제어 |
| MSA | Microservice Architecture, 마이크로서비스 아키텍처 |
| 멀티테넌시 | 하나의 시스템에서 여러 조직(Organization)을 격리하여 운영하는 구조 |
| 해시체인 | 이전 서명의 해시를 다음 서명에 포함시켜 위변조를 방지하는 무결성 보장 기법 |
| Presigned URL | 사전 서명된 URL로, 인증 없이 제한 시간 동안 파일에 접근할 수 있는 URL |

### 1.4 참조 문서

| 문서명 | 설명 |
|--------|------|
| `docs/NOTE_STATUS_MANAGEMENT.md` | 노트 상태 관리 정합성 문서 |
| `docs/rbac.md` | RBAC 분석 및 대시보드 설계 제안서 |
| `docs/plan-manage.md` | RBAC 시스템 분석 및 설계 문서 |
| `docs/sso-settings-design.md` | SSO 설정 UI 설계 문서 |
| `docs/deploy-org-scoping.md` | 조직 스코핑 배포 가이드 |

---

## 2. 시스템 개요

### 2.1 시스템 구성도

```
┌──────────────────────────────────────────────────────────────┐
│                      클라이언트 계층                           │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ React SPA       │  │ 인벤토리 전용 React SPA          │   │
│  │ (localhost:5173) │  │ (localhost:3000)                 │   │
│  └────────┬────────┘  └────────────────┬────────────────┘   │
└───────────┼────────────────────────────┼────────────────────┘
            │                            │
            ▼                            ▼
┌──────────────────────────────────────────────────────────────┐
│              API Gateway (Fastify, :8000)                     │
│  JWT 검증 | 프록시 | SSE | Rate Limit | 대시보드 집계         │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬─────────┘
   │      │      │      │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼
 auth   eln   sig/aud  inv   sched  search  file  collab
 :8001  :8002  :8003   :8004  :8005  :8006  :8008  :8009(ws)
```

### 2.2 기술 스택

| 계층 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + TypeScript, shadcn/ui, TanStack Query, react-i18next |
| 백엔드 | Fastify (전 서비스 통일), Prisma ORM, TypeScript |
| 데이터베이스 | PostgreSQL 15 (서비스별 스키마 분리) |
| 캐시/메시징 | Redis 7 (캐싱, Rate Limit, Redis Stream 이벤트) |
| 파일 저장소 | MinIO (S3 호환 오브젝트 스토리지) |
| 검색 엔진 | OpenSearch 2 (한국어 형태소 분석 포함) |
| SSO | Keycloak 24 (선택적 OIDC/SAML) |
| 모니터링 | Jaeger (OpenTelemetry 트레이싱), Dozzle (로그 뷰어) |
| 실시간 통신 | WebSocket (ws 라이브러리), Redis Pub/Sub |

### 2.3 사용자 역할

| 역할 | 설명 |
|------|------|
| Admin | 시스템 전체 관리자. 모든 권한 보유 |
| Researcher | 연구원. 노트/프로토콜 작성, 인벤토리 관리, 예약, 파일 업로드 |
| Reviewer | 검토자. 노트 검토/서명, 감사로그 열람 |
| Viewer | 읽기 전용. 모든 리소스 열람만 가능 |

---

## 3. 기능 요구사항

### 3.1 사용자 인증 및 계정 관리 (AUTH)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| AUTH-001 | 로컬 로그인 | 필수 | 이메일/비밀번호 기반 JWT 발급 (Access Token + Refresh Token) |
| AUTH-002 | 회원가입 | 필수 | 이메일, 이름, 비밀번호 입력. 조직 코드로 조직 연결 |
| AUTH-003 | 로그아웃 | 필수 | Refresh Token 무효화 |
| AUTH-004 | 토큰 갱신 | 필수 | Refresh Token으로 Access Token 자동 갱신 |
| AUTH-005 | 내 정보 조회 | 필수 | 로그인 사용자의 프로필, 역할, 권한, 소속 팀 조회 |
| AUTH-006 | SSO 로그인 | 선택 | Keycloak OIDC PKCE 플로우. 환경변수로 활성화 |
| AUTH-007 | SSO 자동 사용자 생성 | 선택 | SSO 최초 로그인 시 sso-hook으로 사용자 자동 생성 |
| AUTH-008 | 비밀번호 검증 (내부) | 필수 | 서비스 간 내부 호출로 비밀번호 재검증 (관리자 잠금해제, 전자서명 시 사용) |
| AUTH-009 | 세션 관리 (쿠키) | 필수 | API Gateway에서 httpOnly 쿠키 기반 세션 관리 (설정/갱신/삭제) |
| AUTH-010 | 역할별 권한 조회 (내부) | 필수 | 서비스 간 내부 호출로 역할별 권한 목록 조회 |

### 3.2 조직/팀/사용자 관리 (ORG)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| ORG-001 | 조직 CRUD | 필수 | Admin만 조직 생성/수정/삭제. 조직 코드 자동 생성 |
| ORG-002 | 팀 CRUD | 필수 | Admin만 팀 생성/수정/삭제 |
| ORG-003 | 팀원 관리 | 필수 | Admin만 팀원 추가/제거. 사용자는 여러 팀에 소속 가능 |
| ORG-004 | 사용자 CRUD | 필수 | Admin만 사용자 생성/수정/삭제 |
| ORG-005 | 역할 관리 | 필수 | Admin만 역할 생성/삭제, 역할별 권한 수정 |
| ORG-006 | 멀티테넌시 격리 | 필수 | 모든 데이터 쿼리에 orgId 필터 적용. 조직 간 데이터 완전 격리 |

### 3.3 연구노트 관리 (NOTE)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| NOTE-001 | 노트 생성 | 필수 | 제목, 내용, 태그, 타입(note/protocol) 입력. 초기 상태 `draft` |
| NOTE-002 | 노트 목록 조회 | 필수 | 페이지네이션, 상태 필터, 태그 필터, 검색 지원 |
| NOTE-003 | 노트 상세 조회 | 필수 | 노트 내용, 첨부파일, 교차참조 링크, 리비전 이력 포함 |
| NOTE-004 | 노트 수정 | 필수 | `draft` 또는 `in_progress` 상태에서만 수정 가능. 소유자 또는 Admin만 가능 |
| NOTE-005 | 노트 삭제 | 필수 | `draft` 또는 `in_progress` 상태에서만 삭제 가능. Admin만 가능 (`note:delete` 권한) |
| NOTE-006 | 노트 통계 조회 | 필수 | 상태별 노트 수, 전체 노트 수 집계 |
| NOTE-007 | 노트 일괄 조회 | 필수 | ID 배열로 여러 노트 동시 조회 |
| NOTE-008 | 태그 목록 조회 | 필수 | 조직 내 사용된 태그 목록 조회 |

### 3.4 노트 상태 관리 (STATUS)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| STATUS-001 | 상태 전환 | 필수 | `draft` <-> `in_progress` -> `locked` / `signed` 흐름 준수 |
| STATUS-002 | 상태 전환 권한 검증 | 필수 | `in_progress -> locked`는 Reviewer/Admin만 가능 |
| STATUS-003 | signed 상태 불변성 | 필수 | `signed` 상태는 어떤 역할도 다른 상태로 변경 불가 |
| STATUS-004 | signed 전환 제한 | 필수 | `signed` 전환은 서명 프로세스(Redis Stream 이벤트)를 통해서만 가능. `PATCH /status`로 직접 전환 불가 |
| STATUS-005 | 관리자 잠금 해제 | 필수 | Admin만 `locked -> draft` 전환 가능. 비밀번호 재검증 + 사유 입력 필수 |
| STATUS-006 | DB 트리거 안전장치 | 필수 | `check_note_status_transition()` 트리거가 DB 레벨에서 잘못된 전환 차단 |
| STATUS-007 | 상태 이력 기록 | 필수 | 모든 상태 변경은 `NoteStatusHistory` + `AuditLog` 이중 기록 |
| STATUS-008 | locked/signed 수정 차단 | 필수 | `locked`/`signed` 상태 노트는 내용 수정 및 삭제 불가 |

### 3.5 노트 버전 관리 (VER)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| VER-001 | 리비전 자동 생성 | 필수 | 노트 수정 시 리비전(NoteRevision) 자동 생성. 내용 해시 포함 |
| VER-002 | 리비전 목록 조회 | 필수 | 특정 노트의 모든 리비전 이력 조회 |
| VER-003 | 특정 리비전 조회 | 필수 | 특정 리비전 번호의 내용 조회 |

### 3.6 노트 첨부파일 (ATT)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| ATT-001 | 첨부파일 목록 조회 | 필수 | 특정 노트의 첨부파일 목록 조회 |
| ATT-002 | 첨부파일 업로드 | 필수 | 노트에 파일 첨부. `file:upload` 권한 필요 |
| ATT-003 | 첨부파일 삭제 | 필수 | 첨부파일 삭제. `file:delete` 권한 필요 |

### 3.7 노트 교차참조 (LINK)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| LINK-001 | 교차참조 목록 조회 | 필수 | 특정 노트의 교차참조 링크 목록 |
| LINK-002 | 교차참조 생성 | 필수 | 노트 간 교차참조 링크 생성 |
| LINK-003 | 교차참조 삭제 | 필수 | 교차참조 링크 삭제 |

### 3.8 프로토콜 관리 (PROTO)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| PROTO-001 | 프로토콜 CRUD | 필수 | 노트와 동일한 구조, `type='protocol'`로 구분 |
| PROTO-002 | 프로토콜 상태 관리 | 필수 | 노트와 동일한 상태 전환 규칙 적용 |

### 3.9 템플릿 관리 (TMPL)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| TMPL-001 | 템플릿 목록 조회 | 필수 | 조직 내 사용 가능한 노트/프로토콜 템플릿 조회 |
| TMPL-002 | 템플릿 생성 | 필수 | 노트/프로토콜 작성 시 사용할 템플릿 생성. `template:write` 권한 필요 |
| TMPL-003 | 템플릿 수정/삭제 | 필수 | 템플릿 수정(`template:write`), 삭제(`template:delete`) |
| TMPL-004 | 템플릿으로 노트 생성 | 필수 | 템플릿 기반으로 노트/프로토콜 자동 생성 |
| TMPL-005 | 코드 자동채번 | 필수 | 조직별 코드 패턴에 따른 자동 번호 채번 |
| TMPL-006 | 템플릿 복사 | 필수 | 기존 템플릿을 복사하여 새 템플릿 생성 |
| TMPL-007 | 템플릿 추천 | 필수 | 컨텍스트 기반 템플릿 추천 목록 제공 |

### 3.10 코드 관리 (CODE)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| CODE-001 | 코드 그룹 목록 조회 | 필수 | 조직 내 코드 그룹(실험 유형, 부서 등) 목록 조회 |
| CODE-002 | 코드 목록 조회 | 필수 | 특정 그룹의 코드 목록 조회 |
| CODE-003 | 코드 생성 | 필수 | Admin만 코드 생성 가능. 그룹/값/라벨/정렬순서 설정 |
| CODE-004 | 코드 수정 | 필수 | Admin만 코드 수정 가능 |
| CODE-005 | 코드 삭제 | 필수 | Admin만 코드 삭제 가능 |

### 3.11 전자서명 (SIG)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| SIG-001 | 전자서명 수행 | 필수 | Reviewer/Admin만 가능 (`note:sign` 권한). 비밀번호 재검증 필수 |
| SIG-002 | SHA-256 해시체인 | 필수 | 이전 서명 해시를 포함하여 위변조 방지 체인 구성 |
| SIG-003 | 서명 무결성 검증 | 필수 | 서명 해시체인의 무결성 검증 API |
| SIG-004 | 서명 현황 조회 | 필수 | 특정 노트의 서명 이력 조회 |
| SIG-005 | 서명 취소 | 필수 | Admin만 서명 취소 가능 (`requireRole('admin')`) |
| SIG-006 | 규정준수 통계 | 필수 | 서명 완료율, 미서명 노트 목록 등 규정준수 현황 조회 |
| SIG-007 | 편집 가능 여부 조회 | 필수 | 특정 노트의 현재 편집 가능 상태 확인 |
| SIG-008 | 이벤트 기반 상태 전환 | 필수 | 서명 완료 시 Redis Stream `NOTE_SIGNED` 이벤트 발행 -> ELN 서비스가 소비하여 `in_progress -> signed` 전환 |
| SIG-009 | HTTP 폴백 | 필수 | Redis 장애 시 HTTP 직접 호출로 상태 전환 (x-user-role: system) |

### 3.12 감사로그 (AUDIT)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| AUDIT-001 | 감사로그 기록 | 필수 | 모든 주요 작업(상태 변경, 서명, 잠금 해제 등) 자동 기록 |
| AUDIT-002 | 감사로그 조회 | 필수 | Admin/Reviewer만 조회 가능 (`audit:read` 권한) |
| AUDIT-003 | 감사로그 불변성 | 필수 | INSERT ONLY. 감사로그는 수정/삭제 불가 |
| AUDIT-004 | IP 주소 기록 | 필수 | 모든 감사로그에 요청자 IP 주소 포함 |
| AUDIT-005 | 상세 정보 JSONB | 필수 | 감사로그에 상세 변경 내역을 JSONB 형태로 저장 |

### 3.13 알림 (NOTI)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| NOTI-001 | 노트 잠금 알림 | 필수 | 노트가 잠금될 때 작성자에게 알림 발송 (본인 제외) |
| NOTI-002 | 잠금 해제 알림 | 필수 | 노트 잠금 해제 시 작성자에게 알림 발송 |
| NOTI-003 | 서명 완료 알림 | 필수 | 전자서명 완료 시 노트 작성자에게 알림 발송 |
| NOTI-004 | 알림 목록 조회 | 필수 | 사용자별 알림 목록 조회 |
| NOTI-005 | 알림 읽음 처리 | 필수 | 개별/전체 알림 읽음 처리 |
| NOTI-006 | 실시간 알림 (SSE) | 필수 | API Gateway를 통한 Server-Sent Events 기반 실시간 알림 전달 |

### 3.14 인벤토리 관리 (INV)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| INV-001 | 인벤토리 항목 CRUD | 필수 | 시약/샘플/장비 등록/수정/삭제. `inventory:write/delete` 권한 필요 |
| INV-002 | 인벤토리 목록 조회 | 필수 | 페이지네이션, 카테고리 필터, 검색 지원 |
| INV-003 | 인벤토리 상세 조회 | 필수 | 항목 상세 정보 + 이력 조회 |
| INV-004 | 바코드 조회 | 필수 | 바코드 스캔으로 인벤토리 항목 검색 |
| INV-005 | 수량 변경 | 필수 | 입고/출고에 따른 수량 변경 + 이력 자동 기록 |
| INV-006 | 이력 조회 | 필수 | 특정 항목의 수량 변경 이력 조회 |
| INV-007 | 유효기한 만료 알림 | 필수 | 만료 임박 시약/샘플 목록 조회 |
| INV-008 | 재고 부족 알림 | 필수 | 최소 재고량 이하 항목 목록 조회 |
| INV-009 | 카테고리 관리 | 필수 | Admin만 카테고리 CRUD 가능 |

### 3.15 예약 관리 (SCHED)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| SCHED-001 | 자원(장비/회의실) CRUD | 필수 | Admin만 자원 등록/수정/삭제 |
| SCHED-002 | 자원 목록/상세 조회 | 필수 | 장비/회의실 목록 및 상세 정보 조회 |
| SCHED-003 | 예약 생성 | 필수 | 시작/종료 시간, 목적 입력. `scheduler:write` 권한 필요 |
| SCHED-004 | 예약 수정 | 필수 | 소유자 또는 Admin만 수정 가능 |
| SCHED-005 | 예약 승인 | 필수 | Admin 또는 자원 소유자만 승인 가능 (PENDING -> APPROVED) |
| SCHED-006 | 예약 거절 | 필수 | Admin 또는 자원 소유자만 거절 가능 (PENDING -> REJECTED) |
| SCHED-007 | 예약 취소 | 필수 | 소유자 또는 Admin만 취소 가능 |
| SCHED-008 | 예약 완료 | 필수 | 소유자 또는 Admin만 완료 처리 가능 |
| SCHED-009 | 캘린더 조회 | 필수 | 승인된(APPROVED) 예약만 캘린더 형태로 조회 |
| SCHED-010 | 예약 충돌 검증 | 필수 | 동일 자원의 시간대 중복 예약 방지 |

### 3.16 통합검색 (SEARCH)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| SEARCH-001 | 통합 검색 | 필수 | 노트, 프로토콜, 인벤토리 등 전체 리소스 통합 검색 (OpenSearch) |
| SEARCH-002 | 한국어 형태소 분석 | 필수 | OpenSearch Korean Analyzer를 통한 한국어 검색 지원 |
| SEARCH-003 | 자동완성 | 필수 | 검색어 입력 시 자동완성 제안 |
| SEARCH-004 | 검색 히스토리 | 필수 | 사용자별 최근 검색 기록 저장/조회/삭제 |
| SEARCH-005 | 즐겨찾기 | 필수 | 검색 결과 즐겨찾기 추가/제거/조회 |
| SEARCH-006 | 검색어 즐겨찾기 | 필수 | 자주 사용하는 검색어 즐겨찾기 |
| SEARCH-007 | 검색 인덱스 자동 갱신 | 필수 | 노트/인벤토리 생성/수정 이벤트 수신 시 OpenSearch 인덱스 자동 갱신 |
| SEARCH-008 | 권한 기반 필터링 | 필수 | 사용자 권한에 따른 검색 결과 필터링 |

### 3.17 파일 관리 (FILE)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| FILE-001 | 파일 업로드 | 필수 | MinIO에 파일 업로드. `file:upload` 권한 필요 |
| FILE-002 | Presigned URL 업로드 | 필수 | 대용량 파일을 위한 사전 서명 URL 발급 후 직접 업로드 |
| FILE-003 | 파일 다운로드 | 필수 | 파일 ID로 다운로드. `file:read` 권한 필요 |
| FILE-004 | 파일 스트리밍 | 필수 | 대용량 파일 스트리밍 다운로드 |
| FILE-005 | 파일 메타데이터 조회 | 필수 | 파일명, 크기, MIME 타입 등 메타정보 조회 |
| FILE-006 | 파일 삭제 | 필수 | 파일 삭제. `file:delete` 권한 필요 (Admin만 보유) |
| FILE-007 | Presigned URL 발급 | 필수 | 제한 시간 동안 유효한 다운로드 URL 발급 |

### 3.18 내보내기 (EXPORT)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| EXPORT-001 | PDF 내보내기 | 필수 | 노트를 PDF로 변환. Puppeteer 기반 렌더링. `export:pdf` 권한 필요 |
| EXPORT-002 | ZIP 내보내기 | 필수 | 노트 + 첨부파일을 ZIP으로 묶어 내보내기 |
| EXPORT-003 | 내보내기 작업 상태 조회 | 필수 | BullMQ 기반 비동기 변환 작업의 진행 상태 조회 |
| EXPORT-004 | 내보내기 이력 조회 | 필수 | 사용자별 내보내기 작업 이력 조회 |
| EXPORT-005 | 규정준수 보고서 | 필수 | 서명/감사 기반 규정준수 보고서 생성 및 내보내기 |

### 3.19 실시간 협업 (COLLAB)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| COLLAB-001 | 실시간 동시 편집 | 필수 | WebSocket 기반 노트 실시간 협업 편집 |
| COLLAB-002 | 편집 참여자 표시 | 필수 | 현재 같은 노트를 편집 중인 사용자 목록 표시 |
| COLLAB-003 | 커서 위치 공유 | 선택 | 다른 편집자의 커서 위치 실시간 표시 |
| COLLAB-004 | Redis Pub/Sub 동기화 | 필수 | 여러 collab-service 인스턴스 간 Redis Pub/Sub으로 메시지 동기화 |

### 3.20 대시보드 (DASH)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| DASH-001 | 통합 대시보드 | 필수 | 노트 상태별 통계, 인벤토리 현황, 예약 현황, 알림 집계 |
| DASH-002 | 대시보드 캐싱 | 필수 | Redis 캐시 기반 대시보드 데이터 캐싱 (역할별 분리) |
| DASH-003 | 최근 활동 | 필수 | 최근 생성/수정된 노트, 예약 등 활동 내역 |

### 3.21 다국어 지원 (I18N)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| I18N-001 | 한국어/영어 지원 | 필수 | 전체 UI 한국어(ko), 영어(en) 이중 지원 |
| I18N-002 | 네임스페이스 분리 | 필수 | 기능별 번역 파일 분리: auth, notes, protocols, inventory, scheduler, signatures, auditLogs, exports, searchPage, dashboard, admin, common |
| I18N-003 | 동적 언어 전환 | 필수 | 런타임 언어 변경 지원 |

---

## 4. 비기능 요구사항

### 4.1 보안 (SEC)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| SEC-001 | JWT 기반 인증 | 필수 | API Gateway에서 JWT 검증 후 내부 서비스에 사용자 정보 헤더 주입 |
| SEC-002 | RBAC 권한 제어 | 필수 | 4개 역할, 22개 세부 권한 기반 접근 제어 |
| SEC-003 | 멀티테넌시 격리 | 필수 | 모든 데이터 쿼리에 orgId 필터 적용 |
| SEC-004 | 내부 서비스 인증 | 필수 | `x-internal-secret` 헤더로 서비스 간 통신 인증 |
| SEC-005 | SQL 인젝션 방지 | 필수 | Prisma ORM 사용, `$queryRawUnsafe` 사용 금지 |
| SEC-006 | XSS 방지 | 필수 | `dangerouslySetInnerHTML` 사용 금지 |
| SEC-007 | 시크릿 관리 | 필수 | 환경변수로 관리, .env 파일 커밋 금지 |
| SEC-008 | Rate Limiting | 필수 | API Gateway에서 Redis 기반 요청 제한 |
| SEC-009 | 비밀번호 해싱 | 필수 | bcrypt 기반 비밀번호 해싱 |
| SEC-010 | 감사 불변성 | 필수 | 감사로그 테이블 INSERT ONLY |

### 4.2 성능 (PERF)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| PERF-001 | Redis 캐싱 | 필수 | 대시보드, 검색 결과 등 빈번한 조회 데이터 캐싱 |
| PERF-002 | 페이지네이션 | 필수 | 모든 목록 API에 페이지네이션 적용 |
| PERF-003 | 비동기 작업 처리 | 필수 | PDF/ZIP 내보내기는 BullMQ 기반 비동기 처리 |
| PERF-004 | 이벤트 기반 비동기 | 필수 | 서비스 간 이벤트는 Redis Stream 기반 비동기 처리 |
| PERF-005 | DB 인덱스 최적화 | 필수 | orgId 포함 복합 인덱스 적용 |

### 4.3 안정성 (REL)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| REL-001 | 헬스체크 | 필수 | 모든 서비스에 `/health` 엔드포인트 구현 |
| REL-002 | 의존성 기동 순서 | 필수 | Docker `depends_on` + `condition: service_healthy`로 순서 보장 |
| REL-003 | 이벤트 Pending 복구 | 필수 | Redis Stream 미처리 메시지 60초 주기 XCLAIM으로 복구 |
| REL-004 | 멱등성 보장 | 필수 | 이벤트 컨슈머의 중복 처리 방지 (이미 signed면 스킵) |
| REL-005 | HTTP 폴백 | 필수 | Redis 장애 시 HTTP 직접 호출로 폴백 |
| REL-006 | Graceful Shutdown | 필수 | 프로세스 종료 시 Prisma disconnect, 커넥션 정리 |

### 4.4 운영/배포 (OPS)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| OPS-001 | Docker Compose 배포 | 필수 | 단일 `docker compose up -d`로 전체 시스템 기동 |
| OPS-002 | 구조화된 로깅 | 필수 | Pino 기반 JSON 구조화 로깅 (전 서비스 통일) |
| OPS-003 | 분산 트레이싱 | 선택 | Jaeger + OpenTelemetry 기반 서비스 간 호출 추적 |
| OPS-004 | 로그 뷰어 | 선택 | Dozzle 기반 실시간 로그 모니터링 (localhost:9999) |
| OPS-005 | 환경변수 필수 검증 | 필수 | `${VAR:?설명}` 패턴으로 누락 시 즉시 실패 |

### 4.5 확장성 (SCALE)

| ID | 요구사항 | 우선순위 | 상세 |
|----|----------|----------|------|
| SCALE-001 | MSA 아키텍처 | 필수 | 서비스별 독립 배포/스케일링 가능 |
| SCALE-002 | DB 스키마 분리 | 필수 | 하나의 PostgreSQL, 서비스별 스키마 분리 |
| SCALE-003 | 파일 스토리지 분리 | 필수 | MinIO(S3 호환)로 파일 저장소 분리 |
| SCALE-004 | 검색 엔진 분리 | 필수 | OpenSearch로 검색 기능 분리 |

---

## 5. 권한 매트릭스

### 5.1 역할별 권한 상세 (22개 권한)

| 권한 | Admin | Researcher | Reviewer | Viewer | 설명 |
|------|:-----:|:----------:|:--------:|:------:|------|
| `note:read` | O | O | O | O | 노트 조회 |
| `note:write` | O | O | - | - | 노트 생성/수정 |
| `note:delete` | O | - | - | - | 노트 삭제 |
| `note:status` | O | O | O | - | 노트 상태 변경 |
| `note:sign` | O | - | O | - | 전자서명 수행 |
| `note:unlock` | O | - | - | - | 관리자 잠금 해제 |
| `template:read` | O | O | O | O | 템플릿 조회 |
| `template:write` | O | O | - | - | 템플릿 생성/수정 |
| `template:delete` | O | - | - | - | 템플릿 삭제 |
| `inventory:read` | O | O | O | O | 인벤토리 조회 |
| `inventory:write` | O | O | - | - | 인벤토리 생성/수정 |
| `inventory:delete` | O | - | - | - | 인벤토리 삭제 |
| `scheduler:read` | O | O | O | O | 예약 조회 |
| `scheduler:write` | O | O | - | - | 예약 생성/수정 |
| `scheduler:manage` | O | - | O | - | 예약 승인/거절 |
| `resource:write` | O | - | O | - | 자원(장비/회의실) 관리 |
| `file:read` | O | O | O | O | 파일 조회/다운로드 |
| `file:upload` | O | O | - | - | 파일 업로드 |
| `file:delete` | O | - | - | - | 파일 삭제 |
| `audit:read` | O | - | O | - | 감사로그 조회 |
| `export:pdf` | O | O | - | - | PDF 내보내기 |
| `user:read/write/delete` | O | - | - | - | 사용자 관리 |

---

## 6. 데이터 모델 요약

### 6.1 서비스별 주요 엔티티

| 서비스 | DB 스키마 | 주요 엔티티 |
|--------|----------|------------|
| auth-service | `auth` | Organization, Role, User, Team, TeamMember |
| eln-service | `eln` | Note (note/protocol), NoteRevision, NoteSection, NoteLink, Attachment, Template, NoteStatusHistory |
| signature-audit-service | `signature` | Signature (해시체인), AuditLog, ExportJob, Notification |
| inventory-service | `inventory` | InventoryItem, InventoryHistory, Category |
| scheduler-service | `scheduler` | Resource (EQUIPMENT/ROOM), Booking (PENDING/APPROVED/REJECTED/COMPLETED) |
| search-service | `search` | SearchHistory, Favorite, SearchKeywordFavorite |
| file-service | `file` | File, ExportJob |

### 6.2 멀티테넌시

모든 주요 테이블에 `orgId` 필드가 포함되며, 모든 쿼리에 조직 스코프 필터가 적용된다.

---

## 7. 서비스 간 이벤트 흐름

| 이벤트 | 발행자 | 구독자 | 채널 | 설명 |
|--------|--------|--------|------|------|
| `note.created` | eln-service | search-service | Redis Stream | 검색 인덱스 갱신 |
| `note.updated` | eln-service | search-service | Redis Stream | 검색 인덱스 갱신 |
| `NOTE_SIGNED` | signature-audit | eln-service | Redis Stream | 노트 status -> signed 전환 |
| `note.locked` | eln-service | signature-audit | Redis Stream | 잠금 알림 발송 |
| `inventory.updated` | inventory-service | search-service | Redis Stream | 인덱스 갱신 |
| `export.completed` | signature-audit | (알림) | Redis Stream | PDF/ZIP 생성 완료 |

---

## 8. 인터페이스 목록

### 8.1 프론트엔드 페이지

| 페이지 | 파일 | 설명 |
|--------|------|------|
| 로그인 | `LoginPage.tsx` | 로컬/SSO 로그인 |
| 대시보드 | `Dashboard.tsx` | 통합 대시보드 |
| 노트 목록 | `NotesPage.tsx` | 노트 목록/필터/상태변경 |
| 노트 편집기 | `NoteEditor.tsx` | 노트 편집/서명/상태표시 |
| 프로토콜 | `ProtocolsPage.tsx` | 프로토콜 목록 |
| 인벤토리 | `InventoryPage.tsx` | 시약/샘플/장비 관리 |
| 예약 | `SchedulerPage.tsx` | 장비/회의실 예약 |
| 서명 현황 | `SignaturesPage.tsx` | 서명 대시보드 |
| 감사로그 | `AuditLogsPage.tsx` | 감사 이력 조회 |
| 통합검색 | `SearchPage.tsx` | 통합 검색 |
| 내보내기 | `ExportsPage.tsx` | 내보내기 이력/다운로드 |
| 관리자 설정 | `admin/AdminSettingsPage.tsx` | 시스템 설정, SSO 설정 |
| 조직/팀/사용자 관리 | `admin/OrgTeamUserPage.tsx` | 조직, 팀, 사용자 CRUD |
| 역할 관리 | `admin/RolesPage.tsx` | 역할 생성, 권한 매핑 |
| 코드 관리 | `admin/CodeManagePage.tsx` | 코드 그룹/코드 CRUD |

### 8.2 API 서비스 포트

| 서비스 | 포트 | 프로토콜 |
|--------|------|----------|
| API Gateway | 8000 | HTTP |
| auth-service | 8001 | HTTP |
| eln-service | 8002 | HTTP |
| signature-audit-service | 8003 | HTTP |
| inventory-service | 8004 | HTTP |
| scheduler-service | 8005 | HTTP |
| search-service | 8006 | HTTP |
| file-service | 8008 | HTTP |
| collab-service | 8009 | WebSocket |

### 8.3 인프라 서비스

| 서비스 | 포트 | 용도 |
|--------|------|------|
| PostgreSQL | 5432 | 관계형 데이터베이스 |
| Redis | 6379 | 캐시/메시징/Rate Limit |
| MinIO | 9000/9001 | 오브젝트 스토리지 (API/콘솔) |
| OpenSearch | 9200 | 검색 엔진 |
| Keycloak | 8080 | SSO IdP (선택) |
| Jaeger | 16686 | 분산 트레이싱 UI |
| Dozzle | 9999 | 로그 뷰어 |

---

## 9. 제약사항 및 가정

### 9.1 제약사항

1. **온프레미스 전용**: Docker Compose 기반 사내 구축형 배포. 클라우드 매니지드 서비스 미사용
2. **단일 DB 인스턴스**: 하나의 PostgreSQL에 서비스별 스키마 분리
3. **팀 스코핑 미적용**: 현재 조직(orgId) 단위 격리만 지원. 팀 단위 데이터 격리는 Phase 2 예정
4. **SSO 선택적**: Keycloak SSO는 환경변수로 활성화/비활성화. 기본 비활성화
5. **Git push 제한**: GitLab origin만 허용. GitHub push 금지

### 9.2 가정

1. 모든 사용자는 하나의 조직에 소속된다
2. 사용자는 하나의 역할만 가진다 (1:1 매핑)
3. 사용자는 여러 팀에 소속될 수 있다 (N:M 매핑)
4. 전자서명된 노트는 어떤 경우에도 상태 변경 불가 (법적 효력 보장)
5. 내부 네트워크에서만 서비스 간 통신이 이루어진다 (Docker 내부 DNS)

---

## 10. 요구사항 추적 매트릭스

| 기능 영역 | 요구사항 수 | 필수 | 선택 |
|-----------|:-----------:|:----:|:----:|
| 인증/계정 (AUTH) | 10 | 8 | 2 |
| 조직/팀/사용자 (ORG) | 6 | 6 | 0 |
| 연구노트 (NOTE) | 8 | 8 | 0 |
| 상태 관리 (STATUS) | 8 | 8 | 0 |
| 버전 관리 (VER) | 3 | 3 | 0 |
| 첨부파일 (ATT) | 3 | 3 | 0 |
| 교차참조 (LINK) | 3 | 3 | 0 |
| 프로토콜 (PROTO) | 2 | 2 | 0 |
| 템플릿 (TMPL) | 7 | 7 | 0 |
| 코드 관리 (CODE) | 5 | 5 | 0 |
| 전자서명 (SIG) | 9 | 9 | 0 |
| 감사로그 (AUDIT) | 5 | 5 | 0 |
| 알림 (NOTI) | 6 | 6 | 0 |
| 인벤토리 (INV) | 9 | 9 | 0 |
| 예약 (SCHED) | 10 | 10 | 0 |
| 통합검색 (SEARCH) | 8 | 8 | 0 |
| 파일 관리 (FILE) | 7 | 7 | 0 |
| 내보내기 (EXPORT) | 5 | 5 | 0 |
| 실시간 협업 (COLLAB) | 4 | 3 | 1 |
| 대시보드 (DASH) | 3 | 3 | 0 |
| 다국어 (I18N) | 3 | 3 | 0 |
| **기능 합계** | **134** | **131** | **3** |
| 보안 (SEC) | 10 | 10 | 0 |
| 성능 (PERF) | 5 | 5 | 0 |
| 안정성 (REL) | 6 | 6 | 0 |
| 운영/배포 (OPS) | 5 | 3 | 2 |
| 확장성 (SCALE) | 4 | 4 | 0 |
| **비기능 합계** | **30** | **28** | **2** |
| **총합계** | **164** | **159** | **5** |

---

*본 문서는 LabNote ELN 시스템의 Phase 1 요구사항을 정의하며, 코드베이스 분석 기반으로 작성되었습니다.*
