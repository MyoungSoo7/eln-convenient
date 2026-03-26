# Redis Stream Event Agent

서비스 간 Redis Stream 이벤트를 추가한다.

## 역할
- 이벤트 타입 정의 (`@lab/shared` ServiceEventType)
- Publisher (발행) 코드 생성
- Consumer (구독) 코드 생성
- HTTP 폴백 엔드포인트 안내

## 이벤트 아키텍처

```
[Publisher Service]
    │
    ├─── Redis Stream (XADD) ──→ [Consumer Service] (XREADGROUP)
    │
    └─── HTTP POST (폴백) ──────→ [Consumer Service] (/internal/events)
```

- 기본: Redis Stream 비동기 처리
- 폴백: Redis 실패 시 HTTP 직접 호출
- 인증: `x-internal-secret` 헤더

## 기존 이벤트 맵

| 이벤트 | 발행자 | 구독자 | Stream Key |
|--------|--------|--------|-----------|
| note.created | eln-service | search-service | eln-events |
| note.updated | eln-service | search-service | eln-events |
| note.signed | signature-audit | eln-service | signature-events |
| note.locked | eln-service | signature-audit | eln-events |
| inventory.updated | inventory-service | search-service | inventory-events |
| export.completed | signature-audit | (알림) | signature-events |

## 코드 패턴

### 1. ServiceEventType 등록 (shared/src/index.ts)
```typescript
export const ServiceEventType = {
  NOTE_CREATED: 'note.created',
  NOTE_UPDATED: 'note.updated',
  NOTE_SIGNED: 'note.signed',
  // 새 이벤트 추가
  NEW_EVENT: 'new.event',
} as const;
```

### 2. 이벤트 발행 (Publisher)
```typescript
import { buildServiceEvent, ServiceEventType } from '@lab/shared';
import { redis } from '../lib/redis';

// Stream에 이벤트 발행
await redis.xadd(
  'service-events-stream',
  '*',
  'event', JSON.stringify(
    buildServiceEvent(ServiceEventType.NEW_EVENT, {
      id: entity.id,
      orgId: entity.orgId,
      // 필요한 페이로드
    })
  )
);
```

### 3. 이벤트 소비 (Consumer)
```typescript
// src/events/eventConsumer.ts 또는 index.ts 내
async function processEvent(event: ServiceEvent) {
  switch (event.type) {
    case ServiceEventType.NEW_EVENT:
      await handleNewEvent(event.data);
      break;
  }
}
```

### 4. HTTP 폴백 엔드포인트
```typescript
// Consumer 서비스의 라우트
app.post('/internal/events', {
  preHandler: [validateInternalSecret]
}, async (req, reply) => {
  await processEvent(req.body);
  reply.send({ ok: true });
});
```

## 실행

$ARGUMENTS 를 이벤트 요구사항으로 받는다.
형식: `<이벤트명> <발행 서비스> <구독 서비스> [페이로드 설명]`
예시: `inventory.low_stock inventory-service search-service "재고 부족 알림, itemId와 currentQty 포함"`

### 절차
1. `@lab/shared`의 `ServiceEventType`에 새 이벤트 타입 추가
2. 발행 서비스에 XADD 코드 삽입 (적절한 위치에)
3. 구독 서비스의 eventConsumer에 핸들러 추가
4. HTTP 폴백 엔드포인트 확인/추가
5. docker-compose.yml에서 Redis 의존성 확인

## 체크리스트
- [ ] `ServiceEventType`에 이벤트 타입 상수 등록
- [ ] `buildServiceEvent()` 사용하여 이벤트 생성
- [ ] Consumer group 설정 확인
- [ ] HTTP 폴백 경로 존재
- [ ] `x-internal-secret` 인증 적용
- [ ] 이벤트 페이로드에 `orgId` 포함 (멀티테넌시)
