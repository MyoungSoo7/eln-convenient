# LabNote ELN — 역순 PRD

> **역순(brownfield) 산출물.** 이 문서는 새 기능을 설계한 것이 아니라, **이미 작성된 코드가 실제로 만족하고 있는 요구사항을 코드에서 되짚어 문서화**한 것이다. 판단 기준은 문서의 주장이 아니라 코드의 동작이며, 코드에 없는 기능을 발명해 넣지 않았다.

- **대상 레포**: `/Users/lms/eln-convenient`
- **대상 브랜치**: `eln-without-ai`
- **기준 커밋**: `7012f7a` — "chore: main 에서 AI 스택만 걷어내 no-AI 라인을 다시 만든다"
- **작성 방식**: ouroboros brownfield → PM 인터뷰(`interview_20260815_163452`, 모호도 0.11) → 개발 인터뷰(`interview_20260815_165042`, 모호도 0.13) → 시드
- **작성일**: 2026-08-16

## 0. 기준 커밋이 바뀐 사실

PM 인터뷰는 HEAD `0f555ba` 를 기준으로 진행했다. 개발 인터뷰 도중 같은 브랜치의 HEAD 가 `7012f7a` 로 **재작성**된 것을 발견했다. 두 커밋 차이는 **223 파일, +39,693 / −11,235 줄**이다.

그 결과 PM 단계에서 사실로 적었던 항목 중 최소 다섯 개가 뒤집혔다. 아래 §4 의 재검증 표는 **전부 `7012f7a` 에서 다시 읽은 것**이며, 재검증하지 않은 주장은 이 문서에 남기지 않았다. PM 문서(`.ouroboros/pm.md`)는 `0f555ba` 기준 초안으로 보존하되, **충돌 시 이 PRD 가 우선**한다.

`pm.md` 90행의 "해시체인 감사" 라는 표현도 여기서 취소한다. 해시 체인은 `Signature` 모델에 있고, `AuditLog` 에는 해시가 **없다**(§4-⑩).

## 1. 제품 정의

사내 R&D 연구실용 **온프레미스 전자연구노트(ELN)** 협업 플랫폼.

존재 이유는 편의가 아니라 **감사 가능성(auditability)과 서명 불변성(signature immutability)** 이다. 모든 설계 트레이드오프는 이 둘에 양보한다. 실험 기록이 언제 누구에 의해 어떤 상태로 바뀌었는지 추적 가능해야 하고, 서명이 끝난 기록은 어떤 경로로도 바뀌지 않아야 한다.

**규제 표준은 채택하지 않는다.** 21 CFR Part 11 · GLP · ISO 17025 중 무엇도 준수를 주장하지 않으며 인증 대상도 아니다. 이 문서의 "규제 요구"는 전부 **코드가 이미 강제하고 있는 자체 불변식**을 가리킨다. Part 11 은 부록의 갭 분석 참조 프레임으로만 등장할 수 있고 준수 주장으로는 등장할 수 없다.

**폐쇄망 제약.** 온프레미스 단일 호스트 Docker Compose 배포이며 외부 API 호출을 허용하지 않는다. 연구 데이터의 민감도가 이유다. AI 기능을 언젠가 넣는다면 온프레미스 LLM 이 전제다.

## 2. 사용자와 역할

역할 4종 × 권한 상수 24개. Organization → Team → User 3계층 테넌시이며 **모든 API 는 orgId 로 스코프**된다.

| 역할 | 핵심 권한 |
| --- | --- |
| researcher | 노트 작성·수정·제출, 첨부·링크, 인벤토리 연결, 내보내기 |
| reviewer | 노트·이력·감사로그 열람, 서명 권한 보유 |
| admin | 조직·팀·사용자·역할 관리, 잠금 해제(비밀번호 재확인), 서명 취소 |
| viewer | 읽기 전용 — 노트·검색·감사로그 열람만 |

## 3. 규제 핵심 — 노트 상태 머신

제품의 규제적 심장이다. 다른 무엇을 잃어도 이건 잃을 수 없다.

```
draft ⇄ in_progress
in_progress → signed    (signature-audit 서비스를 통해서만)
in_progress → locked
signed  → []            (종결. 불변)
locked  → draft         (admin 전용 + 비밀번호 재확인)
```

**삼중 강제.** DTO 전이표(`services/eln-service/src/dtos/note.dto.ts`) + DB 트리거 + 이중 이력(`NoteStatusHistory` 로컬 + `AuditLog` 원격).

