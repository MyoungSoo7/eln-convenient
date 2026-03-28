# 실시간 협업 편집 트러블슈팅

## 증상 1: WebSocket 연결 실패

### 원인
CORS, 프록시 설정, 또는 JWT 토큰 오류.

### 진단
```bash
# 1. collab-service 기동 상태
docker compose ps collab-service
docker compose logs collab-service | tail -20

# 2. 브라우저 콘솔에서 WebSocket 에러 확인
# "WebSocket connection to 'ws://...' failed"

# 3. 직접 WebSocket 연결 테스트
# wscat 설치: npm install -g wscat
wscat -c "ws://localhost:8009/collab/notes/test-note?token=<jwt>"
```

### 해결
| 에러 | 원인 | 해결 |
|------|------|------|
| "Connection refused" | collab-service 미기동 | `docker compose up -d collab-service` |
| "401 Unauthorized" | JWT 토큰 만료/무효 | 새 토큰으로 재연결 |
| "CORS error" | Origin 불일치 | collab-service CORS 설정 확인 |
| "Upgrade failed" | 프록시가 WS 업그레이드 차단 | Nginx/프록시 WebSocket 설정 |

```bash
# CORS 설정 확인
docker compose logs collab-service | grep -i "cors\|origin"
```

> **참고**: collab-service는 :8009에서 직접 연결 (API Gateway 프록시 아님)

---

## 증상 2: 다른 사용자의 편집이 안 보임

### 원인
같은 인스턴스 내 브로드캐스트 실패 또는 Redis Pub/Sub 연결 문제.

### 진단
```bash
# 1. 같은 방(Room)에 사용자가 있는지 확인
docker compose logs collab-service 2>&1 | grep -E "joined|user-joined|room"

# 2. Redis Pub/Sub 동작 확인
docker compose exec redis redis-cli SUBSCRIBE labnote:collab
# 편집 시 메시지가 오는지 확인
```

### 해결
```bash
# 단일 인스턴스 모드인지 확인
docker compose logs collab-service 2>&1 | grep -E "Redis|pub.*sub|single"

# Redis 연결 재시도
docker compose restart collab-service
```

---

## 증상 3: 커서 위치/색상이 이상함

### 원인
awareness 메시지 동기화 문제 또는 색상 인덱스 충돌.

### 진단
```bash
# awareness 메시지 로그
docker compose logs collab-service 2>&1 | grep "awareness"

# 사용자 색상 할당 확인
docker compose logs collab-service 2>&1 | grep "colorIdx"
```

### 해결
- 색상은 0~7 (8명까지 고유 색상)
- 8명 초과 시 색상 재사용됨
- 페이지 새로고침으로 재연결하면 새 색상 배정

---

## 증상 4: 연결 끊김 후 재연결 안 됨

### 원인
프론트엔드 WebSocket 재연결 로직 미동작 또는 토큰 만료.

### 진단
```bash
# 브라우저 콘솔에서 확인
# WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED

# 서버 측 user-left 이벤트 확인
docker compose logs collab-service 2>&1 | grep "user-left"
```

### 해결
- 프론트엔드 재연결 로직 확인 (지수 백오프 + 토큰 갱신)
- 페이지 새로고침으로 수동 재연결
- 토큰이 만료되었다면 먼저 리프레시 후 재연결

---

## 증상 5: 편집 내용이 저장 안 됨

### 원인
WebSocket은 실시간 동기화만 담당. 저장은 별도 API 호출.

### 진단
```bash
# 프론트엔드에서 자동 저장(autosave) API 호출 확인
# Network 탭 → PUT /api/notes/:id 호출 확인
```

### 해결
- WebSocket `content-update`는 화면 동기화용 (영속성 없음)
- 실제 저장: `PUT /api/notes/:id` API 호출 필요
- 자동 저장 간격/트리거 확인 (디바운스, onBlur 등)

---

## 증상 6: 멀티 인스턴스에서 동기화 안 됨

### 원인
Redis Pub/Sub 미연결 → 각 인스턴스가 독립 동작.

### 진단
```bash
# 인스턴스별 로그 확인
docker compose logs collab-service 2>&1 | grep -E "Redis.*connect|pub.*sub"

# Redis 연결 상태
docker compose exec redis redis-cli CLIENT LIST | grep collab
```

### 해결
```bash
# Redis가 정상이면 각 인스턴스 재시작
docker compose restart collab-service

# Redis가 다운이면 단일 인스턴스 모드로 동작 (설계 의도)
# Redis 복구 후 자동 재연결됨
```

---

## 빠른 진단 체크리스트

```bash
# 1. collab-service 상태
docker compose ps collab-service
docker compose logs --tail=20 collab-service

# 2. WebSocket 포트 접근 가능 여부
curl -v http://localhost:8009/ 2>&1 | head -5

# 3. Redis Pub/Sub 동작
docker compose exec redis redis-cli PUBSUB CHANNELS "labnote:*"

# 4. 현재 활성 연결 수
docker compose logs collab-service 2>&1 | grep -c "user-joined"
```
