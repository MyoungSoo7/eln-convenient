# 노트 상태 전환 트러블슈팅

## 증상 1: 서명 후 노트 상태가 signed로 안 바뀜

### 원인
Redis Stream eventConsumer가 중단되었거나 메시지가 dead-letter로 빠짐.

### 진단
```bash
# 1. eln-service 이벤트 소비자 로그 확인
docker compose logs -f eln-service 2>&1 | grep -E "eventConsumer|NOTE_SIGNED|handleNote"

# 2. Redis Stream pending 메시지 확인
docker compose exec redis redis-cli XPENDING labnote:events eln-service
# 출력 예시: 1) (integer) 3    ← 미처리 메시지 수
#            2) "1234-0"       ← 가장 오래된 pending ID
#            3) "1234-5"       ← 가장 최근 pending ID

# 3. 상세 pending 정보 (재전달 횟수 확인)
docker compose exec redis redis-cli XPENDING labnote:events eln-service - + 10
# deliveryCount > 5면 dead-letter 처리됨

# 4. Stream 전체 메시지 확인
docker compose exec redis redis-cli XRANGE labnote:events - + COUNT 10
```

### 해결
```bash
# 방법 1: eln-service 재시작 (소비자 재연결)
docker compose restart eln-service

# 방법 2: pending 메시지 수동 처리
# Redis에서 메시지 내용 확인 후 직접 상태 변경

# 방법 3: HTTP 폴백 수동 실행
curl -X PATCH http://localhost:8002/api/notes/<noteId>/status \
  -H "Content-Type: application/json" \
  -H "x-user-role: system" \
  -H "x-internal-secret: <시크릿값>" \
  -d '{"status": "signed"}'
```

### 예방
- eln-service의 healthcheck에 eventConsumer 상태 포함 확인
- 모니터링: XPENDING 카운트가 일정 수 이상이면 알림

---

## 증상 2: "잘못된 상태 전환" 에러 (DB 트리거 차단)

### 원인
`check_note_status_transition()` DB 트리거가 허용되지 않은 전환을 차단.

### 진단
```bash
# 에러 메시지 확인
docker compose logs eln-service 2>&1 | grep -E "check_note_status|transition|trigger"
# 예시: "ERROR: Invalid status transition from 'draft' to 'signed'"

# 현재 노트 상태 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, status, title FROM notes WHERE id = '<noteId>';"
```

### 허용된 전환 경로
```
draft → in_progress (모든 역할)
in_progress → draft (모든 역할)
in_progress → locked (Reviewer/Admin)
in_progress → signed (system만)
locked → draft (Admin, 잠금해제)
signed → (없음, 불변)
```

### 해결
| 시도한 전환 | 원인 | 해결 |
|------------|------|------|
| draft → signed | 서명은 반드시 서명 프로세스를 거쳐야 함 | `POST /signatures/sign/:noteId` 사용 |
| draft → locked | draft에서 직접 locked 불가 | 먼저 in_progress로 변경 후 locked |
| signed → draft | signed는 불변 | 변경 불가 (설계 의도) |
| locked → in_progress | locked에서는 draft로만 가능 | Admin이 먼저 잠금 해제 (→ draft) |

---

## 증상 3: Researcher가 locked 전환 시도 시 403

### 원인
`in_progress → locked` 전환은 Reviewer/Admin만 가능. 컨트롤러에서 `x-user-role` 검증.

### 진단
```bash
# 해당 요청의 역할 확인
docker compose logs eln-service 2>&1 | grep -E "x-user-role|locked|403"
```

### 해결
- 정상 동작: Researcher는 locked 전환 권한 없음
- 필요 시 해당 사용자의 역할을 Reviewer로 변경

---

## 증상 4: Admin 잠금 해제 실패

### 원인
3중 검증 (역할 + 권한 + 비밀번호) 중 하나 실패.

### 진단
```bash
docker compose logs eln-service 2>&1 | grep "admin-unlock"
```

### 해결
| 에러 | 원인 | 해결 |
|------|------|------|
| 403 "Insufficient role" | Admin 역할 아님 | 사용자 역할 확인 |
| 403 "Permission denied" | NOTE_UNLOCK 권한 없음 | 역할에 권한 추가 |
| 401 "비밀번호 불일치" | 입력 비밀번호 오류 | 재입력 |
| 500 "Auth service 연결 실패" | auth-service 다운 | `docker compose restart auth-service` |

---

## 증상 5: signed/locked 노트가 수정됨 (보안 위반)

### 원인
컨트롤러의 상태 체크 로직 누락 또는 우회.

### 진단
```bash
# 감사 로그 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT * FROM audit_logs WHERE entity_id = '<noteId>' ORDER BY created_at DESC LIMIT 10;"

# NoteStatusHistory 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT * FROM note_status_histories WHERE note_id = '<noteId>' ORDER BY created_at DESC;"
```

### 해결
- 이것은 **심각한 버그**. 컨트롤러의 UPDATE/DELETE 로직에서 상태 체크 누락 확인
- `note.controller.ts`의 updateNote, deleteNote 함수에서 `signed`, `locked` 상태 체크 존재 여부 확인

---

## 증상 6: NoteStatusHistory에 기록 누락

### 원인
상태 변경은 성공했으나 히스토리 기록이 실패 (트랜잭션 미사용).

### 진단
```bash
# 상태 변경 vs 히스토리 비교
docker compose exec postgres psql -U labnote -d labnote -c "
  SELECT n.id, n.status, n.updated_at,
         nsh.from_status, nsh.to_status, nsh.created_at as history_at
  FROM notes n
  LEFT JOIN note_status_histories nsh ON n.id = nsh.note_id
  WHERE n.id = '<noteId>'
  ORDER BY nsh.created_at DESC;
"
```

### 해결
- 상태 변경과 히스토리 기록이 같은 Prisma 트랜잭션 내에 있는지 확인
- AuditLog는 fire-and-forget이므로 누락 가능 (설계 의도), 하지만 NoteStatusHistory는 트랜잭션 내에 있어야 함

---

## 빠른 진단 체크리스트

```bash
# 1. 노트 현재 상태 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, status, author_id, updated_at FROM notes WHERE id = '<noteId>';"

# 2. 상태 변경 히스토리
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT * FROM note_status_histories WHERE note_id = '<noteId>' ORDER BY created_at;"

# 3. Redis Stream 상태
docker compose exec redis redis-cli XLEN labnote:events
docker compose exec redis redis-cli XPENDING labnote:events eln-service

# 4. 서명 기록
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT * FROM signatures WHERE note_id = '<noteId>' ORDER BY created_at DESC;"
```
