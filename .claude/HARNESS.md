# HARNESS.md — Claude Code 하네스 운영 매뉴얼

> **목적**: `.claude/` 하위의 모든 설정(훅, 룰, 에이전트, 커맨드, 권한)이 **왜** 있고, **언제** 발화하고, **어떻게** 수정해야 하는지 설명한다.
> CLAUDE.md가 "프로젝트가 무엇인지"라면, 이 문서는 "에이전트가 이 프로젝트에서 어떻게 일하는지"의 운영 문서다.
>
> **대상 독자**: 하네스를 유지보수/디버깅하는 사람, 신규 훅/룰/에이전트를 추가하려는 사람.

---

## 1. `.claude/` 레이아웃 전체 지도

```
.claude/
├── settings.json          # 팀 공유 — deny 룰 + PostToolUse 훅 5종
├── settings.local.json    # 개인 — allow 권한 (gitignore 대상)
├── HARNESS.md             # 이 파일
├── rules/                 # 파일 패턴별 자동 로드 규칙
│   ├── 00-meta.md         # 메타룰 — 에이전트 작업 프로토콜
│   └── 01~11              # 도메인 코드 규칙
├── hooks/                 # PostToolUse 자동 실행 스크립트 (5개)
├── agents/                # 특화 서브에이전트 (25개) + README.md 카탈로그
├── commands/              # 슬래시 커맨드 (9개)
├── plugins/               # (플러그인 디렉토리)
└── skills/                # (스킬 디렉토리)
```

---

## 2. 훅 (PostToolUse)

`Write|Edit` 도구 사용 직후 **단일 디스패처** `dispatch.sh`가 발화한다. 디스패처가 `file_path`를 보고 해당하는 훅만 병렬 실행한다. 실패해도 작업을 블로킹하지 않는다.

**왜 디스패처 구조인가**: 과거에는 5개 훅이 `Write|Edit`마다 전부 기동됐다. README 한 줄 수정에도 bash 5개 + jq 파싱이 돌아 낭비가 컸다. 디스패처가 경로 매칭으로 필요한 훅만 호출하도록 통합했다.

| 하위 훅 | 디스패처 라우팅 조건 | 목적 |
|---|---|---|
| `check-i18n-sync.sh` | `src/i18n/locales/` 경로 | ko/en 키 누락 감지 |
| `rebuild-reminder.sh` | `services/*-service/src/` 경로 | "재빌드 필요" 리마인더 |
| `prisma-migration-reminder.sh` | `*schema.prisma` | "migrate dev 필요" 리마인더 |
| `check-compose-env.sh` | `*docker-compose.yml` | 환경변수/포트 충돌 검증 |
| `update-status.sh` | `docker-compose.yml` / `package.json` / `schema.prisma` | `STATUS.md` 자동 갱신 |

**재귀 방지 가드**: 디스패처는 `STATUS.md` 및 `.claude/hooks/*` 수정은 즉시 무시한다. `update-status.sh`가 `STATUS.md`를 덮어써도 다음 훅 사이클이 발화하지 않는다.

**디스패처 총 타임아웃**: 30초 (`settings.json`에서 단일 값). 이전의 개별 5~15초 합계 50초보다 짧다.

### 훅 디버깅

```bash
# 직접 실행해보기
bash .claude/hooks/update-status.sh

# 훅이 무한루프 도는 경우: update-status.sh가 STATUS.md를 수정하면
# 다시 PostToolUse가 발화할 수 있음 → 스크립트 내부에서 자기 파일 변경은
# 훅 재귀를 유발하지 않도록 guard 필요
```

### 신규 훅 추가 절차

1. `.claude/hooks/<name>.sh` 작성 (bash, exit 0 기본, stderr로 메시지)
2. `chmod +x`
3. `settings.json`의 `hooks.PostToolUse[].hooks[]`에 항목 추가
4. `matcher` 필드로 트리거 도구 제한 (`Write|Edit` 등)
5. 직접 실행해 검증 후 커밋

---

## 3. 룰 (rules/)

`.claude/rules/*.md`는 Claude Code가 파일 수정 시 **자동 로드**되는 규칙 문서다. 하나의 룰은 하나의 관심사만 다룬다.

