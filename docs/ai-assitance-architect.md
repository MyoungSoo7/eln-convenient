# ai-assistance-architect

> LabNote ELN 온프레미스 AI Assistant Service 설계 문서
> 작성일: 2026-04-07
> 상태: 설계 단계 (미구현)

---

## 1. 배경 및 목표

### 현황
- 기존 `eln-convenient` 프로젝트에는 LLM 기반 AI 서비스가 전혀 없음
- 검색은 OpenSearch BM25, 템플릿 추천은 `useCount` 기반 단순 정렬
- 실험실 데이터 특성상 외부 API 호출은 금지 (데이터 프라이버시)

### 목표
- **온프레미스 전용** LLM 서비스 구축 (외부 API 사용 금지)
- 기존 MSA 아키텍처에 자연스럽게 통합
- 연구 생산성 향상 (노트 작성, 검색, 추천, 규정 준수)
- 데이터 유출 0, 월 운영비 0 (전기료 제외)

---

## 2. 하드웨어 요구사항

### 최소 사양 (LLM 7B 모델)
| 항목 | 사양 |
|------|------|
| GPU | NVIDIA RTX 3060 12GB 이상 (또는 CPU 전용 16GB RAM) |
| RAM | 32GB |
| 디스크 | 100GB SSD |
| CPU | 8코어 이상 |

### 권장 사양 (LLM 13B~70B)
| 항목 | 사양 |
|------|------|
| GPU | NVIDIA RTX 4090 24GB 또는 A100 40GB |
| RAM | 64GB |
| 디스크 | 500GB NVMe SSD |

### 대안
- **Apple Silicon**: M2/M3 Ultra (통합 메모리 64GB+)
- **CPU 전용**: Intel Xeon + AVX-512 (느리지만 동작)

---

## 3. 모델 선택 (한국어 지원)

### LLM (추론용)
| 순위 | 모델 | 특징 | VRAM |
|------|------|------|------|
| 1 | Qwen2.5 14B | 한국어 우수, 오픈소스 | ~16GB |
| 2 | Llama 3.1 8B Instruct | 균형, 다양한 태스크 | ~10GB |
| 3 | EXAONE 3.5 7.8B | LG, 한국어 특화 | ~10GB |
| 경량 | Mistral 7B | 빠름, 영문 위주 | ~8GB |

### 임베딩 (벡터화)
| 순위 | 모델 | 특징 | 차원 |
|------|------|------|------|
| 1 | bge-m3 | 다국어, 8192 컨텍스트 | 1024 |
| 2 | multilingual-e5-large | 한국어 우수 | 1024 |
| 3 | ko-sroberta-multitask | 한국어 전용 | 768 |

---

## 4. 기술 스택

### 추론 엔진
- **Ollama** (권장): 설치 간단, REST API 기본 제공, 모델 관리 편리
- **vLLM**: 프로덕션 최적화, 빠름 (설정 복잡)
- **LocalAI**: OpenAI 호환 API

### 벡터 DB
- **pgvector**: PostgreSQL 15 확장 (기존 DB 재활용)
  - 별도 DB 불필요, 운영 단순화
  - 이미 PostgreSQL 15 운영 중
  - `CREATE EXTENSION vector;`

### 대기열
- **BullMQ + Redis** (기존 인프라 재사용)

### 웹 프레임워크
- **Fastify + TypeScript** (기존 MSA 패턴 일치)

---

## 5. 서비스 아키텍처

### 디렉토리 구조
```
services/
└── ai-assistant-service/           # 신규 마이크로서비스 (:8010)
    ├── src/
    │   ├── controllers/
    │   │   ├── chat.controller.ts
    │   │   ├── summarize.controller.ts
    │   │   ├── search.controller.ts
    │   │   ├── rag.controller.ts
    │   │   ├── recommend.controller.ts
    │   │   └── compliance.controller.ts
    │   ├── services/
    │   │   ├── llm.service.ts
    │   │   ├── embedding.service.ts
    │   │   ├── vector.service.ts
    │   │   ├── prompt.service.ts
    │   │   ├── cache.service.ts
    │   │   └── usage.service.ts
    │   ├── workers/
    │   │   ├── embedding.worker.ts
    │   │   └── summary.worker.ts
    │   ├── prompts/
    │   │   ├── system/
    │   │   └── templates/
    │   └── config/
    │       └── models.ts
    ├── prisma/
    │   └── schema.prisma
    ├── package.json
    └── Dockerfile
```

