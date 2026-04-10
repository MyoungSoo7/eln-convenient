# 서브에이전트 카탈로그

> 이 프로젝트의 25개 특화 서브에이전트 인덱스. **언제 어떤 에이전트를 호출할지**의 기준을 제공한다.
> 에이전트 정의 자체는 각 `.md` 파일의 frontmatter에 있다.

## 호출 원칙 (반드시 읽을 것)

1. **단순 검색은 에이전트 쓰지 말 것** — 특정 파일/심볼 찾기는 Glob/Grep 직접 사용이 빠르다
2. **컨텍스트 보호 목적**: 대용량 결과가 예상되는 조사를 위임해 메인 컨텍스트 절약
3. **병렬화**: 독립 조사는 한 메시지에서 복수 Agent 호출 (예: 보안 + 성능 + 타입 동시)
4. **자급자족 프롬프트**: 대화 맥락을 상속하지 않으므로 경로/배경/기대 출력 형식을 프롬프트에 전부 포함
5. **과다 호출 경계**: "일단 에이전트로" 사고는 금물. 3쿼리 이상의 탐색일 때만 고려

---

## 카테고리별 에이전트

### 🔍 코드 품질 / 리뷰
| 에이전트 | 언제 쓰나 | 중복 주의 |
|---|---|---|
| `api-reviewer` | API 엔드포인트 변경 시 호환성/품질 검증 | `/review` 커맨드로도 호출 가능 |
| `dead-code-detector` | 리팩터 전, 미사용 export/함수/의존성 감지 | `dependency-checker`와는 다름 (이쪽은 코드 레벨) |
| `type-safety-checker` | `any`/`as`/`!` 타입 우회 감지 | TS 엄격화 작업 시 |
| `error-handler-reviewer` | try/catch 누락, 에러 전파 체인, `AppError` 미사용 감지 | - |
| `performance-reviewer` | N+1, 누락 인덱스, 불필요 await, 메모리 누수 패턴 | DB 인덱스는 `db-migration`과 협업 |

### 🔒 보안 / 컴플라이언스
| 에이전트 | 언제 쓰나 | 중복 주의 |
|---|---|---|
| `security-scanner` | 코드 변경 시 보안 취약점 일반 검사 | 포괄적, 시작점으로 적합 |
| `data-flow-tracker` | **PII 흐름** 추적 — 민감 데이터 저장/전달 매핑 (GDPR) | `security-scanner`가 static이면 이쪽은 data-centric |
| `rate-limit-reviewer` | API 레이트 리밋/브루트포스 방어 검증 | 신규 엔드포인트 추가 시 |
| `middleware-auditor` | Express/Fastify 미들웨어 순서/누락 검증 | `error-handler-reviewer`와 상호보완 |

### 🏗 아키텍처 / 서비스 간
| 에이전트 | 언제 쓰나 | 중복 주의 |
|---|---|---|
| `circuit-breaker-reviewer` | 서비스 간 호출에 타임아웃/재시도/CB 패턴 적용 여부 | 서비스 간 통신 추가 시 필수 |
| `event-flow-analyzer` | Redis pub/sub, WebSocket 이벤트 발행-구독 매핑 | `NOTE_SIGNED` 류 이벤트 추가 시 |
| `config-drift-detector` | tsconfig/eslint/prettier 서비스 간 불일치 감지 | 분기 후 통합 시 |
| `dependency-checker` | 패키지 버전 불일치/취약점 | `dead-code-detector`와 분리 |
| `env-validator` | `.env` ↔ `docker-compose.yml` 환경변수 일치 검증 | 환경변수 추가 시 |

### 🧪 테스트 / 운영
| 에이전트 | 언제 쓰나 | 중복 주의 |
|---|---|---|
| `test-runner` | 코드 수정 후 관련 테스트 자동 실행 + 보고 | 수정 직후 |
| `test-coverage-analyzer` | 커버리지 분석, 테스트 없는 critical path 식별 | 릴리스 전 |
| `health-checker` | 헬스체크 엔드포인트 존재/readiness/liveness 검증 | 신규 서비스 추가 시 |
| `docker-checker` | Dockerfile / docker-compose 빌드 검증 | 이미지 변경 시 |
| `log-analyzer` | 로그 포맷 일관성, 민감정보 노출, 구조화 준수 | `data-flow-tracker`와 분리 (이쪽은 런타임 로그) |

### 📝 문서 / 생성
| 에이전트 | 언제 쓰나 | 중복 주의 |
|---|---|---|
| `openapi-generator` | 라우트 코드 → OpenAPI/Swagger 스펙 자동 생성 | API 릴리스 전 |
| `api-client-generator` | 백엔드 스펙 → 프론트엔드 TS 클라이언트 생성 | `openapi-generator` 후속 |
| `changelog-generator` | git log → 서비스별 CHANGELOG 생성 | 릴리스 태그 시 |
| `db-migration` | Prisma 마이그레이션 스크립트 생성/검증 | 스키마 변경 시 |
| `i18n-checker` | 하드코딩 문자열/번역 키 누락/미사용 키 감지 | `check-i18n-sync.sh` 훅과 보완 (이쪽은 심층) |
| `accessibility-checker` | 프론트엔드 a11y (aria, 키보드, 대비, 시맨틱 HTML) | UI 수정 시 |

---

## 중복 해소 가이드 — "어떤 걸 써야 하지?"

| 질문 | 답 |
|---|---|
| 보안 일반 점검? | `security-scanner` 먼저 → 이슈 발견 시 세부 에이전트 |
| PII가 로그에 새는가? | `log-analyzer` (런타임 포맷) + `data-flow-tracker` (흐름) 병렬 |
| 미사용 코드 정리? | `dead-code-detector` (코드) + `dependency-checker` (패키지) |
| API 추가 후 점검? | `api-reviewer` → `rate-limit-reviewer` → `openapi-generator` → `api-client-generator` 순차 |
| 서비스 간 통신 추가? | `circuit-breaker-reviewer` + `event-flow-analyzer` 병렬 |
| 신규 서비스 부트스트랩? | `docker-checker` + `env-validator` + `health-checker` + `config-drift-detector` 병렬 |

---

## 프롬프트 템플릿

```
[컨텍스트]
- 브랜치: eln
- 수정한 파일: services/eln-service/src/routes/notes.route.ts
- 배경: 노트 상태 전환 엔드포인트에 `locked` 케이스 추가

[조사 목표]
상태 전환이 권한/감사로그/이벤트 전파까지 일관성 있는지 확인

[기대 출력]
문제 있는 라인 번호 + 이유. 200자 이내 요약.
```

프롬프트는 짧고 구체적으로. 터미널 명령 스타일 프롬프트("보안 점검해줘")는 얕은 결과를 낳는다.

---

## 신규 에이전트 추가 기준

새 에이전트를 만들기 전 스스로 물어볼 것:

1. 기존 25개 중 **겹치는 역할**이 있는가? → 기존 에이전트 프롬프트를 개선하는 쪽이 낫다
2. 이 에이전트가 해결하는 문제가 **자주 반복**되는가? → 1회성이면 Agent 도구로 직접 호출
3. 결과가 대용량이라 **컨텍스트 보호**가 필요한가? → 그렇지 않으면 Grep/Read로 충분
4. 에이전트 정의가 **자급자족** 가능한가? → 매번 추가 설명이 필요하면 재설계

충족되면 `.claude/agents/<name>.md` 작성, frontmatter에 `description`/`tools` 명시, 이 README의 카테고리 표에 등록.
