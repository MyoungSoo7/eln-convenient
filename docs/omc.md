# oh-my-claudecode (OMC) 운영 가이드

> 버전: 4.11.4 | 설치 일자: 2026-04-10
> 저장소: https://github.com/Yeachan-Heo/oh-my-claudecode

---

## 1. OMC란?

Claude Code를 위한 **멀티 에이전트 오케스트레이션 플러그인**.
단일 Claude 에이전트를 여러 전문 에이전트 팀으로 확장하여 병렬 작업, 자율 실행, 품질 검증을 자동화한다.

핵심 가치:
- **설정 불필요** — 설치 즉시 작동
- **자연어 인터페이스** — 명령어 암기 필요 없음
- **자동 병렬화** — 복잡한 작업을 전문 에이전트에게 분산
- **모델 라우팅** — 간단한 작업은 Haiku, 복잡한 추론은 Opus 자동 배정
- **비용 최적화** — 토큰 30~50% 절약

---

## 2. 설치 및 설정

### 설치

```bash
# Step 1: 마켓플레이스 등록
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode

# Step 2: 플러그인 설치
/plugin install oh-my-claudecode
```

### 설정

```bash
# 프로젝트 스코프 (권장)
/omc-setup --local

# 글로벌 스코프
/omc-setup
```

### 업데이트

```bash
/plugin marketplace update omc
/omc-setup
```

### 문제 해결

```bash
/omc-doctor
```

### 필수 환경변수

`settings.json`에 이미 설정됨:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 선택적 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OMC_STATE_DIR` | (미설정) | 중앙 상태 디렉토리 (worktree 삭제 시 상태 보존) |
| `OMC_PARALLEL_EXECUTION` | `true` | 병렬 에이전트 실행 토글 |
| `OMC_LSP_TIMEOUT_MS` | `15000` | LSP 요청 타임아웃 |
| `DISABLE_OMC` | (미설정) | 모든 OMC 훅 비활성화 |
| `OMC_SKIP_HOOKS` | (미설정) | 건너뛸 훅 이름 (쉼표 구분) |

---

## 3. 실행 모드

### 모드 비교

| 모드 | 특징 | 용도 | 커맨드 |
|------|------|------|--------|
| **Team** (권장) | 단계별 파이프라인 | N개 에이전트 협력 작업 | `/team 3:executor "task"` |
| **Autopilot** | 완전 자율 | end-to-end 기능 개발 | `autopilot: build X` |
| **Ralph** | 완료까지 반복 | 반드시 끝내야 하는 작업 | `ralph: refactor auth` |
| **Ultrawork** | 최대 병렬 | 대량 수정/리팩터링 | `ulw fix all errors` |
| **CCG** | 트라이모델 | Claude+Codex+Gemini 교차 검증 | `/ccg review this PR` |
| **Deep Interview** | 소크라테스식 질문 | 요구사항 명확화 | `/deep-interview "idea"` |
| **Pipeline** | 순차 처리 | 엄격한 순서 다단계 변환 | 스킬 파이프라인 |

### Team 모드 상세

Team은 OMC의 표준 오케스트레이션 방식. 파이프라인 순서:

```
team-plan → team-prd → team-exec → team-verify → team-fix (loop)
```

```bash
# Claude 에이전트 3개로 TypeScript 에러 수정
/team 3:executor "fix all TypeScript errors"

# tmux CLI 워커 (Codex/Gemini 활용)
omc team 2:codex "security review"
omc team 2:gemini "UI accessibility review"
omc team 1:claude "implement payment flow"

