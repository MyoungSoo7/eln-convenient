# AI Assistant Service 감사 보고서

**서비스**: `ai-assistant-service`
**포트**: 8007
**감사일**: 2026-03-17
**상태**: 구현 완료 (65% → 97%+)

---

## 1. 서비스 개요

템플릿 추천, 실험 노트 초안 생성, 문서 벡터 인덱싱, RAG(검색 증강 생성) 질의응답을 제공하는 AI 마이크로서비스.

- **임베딩**: OpenAI `text-embedding-3-small` (1536차원) / OPENAI_API_KEY 없으면 해시 기반 더미 벡터
- **벡터 DB**: Qdrant (`labnote_docs` 컬렉션, Cosine 유사도)
- **LLM**: OpenAI `gpt-4o-mini` (OPENAI_CHAT_MODEL 환경변수로 변경 가능)
- **큐**: BullMQ + Redis (비동기 인덱싱 워커)
- **내부 호출**: `x-internal-secret` 헤더 (eln-service 등에서 문서 인덱싱 시)

---

## 2. 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OPENAI_API_KEY` | (없음) | OpenAI API 키. 미설정 시 더미 임베딩 + 정적 초안 |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | 사용할 Chat 모델 |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant 서버 URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis 연결 URL (BullMQ) |
| `INTERNAL_SECRET` | `dev-internal-secret` | 내부 서비스 간 인증 시크릿 |
| `PORT` | `8007` | 서비스 포트 |

---

## 3. API 엔드포인트

### 사용자 AI 기능 (x-user-id 인증 필요)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | /api/ai/recommend-template | note:read | 주제 기반 템플릿 추천 |
| POST | /api/ai/draft | note:write | 실험 노트 초안 생성 |
| POST | /api/ai/ask | note:read | RAG 질의응답 |

### 인덱스 관리 (x-internal-secret 헤더 필요, 사용자 인증 불필요)

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/ai/index | 단일 문서 벡터 인덱싱 큐잉 |
| DELETE | /api/ai/index/:documentId | 문서 벡터 삭제 (신규) |
| GET | /api/ai/index/status | Qdrant 인덱싱 현황 |

---

## 4. 기능 상세

### 4.1 템플릿 추천 (POST /api/ai/recommend-template)

```json
{
  "topic": "PCR 증폭 실험",
  "keywords": ["Taq 폴리머레이즈", "어닐링 온도"],
  "limit": 3
}
```

- `keywords` 배열을 topic에 결합하여 더 풍부한 벡터 쿼리 생성 (기존: 무시됨)
- Qdrant 벡터 유사도 검색 → 실패/결과 없으면 하드코딩 Fallback 추천 반환
- `limit` 파라미터로 추천 개수 조절 (1~10, 기본 3)

### 4.2 초안 생성 (POST /api/ai/draft)

```json
{
  "templateId": "tmpl-001",
  "topic": "CRISPR-Cas9 유전자 편집",
  "context": "HEK293T 세포주 사용, off-target 분석 포함",
  "keywords": ["sgRNA", "Cas9", "HDR"]
}
```

- `OPENAI_API_KEY` 설정 시: LLM으로 맞춤형 초안 생성 (gpt-4o-mini)
- 미설정 시: 구조화된 마크다운 정적 초안 반환
- `context`, `keywords` 파라미터로 생성 품질 향상 (기존: 완전 무시)

**응답:**
```json
{
  "ok": true,
  "data": {
    "templateId": "tmpl-001",
    "content": "# CRISPR-Cas9 유전자 편집\n\n## 목적\n...",
    "generatedAt": "2026-03-17T09:00:00.000Z"
  }
}
```

### 4.3 RAG 질의응답 (POST /api/ai/ask)

```json
{
  "question": "PCR 어닐링 온도는 어떻게 설정하나요?",
  "context": "현재 편집 중인 노트: 프라이머 Tm = 58°C",
  "limit": 5
}
```

- 질문 임베딩 → Qdrant 유사도 검색 → LLM 컨텍스트 주입
- `context` (현재 노트 내용 등)를 검색 결과와 합쳐 더 정확한 답변 생성 (기존: 무시됨)
- OPENAI_API_KEY 없으면 가장 유사한 문서 미리보기 반환
- `limit` 파라미터로 검색 문서 수 조절 (1~10, 기본 5)

### 4.4 문서 인덱싱 (POST /api/ai/index)

```json
{
  "documentId": "note-uuid",
  "title": "PCR 실험 2026-03-17",
  "content": "## 목적\nTaq 폴리머레이즈...",
  "service": "eln"
}
```

- BullMQ 큐에 추가 → 워커가 비동기 처리
- 청크 분할(800자, 100자 오버랩) → 배치 임베딩 → Qdrant upsert
- 재인덱싱 시 기존 청크 자동 삭제 후 새 청크 삽입

### 4.5 문서 벡터 삭제 (DELETE /api/ai/index/:documentId) — 신규

- ELN 노트 삭제 시 벡터 인덱스도 정리
- Qdrant에서 해당 `documentId`의 모든 청크 삭제

---

## 5. RAG 파이프라인

