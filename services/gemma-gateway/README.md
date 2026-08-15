# gemma-gateway

LabNote Gemma 4 연구용 **OpenAI 호환 라우터**.
모델 alias 하나로 로컬 Ollama / vLLM / OpenAI 백엔드를 자유롭게 라우팅한다.

## 왜 만들었나

- 연구자가 `gemma4:e4b`, `gemma4:26b`, `gpt-4o-mini`, `bge-m3` 등 모델 이름만 바꾸면 백엔드가 알아서 결정되도록.
- ai-assistant-service는 **provider 1개**만 알면 됨 — `OPENAI_BASE_URL=http://gemma-gateway:8010/v1`.
- 향후 vLLM(AWS) 도입 시 코드 변경 없이 라우팅 테이블만 수정.

## 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 헬스체크 + 활성 모델 목록 |
| GET | `/_routing` | 라우팅 테이블 디버그 |
| GET | `/v1/models` | OpenAI 호환 모델 리스트 |
| POST | `/v1/chat/completions` | 채팅 완성 (스트리밍 지원) |
| POST | `/v1/embeddings` | 임베딩 |
| POST | `/v1/completions` | 레거시 텍스트 완성 |
| GET | `/docs` | Swagger UI |

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8010` | |
| `OLLAMA_BASE_URL` | `http://ollama:11434/v1` | 로컬 Ollama OpenAI 호환 엔드포인트 |
| `VLLM_BASE_URL` | (없음) | 비어 있으면 vLLM 라우트 비활성 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | |
| `OPENAI_API_KEY` | (없음) | 없으면 OpenAI 라우트 비활성 |

## 라우팅 테이블 (기본 — 로컬 Ollama 우선)

| Alias | Backend | Real Model |
|---|---|---|
| `gemma4:e2b` | ollama | `gemma4:e2b` |
| `gemma4:e4b` | ollama | `gemma4:e4b` |
| `gemma4:26b` | ollama | `gemma4:26b` |
| `gemma4:31b` | ollama | `gemma4:31b` |
| `gemma4:latest` | ollama | `gemma4:latest` |
| `bge-m3` | ollama | `bge-m3` |
| `nomic-embed-text` | ollama | `nomic-embed-text` |
| `gemma4:26b@vllm` | vllm | `google/gemma-4-26B-A4B-it` *(VLLM_BASE_URL 설정 시)* |
| `gemma4:31b@vllm` | vllm | `google/gemma-4-31B-it` *(VLLM_BASE_URL 설정 시)* |
| `gpt-4o-mini` | openai | `gpt-4o-mini` *(OPENAI_API_KEY 설정 시)* |
| `text-embedding-3-small` | openai | `text-embedding-3-small` *(OPENAI_API_KEY 설정 시)* |

테이블은 `src/config/routing.ts` 한 곳에서 관리.

## 로컬 기동

```bash
cd services
docker compose --profile ollama --profile research up -d ollama gemma-gateway
docker exec -it labnote-ollama ollama pull gemma4:e4b
docker exec -it labnote-ollama ollama pull bge-m3
```

## 동작 확인

```bash
# 활성 모델 확인
curl http://localhost:8010/v1/models | jq

# 채팅
curl http://localhost:8010/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model": "gemma4:e4b",
    "messages": [{"role":"user","content":"안녕"}]
  }' | jq

# 임베딩
curl http://localhost:8010/v1/embeddings \
  -H "content-type: application/json" \
  -d '{"model":"bge-m3","input":"형광 단백질 정제"}' | jq '.data[0].embedding | length'
# → 1024
```

## ai-assistant-service에서 사용하기

`services/.env`:
```bash
# Gemma Gateway 경유 — provider는 openai 그대로 두고 baseUrl만 변경
CHAT_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_BASE_URL=http://gemma-gateway:8010/v1
OPENAI_API_KEY=dummy   # gemma-gateway는 dummy 키 허용
CHAT_MODEL=gemma4:e4b
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024
```

> 위 설정은 ai-assistant-service의 `providers/llm.ts` 가 OpenAI 클라이언트를 그대로 쓰되 baseURL만 gemma-gateway로 가리키게 한다. 추가 코드 변경 불필요.

## TODO

- [ ] PII 스캐너 미들웨어 (요청 payload에서 L1/L2 자동 검출)
- [ ] 호출 로그 → MLflow run 자동 기록
- [ ] 비용 집계 (`tokens × unit_price`)
- [ ] 폴백 라우팅 (vLLM 다운 → ollama-local)
- [ ] 레이트 리밋 (실험자별)
- [ ] api-gateway 통합 (현재는 직접 8010 노출)
