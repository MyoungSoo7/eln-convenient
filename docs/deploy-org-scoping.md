# 조직 스코핑 (Org Scoping) 배포 가이드

## 아키텍처 현황

```
단일 PostgreSQL (labnote DB)
├── auth    스키마  ← User.orgId 이미 존재 (데이터 소스)
├── eln     스키마  ← Note, Template에 orgId 추가
├── inventory 스키마 ← InventoryItem, Category에 orgId 추가
├── files   스키마  ← File, ExportJob에 orgId 추가
├── signature 스키마 ← AuditLog, Notification, ExportJob에 orgId 추가
├── scheduler 스키마 ← Resource, Booking에 orgId 추가
└── search  스키마  ← SearchHistory, Favorite, SearchKeywordFavorite에 orgId 추가
```

모든 서비스가 같은 PostgreSQL 인스턴스를 사용하므로, cross-schema JOIN으로 기존 데이터의 orgId를 채울 수 있습니다.

---

## 1단계: 마이그레이션 실행

서비스 간 의존성이 없으므로 순서 무관하지만, 안전한 순서:

```
1. auth-service     — 변경 없음 (이미 orgId 존재), seed만 재실행
2. eln-service      — Note, Template
3. file-service     — File, ExportJob
4. inventory-service — InventoryItem, Category
5. signature-audit  — AuditLog, Notification, ExportJob
6. scheduler-service — Resource, Booking
7. search-service   — SearchHistory, Favorite, SearchKeywordFavorite
```

각 서비스에서 실행:

```bash
cd services/<service-name>
npx prisma migrate deploy
```

---

## 2단계: 기존 데이터 orgId 채우기 (Backfill)

마이그레이션 후 모든 orgId는 `''` (빈 문자열)입니다. auth 스키마의 User.orgId를 기준으로 cross-schema UPDATE를 실행합니다.

### 원칙

- 각 테이블의 "소유자 컬럼" (authorId, createdBy, uploaderId 등)으로 auth.User와 JOIN
- 소유자가 삭제된 레코드는 fallback 조직 ID 사용

### Backfill SQL

```sql
DO $$
DECLARE
  v_default_org TEXT;
BEGIN
  SELECT id INTO v_default_org
  FROM auth."Organization"
  ORDER BY "createdAt" ASC LIMIT 1;

  IF v_default_org IS NULL THEN
    RAISE EXCEPTION '조직이 없습니다. auth-service seed를 먼저 실행하세요.';
  END IF;

  -- ════════════════════════════════════════════════════════
  -- 1. eln 스키마
  -- ════════════════════════════════════════════════════════

  -- Note: authorId → User.orgId
  UPDATE eln."Note" n
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE n."authorId" = u.id AND n."orgId" = '';

  UPDATE eln."Note"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- Template: createdBy → User.orgId
  UPDATE eln."Template" t
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE t."createdBy" = u.id AND t."orgId" = '';

  UPDATE eln."Template"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- ════════════════════════════════════════════════════════
  -- 2. files 스키마 (테이블명: files, export_jobs)
  -- ════════════════════════════════════════════════════════

  UPDATE files.files f
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE f."uploaderId" = u.id AND f."orgId" = '';

  UPDATE files.files
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  UPDATE files.export_jobs e
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE e."requestedBy" = u.id AND e."orgId" = '';

  UPDATE files.export_jobs
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- ════════════════════════════════════════════════════════
  -- 3. inventory 스키마
  -- ════════════════════════════════════════════════════════

  UPDATE inventory."InventoryItem" i
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE i."createdBy" = u.id AND i."orgId" = '';

  UPDATE inventory."InventoryItem"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- Category는 createdBy가 없으므로 전부 기본 조직에 할당
  UPDATE inventory."Category"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- ════════════════════════════════════════════════════════
  -- 4. signature 스키마
  -- ════════════════════════════════════════════════════════

  UPDATE signature."AuditLog" a
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE a."actorId" = u.id AND a."orgId" = '';

  UPDATE signature."AuditLog"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  UPDATE signature."Notification" n
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE n."recipientId" = u.id AND n."orgId" = '';

  UPDATE signature."Notification"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  UPDATE signature."ExportJob" e
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE e."requestedBy" = u.id AND e."orgId" = '';

  UPDATE signature."ExportJob"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- ════════════════════════════════════════════════════════
  -- 5. scheduler 스키마 (테이블명: resources, bookings)
  -- ════════════════════════════════════════════════════════

  -- Resource: ownerId → User.orgId (ownerId가 null일 수 있음)
  UPDATE scheduler.resources r
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE r."ownerId" = u.id AND r."orgId" = '';

  UPDATE scheduler.resources
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  UPDATE scheduler.bookings b
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE b."userId" = u.id AND b."orgId" = '';

  UPDATE scheduler.bookings
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  -- ════════════════════════════════════════════════════════
  -- 6. search 스키마
  -- ════════════════════════════════════════════════════════

  UPDATE search."SearchHistory" s
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE s."userId" = u.id AND s."orgId" = '';

  UPDATE search."SearchHistory"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  UPDATE search."Favorite" f
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE f."userId" = u.id AND f."orgId" = '';

  UPDATE search."Favorite"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  UPDATE search."SearchKeywordFavorite" k
  SET "orgId" = u."orgId"
  FROM auth."User" u
  WHERE k."userId" = u.id AND k."orgId" = '';

  UPDATE search."SearchKeywordFavorite"
  SET "orgId" = v_default_org
  WHERE "orgId" = '';

  RAISE NOTICE 'orgId backfill 완료. 기본 조직: %', v_default_org;
END $$;
```