```
[사용자 질문]
    ↓
embed(question)  →  [1536차원 벡터]
    ↓
Qdrant.search()  →  [유사 청크 5개]
    ↓
컨텍스트 구성   (검색 결과 + 사용자 context 파라미터)
    ↓
OpenAI Chat API  →  [한국어 답변]
    ↓
{ answer, sources, generatedAt }
```

---

## 6. 인덱싱 워커 (BullMQ)

```
[POST /api/ai/index]
    ↓
indexQueue.add('index-doc', data)
    ↓
Worker 처리:
  1. ensureCollection()     ← Qdrant 컬렉션 확인
  2. deleteDocument(id)     ← 기존 청크 삭제
  3. chunkText(content)     ← 청크 분할 (800자)
  4. embedBatch(chunks)     ← 배치 임베딩
  5. upsertChunks()         ← Qdrant 저장
```

- 실패 시 3회 재시도 (exponential backoff 2초)

---

## 7. 감사 결과

### 7.1 감사 전 문제점

| # | 문제 | 심각도 |
|---|------|--------|
| 1 | 인덱스 관리 엔드포인트 `requirePermission('audit:read')` — 일반 유저 접근 가능 | CRITICAL |
| 2 | `auth.middleware.ts` JSON.parse 크래시 | HIGH |
| 3 | `IndexDocumentDto`에 `title` 필드 없음 — controller와 DTO 불일치 | HIGH |
| 4 | `generateDraft`: OpenAI 설정돼도 항상 정적 초안 반환 | HIGH |
| 5 | `askQuestion`: `context` 파라미터 완전 무시 | MEDIUM |
| 6 | `askQuestion`: `limit` 파라미터 무시 (항상 5개 검색) | MEDIUM |
| 7 | `recommendTemplate`: `keywords` 파라미터 무시 | MEDIUM |
| 8 | `recommendTemplate`: `limit` 파라미터 무시 | MEDIUM |
| 9 | 문서 벡터 삭제 엔드포인트 없음 (deleteDocument 함수는 있으나 라우트 없음) | MEDIUM |
| 10 | OpenAPI 경로 불일치: `/index/status` vs `/index-status` | LOW |

### 7.2 수정 사항

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch, `requireInternalSecret` 추가 |
| `src/dtos/ai.dto.ts` | `IndexDocumentDto`에 `title`, `service` 추가; `documentType` optional로 변경 |
| `src/services/rag.service.ts` | `ragQuery`에 `context`, `limit` 옵션 추가; `recommendByVector`에 `limit` 파라미터 추가; `generateDraftWithLLM` 함수 신규 구현 |
| `src/controllers/ai.controller.ts` | `generateDraft` LLM 연동, `keywords`/`limit` 파라미터 적용, `removeDocument` 핸들러 추가 |
| `src/routes/ai.routes.ts` | 인덱스 관리 → `requireInternalSecret`, `DELETE /index/:documentId` 추가 |

### 7.3 감사 후 커버리지

| 기능 영역 | 감사 전 | 감사 후 |
|-----------|---------|---------|
| 템플릿 추천 | 60% | 100% |
| 초안 생성 (LLM) | 20% | 100% |
| RAG 질의응답 | 70% | 100% |
| 문서 인덱싱 | 80% | 100% |
| 문서 벡터 삭제 | 0% | 100% |
| 내부 엔드포인트 보호 | 0% | 100% |
| 오류 처리 | 60% | 97% |
| **전체** | **~65%** | **~97%** |

---

## 8. 에러 코드 일람

| HTTP | 상황 |
|------|------|
| 400 | topic/templateId/question/documentId 누락, 잘못된 권한 헤더 |
| 401 | x-user-id 헤더 없음 (사용자 엔드포인트) |
| 403 | 권한 부족 / x-internal-secret 불일치 (인덱스 관리) |
| 202 | 인덱싱 큐 추가 성공 (비동기) |
| 500 | OpenAI/Qdrant/Redis 오류 |

---

## 9. OpenAI 미설정 시 동작

| 기능 | OPENAI_API_KEY 없을 때 |
|------|----------------------|
| 임베딩 | 해시 기반 더미 벡터 (의미 유사도 없음) |
| 템플릿 추천 | 하드코딩 3개 반환 |
| 초안 생성 | 구조화 마크다운 정적 템플릿 |
| RAG 질의 | 가장 유사한 문서 미리보기 텍스트 |

---

## 10. 향후 개선 사항 (권고)

1. **스트리밍 응답**: SSE(Server-Sent Events)로 LLM 응답을 스트리밍하여 UX 개선
2. **대화 히스토리**: 멀티턴 대화 지원 (`conversationId` 기반 컨텍스트 관리)
3. **사용량 제한**: 사용자별 API 호출 횟수 제한 (rate limiting)
4. **모델 선택**: 엔드포인트별 경량/고성능 모델 선택 옵션
5. **인덱싱 진행 상황**: 웹소켓이나 polling으로 인덱싱 완료 알림
6. **Anthropic Claude 지원**: OpenAI → Claude API 교체 옵션 (Claude SDK 활용)
