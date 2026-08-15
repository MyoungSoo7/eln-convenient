# 자동화 파이프라인 (Claude Code × GitHub Actions)

> LabNote ELN 프로젝트의 Claude Code 기반 CI/CD 자동화 설계.
> 사람 개입 없이 24/7 가동되는 PR 리뷰 / 이슈 수정 / 정기 스캔 파이프라인.

## 목표

1. **PR 품질 자동화**: 모든 PR을 Claude가 프로젝트 규칙(`.claude/rules/*.md`) 기준으로 자동 리뷰
2. **이슈 → PR 자동화**: 버그 이슈가 들어오면 분석·수정·PR 생성까지 무인 처리
3. **정기 헬스체크**: 매일/매주 코드베이스를 스캔하고 발견 항목을 이슈로 적재
4. **MSA 효율화**: 11개 서비스 중 변경된 것만 빌드/테스트

## 워크플로우 구성

```
.github/workflows/
├── claude-review.yml      # PR 자동 리뷰 (1단계)
├── claude-issue.yml       # 이슈 → PR 자동 생성 (2단계)
├── nightly-scan.yml       # 정기 스캔 (2단계)
└── build-services.yml     # 변경 서비스만 빌드 (3단계)
```

## 1. PR 자동 리뷰 (`claude-review.yml`)

### 트리거
- `pull_request`: opened / synchronize / reopened / ready_for_review
- `issue_comment`: PR 코멘트에 `@claude` 포함 시
- `pull_request_review_comment`: 리뷰 코멘트에 `@claude` 포함 시

### 동작
1. `.claude/commands/review.md` 슬래시 커맨드 실행
2. 프로젝트 규칙 10개(`01-backend-service-pattern` ~ `10-security`) 기준 리뷰
3. Critical 발견 → `REQUEST_CHANGES`, 없으면 `COMMENT`
4. 드래프트 PR은 자동 스킵

### 사용 모델
`claude-opus-4-5` — 리뷰 품질이 가장 중요하므로 고성능 모델

## 2. 이슈 → 자동 PR (`claude-issue.yml`)

### 트리거
- 이슈에 `claude-fix` 라벨 부착
- 이슈 코멘트에 `@claude fix`

### 동작
1. 이슈 분석 → 문제 특정
2. `.claude/rules/*.md` 준수하여 최소 변경으로 수정
3. 브랜치 `claude/issue-<번호>-<slug>` 생성
4. Conventional Commits 커밋
5. `Closes #<번호>` 포함 PR 생성

### 안전장치 (Guardrails)
| 금지 사항 | 이유 |
|-----------|------|
| DB 마이그레이션 파일 직접 수정 | 데이터 무결성 리스크 |
| `schema.prisma` 트리거 관련 변경 | `check_note_status_transition()` 등 최종 안전장치 |
| 3개 이상 서비스 동시 수정 | 영향 범위 불명확 시 사람 판단 필요 |
| `.env` / secrets 변경 | 자격증명 누출 방지 |

큰 변경이 필요하다고 판단되면 **수정하지 않고 분석 코멘트만** 남김.

## 3. 정기 스캔 (`nightly-scan.yml`)

### Daily (매일 KST 00:00)
| 에이전트 | 목적 |
|----------|------|
| `security-scanner` | orgId 누락, 권한 누락, 민감정보 노출 |
| `i18n-checker` | 하드코딩 문자열, ko/en 키 불일치 |
| `type-safety-checker` | `any`, `as`, `!` non-null assertion |

### Weekly (매주 월요일 KST 01:00)
| 에이전트 | 목적 |
|----------|------|
| `dependency-checker` | 11개 서비스 패키지 버전 드리프트 |
| `config-drift-detector` | tsconfig / eslint / prettier 불일치 |
| `dead-code-detector` | 미사용 export, 도달 불가 코드 |

### 이슈 중복 방지
동일 제목(날짜 제외)의 open 이슈가 있으면 **새로 만들지 않고 코멘트로 업데이트**.

### 사용 모델
`claude-haiku-4-5` — 대량 스캔은 비용 효율 우선