| 번호 | 파일 | 범위 |
|---|---|---|
| 00 | meta.md | **에이전트 작업 프로토콜** (이 프로젝트 한정) |
| 01 | backend-service-pattern.md | 서비스 디렉토리 구조, 에러 처리 |
| 02 | route-definition.md | Fastify 라우트 정의 |
| 03 | dto-validation.md | Zod 스키마 작성 |
| 04 | frontend-i18n.md | 다국어 규칙 |
| 05 | api-response.md | 응답 포맷 통일 |
| 06 | note-status.md | 노트 상태 전환 제약 |
| 07 | docker-compose.md | 인프라/포트/헬스체크 |
| 08 | shared-package.md | `@lab/shared` 수정 규칙 |
| 09 | prisma-schema.md | DB 스키마 규칙 |
| 10 | security.md | 보안 체크리스트 |
| 11 | pii.md | PII/민감정보 처리 |

### 룰 추가 기준

- **중복 금지**: 기존 룰에 한 줄 추가로 해결 가능하면 새 파일 만들지 말 것
- **파일명 규칙**: `NN-<domain>.md` (NN은 두 자리, 00은 메타룰 전용)
- **Breaking 사례 기반**: "과거에 이래서 사고 났다"는 맥락을 **Why** 섹션에 기록

---

## 4. 서브에이전트 (agents/)

25개의 특화 에이전트가 `.claude/agents/*.md`로 정의되어 있다. 각 파일은 `frontmatter`로 에이전트의 역할/트리거 조건/허용 도구를 기술한다.

**상세 카탈로그**: [.claude/agents/README.md](./agents/README.md)

### 호출 원칙

1. **메인 컨텍스트 보호**: 대용량 검색/분석은 서브에이전트로 위임해 결과만 요약 받기
2. **병렬 실행**: 독립적인 조사는 동일 메시지에서 복수 Agent 호출
3. **과다 호출 금지**: 단일 파일 검색은 Grep/Glob으로 충분 — 3쿼리 이상일 때만 Explore 에이전트
4. **프롬프트 자급자족**: 서브에이전트는 대화 맥락을 모름 — 필요한 경로/배경/기대 출력 형식을 명시

---

## 5. 슬래시 커맨드 (commands/)

| 커맨드 | 용도 |
|---|---|
| `/rebuild` | 서비스 재빌드 절차 안내 |
| `/review` | 코드 리뷰 에이전트 실행 |
| `/service-status` | 서비스 상태 대시보드 |
| `/troubleshoot` | 장애 진단 플로우 |
| `/prisma-migrate` | Prisma 마이그레이션 가이드 |
| `/add-endpoint` | 신규 API 엔드포인트 스캐폴딩 |
| `/add-event` | Redis Stream 이벤트 추가 |
| `/add-i18n` | i18n 키 추가 |
| `/search-index` | OpenSearch 인덱스 관리 |

슬래시 커맨드는 사용자가 직접 호출한다(`/rebuild` 등). 에이전트가 자동 호출하려면 **Skill 도구**를 거쳐야 한다.

---

## 6. Deny 룰의 배경 (왜 막혔는가)

`settings.json`의 `permissions.deny`에 있는 각 항목의 이유:

| 패턴 | 이유 |
|---|---|
| `Bash(rm:*)` | 모든 `rm` 호출 차단. 필요한 파일 삭제는 Write로 빈 파일 교체하거나 명시적 승인 필요 |
| `Bash(find:* -delete*)`, `Bash(find:* -exec rm*)` | `find`로 `rm`을 우회하는 경로 차단 |
| `Bash(git push:* origin*)`, `Bash(git push:* gitlab*)` | `origin`은 GitLab 원격. 회사 정책상 GitLab push 금지. GitHub는 원격명을 명시해 `git push github ...` 형태로 사용 |
| `Bash(git -C:* push:*origin*)` 외 | `git -C <dir> push` 변형 차단 |
| `Bash(psql:*DROP*)`, `Bash(docker exec:*psql*DROP*)` 등 | DB 파괴 방지. 대소문자 혼용 + `docker exec` 경유 케이스도 커버 |
| `Bash(prisma migrate reset:*)` 외 | 마이그레이션 초기화 차단 (로컬 데이터 소실 방지) |
| `Bash(docker volume rm:*)`, `Bash(docker compose down:*-v*)` | 영속 볼륨 파괴 방지 |

