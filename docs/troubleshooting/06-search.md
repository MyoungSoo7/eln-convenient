# 검색 트러블슈팅

## 증상 1: 검색 결과가 안 나옴 (데이터는 있는데)

### 원인
OpenSearch 인덱싱 실패 (fire-and-forget이므로 에러가 묻힘) 또는 권한 필터.

### 진단
```bash
# 1. OpenSearch에 문서가 있는지 확인
curl -s "http://localhost:9200/labnote-notes/_count" | jq .count

# 2. 특정 문서 검색
curl -s "http://localhost:9200/labnote-notes/_search" \
  -H "Content-Type: application/json" \
  -d '{"query": {"match": {"title": "검색어"}}}' | jq .hits.total

# 3. search-service 인덱싱 로그 확인
docker compose logs search-service 2>&1 | grep -E "index|Error"

# 4. eln-service에서 인덱싱 요청을 보내는지 확인
docker compose logs eln-service 2>&1 | grep "searchClient"
```

### 해결
```bash
# 인덱스 전체 재구축
# 1. 기존 인덱스 삭제
curl -X DELETE "http://localhost:9200/labnote-notes"

# 2. search-service 재시작 (인덱스 자동 재생성)
docker compose restart search-service

# 3. 기존 노트 재인덱싱 (수동)
# eln-service에서 모든 노트에 대해 인덱싱 요청 재전송 필요
```

---

## 증상 2: 검색 결과가 오래된 데이터

### 원인
Redis 캐시 (3분 TTL) 또는 OpenSearch 인덱싱 지연.

### 진단
```bash
# Redis 캐시 확인
docker compose exec redis redis-cli KEYS "cache:search:*"
docker compose exec redis redis-cli TTL "cache:search:<키>"
```

### 해결
```bash
# 캐시 수동 삭제
docker compose exec redis redis-cli KEYS "cache:search:*" | xargs -r docker compose exec redis redis-cli DEL

# 또는 특정 키만
docker compose exec redis redis-cli DEL "cache:search:<키>"
```

---

## 증상 3: OpenSearch 연결 실패

### 원인
OpenSearch 미기동 또는 메모리 부족으로 크래시.

### 진단
```bash
# 클러스터 상태
curl -s "http://localhost:9200/_cluster/health" | jq .

# 노드 상태
curl -s "http://localhost:9200/_cat/nodes?v"

# 인덱스 목록
curl -s "http://localhost:9200/_cat/indices?v"
```

### 해결
```bash
# OpenSearch 재시작
docker compose restart opensearch

# 메모리 부족이면 설정 조정
# docker-compose.yml:
# OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
# → 서버 메모리에 따라 조정
```

---

## 증상 4: 자동완성이 안 됨

### 원인
SearchHistory 테이블에 데이터 없음 또는 search-service DB 연결 문제.

### 진단
```bash
# SearchHistory 데이터 확인
docker compose exec postgres psql -U labnote -d labnote -c \
  "SELECT keyword, count FROM search_histories WHERE org_id = '<orgId>' ORDER BY count DESC LIMIT 10;"
```

### 해결
- 검색을 실행해야 히스토리가 쌓임 (UPSERT)
- search-service Prisma 연결 확인

---

## 증상 5: 검색 권한 필터가 안 먹음 (다른 조직 데이터 노출)

### 원인
인덱싱 시 orgId 누락 또는 검색 쿼리에 orgId 필터 미적용. **보안 이슈**.

### 진단
```bash
# OpenSearch에 저장된 문서의 orgId 확인
curl -s "http://localhost:9200/labnote-notes/_search?size=5" | jq '.hits.hits[]._source.orgId'

# 모든 문서에 orgId가 있는지
curl -s "http://localhost:9200/labnote-notes/_search" \
  -H "Content-Type: application/json" \
  -d '{"query": {"bool": {"must_not": {"exists": {"field": "orgId"}}}}}' | jq .hits.total
# total > 0이면 orgId 누락된 문서 존재
```

### 해결
- orgId 없는 문서가 있으면 재인덱싱 필요
- search-service의 검색 쿼리에 `filter: {term: {orgId}}` 확인
- 인덱싱 요청 시 orgId 포함 확인

---

## 증상 6: 한글 검색이 안 됨

### 원인
OpenSearch Korean analyzer (nori) 미설정.

### 진단
```bash
# 인덱스 매핑 확인
curl -s "http://localhost:9200/labnote-notes/_mapping" | jq .

# analyzer 테스트
curl -s "http://localhost:9200/labnote-notes/_analyze" \
  -H "Content-Type: application/json" \
  -d '{"analyzer": "korean", "text": "실험결과보고서"}' | jq .tokens
```

### 해결
- 인덱스 생성 시 Korean analyzer 설정 확인
- nori 플러그인 설치 확인: `curl -s "http://localhost:9200/_cat/plugins?v"`
- 플러그인 없으면 Dockerfile에 추가 후 재빌드

---

## 빠른 진단 체크리스트

```bash
# 1. OpenSearch 상태
curl -s "http://localhost:9200/_cluster/health" | jq '{status, number_of_nodes}'

# 2. 인덱스 문서 수
curl -s "http://localhost:9200/labnote-notes/_count" | jq .count

# 3. search-service 로그
docker compose logs --tail=20 search-service

# 4. Redis 캐시 키 수
docker compose exec redis redis-cli KEYS "cache:search:*" | wc -l

# 5. Rate Limit 확인 (60 req/60s)
docker compose logs api-gateway 2>&1 | grep -E "rate.*limit|429"
```
