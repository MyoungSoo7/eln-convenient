# STATUS — LabNote ELN

> 사내 구축형 전자연구노트(ELN) 협업 플랫폼 · 온프레미스 MSA (Docker Compose)

**Last updated:** 2026-04-09

## 현재 상태
- **활성 브랜치:** `eln-without-ai`
- **아키텍처:** API Gateway 뒤로 8개 마이크로서비스 (auth/eln/sig-aud/inv/sched/search/file/collab)
- **최근 커밋:** `8276a28` docs: add on-premises AI assistant service architecture design

## 최근 진척
- 온프레미스 AI 어시스턴트 서비스 아키텍처 설계 문서
- ai-dev-team 커맨드 + 17개 에이전트 프롬프트
- README 노출 비밀번호 제거 (Keycloak/MinIO/계정)
- 서비스 간 통신 프로토콜 문서
- `findNoteInOrg` 보안 헬퍼 (orgId 스코프 누락 방지)
- `auth.test.ts` 더미 → 실제 단위 테스트 교체
- 화면설계서/프로세스 정의서 (Mermaid), 사용자 매뉴얼

## 진행 중
- AI 없는 코어 브랜치(`eln-without-ai`) 안정화
- 단위 테스트 커버리지 확대
- 보안 하네스 정비 (hooks, rules 적용)

## 다음 할 일
- [ ] `eln-without-ai` 코어 머지 후 AI 어시스턴트 서비스 본격 착수
- [ ] MSA 간 트랜잭션 경계 재검토 (SAGA 패턴 적용 검토)
- [ ] 파일 서비스 대용량 업로드 성능 튜닝

## 주요 위험/메모
- 온프레미스 전제이므로 외부 의존성 버전 고정과 오프라인 번들링 중요
- 멀티 서비스 간 환경변수 드리프트 방지 (`.env`, `docker-compose.yml` 단일 출처 유지)

## 참고 문서
- `README.md` — MSA 설계 문서
- `CLAUDE.md` — 에이전트 운용 가이드
- `HARNESS.md` — Claude Code 개발 하네스 구성 (agents/commands/hooks/rules)
