# Agent Teams — LabNote ELN 팀 레시피

> Claude Code의 실험 기능 **Agent Teams**를 이 프로젝트에 맞게 활용하는 실전 레시피 모음.
> 공식 문서: https://code.claude.com/docs/en/agent-teams

## 사전 조건

1. **Claude Code v2.1.32 이상** — `claude --version`으로 확인
2. **플래그 활성화** — 이 프로젝트는 이미 `.claude/settings.json`에 설정됨:
   ```json
   { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   ```
3. **Windows + VS Code 터미널 제약** — split-pane 모드는 tmux/iTerm2 필요, VS Code/Windows Terminal에서는 **in-process 모드만 동작**. 이 환경에서는 자동으로 in-process로 떨어짐.

## 조작 기본키 (in-process 모드)

| 키 | 동작 |
|----|------|
| `Shift+Down` | 팀원 사이 순환 (리드 → 팀원1 → 팀원2 → ... → 리드) |
| `Enter` | 선택된 팀원 세션 진입 |
| `Esc` | 팀원의 현재 turn 중단 |
| `Ctrl+T` | 공유 task list 토글 |

## 중요한 동작 특성

- **Team config 수동 작성 불가**: `.claude/teams/*.json` 같은 파일은 무시됨. 팀은 항상 자연어 프롬프트로 런타임 생성.
- **기존 subagent 재사용 가능**: `.claude/agents/`의 25개 에이전트를 teammate type으로 참조 가능. `tools` 허용목록과 `model`은 적용되지만 `skills`/`mcpServers` frontmatter는 무시됨.
- **CLAUDE.md는 자동 로드**: 모든 teammate가 프로젝트 `CLAUDE.md`와 `.claude/rules/*.md`를 기본 컨텍스트로 받음.
- **리드 대화 히스토리는 전달 안 됨**: teammate를 spawn할 때 필요한 맥락을 프롬프트에 직접 포함시켜야 함.
- **파일 충돌 주의**: 두 teammate가 같은 파일을 편집하면 덮어쓰기 발생. 역할별로 파일 경계를 명확히 나눌 것.

---

## 레시피 1 — PR 리뷰 팀 (3인)

**언제**: 중요한 PR을 여러 관점에서 동시에 리뷰하고 싶을 때. 특히 인증/권한/멀티테넌시 영역 변경.

**복붙 프롬프트**:
```
Create an agent team to review the current branch's changes against main.
Spawn 3 teammates using existing subagent definitions:

1. Name "security" — use the security-scanner agent type.
   Focus: orgId 누락, requirePermission 누락, x-internal-secret 검증, SQL injection,
   민감정보 로깅, .claude/rules/10-security.md 위반 여부.

2. Name "perf" — use the performance-reviewer agent type.
   Focus: N+1 쿼리, 누락된 Prisma 인덱스, 불필요한 await, 메모리 누수 패턴,
   OpenSearch/Redis 호출 효율.

3. Name "rules" — use the api-reviewer agent type.
   Focus: .claude/rules/01~09-*.md 준수 여부, API 응답 형식({ok, data, error}),
   Zod validate 미들웨어, Fastify preHandler 체인 순서, DTO 네이밍 컨벤션.

Have them work in parallel on the git diff, then broadcast their findings
to each other and discuss any overlapping issues. Finally, synthesize
a unified review report with Critical/Warning/Suggestion sections.

Wait for all teammates to finish before proceeding. Do not edit any files.
```

**예상 토큰**: 단일 리뷰 대비 3~4배. 중요 PR에서만.

---

## 레시피 2 — 버그 수사팀 (5인, 경쟁 가설)

**언제**: 원인이 불분명한 프로덕션 버그. 특히 "가끔 재현", "특정 환경에서만" 같은 케이스.

**복붙 프롬프트 템플릿** (버그 설명만 바꿔서 사용):
```
BUG: <여기에 구체 증상, 재현 경로, 로그 스니펫, 최근 변경 이력>

Spawn a team of 5 agent teammates to investigate this in parallel,
each holding a different hypothesis. Have them talk to each other
directly and try to DISPROVE each other's theories — scientific debate
style. Whatever consensus emerges, write it to docs/incidents/<date>-<slug>.md.

Teammates:
1. "db" — suspect Prisma query / transaction / index / migration issue
2. "race" — suspect race condition in Redis Stream / BullMQ / WebSocket
3. "auth" — suspect JWT/권한/orgId 필터 edge case
4. "infra" — suspect Docker compose, env var, healthcheck, network issue
5. "client" — suspect frontend retry/cache/race with backend

Rules:
- Each teammate investigates their own hypothesis first, then challenges others.
- Use Read/Grep only — do NOT modify code during investigation.
- When one teammate's theory is disproven by evidence, they must acknowledge
  it in the shared task list and pivot to helping verify the surviving theory.
- Final consensus must cite specific file:line evidence, not speculation.
```

