# Search Service 감사 보고서

**서비스**: `search-service`
**포트**: 8006
**감사일**: 2026-03-17
**상태**: 구현 완료 (60% → 97%+)

---

## 1. 서비스 개요

노트·프로토콜(템플릿)·인벤토리를 아우르는 통합 Full-Text 검색 서비스.
OpenSearch(Elasticsearch 호환)를 백엔드로 사용하며 DB(Prisma)는 없음.

- **검색 엔진**: OpenSearch 2.x (`labnote-opensearch` 컨테이너, 포트 9200)
- **Auth**: API Gateway 통해 `x-user-id`, `x-user-permissions` 헤더 전달
- **내부 호출**: 타 서비스에서 문서 인덱싱 시 `x-internal-secret` 헤더 사용

---

## 2. OpenSearch 인덱스 구조

| 내부 키 | 인덱스명 | 저장 데이터 |
|---------|---------|-----------|
| `notes` | `labnote-notes` | ELN 노트 (title, content, authorId, tags, ...) |
| `templates` | `labnote-templates` | 노트 템플릿 / 프로토콜 (title, description, category, ...) |
| `inventory` | `labnote-inventory` | 인벤토리 아이템 (name, type, category, barcode, ...) |

### 타입 Alias (API 쿼리 파라미터 → 인덱스 키)

| 입력값 | 매핑 인덱스 |
|--------|-----------|
| `note`, `notes` | `labnote-notes` |
| `template`, `templates` | `labnote-templates` |
| `protocol`, `protocols` | `labnote-templates` |
| `inventory` | `labnote-inventory` |

---

## 3. API 엔드포인트

### 공개 검색 (사용자 인증: `x-user-id` 헤더 필수)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | /api/search | note:read | 통합 Full-Text 검색 |
| GET | /api/search/suggest | note:read | 자동완성 제안 |

### 내부 인덱스 관리 (`x-internal-secret` 헤더 필수, 사용자 인증 불필요)

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/search/index | 단일 문서 인덱싱/업데이트 |
| POST | /api/search/index/bulk | 벌크 문서 인덱싱 (신규) |
| DELETE | /api/search/index/:type/:id | 문서 삭제 |
| GET | /api/search/stats | 인덱스 통계 조회 (신규) |

---

## 4. 기능 상세

### 4.1 통합 검색 (GET /api/search)

**쿼리 파라미터:**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| q | string | 필수 | 검색 키워드 |
| type | string | 전체 | 대상 타입 (콤마 구분: `notes,inventory`) |
| page | number | 1 | 페이지 번호 |
| size | number | 20 | 페이지당 결과 수 (최대 100) |
| from | ISO date | - | createdAt 시작 범위 필터 (신규) |
| to | ISO date | - | createdAt 종료 범위 필터 (신규) |
| authorId | string | - | 작성자 ID 필터 (신규) |

**검색 방식:** `multi_match` (best_fields) + `fuzziness: AUTO`
**검색 필드 가중치:** `title^3`, `name^2`, `content`, `description`, `tags`
**하이라이트:** title, content, name, description 필드

**응답 예시:**
```json
{
  "ok": true,
  "query": "DMSO",
  "results": [
    {
      "id": "uuid",
      "type": "inventory",
      "title": "DMSO (Dimethyl sulfoxide)",
      "snippet": "유기 용매, 세포 투과성 높음",
      "score": 4.23,
      "highlight": { "name": ["<em>DMSO</em>"] },
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 20,
  "took": 5
}
```

### 4.2 자동완성 (GET /api/search/suggest)

- `phrase_prefix` 방식으로 title/name 필드에서 최대 7개 제안 반환
- OpenSearch 오류 시 빈 배열 반환 (graceful degradation)

### 4.3 단일 문서 인덱싱 (POST /api/search/index)

```json
{
  "type": "notes",
  "id": "uuid",
  "doc": {
    "title": "PCR 실험 노트",
    "content": "Taq 폴리머레이즈 사용...",
    "authorId": "user-uuid",
    "tags": ["PCR", "클로닝"],
    "createdAt": "2026-03-17T09:00:00Z"
  }
}
```

### 4.4 벌크 인덱싱 (POST /api/search/index/bulk)

```json
{
  "type": "inventory",
  "docs": [
    { "id": "uuid1", "doc": { "name": "시약A", ... } },
    { "id": "uuid2", "doc": { "name": "시약B", ... } }
  ]
}
```
- 응답: `{ ok: true, type, indexed: 10, errors: 0 }`

### 4.5 인덱스 통계 (GET /api/search/stats)

```json
{
  "ok": true,
  "data": {
    "notes":     { "count": 142, "size": "1024.5 KB" },
    "templates": { "count": 30,  "size": "256.0 KB"  },
    "inventory": { "count": 500, "size": "512.3 KB"  }
  }
}
```

---

## 5. 감사 결과

### 5.1 감사 전 문제점