**한계를 명시**: Claude Code의 deny는 **명령어 문자열 prefix 매칭**이다. 따라서 다음은 완전히 막을 수 없다:
- shell alias / 환경변수 우회 (`alias rm=echo && ...`)
- 새 bash 스크립트 파일을 생성한 뒤 실행
- 파이프/리다이렉션 중간의 위험 명령 (`echo 'DROP TABLE x' | docker exec -i ...`)

따라서 **deny는 실수 방지용 가드**이지 **악의적 우회에 대한 방어가 아니다**. 진짜 보호는 DB 권한 분리 / 백업 / 감사 로그로 구현해야 한다.

**우회 시도 금지**: 위 한계를 알더라도 deny를 우회하는 행위는 팀 정책 위반. 새 예외가 필요하면 PR로 `settings.json` 수정 후 리뷰.

---

## 7. 메모리 시스템 사용 지침 (이 프로젝트 한정)

Claude Code의 자동 메모리는 `C:\Users\<user>\.claude\projects\<hashed-path>\memory\`에 저장된다.

### 이 프로젝트에서 저장할 만한 것
- 사용자가 확인한 아키텍처 결정의 **Why** (예: "왜 ai-assistant만 Express인가")
- 특정 서비스의 known-issue (예: "collab-service는 Redis 재접속 후 5초 지연")
- 팀 내 작업 관례 (예: "eln-service 수정 시 reviewer는 A/B 중 한 명")

### 저장하지 말 것
- `CLAUDE.md` / `.claude/rules/`에 이미 있는 내용 → 중복
- 코드 패턴 / 파일 경로 → 현재 상태 읽으면 됨
- 최근 git 작업 내역 → `git log`로 충분

---

## 8. STATUS.md 자동 갱신 파이프라인

```
docker-compose.yml / package.json / schema.prisma 수정
   ↓ (Write|Edit)
PostToolUse 훅 발화
   ↓
update-status.sh 실행
   ↓
STATUS.md 갱신 (서비스 목록, 포트, 최근 커밋)
```

**주의**: STATUS.md를 **사람이 수동 편집하지 말 것**. 다음 훅 실행 때 덮어써진다. 영구 내용은 CLAUDE.md에 기록.

---

## 9. 하네스 수정 체크리스트

`.claude/` 파일을 수정할 때:

- [ ] 변경이 팀 전체에 영향 주는가? → `settings.json` / `rules/` / `hooks/` → 커밋
- [ ] 개인 설정인가? → `settings.local.json` → gitignore
- [ ] 훅 추가/수정 시 직접 실행해봤는가?
- [ ] 룰 추가 시 기존 룰과 중복되지 않는가?
- [ ] Deny 룰 추가 시 이유를 이 문서에 기록했는가?
- [ ] Breaking change(기존 에이전트 동작 변경)면 팀에 공지했는가?

---

## 10. 문제 해결 (Troubleshooting)

| 증상 | 원인 가능성 | 확인 방법 |
|---|---|---|
| 훅이 발화 안 함 | `matcher` 오타, 파일 권한 없음 | `bash .claude/hooks/<name>.sh` 직접 실행 |
| STATUS.md가 오래됨 | update-status.sh 실패 | `bash .claude/hooks/update-status.sh` 수동 실행 후 stderr 확인 |
| 에이전트가 룰을 무시함 | 룰 파일이 glob 패턴과 매칭 안 됨 | 룰 frontmatter의 `globs` 필드 확인 |
| deny 룰이 과하게 차단 | 패턴이 너무 넓음 | `settings.json` 수정 후 PR |
| 서브에이전트가 과거 대화 기억 못함 | 정상 동작 — 에이전트는 stateless | 프롬프트에 필요 맥락 전부 포함 |

---

*이 문서는 `.claude/` 하네스 설정의 "why"를 기록한다. 설정 자체가 아니라 그 배경과 운영 방법이 핵심이다.*