**signed 로 가는 유일한 문은 signature-audit 서비스다.** eln-service 자체 전이표에는 `in_progress → signed` 가 없고, signature 서비스용 전이표에만 있다. 서명 없이 서명 완료 상태가 되는 경로는 존재하지 않는다.

**서명 발급 게이트** (`services/signature-audit-service/src/controllers/signature.controller.ts`):
- 비밀번호 재검증 실패 시 400 — 서명 거부
- **자기 노트 자기 서명 차단** — `note.authorId === signerId` 이면 403 (admin 예외)
- 서명 권한은 admin · reviewer, 또는 해당 노트 팀의 leader

## 4. 재검증 결과 (`7012f7a` 기준)

역순 작업의 핵심 산출물. 각 항목은 **재현(reproduce)** — 코드가 옳으므로 시드가 그대로 만들어야 함 — 과 **교정(correct)** — 코드가 틀렸으므로 시드가 고쳐야 함 — 으로 나뉜다.

### 4.1 이미 옳거나, 앞선 판단이 틀렸던 것 (재현)

| # | 항목 | `7012f7a` 실측 |
| --- | --- | --- |
| ① | Keycloak SSO 부재 | README 는 완료라고 적었으나 코드에 Keycloak 통합이 **없다**(README + pptx 생성 스크립트에만 문자열 존재). 게이트웨이는 로컬 `jwtVerify` 만 쓴다. **교정 대상은 코드가 아니라 README.** |
| ⑤ | AI 기능 부재 | 이 브랜치 자체가 AI 제거판이다. 재현. |
| ⑥ | CI 게이트 | **앞선 판단 취소.** `.github/workflows/ci.yml` 은 `npx tsc --noEmit` 과 `npm test` 를 `continue-on-error` 없이 돌린다. 주석이 "게이트가 없으면 테스트는 조용히 썩는다 — 붙이는 순간 방금 걷어낸 빈 게이트가 된다"고 명시. **이미 고쳐져 있으므로 보존.** |
| ⑦ | 서명·잠금 노트의 첨부·링크 변경 | **앞선 판단 취소.** `note.controller.ts:627,657,688` 에 `status === 'signed' \|\| status === 'locked'` 가드가 있다. 본문 수정(:247,250)·삭제(:324,328) 가드와 함께 불변성이 첨부·링크까지 덮는다. **보존.** |
| — | 검색 색인 | **앞선 판단 취소.** fire-and-forget HTTP 가 아니라 Redis Stream `labnote:events` 기반이다. 발행: `searchClient.ts` XADD. 소비: search-service Consumer Group + XPENDING/XCLAIM 자동 재청구 + 5회 초과 시 dead letter. search-service 가 죽어 있던 동안의 이벤트도 Stream 에 보존된다. **보존** (단 §4.3 관측 요구 추가). |
| — | 알림 | **앞선 판단 취소.** 백엔드(BullMQ `notificationQueue`, `idempotencyKey`·`jobId` 이중 중복방지, `/api/notifications/internal`)와 프론트(`NotificationsPage.tsx`) 모두 존재한다. |
| — | 403 페이지 | **앞선 판단 취소.** `src/pages/ForbiddenPage.tsx` 존재. |

### 4.2 여전히 틀려 있는 것 (교정)