# 상태 확인 / 종료
omc team status <team-name>
omc team shutdown <team-name>
```

### Autopilot 모드

최소한의 입력으로 자율 실행:

```bash
autopilot: build a REST API for managing tasks
```

### Ralph 모드

작업이 완전히 검증될 때까지 포기하지 않는 지속 모드:

```bash
ralph: refactor auth module
# ralph는 ultrawork의 병렬 실행을 자동 포함
```

---

## 4. 매직 키워드

프롬프트에 키워드를 포함하면 자동으로 모드가 활성화된다.

| 키워드 | 효과 |
|--------|------|
| `ultrawork`, `ulw`, `uw` | 병렬 에이전트 오케스트레이션 |
| `autopilot`, `build me`, `handle it all`, `e2e this` | 완전 자율 실행 |
| `ralph`, `don't stop`, `must complete`, `until done` | 완료까지 반복 |
| `ccg`, `claude-codex-gemini` | 트라이모델 오케스트레이션 |
| `ralplan` | 반복 합의 기반 계획 |
| `deep interview`, `ouroboros` | 소크라테스식 인터뷰 |
| `deepsearch`, `find in codebase` | 코드베이스 심층 검색 |
| `deepanalyze`, `deep-analyze` | 심층 분석 |
| `ultrathink`, `think hard`, `think deeply` | 심층 추론 |
| `tdd`, `test first`, `red green` | TDD 워크플로우 |
| `code review`, `review code` | 코드 리뷰 |
| `security review` | 보안 리뷰 |
| `deslop`, `anti-slop` | AI 생성 코드 정리 |
| `cancelomc`, `stopomc` | 모드 취소 |

---

## 5. 에이전트 (29개)

### 도메인별 모델 티어

| 도메인 | LOW (Haiku) | MEDIUM (Sonnet) | HIGH (Opus) |
|--------|-------------|-----------------|-------------|
| 분석 | `architect-low` | `architect-medium` | `architect` |
| 실행 | `executor-low` | `executor` | `executor-high` |
| 검색 | `explore` | - | `explore-high` |
| 연구 | - | `document-specialist` | - |
| 프론트엔드 | `designer-low` | `designer` | `designer-high` |
| 문서 | `writer` | - | - |
| 비주얼 | - | `vision` | - |
| 계획 | - | - | `planner` |
| 비평 | - | - | `critic` |
| 사전분석 | - | - | `analyst` |
| 테스트 | - | `qa-tester` | - |
| 트레이싱 | - | `tracer` | - |
| 보안 | `security-reviewer-low` | - | `security-reviewer` |
| 빌드 | - | `debugger` | - |
| TDD | - | `test-engineer` | - |
| 코드 리뷰 | - | - | `code-reviewer` |
| 데이터 사이언스 | - | `scientist` | `scientist-high` |
| Git | - | `git-master` | - |
| 단순화 | - | - | `code-simplifier` |

### 작업별 에이전트 선택 가이드

| 작업 | 에이전트 | 모델 |
|------|----------|------|
| 빠른 코드 검색 | `explore` | haiku |
| 단순 코드 변경 | `executor-low` | haiku |
| 기능 구현 | `executor` | sonnet |
| 복잡한 리팩터링 | `executor-high` | opus |
| 간단한 디버깅 | `architect-low` | haiku |
| 복잡한 디버깅 | `architect` | opus |
| UI 컴포넌트 | `designer` | sonnet |
| 전략 계획 | `planner` | opus |
| 코드 리뷰 | `code-reviewer` | opus |
| 보안 리뷰 | `security-reviewer` | sonnet |
| 빌드 에러 수정 | `debugger` | sonnet |
| TDD 워크플로우 | `test-engineer` | sonnet |
| 데이터 분석 | `scientist` | sonnet |
| Git 작업 | `git-master` | sonnet |
| 코드 단순화 | `code-simplifier` | opus |

---

## 6. 스킬 (32개)

