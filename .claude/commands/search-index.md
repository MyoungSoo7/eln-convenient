# OpenSearch Index Management Agent

OpenSearch 인덱스를 관리하고 검색 품질을 점검한다.

## 역할
- 인덱스 매핑 확인 및 수정
- 재인덱싱 실행
- 한국어 분석기 테스트
- 검색 쿼리 디버깅

## 인덱스 구조

| 인덱스 | 용도 | 주요 필드 |
|--------|------|----------|
| notes | 연구노트/프로토콜 검색 | title, content, author, orgId, type, status, tags |
| inventory | 시약/장비 검색 | name, category, location, orgId, barcode |

### 분석기 설정
- `nori_analyzer`: 한국어 형태소 분석 (nori 플러그인)
- `standard`: 영문/범용
- `autocomplete_analyzer`: 자동완성용 edge_ngram

## 명령어 참조

### 인덱스 상태 확인
```bash
# 전체 인덱스 목록
curl -s http://localhost:9200/_cat/indices?v

# 특정 인덱스 매핑
curl -s http://localhost:9200/notes/_mapping | jq .

# 인덱스 통계
curl -s http://localhost:9200/notes/_stats | jq '.indices.notes.primaries.docs'
```

### 분석기 테스트
```bash
# 한국어 형태소 분석 테스트
curl -s -X POST http://localhost:9200/notes/_analyze -H 'Content-Type: application/json' -d '{
  "analyzer": "nori_analyzer",
  "text": "테스트할 텍스트"
}' | jq '.tokens[].token'

# 자동완성 분석기 테스트
curl -s -X POST http://localhost:9200/notes/_analyze -H 'Content-Type: application/json' -d '{
  "analyzer": "autocomplete_analyzer",
  "text": "테스트"
}' | jq '.tokens[].token'
```

### 검색 쿼리 테스트
```bash
# 기본 검색
curl -s -X POST http://localhost:9200/notes/_search -H 'Content-Type: application/json' -d '{
  "query": {
    "multi_match": {
      "query": "검색어",
      "fields": ["title^2", "content"],
      "analyzer": "nori_analyzer"
    }
  },
  "size": 5
}' | jq '.hits.hits[]._source.title'

# orgId 필터 포함 검색
curl -s -X POST http://localhost:9200/notes/_search -H 'Content-Type: application/json' -d '{
  "query": {
    "bool": {
      "must": [{ "multi_match": { "query": "검색어", "fields": ["title^2", "content"] }}],
      "filter": [{ "term": { "orgId": "org-id-here" }}]
    }
  }
}' | jq '.hits.total'
```

### 인덱스 재생성
```bash
# 인덱스 삭제 (주의: 데이터 손실)
curl -s -X DELETE http://localhost:9200/notes

# search-service 재시작으로 인덱스 재생성
cd services && docker compose restart search
```

### 문서 수동 색인
```bash
curl -s -X POST http://localhost:9200/notes/_doc -H 'Content-Type: application/json' -d '{
  "title": "테스트 문서",
  "content": "내용",
  "orgId": "test-org",
  "type": "note",
  "status": "draft",
  "createdAt": "2024-01-01T00:00:00Z"
}'
```

## 실행

$ARGUMENTS 를 작업 요청으로 받는다.

### 지원 작업
- **상태 확인**: `status` — 인덱스 목록, 문서 수, 클러스터 헬스
- **매핑 확인**: `mapping <인덱스명>` — 필드 매핑 상세
- **분석 테스트**: `analyze <텍스트>` — 한국어 형태소 분석 결과
- **검색 테스트**: `search <인덱스> <검색어>` — 검색 결과 확인
- **재인덱싱**: `reindex <인덱스>` — 인덱스 삭제 후 재생성 (확인 후 진행)
- **자연어**: "notes 인덱스에 tags 필드 추가해줘"

### 주의사항
- 인덱스 삭제는 사용자 확인 후 진행
- 재인덱싱 후 search-service 재시작 필요
- 프로덕션 데이터에 대한 작업은 항상 확인 요청
- orgId 필터 없는 검색은 멀티테넌시 위반 — 테스트 시에만 허용
