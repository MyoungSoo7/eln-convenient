# Claude Code Monitor (ccmonitor)

> 저장소: https://github.com/tobyilee/ccmonitor
> 요구사항: Bun v1.0+

---

## 1. 개요

Claude Code 세션을 **실시간 모니터링**하는 터미널 대시보드(TUI).
Claude Code와 완전히 분리되어 있으며, `~/.claude/` 디렉토리의 파일 아티팩트를 읽어서 동작한다.

표시 항목:
- 도구 사용 횟수
- 스킬 실행 상태
- 서브에이전트 상태/진행도
- 팀 구성원
- 태스크 목록
- 토큰 소비량 / 컨텍스트 윈도우 사용률
- 파일 변경 이벤트

```
 CLAUDE CODE MONITOR                                    17:18:00
 Session:a1b2c3d4 Model:claude-opus-4-6 Age:12m 30s Idle:2s
 Msgs:U:5 A:12 Tok:I:45.2K O:8.3K CW:12.1K CR:38.0K
┌─ Tools ──────────────────────────────────────────────────────┐
│ Edit:15 Bash:12 Read:8 Grep:5 Agent:3 Skill:2 Write:1       │
└──────────────────────────────────────────────────────────────┘
┌─ Subagents ──────────────────────────────────────────────────┐
│ ● Explore        1m 22s  Find auth middleware files          │
│ ✔ code-reviewer     42s  Review migration safety             │
└──────────────────────────────────────────────────────────────┘
┌─ Skill ──────────────────────────────────────────────────────┐
│ ● /commit (Fix login bug)  3s                                │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 설치

### 소스에서 직접 실행

```bash
git clone https://github.com/tobyilee/ccmonitor.git && cd ccmonitor
bun install
bun run start
```

### 독립 바이너리 빌드 (Bun 불필요)

```bash
git clone https://github.com/tobyilee/ccmonitor.git && cd ccmonitor
bun install && bun run build

# PATH에 복사
cp dist/claude-monitor ~/.bun/bin/ccmonitor
# 또는
sudo cp dist/claude-monitor /usr/local/bin/ccmonitor
```

`bun build --compile`이 Bun 런타임을 단일 바이너리(~54MB)에 내장하므로 대상 머신에 Bun이 없어도 실행 가능.

### 글로벌 링크 (개발용)

```bash
cd ccmonitor
bun link
```

전역 심볼릭 링크 생성. 소스 파일 변경 즉시 반영.

---

## 3. 사용법

```bash
# 현재 디렉토리의 최신 세션 모니터링
bun run start

# 코드 변경 시 자동 리로드
bun run dev