---

## 6. Docker Compose 구성

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: labnote-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    command: >
      sh -c "ollama serve &
             sleep 5 &&
             ollama pull qwen2.5:14b &&
             ollama pull bge-m3 &&
             wait"

  ai-assistant-service:
    build: ./services/ai-assistant-service
    container_name: labnote-ai-assistant
    ports:
      - "8010:8010"
    environment:
      - NODE_ENV=production
      - OLLAMA_HOST=http://ollama:11434
      - LLM_MODEL=qwen2.5:14b
      - EMBEDDING_MODEL=bge-m3
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      ollama:
        condition: service_started
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  ollama-data:
```

---

## 7. 데이터 플로우

### 7-1. 노트 저장 시 자동 임베딩

```
┌──────────┐   ┌─────────────┐   ┌───────────┐   ┌──────────────────────┐
│ 사용자   │──▶│ eln-service │──▶│ Redis     │──▶│ ai-assistant-service │
│ 노트저장 │   │ DB 저장     │   │ pub/sub   │   │ (subscribe)          │
└──────────┘   └─────────────┘   │note.created│  └──────────────────────┘
                                  └───────────┘              │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ BullMQ 큐    │
                                                    │ embedding    │
                                                    └──────────────┘
                                                             │
                                                             ▼
                                               ┌──────────────────────┐
                                               │ embedding.worker     │
                                               │ 1. 청킹 (1000토큰)    │
                                               │ 2. Ollama bge-m3     │
                                               │ 3. pgvector 저장     │
                                               └──────────────────────┘
```

### 7-2. RAG 질의응답

```
사용자 질문
    │
    ▼
┌────────────────────┐
│ POST /api/ai/ask   │
└────────────────────┘
    │
    ▼
┌────────────────────┐
│ 1. 질문 임베딩     │ ← Ollama bge-m3
└────────────────────┘
    │
    ▼
┌────────────────────┐
│ 2. 벡터 유사도 검색 │ ← pgvector, top-10
│    + 권한 필터     │   (orgId, userId)
└────────────────────┘
    │
    ▼
┌────────────────────┐
│ 3. 프롬프트 구성   │ ← 질문 + 유사 노트 내용
└────────────────────┘
    │
    ▼
┌────────────────────┐
│ 4. LLM 응답 생성   │ ← Ollama qwen2.5:14b
└────────────────────┘
    │
    ▼
┌────────────────────┐
│ 5. 응답 + 출처     │
│    반환            │
└────────────────────┘
```

### 7-3. 요약 생성 (캐싱)

```
요청 ─▶ Redis 캐시 확인 (ai:summary:{noteId})
          │
          ├── 히트 ──▶ 즉시 반환
          │
          └── 미스 ──▶ LLM 호출 ──▶ 결과 + 24h 캐싱
```

---

## 8. 데이터베이스 스키마 (Prisma)

### 새 테이블
```prisma
// 노트 임베딩
model NoteEmbedding {
  id        String   @id @default(cuid())
  noteId    String
  orgId     String
  chunkIdx  Int
  content   String   @db.Text
  embedding Unsupported("vector(1024)")  // bge-m3 = 1024차원
  createdAt DateTime @default(now())

  @@index([noteId])
  @@index([orgId])
  // HNSW 인덱스는 raw SQL로 추가
}

// 사용량 추적
model AiUsage {
  id           String   @id @default(cuid())
  userId       String
  orgId        String
  feature      String   // chat, summary, search, rag, recommend
  model        String
  inputTokens  Int
  outputTokens Int
  durationMs   Int
  cachedHit    Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
  @@index([orgId, createdAt])
}

// AI 대화
model AiConversation {
  id        String   @id @default(cuid())
  userId    String
  orgId     String
  title     String?
  messages  Json     // [{ role, content, timestamp, citations }]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([orgId])
}

