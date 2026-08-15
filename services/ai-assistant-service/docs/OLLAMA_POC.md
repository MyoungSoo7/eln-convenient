# Gemma 4 + Ollama PoC 가이드

ai-assistant-service가 OpenAI 대신 **Gemma 4** (온프레미스, Ollama 경유)로 돌아가도록 하는 PoC.

> **Gemma 4**: 2026-04-02 출시, **Apache 2.0 라이선스**, 멀티모달(텍스트/이미지/오디오).
> 26B MoE는 3.8B만 활성되어 31B급 성능을 E4B 수준 컴퓨트로 달성 — **실사용 권장**.

## 구조

```
┌─────────────────────┐   OpenAI-호환 /v1    ┌────────────┐
│ ai-assistant-service│ ───────────────────▶ │   ollama   │
│  (Express, :8007)   │  baseURL=ollama:11434│  Gemma 4   │
│                     │                      │   bge-m3   │
└──────────┬──────────┘                      └────────────┘
           │
           ▼
     ┌─────────┐
     │ Qdrant  │ 컬렉션: labnote_docs_<차원>
     └─────────┘
```

**임베딩은 여전히 `bge-m3`**: Gemma 4 패밀리엔 임베딩 전용 모델 없음.
EmbeddingGemma는 이전 Gemma 세대 별도 프로젝트.

## Gemma 4 변형 선택 가이드

| 변형 | 디스크 | 컨텍스트 | 권장 VRAM | 용도 |
|------|--------|---------|----------|------|
| `gemma4:e2b` | 7.2 GB | 128K | 8 GB | 엣지/CPU-only PoC |
| `gemma4:e4b` | 9.6 GB | 128K | 12 GB | **PoC 기본값** (안전) |
| `gemma4:26b` | 18 GB | 256K | 20-24 GB | **실사용 권장** (MoE 3.8B 활성) |
| `gemma4:31b` | 20 GB | 256K | 24-48 GB | 최고 품질 (Dense) |

**26B MoE가 스위트 스팟**: 31B급 품질 + E4B급 추론 비용 + 256K 컨텍스트 → ELN 장문 프로토콜 RAG에 최적.

## 환경변수 스위치

`services/.env` (없으면 생성):

```bash
# === PoC: Ollama + Gemma 4 + bge-m3 ===
CHAT_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
CHAT_MODEL=gemma4:26b          # 권장. GPU 부족 시 gemma4:e4b
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024             # bge-m3 차원
OLLAMA_BASE_URL=http://ollama:11434/v1

# === 기본: OpenAI (롤백) ===
# CHAT_PROVIDER=openai
# EMBEDDING_PROVIDER=openai
# OPENAI_API_KEY=sk-...
```

차원이 바뀌면 `qdrant.service.ts`가 새 컬렉션 `labnote_docs_1024`를 **자동 생성**.
기존 `labnote_docs_1536`은 유지되어 언제든 롤백 가능.

## 기동

### 1) Ollama 컨테이너 시작 (profile 필요)

```bash
cd services
docker compose --profile ollama up -d ollama
```

### 2) 모델 pull (최초 1회)

```bash
# 권장 구성
docker exec -it labnote-ollama ollama pull gemma4:26b
docker exec -it labnote-ollama ollama pull bge-m3

# 경량 구성 (24GB 미만 GPU 또는 CPU PoC)
docker exec -it labnote-ollama ollama pull gemma4:e4b
docker exec -it labnote-ollama ollama pull bge-m3
```

### 3) ai-assistant-service 재빌드

```bash
docker compose up -d --build ai-assistant-service
docker compose logs -f ai-assistant-service
```

정상 기동 시 로그:
```
[llm] chat=ollama:gemma4:26b (enabled=true) | embedding=ollama:bge-m3 dim=1024 (enabled=true)
[qdrant] 컬렉션 'labnote_docs_1024' 생성됨
```

### 4) 기존 데이터 재인덱싱

```bash
docker exec -it labnote-ai npx ts-node scripts/reindex.ts
```

## 동작 확인

```bash
# 직접 Ollama 테스트
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4:26b",
    "messages": [{"role":"user","content":"형광 단백질 정제 프로토콜 3단계로 요약"}]
  }'

# RAG 엔드포인트 테스트 (Gateway 경유)
curl -X POST http://localhost:8000/api/ai/ask \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"question":"형광 단백질 정제 프로토콜의 핵심 단계를 알려줘"}'
```

## 롤백

```bash
# .env에서 provider만 되돌리기
sed -i 's/CHAT_PROVIDER=ollama/CHAT_PROVIDER=openai/' services/.env
sed -i 's/EMBEDDING_PROVIDER=ollama/EMBEDDING_PROVIDER=openai/' services/.env

docker compose up -d --build ai-assistant-service
# → 자동으로 labnote_docs_1536 컬렉션 재사용
```

## GPU 요구사항 (Q4 양자화 기준)

| 모델 | 최소 VRAM | 권장 GPU | 비고 |
|------|---------|---------|------|
| `gemma4:e2b` | 4-6 GB | RTX 3060 / T4 / CPU | 오디오 입력 지원 |
| `gemma4:e4b` | 8-10 GB | RTX 3070 12GB / L4 | PoC 기본값 |
| `gemma4:26b` | **20-24 GB** | **RTX 4090 24GB / L40S** | MoE라 활성 연산 적음 — 처리량 우수 |
| `gemma4:31b` | 24-48 GB | RTX 4090 (컨텍스트 제한) / A100 40G | Dense, 최고 품질 |

**CPU만으로는 실사용 불가** — E4B/26B는 모두 GPU 필수. E2B만 CPU PoC 가능.

## 프로덕션 전환 (vLLM)

Ollama는 PoC 용도. 다수 사용자 / 높은 동시성이 필요하면 **vLLM**:
- 동일한 OpenAI-호환 `/v1` 엔드포인트
- 환경변수만 교체 (`CHAT_PROVIDER=vllm`, `VLLM_BASE_URL=http://vllm:8000/v1`)
- 연속 배칭으로 처리량 수배 향상
- 26B MoE의 활성 파라미터 최적화 지원

```bash
# vLLM 서빙 예시 (docker)
docker run --gpus all -p 8000:8000 vllm/vllm-openai:latest \
  --model google/gemma-4-26b-it \
  --max-model-len 65536
```

## 알려진 제약

1. **임베딩 모델**: Gemma 4 패밀리엔 임베딩 전용이 없어 `bge-m3` 병행 필요. 디스크 +1.2GB, VRAM ~2GB 추가.
2. **한국어 성능 미검증**: Google 공식 문서에 한국어 벤치 없음 — ELN 도메인 A/B 테스트 필수. 연구노트/프로토콜 샘플 30건으로 gpt-4o-mini와 blind 비교 권장.
3. **멀티모달 미활용**: 현재 ai-assistant-service는 텍스트만 사용. 향후 실험 이미지 분석(웨스턴블롯 등) 기능 추가 시 즉시 활용 가능.
4. **재인덱싱 시간**: bge-m3는 OpenAI API 대비 처리량 낮음. 초기 전체 재인덱싱은 GPU 성능에 따라 수십 분~수 시간 소요.
5. **컨텍스트 256K**: 26B/31B는 256K 지원하지만 KV 캐시가 VRAM을 크게 먹음 — 실사용은 32K-64K로 제한 권장.