| # | 항목 | `7012f7a` 실측 | 교정 요구 |
| --- | --- | --- | --- |
| ② | 로그인 mock 폴백 | `src/api/auth.ts:75` — 백엔드 호출이 throw 하면 `catch` 에서 `mock-jwt-token` 으로 **로그인을 성공 처리**하고 세션을 심는다. `getMe()` 도 같은 방식(:100). | 실패는 실패로 노출한다. 클라이언트가 토큰을 만들어내는 경로를 제거한다. 오프라인/데모 모드가 필요하면 **기본값 off 인 명시적 빌드 플래그**로만. |
| ③ | 내보내기 서브시스템 이중화 | 게이트웨이가 `/api/export` → signature-audit:8003, `/api/exports` → file:8008 로 나뉜다(`proxy.ts:18,24`). 끝의 `s` 하나가 살아있는 경로와 죽은 경로를 가르는 유일한 차이. SSE(`/api/events/exports`)에 발행하는 것은 signature-audit 의 export.worker 뿐. | 소유자를 **signature-audit 단독**으로 확정. file-service 구현에서 **보존 기간 만료 정리 로직만 흡수**하고 나머지는 삭제. |
| ⑧ | collab WebSocket 인가 | upgrade 핸들러(`collab-service/src/index.ts`)가 **JWT 서명만 검증**한다. orgId 대조 없음, 노트 조회 없음, 권한 확인 없음 — 유효한 토큰이면 **어느 조직의 어느 noteId 방에든 입장**해 본문 브로드캐스트를 수신한다. 상태 게이트는 생겼으나(`readOnly` 시 content-update 거부) `isNoteReadOnly()` 가 `.then()` 으로 비동기 설정돼 **경합 창**이 있다. 프론트는 게이트웨이를 우회해 `ws://…:8009` 로 직접 붙고 **토큰을 쿼리스트링에 실어 보낸다**(`NoteEditor.tsx`). | upgrade 시점에 ① orgId 일치 ② 노트 존재 ③ 읽기/쓰기 권한 ④ 상태를 **동기적으로** 확인하고 통과 못 하면 연결 거부. 연결은 게이트웨이를 경유하고 토큰은 헤더 또는 subprotocol 로 전달. |
| ⑨ | 서명 해시가 본문을 묶지 않음 | 해시 입력은 `noteId:signerId:timestamp:prevHash:comment` 다. **노트 내용이 들어가지 않는다** — 서명 후 본문이 바뀌어도 해시로는 탐지할 수 없다. 게다가 `timestamp` 와 `comment` 는 **저장되지 않아** 해시를 영원히 재계산할 수 없다. `verifySignature` 는 `prevHash` 연결과 `chainIndex` 연속성만 보고 **해시를 한 번도 재계산하지 않는다**. | 해시 입력에 **노트 내용 다이제스트**를 포함하고, 재계산에 필요한 모든 재료를 저장한다. 검증은 **저장값으로 재계산해 대조**한다. 연결관계 확인만 하는 검증은 무결성을 보증하지 않는다. |
| ⑩ | 감사로그 변조 탐지 부재 | `AuditLog` 모델에 `hash` 도 `prevHash` 도 없다. 멱등키 `eventId` 만 추가돼 있다. | §5.2 참조. |
| ④ | 스캐폴딩 잔해 | 루트에 `bun.lock` + `bun.lockb` + `package-lock.json` **3종 공존**, 서비스 하위에 `package-lock.json` 11개 추가. `bash.exe.stackdump` 3개(`./`, `./docs/si/`, `./services/`). `src/pages/Index.tsx` 는 **2줄**. `services/inventory-frontend` 는 루트 SPA 와 라우트가 겹치는 중복 SPA. | 패키지 매니저 택일 후 나머지 잠금 파일 전부 삭제, stackdump 삭제, 빈 페이지·중복 SPA 제거. |

### 4.3 인터뷰 중 새로 발견한 것 (교정)

| 항목 | 실측 | 교정 요구 |
| --- | --- | --- |
| **관리자 잠금 해제가 비트랜잭션** | `note.controller.ts` 언락 경로는 `prisma.note.update` 로 상태를 draft 로 바꾼 뒤 `prisma.noteStatusHistory.create` 를 **별도 호출**하고, 실패를 `.catch` 로 삼키며 `[HISTORY_WARN] … (잠금해제는 완료)` 를 남긴다. **규제상 가장 민감한 행위가 같은 DB 안의 이력조차 없이 성공할 수 있다.** 반면 일반 상태 전이(:381-396)는 `prisma.$transaction` 안에서 `tx.note.update` 와 `tx.noteStatusHistory.create` 를 함께 커밋한다. | 언락도 단일 트랜잭션으로 묶고, **이력 기록 실패는 언락 실패로 처리**한다. |
| **감사 기록이 유실 가능** | eln-service 는 감사를 HTTP 로 원격 기록한다(`lib/audit.ts`). 응답 오류·타임아웃·연결 실패를 모두 `[AUDIT_FAIL]` 로그로만 남기고 **호출자는 그대로 진행**한다. | §5.1 outbox. |
| **검색 색인 손실 창 3종** | ① XADD 자체 실패(Redis 다운) — `console.error` 만, 주석도 "여기서만 색인 손실 가능"이라 인정. ② `STREAM_MAXLEN ~10000` 트림으로 미소비 이벤트가 조용히 잘림. ③ dead letter 가 `XACK` 로 폐기(로그 한 줄). | 세 경우 모두 **지표로 노출**. 복구 수단인 `POST /api/search/index/bulk` 는 관리자 수동 조작으로 남기되 **항상 호출 가능**해야 한다. 기동 시 자동 전량 재색인은 넣지 않는다 — 비용이 크고 사고 증상을 덮는다. |

