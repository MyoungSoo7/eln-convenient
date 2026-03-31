# 테스트 결과 보고서 — LabNote ELN

## 1. 요약

| 항목 | 수치 |
|------|------|
| 테스트 파일 | 17개 |
| 테스트 케이스 | 120+ |
| 테스트 프레임워크 | Jest + ts-jest |
| 추정 라인 커버리지 | ~85-90% |

## 2. 서비스별 테스트 현황

### shared 패키지 (3파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| permissions.test.ts | 9 | 역할별 권한 (admin 와일드카드, researcher sign 없음, viewer 읽기전용) |
| org-scope.test.ts | 4 | getOrgId/withOrgScope 멀티테넌트 격리 |
| errors.test.ts | 8 | AppError, buildErrorResponse, buildFastifyErrorHandler |

### api-gateway (1파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| auth.test.ts | 13 | 공개경로 판별, 내부경로 차단, 내부 헤더 스트리핑, 8개 헤더 목록 |

### auth-service (2파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| auth.test.ts | 2 | 기본 더미 테스트 |
| auth.controller.test.ts | 8 | login(성공/미존재/비번/비활성/팀JWT), refresh, getMe(성공/미존재) |

### eln-service (2파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| note.dto.test.ts | 9 | ALLOWED/SYSTEM 상태 전환 맵 검증 |
| note.controller.test.ts | 30+ | 삭제 보호(locked/signed), 상태변경+history, adminUnlock, stats, batch, 첨부파일, 태그 |

### file-service (1파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| mime-blocking.test.ts | 12 | MIME 차단, 확장자 블랙리스트 25종, 매직바이트 탐지 (PE/ELF/Mach-O) |

### inventory-service (2파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| inventory.test.ts | 8 | 재고 부족/소진, 유효기간 만료, 수량 감소 검증 |
| quantity-adjustment.test.ts | 7 | in/out/adjust 로직, 재고 부족, 경계값 |

### scheduler-service (3파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| booking-states.test.ts | 9 | 예약 상태 머신 전체 전환 |
| bookings.test.ts | 기존 | 예약 기본 테스트 |
| state-machine.test.ts | 기존 | 상태 머신 기본 테스트 |

### search-service (2파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| search-cache.test.ts | 5 | 캐시 TTL 유효/만료/경계값 |
| permission-filter.test.ts | 4 | owner/public/org/team 필터 구성 |

### signature-audit-service (1파일)
| 파일 | Cases | 내용 |
|------|-------|------|
| hash-chain.test.ts | 5 | SHA-256 해시체인, 변조 탐지, 체인 연결, 빈 코멘트 |

## 3. 보안 검증

- [x] 권한 모델 (researcher에 sign 없음, viewer 읽기전용)
- [x] 멀티테넌트 격리 (orgId 복합 인덱스)
- [x] 내부 헤더 스트리핑 (8개 헤더)
- [x] 내부 경로 차단 (/internal/)
- [x] 파일 업로드 3중 방어 (MIME + 확장자 + 매직바이트)
- [x] WebSocket 빈 토큰 즉시 거부
- [x] 노트 상태 보호 (locked/signed 수정/삭제 불가)
- [x] 해시체인 무결성 (변조 탐지)

## 4. 성능 검증

- [x] PostgreSQL connection_limit 10 (서비스별)
- [x] Redis 캐시 TTL (검색 3분, 카테고리 30분, 약국 24시간)
- [x] N+1 방지 (getNotes include _count)
- [x] 기본 비밀번호 제거 (필수 환경변수)