**팁**: 가설이 5개를 넘으면 5인 유지 + 리드가 가설을 병합하도록 지시.

---

## 레시피 3 — 신규 서비스 스캐폴딩 팀 (4인)

**언제**: 새 MSA 서비스를 추가할 때 (현재 11개 → 12번째). 레이어별로 역할 분리하면 파일 충돌 없이 병렬 가능.

**복붙 프롬프트**:
```
Create an agent team to scaffold a new <SERVICE_NAME>-service
following the existing pattern of eln-service and auth-service.

Port: <PORT>   Domain: <간단한 설명>

Spawn 4 teammates. Each owns a strict file boundary to prevent conflicts:

1. "infra" — owns:
   - services/<name>-service/Dockerfile
   - services/<name>-service/package.json
   - services/<name>-service/tsconfig.json
   - services/<name>-service/prisma/schema.prisma
   - services/docker-compose.yml (only the new service block + its depends_on)

2. "api" — owns:
   - services/<name>-service/src/index.ts
   - services/<name>-service/src/app.ts
   - services/<name>-service/src/routes/**
   - services/<name>-service/src/controllers/**
   - services/<name>-service/src/dtos/**
   - services/<name>-service/src/middlewares/auth.middleware.ts
   Must follow .claude/rules/01~03,05.md exactly.

3. "gateway" — owns:
   - services/api-gateway/src/config/services.ts (or equivalent proxy config)
   - services/api-gateway proxy route additions
   Must add JWT forwarding headers per CLAUDE.md §인증/권한 흐름.

4. "i18n" — owns:
   - src/i18n/locales/ko/<namespace>.json
   - src/i18n/locales/en/<namespace>.json
   Must add keys for any user-facing strings the api teammate introduces.

Coordination:
- "api" broadcasts new error messages / labels to "i18n" as soon as defined.
- "infra" must finish schema.prisma BEFORE "api" starts writing controllers.
  Use task dependencies.
- NOBODY touches services/shared/ — if shared changes are needed, stop and
  escalate to me.
- Require plan approval for "infra" teammate before it writes any files.

When all teammates are idle, report which files were created and remind me
to run: docker compose up -d --build <name>-service
```

**핵심**: `task dependencies`로 infra → api 순서를 강제. `Require plan approval`로 위험 역할(infra)만 계획 승인 필요.

---

## 레시피 4 — 통합 검색 디버깅팀 (3인)

**언제**: OpenSearch 관련 이슈. 인덱싱/쿼리/권한 필터가 서로 얽혀있어서 단일 세션으로는 놓치기 쉬움.

**복붙 프롬프트**:
```
Create a 3-teammate team to audit the search-service + OpenSearch integration
end to end.

1. "indexer" — trace document indexing pipeline:
   - eln-service, inventory-service → search-service POST /api/search/index
   - Verify fire-and-forget doesn't silently drop documents
   - Check event bus path via services/search-service/src/lib/eventConsumer.ts
   - Report any docs that would fail to index

2. "query" — audit search query construction:
   - services/search-service/src/controllers/search.controller.ts
   - Korean analyzer usage per reference_opensearch memory
   - orgId filtering on every query (Critical: 멀티테넌시 누수 방지)
   - Highlight/aggregation/autocomplete paths

3. "perm" — audit permission filtering:
   - Verify search results respect note status (locked/signed 접근 권한)
   - Verify role-based filtering matches eln-service's own rules
   - Cross-check with .claude/rules/10-security.md

Teammates must cross-verify: "query" asks "indexer" which fields exist,
"perm" asks "query" whether filters are applied before pagination.

Output: docs/audits/search-audit-<date>.md with Critical/Warning findings
and exact file:line references. Do not modify code.
```

---

## 레시피 5 — i18n 전수 정리팀 (2인)

**언제**: ko/en 키 불일치가 쌓였을 때. 간단해서 2인이면 충분.