## 5. 원자성과 소유 (개발 인터뷰 확정)

### 5.1 세 전이의 원자성 위치가 서로 다르다

**서명은 분산 트랜잭션이 아니다.** `Signature` 와 `AuditLog` 는 **둘 다 signature-audit 자기 DB**이고 같은 Prisma 클라이언트로 쓴다. 지금은 독립 호출 두 개라 사이에서 죽으면 서명만 남지만, **로컬 단일 트랜잭션으로 묶으면 끝난다.** 여기서 "감사 확정 전 성공 불가"는 완화 없이 성립한다.

**노트 상태 전파는 이미 최종 일관성이다.** `patchNoteStatus` 는 Redis Stream 으로 `NOTE_SIGNED` 를 발행하고(eln-service `eventConsumer` 가 소비), 실패하면 HTTP PATCH 폴백, 그것도 실패하면 201 을 반환하며 응답에 "서명은 저장되었으나 노트 상태 전환이 지연될 수 있습니다"를 붙인다. 즉 **서명 원장이 진실이고 `note.status` 는 파생 투영**이라는 입장이 이미 구현돼 있다. 이건 결함이 아니라 옳은 선택이므로 유지한다. 다만 **미반영 검출 수단**(서명은 있는데 status 가 signed 가 아닌 노트 조회)을 요구로 추가한다 — 현재는 발행 성공만 확인하고 반영 여부는 아무도 보지 않는다.

**잠금·언락이 진짜 분산 케이스다.** 전이는 eln-service 로컬 DB, 감사는 원격 HTTP. 여기에 **outbox** 를 둔다: `note.update` + `noteStatusHistory.create` + outbox 행을 **한 트랜잭션**으로 커밋하고, 릴레이 워커가 signature-audit `/audit/internal` 로 보낸 뒤 outbox 행을 완료 처리한다. **성공 판정 기준은 로컬 커밋.** 원격 반영은 최종 일관성이되 **유실은 불가** — 재시도하고, 미전송 잔량과 최장 지연을 지표로 노출하며 임계 초과 시 알린다.

**가용성 결합은 거부한다.** signature-audit 이 죽었다고 잠금·언락이 전부 막혀서는 안 된다. 서명은 signature-audit 자신이 처리 주체이므로 그 서비스가 죽으면 불가한데, 그건 결합이 아니라 소유다.

### 5.2 감사로그 변조 탐지 — 소유는 signature-audit 단독

이건 설계 선택이 아니라 **코드가 이미 그런 사실을 굳히는 것**이다. `prisma.auditLog.create` 를 호출하는 파일은 signature-audit 안에만 있고(signature.controller, export.controller, audit.controller, export.worker), 다른 서비스는 `POST /audit/internal` 로 보낸다. 그 엔드포인트는 `requireInternalSecret` 로 잠겨 있고 조회 라우트는 GET 셋뿐이라 **수정·삭제 API 는 애초에 없다.** 쓰기 경로가 이미 한 곳으로 좁혀져 있으므로 체인 계산은 **수신 시점의 signature-audit** 이 한다.

셋을 함께 쓴다. 하나만으로는 각각 뚫린다.

1. **해시 체인(필수)** — `AuditLog` 에 `prevHash`·`hash`·`chainIndex` 추가. 체인 범위는 **orgId 단위**로 끊는다(전역 단일 체인이면 한 테넌트의 기록량이 다른 테넌트의 검증 비용을 끌어올리고 삽입이 전역 직렬화된다). `Signature` 의 `@@unique([noteId, chainIndex])` 와 같은 요령으로 `@@unique([orgId, chainIndex])` 를 걸어 번호 건너뛰기·중복을 DB 가 막게 한다.
2. **append-only 권한(필수)** — 애플리케이션 DB 롤에서 audit 테이블의 UPDATE·DELETE 를 회수하고 INSERT·SELECT 만 남긴다. **이게 없으면 1번은 무의미하다** — 쓰기 권한을 가진 자는 행 하나를 고친 뒤 뒤따르는 `prevHash` 를 전부 다시 계산하면 그만이다. ⑨의 함정을 여기서 되풀이하지 않는다.
3. **주기적 검증(필수)** — 체인 연속성과 **각 레코드 해시 재계산**을 도는 배치. 결과를 관리자 화면에 노출한다. 연결관계만 보는 검증은 아무것도 보증하지 않는다.