# 특정 세션 ID 모니터링
bun run start <sessionId>
```

### 단축키

| 키 | 동작 |
|----|------|
| `r` | 강제 새로고침 |
| `q` / `Ctrl+C` | 종료 |

---

## 4. 대시보드 패널

| 패널 | 표시 내용 |
|------|-----------|
| **Tools** | 도구 호출 횟수 (빈도순 정렬) |
| **Subagents** | 실행/완료된 에이전트 — 타입, 소요시간, 설명 |
| **Skill** | 활성 스킬 (경과 시간), 마지막 완료 스킬, 히스토리 |
| **Teams** | 팀 이름 + 멤버 목록 |
| **Tasks** | 태스크 제목 + 상태 아이콘 |
| **File Activity** | `~/.claude/` 하위 파일 추가/변경/삭제 이벤트 (최근 8개) |

---

## 5. 동작 원리

### 데이터 수집 흐름

1. `process.cwd()`를 Claude 프로젝트 디렉토리명으로 변환 (`/Users/foo/bar` → `-Users-foo-bar`)
2. `~/.claude/projects/<dir>/`에서 최신 `.jsonl` 트랜스크립트 탐색
3. 각 JSONL 항목에서 도구 사용, 스킬, 토큰, 메시지, 모델 정보 파싱
4. 디스크에서 서브에이전트 메타데이터, 팀 설정, 태스크 파일 로드
5. ANSI 박스 드로잉 UI를 stdout에 **2초 간격**으로 렌더링
6. chokidar로 파일 변경 감시하여 실시간 파일 활동 표시

### 데이터 채널

| 채널 | 소스 | 추출 대상 |
|------|------|-----------|
| JSONL 트랜스크립트 파싱 | `~/.claude/projects/<dir>/*.jsonl` | 도구, 스킬, 토큰, 모델 |
| 디스크 파일 스캔 | `~/.claude/` 하위 디렉토리 | 서브에이전트, 팀, 태스크, 파일 활동 |

---

## 6. 데이터 추출 상세

### Tools (도구)

JSONL 트랜스크립트에서 `message.content` 배열의 `type: "tool_use"` 블록을 스캔. 각 블록의 `name` 필드(Edit, Bash, Read 등)별로 호출 횟수 집계.

```json
{"message":{"role":"assistant","content":[
  {"type":"tool_use","name":"Read","id":"toolu_01X...","input":{"file_path":"/src/index.ts"}}
]}}
```

### Skills (스킬)

3가지 감지 메커니즘:

| 방식 | 감지 방법 |
|------|-----------|
| **슬래시 커맨드** | 사용자 메시지의 `<command-name>skill-name</command-name>` XML 태그 |
| **Skill 도구 호출** | `tool_use` 블록에서 `name: "Skill"` + `input.skill` |
| **PostToolUse 훅** (선택) | `~/.claude/.omc/state/last-skill-complete.json` 파일 감시 |

스킬 라이프사이클:
- `activeSkill`로 추적
- `stop_reason: "end_turn"` 발생 시 완료 처리
- `lastCompletedSkill`로 승격 + 히스토리 링 (최대 5개)

### Subagents (서브에이전트)

**트랜스크립트가 아닌 파일시스템에서 탐지:**

| 파일 | 내용 |
|------|------|
| `agent-*.meta.json` | 에이전트 타입 (`Explore`, `code-reviewer` 등), 태스크 설명 |
| `agent-*.jsonl` | 서브에이전트 트랜스크립트 — 파일 수정 시각 기준으로 상태 판단 |

경로: `~/.claude/projects/<dir>/<sessionId>/subagents/`

상태 판단: `.jsonl` 파일이 30초 이상 갱신되지 않으면 **완료**로 간주.

### Teams (팀)

2단계 추출:

1. **트랜스크립트 스캔** — `TeamCreate` tool_use 블록에서 팀 이름 수집
2. **설정 로드** — `~/.claude/teams/<name>/config.json`에서 멤버 목록 + `inboxes/` 디렉토리 확인

현재 세션에서 참조된 팀만 표시 (디스크의 모든 팀이 아님).

### Tasks (태스크)

2가지 소스 집계:

| 소스 | 설명 |
|------|------|
| 트랜스크립트 `type: "create"` | 태스크 제목, 초기 상태 |
| 트랜스크립트 `type: "update"` | taskId 매칭으로 상태 갱신 |
| 디스크 `~/.claude/tasks/<sessionId>/*.json` | 서브에이전트가 생성한 태스크 등 |

### Token / Context Window (토큰)

`message.usage` 필드에서 추출:

| 필드 | 의미 |
|------|------|
| `input_tokens` | 모델에 전송된 토큰 |
| `output_tokens` | 모델이 생성한 토큰 |
| `cache_creation_input_tokens` | 프롬프트 캐시에 기록된 토큰 |
| `cache_read_input_tokens` | 프롬프트 캐시에서 읽은 토큰 |

컨텍스트 윈도우 사용률 = (input + cache write + cache read) / 모델 컨텍스트 한도
- Opus 4.5+: 1M
- 기타: 200K

### Model (모델)

`message.model` 필드에서 추출. 매 assistant 메시지마다 갱신되어 최신 사용 모델 반영.

### File Activity (파일 활동)

트랜스크립트가 아닌 **chokidar 파일 감시**로 실시간 이벤트 수집.

이벤트 유형: `add` / `change` / `unlink`
링 버퍼 최대 50개, 최근 8개 표시.

감시 대상:

| Glob 패턴 | 캡처 대상 |
|-----------|-----------|
| `projects/**/*.jsonl` | 세션/서브에이전트 트랜스크립트 |
| `projects/**/*.json` | 서브에이전트 메타데이터 |
| `tasks/**/*.json` | 태스크/TODO 데이터 |
| `teams/**/*` | 팀 설정 + 인박스 |
| `sessions/*.json` | 활성 세션 레지스트리 |
| `file-history/**/*` | 파일 변경 히스토리 |
| `.omc/state/last-skill-complete.json` | 훅 기반 스킬 완료 시그널 |

---

## 7. 스킬 감지 가속 (선택)

PostToolUse 훅을 설치하면 스킬 완료를 즉시 감지:

```json
// ~/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Skill",
        "command": "bash /path/to/ccmonitor/scripts/on-skill-complete.sh"
      }
    ]
  }
}
```

훅 미설치 시 트랜스크립트 기반 감지로 폴백 (2초 폴링).