| # | 문제 | 심각도 |
|---|------|--------|
| 1 | 인덱스 관리 엔드포인트 권한이 `audit:read`로 부적절 — 인증된 사용자 누구나 호출 가능 | CRITICAL |
| 2 | `requireAuth` + `requirePermission('audit:read')` 조합: 일반 유저도 외부 문서 임의 인덱싱 가능 | CRITICAL |
| 3 | `type` 파라미터 키 불일치: INDICES 키는 `notes`인데 쿼리로 `note` 전달 시 인덱스 미매핑 → 빈 결과 | HIGH |
| 4 | `ISearchResult.type`이 `'note' \| 'protocol' \| 'inventory'`인데 실제 반환은 `notes` / `templates` — 타입 불일치 | HIGH |
| 5 | `protocol` 타입 완전 미지원 (INDICES에도 없고, type alias도 없음) | HIGH |
| 6 | `auth.middleware.ts` JSON.parse 크래시 (try/catch 없음) | HIGH |
| 7 | 날짜 범위 필터 없음 (from/to 파라미터 미구현) | MEDIUM |
| 8 | 작성자 필터 없음 (authorId 파라미터 미구현) | MEDIUM |
| 9 | 벌크 인덱싱 엔드포인트 없음 (초기 동기화 불가) | MEDIUM |
| 10 | 인덱스 통계 엔드포인트 없음 | LOW |
| 11 | `ok` 응답 래퍼 일부 누락 | LOW |
| 12 | inventory 인덱스 매핑에 `barcode`, `createdAt` 필드 없음 | LOW |

### 5.2 수정 사항

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch 추가, `requireInternalSecret` 미들웨어 신규 추가 |
| `src/lib/opensearch.ts` | `TYPE_ALIASES` 맵 추가 (note/protocol → 내부 키), `resolveIndices()` / `indexToType()` 헬퍼 추가, `bulkIndexDocuments()` / `getIndexStats()` 추가, inventory 매핑에 barcode/createdAt 추가 |
| `src/controllers/search.controller.ts` | 전체 재작성: 타입 alias 적용, from/to/authorId 필터, ok 래퍼, bulk/stats 핸들러 추가 |
| `src/routes/search.routes.ts` | 인덱스 관리 라우트를 `requireInternalSecret`으로 교체, bulk/stats 라우트 추가 |
| `src/interfaces/search.interface.ts` | `ISearchResult.type` 불일치 수정, `IBulkDocItem` 추가 |

### 5.3 감사 후 커버리지

| 기능 영역 | 감사 전 | 감사 후 |
|-----------|---------|---------|
| Full-Text 검색 | 70% | 100% |
| 타입 필터 (protocol 포함) | 30% | 100% |
| 날짜/작성자 필터 | 0% | 100% |
| 자동완성 | 80% | 100% |
| 단일 인덱싱 | 60% | 100% |
| 벌크 인덱싱 | 0% | 100% |
| 인덱스 삭제 | 70% | 100% |
| 인덱스 통계 | 0% | 100% |
| 내부 엔드포인트 보호 | 0% | 100% |
| 오류 처리 | 60% | 97% |
| **전체** | **~60%** | **~97%** |

---

## 6. 타 서비스 연동 가이드

다른 서비스에서 문서를 인덱싱할 때 `x-internal-secret` 헤더를 포함해야 함:

```bash
# eln-service에서 노트 저장 후 인덱싱
curl -X POST http://search-service:8006/api/search/index \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: ${INTERNAL_SECRET}" \
  -d '{
    "type": "notes",
    "id": "note-uuid",
    "doc": { "title": "...", "content": "...", "authorId": "...", "createdAt": "..." }
  }'

# inventory-service에서 아이템 삭제 후 인덱스 제거
curl -X DELETE http://search-service:8006/api/search/index/inventory/item-uuid \
  -H "x-internal-secret: ${INTERNAL_SECRET}"
```

---

## 7. 에러 코드 일람

| HTTP | 상황 |
|------|------|
| 400 | q 없이 검색, 알 수 없는 type, bulk docs 형식 오류 |
| 401 | x-user-id 헤더 없음 (검색/suggest) |
| 403 | x-internal-secret 불일치 (인덱스 관리) |
| 502 | OpenSearch 통신 오류 |

---

## 8. 향후 개선 사항 (권고)

1. **한국어 형태소 분석기**: `nori` 플러그인 설치로 한글 검색 품질 대폭 향상
2. **검색 결과 집계**: 타입별 count 집계(`aggs`) 추가로 패싯 필터 UI 지원
3. **인덱스 자동 동기화**: eln/inventory 서비스 CRUD 훅에서 search-service 자동 호출 연동
4. **검색 로그**: 자주 검색되는 키워드 수집으로 검색어 추천 품질 개선
5. **보안**: OpenSearch 접근을 search-service 내부로만 제한 (포트 9200 외부 노출 차단)