**HMAC 은 선택.** 넣는다면 키는 signature-audit 만 보유하고 DB 에 두지 않는다. DB 는 뚫렸지만 애플리케이션은 안 뚫린 경우에만 추가 이득이 있는데, 단일 호스트 폐쇄망에서는 그 시나리오가 좁고 키 관리·회전 부담은 실제로 발생한다.

**해시 입력 필드 고정**: `entityType, entityId, action, actorId, orgId, details, ipAddress, createdAt, prevHash`. **재계산에 필요한 값은 전부 저장돼 있어야 한다.**

## 6. 서명 후 정정 경로

signed 는 종결 상태이고 앞으로도 그렇다. 정정은 **수정이 아니라 추기(addendum)** 로만 한다.

새 노트를 만들고 기존 `NoteLink` 스키마(`targetType`/`targetId`/`label` — 이미 범용이라 스키마 변경 불필요)로 원본에 연결한다. 다만 **⑨가 먼저 고쳐져야 추기가 의미를 갖는다** — 원본이 실제로 그 내용이었음을 증명할 수 없으면 정정 대상이 특정되지 않는다. 현재는 시스템이 강제하는 연결 없이 사용자가 수동으로 새 노트를 만들 뿐이므로, 이 상태를 **문서화된 갭**으로 기록한다. 시드 필수 요구로 올릴지는 §9 미결.

## 7. 기능 계층

| 계층 | 기능 |
| --- | --- |
| **핵심** | auth · eln(노트) · signature-audit(서명·감사) · file(첨부) · api-gateway. 템플릿은 별도 도메인이 아니라 **노트의 하위 유형** — `/protocols` 라우트가 `injectTemplateType` 으로 `?type=template` 을 주입해 같은 컨트롤러(`ctrl.getNotes`)를 재사용한다. |
| **준필수** | 내보내기(PDF/ZIP + SSE 진행률), 노트↔인벤토리 링크(실험 재현성 추적) |
| **부가** | 검색(OpenSearch), 인벤토리, 스케줄러, collab 프레즌스 |

**collab 은 "동시 편집"이 아니다.** CRDT 도 OT 도 없다. `content-update` 는 문서 전체를 브로드캐스트하고, 수신 측은 "마지막 로컬 편집 후 1초가 지났으면 덮어쓴다"는 휴리스틱으로 처리한다. 즉 **last-write-wins 이며 동시 편집 시 데이터 손실이 가능하다.** PRD 는 이를 프레즌스(참여자 목록·커서·8색 팔레트)와 전체 문서 브로드캐스트로만 기술하며, 협업 편집으로 과장하지 않는다.

## 8. 서비스 경계는 규제 요구다

8개 서비스 분리는 아키텍처 취향이 아니라 불변식의 강제 수단이다. 합치면 깨진다.

- `in_progress → signed` 가 **signature-audit 을 반드시 경유**한다는 보장
- **감사의 주체와 기록자가 분리**된다는 보장 (감사받는 서비스가 자기 감사로그를 직접 쓰지 못함)
- **스키마 수준 테넌시 격리** (서비스별 PostgreSQL 스키마 분리)

따라서 시드는 8서비스 + api-gateway + `@lab/shared` 구성을 유지해야 한다.

## 9. 성공 기준