**복붙 프롬프트**:
```
Spawn 2 teammates to fix all i18n key mismatches:

1. "scanner" — use i18n-checker agent type. Read-only.
   Output a JSON list of: missing keys per locale, unused keys, hardcoded strings.

2. "fixer" — waits for scanner's output, then:
   - Adds missing keys to the deficient locale (translate using context)
   - Removes truly unused keys only after scanner confirms 0 references
   - Replaces hardcoded strings with t() calls
   - Owns ONLY src/i18n/locales/** and any .tsx files scanner flags

Fixer must not start until scanner marks its task completed (task dependency).
When done, broadcast a summary to me and stop.
```

---

## 품질 게이트 (Hooks)

Agent teams는 `TeammateIdle`, `TaskCreated`, `TaskCompleted` 훅을 지원합니다. 본 프로젝트에 적합한 활용:

### `TeammateIdle` — 빌드 확인 강제
팀원이 백엔드 서비스 파일을 수정했는데 빌드 없이 idle로 가면 경고를 띄우고 작업을 계속시킬 수 있음. `.claude/hooks/rebuild-reminder.sh`를 재활용 가능.

### `TaskCompleted` — 규칙 위반 감지
팀원이 task를 완료로 마킹할 때 `check-i18n-sync.sh`나 `check-compose-env.sh`를 재실행하여 위반 시 task completion을 막을 수 있음 (exit code 2).

> **주의**: 훅은 팀 레시피가 안정화된 뒤에 추가하세요. 초기에는 훅 없이 레시피만 검증하는 게 디버깅이 쉽습니다.

---

## Best Practices (이 프로젝트 한정)

1. **시작은 리뷰/수사부터** — 레시피 1, 2, 4가 가장 안전. 코드 수정 없이 토큰만 쓰므로 사고 위험 최소.
2. **팀 크기 3~5명** — 이 프로젝트 규모에선 5명 초과는 조정 비용이 이득을 상회.
3. **파일 경계 명시** — 레시피 3처럼 "owns" 목록을 명시하지 않으면 파일 충돌 거의 확정.
4. **`services/shared/` 금지** — 팀원에게 shared 패키지 수정을 시키지 말 것. 11개 서비스에 영향이 가서 한 팀원의 변경이 다른 팀원 작업을 망가뜨림. 필요하면 팀 해산 후 단일 세션에서.
5. **DB 마이그레이션 금지** — `prisma migrate`는 단일 세션에서만. 병렬 schema 수정은 재앙.
6. **정리 필수** — 작업 끝나면 "Clean up the team"을 리드에게 지시. 팀원에게 지시하지 말 것 (공식 문서 경고).
7. **리드가 일을 직접 하려고 하면** — "Wait for your teammates to complete their tasks before proceeding" 라고 단호하게 지시.
8. **비용 감시** — 팀 실행 전후로 `/cost` 확인. 레시피 3(스캐폴딩)은 단일 세션의 5~8배 토큰을 쉽게 쓸 수 있음.

## Agent Teams를 피해야 하는 경우

- **순차 작업**: 한 단계가 이전 단계 결과에 의존 → 단일 세션이 빠름
- **같은 파일 연속 편집**: 충돌 필연 → subagent 또는 단일 세션
- **작은 버그 수정**: 조정 비용이 이득 초과 → 단일 세션
- **CI/CD 자동화**: `claude-code-action`은 단일 인스턴스 전제. `docs/AUTOMATION_PIPELINE.md`의 GitHub Actions 워크플로우와는 섞지 말 것.

## 트러블슈팅

| 증상 | 원인/해결 |
|------|-----------|
| `Shift+Down`이 안 먹음 | 팀이 아직 생성 안 됨. 리드 응답 완료까지 대기. |
| 팀원이 보이지 않음 | in-process 모드에서는 `Shift+Down`으로 순환해야 보임 |
| 팀원이 에러 후 멈춤 | 해당 팀원 세션 진입 후 직접 지시, 또는 "Spawn a replacement teammate" |
| `/resume`으로 복구 안 됨 | 공식 제한. 세션 재개 시 팀원은 복원 안 됨 → 재생성 지시 |
| 태스크가 stuck | 완료 여부 수동 확인 후 "nudge the teammate" 지시 |
| 리드가 먼저 종료 선언 | "Keep going, <task>가 아직 미완" 지시 |

## 참고

- 공식 문서: https://code.claude.com/docs/en/agent-teams
- Subagent 정의 (이 프로젝트 25개): `.claude/agents/`
- Subagent vs Team 비교: https://code.claude.com/docs/en/features-overview
- 관련 설계 문서: [`AUTOMATION_PIPELINE.md`](./AUTOMATION_PIPELINE.md) (GitHub Actions 측)
