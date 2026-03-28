# 장비/회의실 예약 트러블슈팅

## 증상 1: 예약 충돌인데 통과됨 (더블 부킹)

### 원인
비관적 락이 적용 안 되었거나, 충돌 검사가 PENDING 건까지 포함하지 않는 설계.

### 진단
```bash
# 겹치는 예약 확인
docker compose exec postgres psql -U labnote -d labnote -c "
  SELECT id, resource_id, status, start_at, end_at, user_id
  FROM bookings
  WHERE resource_id = '<resourceId>'
  AND status = 'APPROVED'
  ORDER BY start_at;
"
```

### 해결
| 상황 | 설명 |
|------|------|
| 2개 APPROVED가 겹침 | **버그** — 비관적 락 로직 확인 필요 |
| PENDING + APPROVED 겹침 | **정상** — PENDING끼리는 충돌 안 함 (설계 의도) |
| 동시 승인으로 발생 | 승인 시점 충돌 재확인 로직 확인 |

```bash
# 수동으로 중복 예약 취소
docker compose exec postgres psql -U labnote -d labnote -c \
  "UPDATE bookings SET status = 'CANCELLED' WHERE id = '<후순위 bookingId>';"
```

---

## 증상 2: 승인 시 "충돌 발생" 에러 (409)

### 원인
승인 시점에 같은 시간대에 다른 예약이 먼저 승인됨. **정상 동작**.

### 진단
```bash
# 충돌 대상 예약 확인
docker compose exec postgres psql -U labnote -d labnote -c "
  SELECT id, status, start_at, end_at, approved_at
  FROM bookings
  WHERE resource_id = '<resourceId>'
  AND status = 'APPROVED'
  AND start_at < '<endAt>'
  AND end_at > '<startAt>';
"
```

### 해결
- 409는 정상 응답 — 먼저 승인된 건이 우선
- 신청자에게 다른 시간대로 재예약 안내
- 충돌 예약 정보를 프론트엔드에서 표시

---

## 증상 3: 예약 상태 전환 실패

### 원인
허용되지 않은 상태 전환 시도.

### 허용된 전환
```
PENDING → APPROVED (승인자)
PENDING → REJECTED (승인자)
PENDING → CANCELLED (신청자)
APPROVED → COMPLETED (신청자/승인자)
APPROVED → CANCELLED (신청자/Admin)
```

### 불가능한 전환
| 시도 | 이유 |
|------|------|
| REJECTED → APPROVED | 거절 후 재승인 불가, 재예약 필요 |
| CANCELLED → APPROVED | 취소 후 복구 불가 |
| COMPLETED → CANCELLED | 완료된 예약 취소 불가 |
| APPROVED → PENDING | 승인 철회 불가 |

---

## 증상 4: 트랜잭션 타임아웃 (5초 초과)

### 원인
비관적 락 대기 시간이 5초를 초과. 동시 승인 요청이 많을 때 발생.

### 진단
```bash
docker compose logs scheduler-service 2>&1 | grep -E "timeout|transaction|lock"
```

### 해결
- 보통 일시적 현상 — 재시도하면 해결
- 지속 발생 시 PostgreSQL 락 상태 확인:
```bash
docker compose exec postgres psql -U labnote -d labnote -c "
  SELECT pid, state, query, wait_event_type
  FROM pg_stat_activity
  WHERE datname = 'labnote' AND state = 'active';
"
```

---

## 증상 5: 예약 알림이 안 감

### 원인
notification 호출이 fire-and-forget으로 실패가 무시됨.

### 진단
```bash
# scheduler-service의 알림 호출 로그
docker compose logs scheduler-service 2>&1 | grep "notification"

# signature-audit-service (알림 담당)의 수신 로그
docker compose logs signature-audit-service 2>&1 | grep "notification"
```

### 해결
```bash
# signature-audit-service 상태 확인
docker compose ps signature-audit-service

# INTERNAL_SECRET 일치 확인
docker compose exec scheduler-service env | grep INTERNAL_SECRET
docker compose exec signature-audit-service env | grep INTERNAL_SECRET
```

---

## 증상 6: 장비 목록이 안 보임

### 원인
Resource 테이블에 데이터 없거나 orgId 필터.

### 진단
```bash
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, name, type, is_active, org_id FROM resources ORDER BY created_at;"
```

### 해결
```bash
# 시드 데이터 실행
docker exec labnote-scheduler npx prisma db seed

# 또는 수동 생성
# POST /api/scheduler/resources (Admin 권한 필요)
```

---

## 빠른 진단 체크리스트

```bash
# 1. 예약 현황
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT status, COUNT(*) FROM bookings GROUP BY status;"

# 2. 장비/회의실 목록
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, name, type, is_active FROM resources;"

# 3. 특정 장비의 예약 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT id, status, start_at, end_at FROM bookings WHERE resource_id = '<id>' AND start_at > NOW() ORDER BY start_at;"

# 4. scheduler-service 로그
docker compose logs --tail=30 scheduler-service
```