// 요약 결과 저장 (Redis 캐시와 병행)
model NoteSummary {
  id        String   @id @default(cuid())
  noteId    String   @unique
  summary   String   @db.Text
  model     String
  createdAt DateTime @default(now())
}
```

### pgvector 인덱스 (마이그레이션 raw SQL)
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX note_embedding_hnsw_idx
  ON "NoteEmbedding"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 9. API 엔드포인트

| Method | 경로 | 기능 | 특이사항 |
|--------|------|------|----------|
| POST | `/api/ai/chat` | 일반 챗봇 대화 | JSON 응답 |
| POST | `/api/ai/chat/stream` | 스트리밍 챗봇 | Server-Sent Events |
| POST | `/api/ai/summarize` | 노트 요약 | Redis 캐시 24h |
| GET | `/api/ai/search/semantic` | 시맨틱 검색 | top-k 반환 |
| POST | `/api/ai/ask` | RAG 질의응답 | 출처 인용 포함 |
| GET | `/api/ai/recommend` | 템플릿/노트 추천 | 사용자 맞춤 |
| POST | `/api/ai/compliance/check` | 규정 준수 검증 | GLP/GCP 체크 |
| GET | `/api/ai/insights` | 대시보드 인사이트 | 자동 요약 |
| GET | `/api/ai/conversations` | 대화 이력 | 페이지네이션 |
| DELETE | `/api/ai/conversations/:id` | 대화 삭제 | |
| GET | `/api/ai/usage` | 사용량 통계 | 관리자 전용 |

---

## 10. 프롬프트 관리

### 디렉토리 구조
```
prompts/
├── system/
│   ├── default.md          # 기본 페르소나
│   ├── scientist.md        # 연구자 모드
│   └── compliance.md       # 규정 검증자 모드
└── templates/
    ├── summarize.md
    ├── translate.md
    ├── rag-answer.md
    ├── recommend-template.md
    └── analyze-audit-log.md
```

### 예시: `summarize.md`
```markdown
당신은 연구 노트 요약 전문가입니다.
다음 노트를 3-5줄로 간결하게 요약하세요.
핵심 방법, 결과, 결론을 포함해야 합니다.

규칙:
- 한국어로 응답
- 전문용어는 원문 그대로 유지
- 불확실한 내용은 추가하지 않음
- 3-5줄 엄수

노트:
{content}

요약:
```

### 예시: `rag-answer.md`
```markdown
당신은 실험실 ELN 어시스턴트입니다.
다음 연구 노트를 참고하여 사용자의 질문에 답하세요.

참고 노트:
{context}

규칙:
- 참고 노트에 없는 내용은 "해당 정보가 노트에 없습니다"라고 답하세요
- 답변 후 참고한 노트의 ID를 [출처: noteId] 형식으로 표시하세요
- 확실하지 않은 내용은 추측하지 마세요
- 한국어로 응답하세요

질문: {question}