1. 상태 머신이 §3 그대로 강제되고, DTO 전이표·DB 트리거·이중 이력으로 삼중 강제된다.
2. signed 불변성이 제목·본문·섹션·태그·**첨부·링크**·삭제를 모두 덮는다. locked 도 동일(admin 언락 경로만 예외).
3. 관리자 언락은 **단일 트랜잭션**이며 이력 기록 실패 시 언락도 실패한다.
4. 인증은 서버 발급 JWT 전용. 로그인 실패는 실패로 노출되고, **클라이언트가 토큰을 만들어내는 경로가 존재하지 않는다.**
5. 모든 엔드포인트가 orgId 테넌시를 강제한다. 역할 4종 × 권한 상수 24개가 적용된다.
6. collab 세션 수립이 **동기적으로** orgId·노트 존재·권한·상태를 확인하고, 게이트웨이를 경유하며, 토큰이 쿼리스트링에 실리지 않는다.
7. 서명 해시가 노트 내용을 묶고, 재계산에 필요한 재료가 모두 저장되며, 검증이 **재계산해 대조**한다.
8. 감사로그가 orgId 단위 해시 체인 + append-only 권한 + 주기 재계산 검증을 갖춘다.
9. 감사 기록이 outbox 로 유실 불가하며, 미전송 잔량·최장 지연이 지표로 노출된다.
10. 내보내기 소유자는 signature-audit 단독이며, 보존 기간 만료 정리가 포함된다.
11. 검색 색인 손실 3종이 지표로 노출되고, bulk 재색인이 호출 가능한 상태로 유지된다.
12. CI 가 **실패할 수 있다** — 타입 체크와 테스트가 `continue-on-error` 없이 게이트로 동작한다(현재 충족, 회귀 금지).
13. 규제 핵심에 테스트가 존재한다 — 상태 전이 4종(특히 signed 불변성, locked→draft 의 admin+비밀번호 게이트), 서명 발급·검증, 상태 변경 시 감사 기록, 권한 게이트(4역할 × 주요 리소스). **`expect(true).toBe(true)` 류 자리표시 테스트는 커버리지로 세지 않는다.**
14. 패키지 매니저가 하나이고 잠금 파일이 하나다.
15. 서비스별 `openapi.yaml` 이 유지된다(약 120개 엔드포인트).

## 10. 미결

- **패키지 매니저 택일** — bun 인지 npm 인지. **결정 절차는 정해져 있다**: 각 서비스 Dockerfile 이 실제로 `bun install` 을 부르는지 `npm ci` 를 부르는지 확인하고 그쪽으로 통일한다. 확인 전에는 결정하지 않는다.
- **서명 후 추기 경로를 시드 필수 요구로 올릴지** — 현재는 문서화된 갭. ⑨ 교정이 선행 조건.
- **collab 인가 강화 시 게이트웨이 경유 전환 범위** — 프론트 직결(`ws://…:8009`)을 끊는 작업이 프론트 변경을 동반한다.
- Keycloak SSO — README 를 코드에 맞춰 정정할 것인지, 통합을 실제로 구현할 것인지.
- AI 어시스턴트 — `docs/ai-assitance-architect.md` 에 설계만 있고 이 브랜치엔 구현이 없다. 넣는다면 온프레미스 LLM 전제.

---

## 부록 A. 근거 위치

| 주장 | 파일 |
| --- | --- |
| 상태 전이표 | `services/eln-service/src/dtos/note.dto.ts` |
| signed/locked 가드 (본문·삭제·첨부·링크) | `services/eln-service/src/controllers/note.controller.ts:247,250,324,328,627,657,688` |
| 상태 전이 트랜잭션 / 언락 비트랜잭션 | 같은 파일 `:381-396` vs 언락 경로 `[HISTORY_WARN]` |
| 감사 HTTP 전송 실패 무시 | `services/eln-service/src/lib/audit.ts` |
| 서명 게이트·해시 생성·감사 기록·상태 전파 | `services/signature-audit-service/src/controllers/signature.controller.ts` |
| 검증이 재계산하지 않음 | 같은 파일 `verifySignature` |
| `Signature` 해시 체인 / `AuditLog` 해시 부재 | `services/signature-audit-service/prisma/schema.prisma` |
| 감사 라우트(내부 쓰기 + GET 3종) | `services/signature-audit-service/src/routes/audit.routes.ts` |
| 내보내기 이중 경로 | `services/api-gateway/src/routes/proxy.ts:18,24` |
| SSE 발행자 | `services/signature-audit-service/src/workers/export.worker.ts` |
| collab upgrade 인가 / readOnly 경합 | `services/collab-service/src/index.ts` |
| 프론트 WS 직결 + 쿼리스트링 토큰 | `src/pages/NoteEditor.tsx` |
| mock 토큰 폴백 | `src/api/auth.ts:75,100` |
| 검색 색인 발행 | `services/eln-service/src/lib/searchClient.ts`, `services/inventory-service/src/lib/searchClient.ts` |
| 검색 색인 소비·재시도·dead letter | `services/search-service/src/lib/eventConsumer.ts:152-161` |
| CI 게이트 | `.github/workflows/ci.yml` |
| 알림 백엔드·프론트 | `services/signature-audit-service/src/lib/queue.ts`, `services/eln-service/src/lib/notification.ts`, `src/pages/NotificationsPage.tsx` |