### Backfill 검증 쿼리

```sql
-- orgId가 아직 빈 문자열인 레코드가 없는지 확인 (모든 count가 0이어야 정상)
SELECT 'eln.Note' AS tbl, COUNT(*) FROM eln."Note" WHERE "orgId" = ''
UNION ALL
SELECT 'eln.Template', COUNT(*) FROM eln."Template" WHERE "orgId" = ''
UNION ALL
SELECT 'files.files', COUNT(*) FROM files.files WHERE "orgId" = ''
UNION ALL
SELECT 'files.export_jobs', COUNT(*) FROM files.export_jobs WHERE "orgId" = ''
UNION ALL
SELECT 'inventory.InventoryItem', COUNT(*) FROM inventory."InventoryItem" WHERE "orgId" = ''
UNION ALL
SELECT 'inventory.Category', COUNT(*) FROM inventory."Category" WHERE "orgId" = ''
UNION ALL
SELECT 'signature.AuditLog', COUNT(*) FROM signature."AuditLog" WHERE "orgId" = ''
UNION ALL
SELECT 'signature.Notification', COUNT(*) FROM signature."Notification" WHERE "orgId" = ''
UNION ALL
SELECT 'signature.ExportJob', COUNT(*) FROM signature."ExportJob" WHERE "orgId" = ''
UNION ALL
SELECT 'scheduler.resources', COUNT(*) FROM scheduler.resources WHERE "orgId" = ''
UNION ALL
SELECT 'scheduler.bookings', COUNT(*) FROM scheduler.bookings WHERE "orgId" = ''
UNION ALL
SELECT 'search.SearchHistory', COUNT(*) FROM search."SearchHistory" WHERE "orgId" = ''
UNION ALL
SELECT 'search.Favorite', COUNT(*) FROM search."Favorite" WHERE "orgId" = ''
UNION ALL
SELECT 'search.SearchKeywordFavorite', COUNT(*) FROM search."SearchKeywordFavorite" WHERE "orgId" = '';
```

---

## 3단계: OpenSearch 재색인

### 3-1. 인덱스 매핑 업데이트

search-service는 시작 시 `ensureIndices()`를 호출하므로 재시작만으로 orgId 매핑이 추가됩니다. 단, 기존 문서에는 orgId가 없으므로 재색인이 필요합니다.

```bash
docker restart labnote-search-service
```

### 3-2. 전체 재색인

DB에서 모든 문서를 읽어 OpenSearch에 다시 색인합니다. search-service의 `/api/search/index/bulk` 엔드포인트를 활용:

```bash
# eln-service의 모든 노트를 search-service에 재색인
curl -X POST http://search-service:8006/api/search/index/bulk \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: ${INTERNAL_SECRET}" \
  -d '{
    "docs": [
      {
        "id": "note-id-1",
        "doc": {
          "domainType": "NOTE",
          "orgId": "org-xxx",
          "title": "...",
          "content": "...",
          "tags": [],
          "ownerId": "user-xxx",
          "visibility": "private",
          "docStatus": "active",
          "createdAt": "...",
          "updatedAt": "..."
        }
      }
    ]
  }'
```

실제 운영에서는 일괄 처리 스크립트 작성을 권장합니다:

```typescript
// scripts/reindex-opensearch.ts
// 1. eln DB에서 모든 Note를 500개씩 페이지네이션으로 읽기
// 2. bulk API로 search-service에 전송
// 3. inventory DB에서 모든 InventoryItem을 같은 방식으로 전송
```

---

## 4단계: 배포 체크리스트

### 배포 전

- [ ] DB 백업 (`pg_dump`)
- [ ] 서비스 전체 중지 또는 유지보수 모드 전환

### 마이그레이션 (서비스 중지 상태)

- [ ] 각 서비스 `prisma migrate deploy` 실행 (6개)
- [ ] Backfill SQL 실행
- [ ] 검증 쿼리로 `orgId = ''` 레코드 0건 확인
- [ ] auth-service seed 재실행 (`admin role → ['*']` 반영)

### 서비스 기동

- [ ] auth-service 시작
- [ ] api-gateway 시작 (orgId 필수화 적용)
- [ ] 나머지 서비스 시작
- [ ] search-service 시작 (`ensureIndices`로 매핑 업데이트)

### 검증

- [ ] 로그인 → JWT에 orgId 포함 확인
- [ ] api-gateway가 orgId 없는 토큰 차단 확인
- [ ] 각 서비스 API 호출 시 org 필터링 동작 확인
- [ ] OpenSearch 재색인 실행
- [ ] 검색 결과에 타 조직 데이터 미노출 확인

### 롤백 계획

- [ ] orgId 컬럼은 `DEFAULT ''`이므로 코드만 롤백하면 기존 동작 복원
- [ ] 인덱스 롤백: 새 인덱스 DROP → 기존 인덱스 재생성
- [ ] OpenSearch: orgId 필터 없는 코드로 롤백 시 자동 복원

---

## 다운타임 최소화 전략 (무중단 배포)

orgId 컬럼이 `NOT NULL DEFAULT ''`이므로 무중단 배포가 가능합니다:

```
Phase A (코드 배포 전, 서비스 가동 중):
  1. ALTER TABLE ADD COLUMN 실행
     → 기존 코드는 orgId를 무시하므로 영향 없음
  2. Backfill SQL 실행
     → 기존 레코드에 orgId 채우기

Phase B (코드 배포):
  3. 새 코드 롤링 배포
     → 이제 orgId 필터링 시작
  4. OpenSearch 재색인
```

이 방식이면 다운타임 0으로 전환 가능합니다.