답변:
```

---

## 11. 캐싱 전략 (Redis)

### Key 설계
| Key 패턴 | TTL | 용도 |
|---------|-----|------|
| `ai:summary:{noteId}` | 24h | 노트 요약 캐시 |
| `ai:embedding:{contentHash}` | 30d | 임베딩 캐시 |
| `ai:search:{userId}:{queryHash}` | 10m | 검색 결과 캐시 |
| `ai:rag:{userId}:{queryHash}` | 10m | RAG 응답 캐시 |
| `ai:usage:daily:{userId}:{date}` | 30d | 일일 사용량 |
| `ai:rate:{userId}:{minute}` | 1m | Rate limit |

### 효과
- 동일 질문 반복 시 즉시 응답
- LLM 연산 시간 절감
- GPU 부하 감소

---

## 12. 보안 / 프라이버시

### 데이터 보호
- **온프레미스 전용** — 외부 API 호출 0
- **권한 필터** — `orgId` 기반 데이터 격리
- **감사 로그** — 모든 LLM 호출 기록 (`AiUsage` 테이블)
- **민감정보 마스킹** — 환자번호, 개인정보 자동 제거
- **프롬프트 인젝션 방어** — 입력 sanitize

### 접근 제어
- JWT 기반 인증 (기존 auth-service 재사용)
- Role 기반 권한 (일부 기능 관리자 전용)
- Rate limiting: 사용자당 분당 20회

### 준수 사항
- 실험실 데이터 외부 유출 금지 (연구 기밀)
- GLP/GCP 감사 추적 호환

---

## 13. 성능 최적화

| 기법 | 효과 |
|------|------|
| GPU 배치 처리 | 여러 요청 한번에 → 처리량 2-3x |
| 임베딩 캐시 | 동일 텍스트 재사용 |
| 청킹 최적화 | 1000 토큰 + 200 중복 |
| Redis 응답 캐싱 | 반복 쿼리 즉시 응답 |
| BullMQ 비동기 큐 | 긴 작업 백그라운드 |
| SSE 스트리밍 | 체감 속도 향상 |

---

## 14. 예상 성능 (Qwen2.5 14B + RTX 4090)

| 작업 | 시간 |
|------|------|
| 요약 (500자 노트) | 3-5초 |
| RAG 질의응답 | 5-8초 |
| 시맨틱 검색 | <1초 |
| 임베딩 (청크 1개) | 0.2초 |
| 챗봇 스트리밍 | 첫 토큰 1초, 30-50 토큰/초 |

---

## 15. 단계별 구현 로드맵

### Phase 1 (주 1-2): 인프라
- [ ] Ollama 도커 컨테이너 설정
- [ ] GPU 드라이버 확인 (nvidia-docker)
- [ ] pgvector extension 설치
- [ ] `ai-assistant-service` 스켈레톤 생성
- [ ] Prisma 스키마 + 마이그레이션

### Phase 2 (주 3-4): 기본 기능
- [ ] 임베딩 워커 구현
- [ ] `note.created` 이벤트 구독
- [ ] 시맨틱 검색 API
- [ ] 요약 API + Redis 캐싱
- [ ] 프론트엔드 기본 UI 추가

### Phase 3 (주 5-6): RAG
- [ ] 벡터 유사도 검색
- [ ] 권한 필터링
- [ ] 프롬프트 엔지니어링
- [ ] 출처 표시 기능
- [ ] `/api/ai/ask` 엔드포인트

### Phase 4 (주 7-8): 고급 기능
- [ ] 챗봇 스트리밍 (SSE)
- [ ] 대화 이력 관리
- [ ] 추천 시스템
- [ ] 규정 준수 검증 (GLP/GCP)

### Phase 5 (주 9-10): 모니터링
- [ ] 사용량 대시보드
- [ ] 성능 메트릭 수집
- [ ] A/B 테스트 프레임워크
- [ ] 프롬프트 튜닝

---

## 16. 운영 비용 비교

| 항목 | 온프레미스 (본 설계) | Claude API | GPT-4 API |
|------|---------------------|------------|-----------|
| 초기 비용 | GPU 서버 300-500만원 | 0 | 0 |
| 월 운영비 | 전기료 5-10만원 | $250-500 | $500-1000 |
| 데이터 보안 | 최고 | 중간 | 중간 |
| 지연시간 | 낮음 (로컬) | 중간 (해외) | 중간 (해외) |
| 커스터마이징 | 자유 | 제한 | 제한 |
| 규정 준수 | 용이 | 주의 필요 | 주의 필요 |

### 손익분기점
- 월 사용자 500명 기준, 약 8-12개월 후 온프레미스가 유리
- 데이터 프라이버시를 고려하면 시작부터 온프레미스 권장

---

## 17. 위험 요소 및 완화 방안

| 위험 | 영향 | 완화 방안 |
|------|------|----------|
| GPU 하드웨어 고장 | 서비스 중단 | CPU 폴백, 이중화 |
| LLM 환각 (hallucination) | 부정확한 답변 | RAG + 출처 표시 |
| 모델 업데이트 | 품질 변동 | 버전 고정, 회귀 테스트 |
| GPU 메모리 부족 | 응답 실패 | 양자화 모델 사용 (Q4) |
| 프롬프트 인젝션 | 보안 위험 | 입력 검증, 시스템 프롬프트 보호 |
| 비동기 큐 적체 | 임베딩 지연 | Worker 수평 확장 |

---

## 18. 다음 단계

1. 이 문서를 바탕으로 **팀 리뷰** 진행
2. 하드웨어 견적 및 구매 승인
3. **PoC** 구축 (Phase 1 + 기본 요약 기능만)
4. 정식 구현 착수 (전체 Phase 1-5)

---

## 참고 자료

- Ollama: https://ollama.com/
- Qwen2.5: https://huggingface.co/Qwen
- bge-m3: https://huggingface.co/BAAI/bge-m3
- pgvector: https://github.com/pgvector/pgvector
- Fastify: https://fastify.dev/
- BullMQ: https://docs.bullmq.io/
- EXAONE 3.5: https://huggingface.co/LGAI-EXAONE

---

**작성자**: Claude Code (설계 지원)
**상태**: 설계 검토 대기
**연관 문서**: `docs/functional-spec.md`, `docs/process-definition.md`