## 4. 변경 서비스 빌드 (`build-services.yml`)

### 전략
`dorny/paths-filter@v3`로 변경된 서비스 감지 → matrix 빌드.

```
변경 감지 ──┬─ services/shared/** 변경 → 전체 10개 서비스 빌드
           └─ 특정 서비스만 변경 → 해당 서비스만 빌드
```

### 매트릭스 구성
- `build-all`: shared 패키지 변경 시 (의존 서비스 전체 영향)
- `build-changed`: 개별 서비스 변경 시만
- `summary`: 머지 게이트 (실패 시 exit 1)

### 빌드 항목
1. Docker 이미지 빌드 (`docker build -f <service>/Dockerfile`)
2. TypeScript 타입체크 (`tsc --noEmit`)

## 필요한 GitHub 설정

### Secrets
| 이름 | 용도 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API 호출 |

### Labels
- `claude-fix` — 이슈 자동 수정 트리거
- `nightly-scan` — 데일리 스캔 이슈
- `weekly-scan` — 주간 스캔 이슈
- `security-scanner` / `i18n-checker` / `type-safety-checker` 등 — 에이전트별 분류

### Branch Protection (권장)
- `main` 브랜치: `Build Changed Services / summary` 체크 필수
- Claude 리뷰 `REQUEST_CHANGES` 상태일 때 머지 차단

## 단계별 롤아웃 순서

1. **Phase 1 (지금)**: `claude-review.yml` 만 활성화 → 2주간 리뷰 품질 관찰
2. **Phase 2**: `nightly-scan.yml` 활성화 → 이슈 폭주 여부 확인, 임계값 튜닝
3. **Phase 3**: `claude-issue.yml` 활성화 → 간단한 i18n 누락 등 저위험 이슈부터 시범 적용
4. **Phase 4**: `build-services.yml` 브랜치 보호 규칙에 등록 → 머지 게이트화
5. **Phase 5 (선택)**: 셀프호스티드 러너 도입 → `docker compose up -d --build` 자동 반영까지

## 비용 관리

| 항목 | 예상 빈도 | 모델 |
|------|----------|------|
| PR 리뷰 | 일 평균 5~10회 | Opus 4.5 |
| 이슈 자동수정 | 주 1~5회 | Opus 4.5 |
| Daily 스캔 | 1회/일 | Haiku 4.5 |
| Weekly 스캔 | 1회/주 | Haiku 4.5 |

Haiku 4.5를 정기 스캔에 사용하여 비용 최소화. 리뷰/수정은 품질 우선.

## 제약과 주의점

- **Claude가 생성한 PR도 리뷰 대상** — `claude-review.yml`이 `claude-issue.yml` 생성 PR을 다시 리뷰하는 무한 루프 방지를 위해, PR 작성자가 `github-actions[bot]`이면 자동 머지 금지
- **민감 작업은 사람 승인** — 서명/잠금/관리자 권한 관련 코드 수정은 자동 머지 금지 (branch protection에 CODEOWNERS 추가 권장)
- **API 키 로테이션** — `ANTHROPIC_API_KEY`는 분기별 로테이션
- **이슈 스팸 방지** — nightly-scan이 같은 문제로 매일 이슈를 만들지 않도록 중복 감지 필수

## 향후 확장

- **Slack 알림**: Critical 스캔 결과는 Slack webhook으로 즉시 통지
- **PR 자동 머지 봇**: 테스트 통과 + Claude 리뷰 OK + 작은 변경 → `--auto` 머지
- **Changelog 자동 생성**: `changelog-generator` 에이전트를 릴리스 태그 시 실행
- **OpenAPI 스펙 동기화**: `openapi-generator` 에이전트를 라우트 변경 시 자동 실행

## 참고

- 프로젝트 규칙: [`CLAUDE.md`](../CLAUDE.md)
- 슬래시 커맨드: [`.claude/commands/`](../.claude/commands/)
- 전문 에이전트 25종: [`.claude/agents/`](../.claude/agents/)
- Claude Code GitHub Action: https://github.com/anthropics/claude-code-action
