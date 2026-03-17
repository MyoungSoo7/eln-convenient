# signature-audit-service 코드 감사 보고서

**감사 일시**: 2026-03-17
**대상 서비스**: `services/signature-audit-service` (포트 8003)
**감사 범위**: 전자서명 / 타임스탬프 / 감사로그 / PDF 변환

---

## 1. 항목별 최종 완성도

| 항목 | 수정 전 | 수정 후 | 주요 변경 |
|---|---|---|---|
| 전자서명 | 60% | 75% | 비밀번호 검증 추가 |
| 타임스탬프 | 40% | 40% | 구조적 한계 (TSA 미지원) |
| 감사로그 | 65% | 85% | export 전 이벤트 기록 추가 |
| PDF 변환 | 75% | 80% | 완료/실패 감사로그 추가 |

---

## 2. 수정된 사항

### 2-1. export 감사로그 기록 추가

**파일**: [export.controller.ts](../services/signature-audit-service/src/controllers/export.controller.ts)

- `exportPdf` — 큐 등록 시 `export_requested` 감사로그 기록
- `exportZip` — 큐 등록 시 `export_requested` 감사로그 기록 (noteIds 포함)

**파일**: [export.worker.ts](../services/signature-audit-service/src/workers/export.worker.ts)

- 작업 완료 시 `export_completed` 감사로그 기록 (fileUrl 포함)
- 작업 실패 시 `export_failed` 감사로그 기록 (에러 메시지 포함)

감사로그 entityType: `'export'`, entityId: jobId

---

### 2-2. 서명 시 비밀번호 검증

**파일**: [signature.controller.ts](../services/signature-audit-service/src/controllers/signature.controller.ts)

`POST /api/signatures/sign/:noteId` 요청 body에 `password` 포함 시:
1. auth-service `POST /api/auth/internal/verify-password` 호출
2. 비밀번호 불일치 시 `401` 반환 — 서명 거부
3. 비밀번호 미포함 시 기존 방식 (JWT 인증만)으로 진행

**파일**: [auth.controller.ts](../services/auth-service/src/controllers/auth.controller.ts)

- `POST /api/auth/internal/verify-password` 신규 엔드포인트 추가
- 헤더 `x-internal-secret` 으로 내부 서비스 간 호출 인증
- `userId` + `password` 수신 → bcrypt 검증 후 `{ verified: boolean }` 반환

**파일**: [auth.routes.ts](../services/auth-service/src/routes/auth.routes.ts)

- `/internal/verify-password` 라우트 등록 (인증 미들웨어 제외)

**파일**: [docker-compose.yml](../services/docker-compose.yml)

- signature-audit-service에 `AUTH_SERVICE_URL`, `INTERNAL_SECRET` 환경변수 추가
- `depends_on`에 `auth-service: service_healthy` 추가

---

### 2-3. ExportJob 테이블 인덱스 추가

**파일**: [schema.prisma](../services/signature-audit-service/prisma/schema.prisma)

```prisma
@@index([requestedBy])   // 사용자별 작업 조회
@@index([status])        // 상태별 필터링
@@index([createdAt])     // 최신순 정렬
```

기존 인덱스 없어서 listExportJobs 풀스캔 발생하던 문제 해결.

---

## 3. 잔존 이슈 (미수정)

### 3-1. 타임스탬프 신뢰성 (낮은 우선순위)
- 서버 시간(`new Date()`) 사용 — TSA(Time Stamping Authority) 미지원
- RFC 3161 기반 외부 타임스탬프 토큰 없음
- 규제 요구가 강한 환경이라면 추후 도입 필요

### 3-2. 대용량 ZIP 메모리 문제 (중간 우선순위)
- ZIP 생성 시 모든 PDF를 메모리에 올림
- 노트 수십 개 이상 선택 시 OOM(Out of Memory) 가능
- **해결 방향**: 스트리밍 방식으로 변경 또는 노트 수 제한

### 3-3. export 소유자 검증 없음 (중간 우선순위)
- `exportPdf` 에서 noteId 소유자 확인 안 함
- 다른 사용자의 noteId로 내보내기 가능
- **해결 방향**: ELN 서비스에 조회 후 authorId 일치 확인

### 3-4. 서명 비밀번호 강제화 미적용 (정책 결정 필요)
- 현재 `password` 필드는 선택 사항
- 규정 준수 환경이라면 필수로 변경 고려
- 변경 시 프론트엔드 서명 UI에도 비밀번호 입력란 추가 필요

### 3-5. Export 파일 자동 정리 없음 (낮은 우선순위)
- MinIO presigned URL 7일 만료
- 하지만 실제 파일은 자동 삭제 안 됨
- **해결 방향**: MinIO lifecycle policy 또는 배치 정리 job 추가

---

## 4. 감사로그 액션 전체 목록 (수정 후)

| action | 발생 시점 | entityType |
|---|---|---|
| `signed` | 전자서명 생성 | `note` |
| `revoked` | 전자서명 취소 (admin) | `signature` |
| `export_requested` | PDF/ZIP 내보내기 요청 | `export` |
| `export_completed` | 내보내기 완료 | `export` |
| `export_failed` | 내보내기 실패 | `export` |

---

## 5. API 엔드포인트 현황

### 전자서명
| 메서드 | 경로 | 권한 | 비고 |
|---|---|---|---|
| POST | `/api/signatures/sign/:noteId` | `note:sign` | body.password 선택적 검증 |
| GET | `/api/signatures/:noteId` | `note:read` | |
| GET | `/api/signatures/verify/:noteId` | `note:read` | 해시 체인 무결성 검증 |
| POST | `/api/signatures/revoke/:signatureId` | admin | reason 필수 |

### 감사로그
| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/api/audit` | `audit:read` |
| GET | `/api/audit/:id` | `audit:read` |
| GET | `/api/audit/actions` | `audit:read` |

### 내보내기
| 메서드 | 경로 | 권한 |
|---|---|---|
| POST | `/api/export/pdf/:noteId` | `export:pdf` |
| POST | `/api/export/zip` | `export:pdf` |
| GET | `/api/export/status/:jobId` | `export:pdf` |
| GET | `/api/export/list` | `export:pdf` |

### 내부 전용 (auth-service)
| 메서드 | 경로 | 인증 |
|---|---|---|
| POST | `/api/auth/internal/verify-password` | `x-internal-secret` 헤더 |

---

## 6. 재빌드 필요 서비스

수정 후 다음 서비스 재빌드 필요:

```bash
cd services
docker compose up -d --build signature-audit-service auth-service
```

schema 변경으로 DB 마이그레이션 자동 적용됨 (`prisma db push`).
