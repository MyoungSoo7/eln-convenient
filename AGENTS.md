# AGENTS.md

> 이 파일은 AI 코딩 에이전트(Claude Code, Codex, Cursor, Aider, Continue, Jules 등) 공통 진입점입니다.
> 사람용 문서는 [README.md](./README.md) / [STATUS.md](./STATUS.md)를 참고하세요.

## 프로젝트 한 줄 요약

사내 구축형 전자연구노트(ELN) 협업 플랫폼. Docker Compose 기반 MSA (api-gateway + 9개 백엔드 서비스 + React 프론트엔드).

## 에이전트가 먼저 읽어야 할 문서

| 우선순위 | 문서 | 역할 |
|---|---|---|
| 1 | [CLAUDE.md](./CLAUDE.md) | 프로젝트 지시서 — 아키텍처, 기술 스택, 상태 흐름, 권한 모델 |
| 2 | [STATUS.md](./STATUS.md) | 자동 갱신되는 서비스/포트/컨테이너 현황 (훅으로 최신화) |
| 3 | [.claude/rules/](./.claude/rules/) | 파일 패턴별 코드 규칙 (11개) |
| 4 | [.claude/HARNESS.md](./.claude/HARNESS.md) | 하네스 운영 매뉴얼 — 훅/커맨드/에이전트 동작 방식 |
| 5 | [.claude/agents/README.md](./.claude/agents/README.md) | 25개 서브에이전트 카탈로그와 선택 기준 |

## 필수 작업 규칙 (모든 에이전트 공통)

1. **Git push는 GitHub만 허용** — GitLab(origin) push 금지. `.claude/settings.json`의 deny 룰로 차단됨
2. **백엔드 코드 수정 후** `docker compose up -d --build <서비스명>` 실행 필요 (services/ 디렉토리에서)
3. **프론트엔드 코드는 Vite HMR**로 자동 반영 — 빌드 불필요
4. **다국어**: 텍스트 추가 시 `src/i18n/locales/ko/`와 `en/` 두 곳 모두 반영
5. **API 응답 형식**: `{ ok: boolean, data: T, error?: string }` 통일
6. **에러 처리**: `@lab/shared`의 `AppError` + `ErrorCode` 사용 (직접 status 반환 금지)
7. **멀티테넌시**: 모든 쿼리에 `getOrgId(req.headers)` + `withOrgScope()` 필수
8. **PII 처리**: AuditLog/로그에 평문 저장 금지 — `maskPII()` 통과 필수 ([.claude/rules/11-pii.md](./.claude/rules/11-pii.md))

## 빠른 실행 커맨드

```bash
# 전체 기동
cd services && docker compose up -d

# 특정 서비스 재빌드
cd services && docker compose up -d --build eln-service

# 프론트엔드 개발 서버
npm run dev  # http://localhost:5173

# 로그 확인 (Dozzle)
# http://localhost:9999

# STATUS.md 수동 갱신
bash .claude/hooks/update-status.sh
```

## 저장소 구조 (최상위만)

```
src/                   # React 메인 프론트엔드
services/              # 백엔드 MSA + docker-compose.yml
  ├── shared/          # @lab/shared 공용 패키지
  ├── api-gateway/     # Fastify — JWT, 프록시, SSE
  ├── auth-service/    # Fastify — 조직/사용자/RBAC
  ├── eln-service/     # Fastify — 노트/프로토콜/상태 흐름
  ├── signature-audit-service/
  ├── inventory-service/
  ├── scheduler-service/
  ├── search-service/
  ├── ai-assistant-service/  # Express (유일한 비-Fastify)
  ├── file-service/
  ├── collab-service/  # WebSocket
  └── inventory-frontend/
docs/                  # 상세 설계 문서
.claude/               # Claude Code 전용 설정 (다른 하네스는 CLAUDE.md만 로드)
```

## 비-Claude 하네스 사용 팁

- `.claude/` 디렉토리는 Claude Code 전용이지만, `.claude/rules/*.md`는 일반 마크다운이라 **다른 하네스에서도 수동 로드**하면 유용합니다
- `.claude/agents/` 하위의 특화 에이전트 정의(25개)는 Claude Code 서브에이전트 포맷 — 다른 하네스에서는 단순 참고용으로 활용
- 훅 스크립트(`.claude/hooks/*.sh`)는 bash로 독립 실행 가능 — CI/CD나 pre-commit에도 재사용 가능

## 안전 경계

- **절대 하지 말 것**: `rm -rf`, `DROP TABLE/DATABASE`, GitLab push, `.env` 커밋, 시크릿 하드코딩, DB 트리거 수정
- **사람 승인 필요**: 마이그레이션 배포, 외부 서비스 호출 추가, `@lab/shared` 시그니처 변경, 새 deny 룰 추가
- **조심**: `locked`/`signed` 노트 상태 변경 로직 — DB 트리거 `check_note_status_transition()`이 최종 안전장치

---

*이 문서는 crossharness 에이전트 진입점입니다. 상세 규칙은 [CLAUDE.md](./CLAUDE.md) + [.claude/rules/](./.claude/rules/)에 있으며, 이 파일은 의도적으로 얇게 유지됩니다.*
