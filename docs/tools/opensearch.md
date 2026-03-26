# OpenSearch — 통합검색 엔진

## 접속 정보

| 항목 | 값 |
|------|-----|
| REST API | http://localhost:9200 |
| 보안 플러그인 | 비활성화 (`DISABLE_SECURITY_PLUGIN=true`) |

> OpenSearch는 별도 UI가 없다. REST API로 직접 확인하거나 Postman/curl을 사용한다.

## OpenSearch가 하는 일

연구노트, 프로토콜, 템플릿, 인벤토리를 **한국어 형태소 분석 기반으로 통합검색**하는 엔진.
PostgreSQL의 LIKE 검색으로는 불가능한 "산화환원" → "산화", "환원" 토큰 분리와 유사어 매칭을 제공한다.

## 인덱스 구조

### 통합 인덱스: `lab_search_v1` (별칭: `lab_search`)

모든 도메인 데이터가 하나의 인덱스에 `domainType` 필드로 구분되어 저장된다.

| 필드 | 타입 | 설명 |
|------|------|------|
| `docId` | keyword | 원본 엔티티 ID |
| `domainType` | keyword | `NOTE` / `PROTOCOL` / `TEMPLATE` / `INVENTORY` |
| `title` | text (한국어) | 제목 — nori 형태소 분석 |
| `content` | text (한국어) | 본문 |
| `summary` | text (한국어) | 요약 |
| `tags` | text + keyword | 태그 |
| `orgId` | keyword | 조직 ID (멀티테넌시 필터) |
| `ownerId` | keyword | 작성자 |
| `docStatus` | keyword | 문서 상태 |
| `createdAt` / `updatedAt` | date | 시간 |

### 한국어 분석기

```
analyzer: korean        → nori_tokenizer + nori_readingform + lowercase (색인용)
analyzer: korean_search → nori_tokenizer + nori_readingform + lowercase + nori_part_of_speech (검색용)
```

nori 플러그인은 컨테이너 시작 시 자동 설치된다 (`entrypoint`에서 `opensearch-plugin install analysis-nori`).

## 데이터 동기화 흐름

```
eln-service (노트 생성/수정/삭제)
  → searchClient.index({ id, doc }) ────→ search-service (/api/search/index)
  → searchClient.delete(id)              → OpenSearch (lab_search_v1)
                                            x-internal-secret 인증

inventory-service (시약/장비 변경)
  → searchClient.index({ id, doc }) ────→ search-service → OpenSearch
```

- 동기화는 **HTTP 내부 호출** (fire-and-forget, 실패해도 원본 작업은 성공)
- `x-internal-secret` 헤더로 서비스 간 인증

## 검색 흐름

```
브라우저 → API Gateway → search-service
                        ├─ GET /api/search?q=산화환원&type=NOTE
                        │   → OpenSearch multi_match 쿼리
                        │   → orgId 필터 자동 적용 (멀티테넌시)
                        │   → 검색 결과 + 하이라이트 반환
                        │
                        ├─ GET /api/search/autocomplete?q=산화
                        │   → prefix 쿼리 → 자동완성 후보
                        │
                        ├─ 검색 히스토리 (PostgreSQL)
                        └─ 즐겨찾기 (PostgreSQL)
```

## 연동 서비스

| 서비스 | 역할 |
|--------|------|
| **search-service** | OpenSearch 직접 접근. 인덱스 생성, 검색 쿼리, 벌크 인덱싱 |
| **eln-service** | 노트/프로토콜/템플릿 CRUD 시 search-service에 인덱싱 요청 |
| **inventory-service** | 시약/장비 변경 시 search-service에 인덱싱 요청 |

## 유용한 API 확인 명령어

```bash
# 인덱스 목록 및 문서 수
curl http://localhost:9200/_cat/indices?v

# 통합 인덱스 문서 수
curl http://localhost:9200/lab_search_v1/_count

# 샘플 문서 조회
curl http://localhost:9200/lab_search_v1/_search?size=3 | jq

# 한국어 분석 테스트
curl -X POST "http://localhost:9200/lab_search_v1/_analyze" \
  -H "Content-Type: application/json" \
  -d '{"analyzer":"korean","text":"산화환원반응 실험"}'

# 클러스터 상태
curl http://localhost:9200/_cluster/health?pretty
```

## 가장 중요하게 봐야 할 점

1. **문서 수 확인**: `curl http://localhost:9200/lab_search_v1/_count` — DB에 데이터가 있는데 여기가 0이면 동기화 장애. search-service 로그 확인 필요
2. **nori 플러그인 설치 여부**: 컨테이너 재생성 시 매번 설치됨. 설치 실패 시 한국어 검색이 영어처럼 공백 기준으로만 분리됨
3. **orgId 필터**: 모든 검색 쿼리에 orgId 조건이 포함되어야 한다. 누락 시 다른 조직 데이터 노출 (보안 위반)
4. **yellow 상태**: `replica=1`인데 노드가 1개라서 yellow. 단일 노드 환경에서는 정상. `OPENSEARCH_REPLICAS=0`으로 설정하면 green
5. **JVM 메모리**: `OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m` 기본값. 데이터 많아지면 1g~2g로 증설 필요