| 스킬 | 설명 | 커맨드 |
|------|------|--------|
| `autopilot` | 완전 자율 실행 | `/autopilot <task>` |
| `team` | 멀티 에이전트 협력 | `/team <N>:<agent> <task>` |
| `ralph` | 완료까지 반복 | `/ralph <task>` |
| `ultrawork` | 최대 병렬 처리 | `/ultrawork <task>` |
| `ultraqa` | QA 사이클 반복 | `/ultraqa <goal>` |
| `ccg` | 트라이모델 오케스트레이션 | `/ccg <task>` |
| `deep-interview` | 소크라테스식 인터뷰 | `/deep-interview <idea>` |
| `deep-dive` | trace + deep-interview 파이프라인 | `/deep-dive <problem>` |
| `trace` | 증거 기반 원인 추적 | `/trace` |
| `omc-plan` | 계획 워크플로우 | `/omc-plan <description>` |
| `ralplan` | 합의 기반 계획 | `/ralplan <description>` |
| `ask` | Claude/Codex/Gemini 질의 | `/ask <provider> <prompt>` |
| `ai-slop-cleaner` | AI 코드 정리 | `/ai-slop-cleaner <target>` |
| `deepinit` | 코드베이스 AGENTS.md 생성 | `/deepinit [path]` |
| `external-context` | 외부 문서 병렬 조사 | `/external-context` |
| `learner` | 세션에서 스킬 추출 | `/learner` |
| `skill` | 로컬 스킬 관리 | `/skill list\|add\|remove` |
| `sciomc` | 병렬 연구 오케스트레이션 | `/sciomc <topic>` |
| `omc-doctor` | 설치 진단/수정 | `/omc-doctor` |
| `omc-setup` | 설정 마법사 | `/omc-setup` |
| `omc-teams` | tmux CLI 워커 실행 | `/omc-teams <N>:<agent> <task>` |
| `project-session-manager` | worktree + tmux 환경 관리 | `/project-session-manager` |
| `configure-notifications` | 알림 설정 (Telegram/Discord/Slack) | `/configure-notifications` |
| `hud` | HUD/상태바 설정 | `/hud` |
| `mcp-setup` | MCP 서버 설정 | `/mcp-setup` |
| `visual-verdict` | 스크린샷 비교 QA | `/visual-verdict <task>` |
| `cancel` | 활성 모드 취소 | `/cancel` |
| `verify` | 변경사항 검증 | `/verify` |
| `self-improve` | 자율 코드 개선 | `/self-improve` |
| `remember` | 프로젝트 메모리 관리 | `/remember` |
| `writer-memory` | 작가용 메모리 시스템 | `/writer-memory` |
| `wiki` | LLM Wiki 지식 관리 | `/wiki` |

---

## 7. 훅 시스템

OMC는 11개 Claude Code 라이프사이클 이벤트에 20개 훅 스크립트를 등록한다.

| 이벤트 | 스크립트 | 타임아웃 |
|--------|----------|----------|
| **UserPromptSubmit** | `keyword-detector.mjs`, `skill-injector.mjs` | 5s, 3s |
| **SessionStart** | `session-start.mjs`, `project-memory-session.mjs`, `setup-init.mjs`, `setup-maintenance.mjs` | 5~60s |
| **PreToolUse** | `pre-tool-enforcer.mjs` | 3s |
| **PermissionRequest** | `permission-handler.mjs` (Bash only) | 5s |
| **PostToolUse** | `post-tool-verifier.mjs`, `project-memory-posttool.mjs` | 3s |
| **PostToolUseFailure** | `post-tool-use-failure.mjs` | 3s |
| **SubagentStart** | `subagent-tracker.mjs start` | 3s |
| **SubagentStop** | `subagent-tracker.mjs stop`, `verify-deliverables.mjs` | 5s |
| **PreCompact** | `pre-compact.mjs`, `project-memory-precompact.mjs` | 5~10s |
| **Stop** | `context-guard-stop.mjs`, `persistent-mode.cjs`, `code-simplifier.mjs` | 5~10s |
| **SessionEnd** | `session-end.mjs` | 30s |

autopilot, ralph, ultrawork, ultraqa는 **스킬**이며, `keyword-detector` 훅이 감지하고 `persistent-mode.cjs`가 Stop 이벤트를 차단하여 지속 실행을 보장한다.

---

## 8. 커스텀 스킬

디버깅/작업 과정에서 얻은 패턴을 재사용 가능한 스킬로 저장.

| | 프로젝트 스코프 | 사용자 스코프 |
|---|---|---|
| 경로 | `.omc/skills/` | `~/.omc/skills/` |
| 공유 | 팀 (버전 관리) | 모든 프로젝트 |
| 우선순위 | 높음 | 낮음 (폴백) |

```yaml
# .omc/skills/fix-proxy-crash.md
---
name: Fix Proxy Crash
description: aiohttp proxy crashes on ClientDisconnectedError
triggers: ["proxy", "aiohttp", "disconnected"]
source: extracted
---
server.py:42의 핸들러를 try/except ClientDisconnectedError로 감싸세요...
```

- `/skill list | add | remove | edit | search` — 스킬 관리
- `/learner` — 세션에서 재사용 패턴 자동 추출
- 매칭되는 스킬은 컨텍스트에 자동 주입

---

## 9. 알림 연동

### Telegram

```bash
omc config-stop-callback telegram --enable --token <bot_token> --chat <chat_id> --tag-list "@alice,bob"
```

### Discord

```bash
omc config-stop-callback discord --enable --webhook <url> --tag-list "@here,123456789"
```

### Slack

```bash
omc config-stop-callback slack --enable --webhook <url> --tag-list "<!here>,<@U1234567890>"
```

### 태그 수정

```bash
omc config-stop-callback telegram --add-tag charlie
omc config-stop-callback discord --remove-tag @here
omc config-stop-callback discord --clear-tags
```

---

## 10. LabNote 프로젝트 연동 참고

### 기존 하네스와의 관계

| 구성 요소 | 기존 (.claude/) | OMC |
|-----------|-----------------|-----|
| 에이전트 | `.claude/agents/` (25개, 프로젝트 특화) | OMC 에이전트 (29개, 범용) |
| 훅 | `.claude/hooks/dispatch.sh` | OMC 훅 시스템 (20개) |
| 룰 | `.claude/rules/00~11` | CLAUDE.md 주입 |
| 스킬 | `.claude/commands/` | `.omc/skills/` |

### 병행 운영

- OMC 훅과 기존 `.claude/hooks/dispatch.sh`는 **동시 실행**된다
- OMC 에이전트는 범용, `.claude/agents/`는 LabNote 도메인 특화 — 역할 중복 없음
- Team 모드에서 OMC 에이전트가 코드를 수정하면 기존 dispatch.sh 훅이 자동 발화 (i18n 체크, 빌드 리마인더 등)

### 활용 시나리오

```bash
# 전체 TypeScript 에러 병렬 수정
/team 3:executor "fix all TypeScript errors in services/"

# 보안 리뷰
security review all API endpoints in eln-service

# 대규모 리팩터링
ralph: migrate all services from console.log to @lab/shared createLogger

# 요구사항 명확화 후 자율 구현
/deep-interview "실험 프로토콜 버전 비교 기능"
```

---

## 11. 요구사항

### 필수

- Claude Code CLI
- Claude Max/Pro 구독 또는 Anthropic API 키

### 선택 (멀티 AI 오케스트레이션)

| 제공자 | 설치 | 활용 |
|--------|------|------|
| Gemini CLI | `npm i -g @google/gemini-cli` | 디자인 리뷰, UI 일관성 (1M 토큰 컨텍스트) |
| Codex CLI | `npm i -g @openai/codex` | 아키텍처 검증, 코드 리뷰 교차 확인 |

3개 Pro 플랜 (Claude + Gemini + ChatGPT) 합산 월 ~$60.

---

## 12. 참고 링크

- [공식 문서](https://yeachan-heo.github.io/oh-my-claudecode-website)
- [CLI 레퍼런스](https://yeachan-heo.github.io/oh-my-claudecode-website/docs.html#cli-reference)
- [워크플로우 가이드](https://yeachan-heo.github.io/oh-my-claudecode-website/docs.html#workflows)
- [마이그레이션 가이드](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/MIGRATION.md)
- [아키텍처](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/ARCHITECTURE.md)
- [Discord 커뮤니티](https://discord.gg/PUwSMR9XNk)
