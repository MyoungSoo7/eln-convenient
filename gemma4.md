# gemma4.md — LabNote 프로젝트의 Gemma 4 연구 플랫폼 전환 설계

> **문서 목적**: 기존 LabNote ELN 프로젝트를 **Gemma 4 연구 플랫폼**으로 전환하기 위한 분석·설계.
> 기존 MSA 인프라(Qdrant, Redis, PostgreSQL, MinIO, OpenSearch, 감사로그, i18n, PII 마스킹)를 **그대로 활용**해 Gemma 4 실험 환경을 구축한다.
>
> **작성일**: 2026-04-10
> **전제**: Gemma 4는 2026-04-02 Apache 2.0으로 공개됨. E2B/E4B/26B MoE/31B Dense 4종. vLLM Day 0 지원.

---

## 0. 핵심 요약 (TL;DR)

1. **연구 목표**: Gemma 4를 한국어 연구노트(ELN) 도메인에서 gpt-4o-mini 대체재로 사용할 수 있는지 **정량 검증**. 특히 26B MoE(3.8B 활성)가 비용·품질 스위트 스팟인지.
2. **왜 이 프로젝트인가**: Qdrant(RAG), Redis(큐/캐시), PostgreSQL(도메인 데이터), MinIO(이미지/첨부파일), i18n(ko/en 평가셋), 감사로그(재현성), PII 마스킹(안전한 데이터)이 이미 전부 있음. **연구용 스택을 0에서 짤 필요 없음**.
3. **GPU 전략**: 로컬 Docker(PoC·개발) → AWS g6e.xlarge(정규 실험) → AWS p5(대규모 파인튜닝/배치). Ollama는 단일 사용자 개발용, **vLLM이 연구·서빙의 기본**.
4. **신규 모듈 5개**: `gemma-gateway`(멀티 provider 라우팅), `eval-harness-service`(벤치마크), `model-registry`(모델·프롬프트 버전), `experiment-tracker`(MLflow 통합), `fine-tune-jobs`(LoRA/QLoRA 배치).
5. **초기 로드맵**: Phase 0(인프라 정비) → Phase 1(벤치마크 기준선) → Phase 2(RAG 품질 비교) → Phase 3(파인튜닝) → Phase 4(멀티모달).

---

## 1. 연구 질문 (Research Questions)

연구 플랫폼으로 전환하려면 **무엇을 측정할 것인가**가 먼저다. 아래 7개를 공식 RQ로 삼는다.

| # | 연구 질문 | 측정 지표 | 우선순위 |
|---|---------|----------|---------|
| RQ1 | Gemma 4 각 변형(E4B/26B/31B)의 **한국어 ELN 도메인 품질**이 gpt-4o-mini와 어떻게 다른가? | Blind pairwise win-rate, BLEU, BERTScore, 사람 평가 (3점 척도) | 높음 |
| RQ2 | **26B MoE**(3.8B 활성)가 실제로 31B Dense 대비 몇 % 지연시간·비용에서 어떤 품질을 내는가? | p50/p95 latency, $/1k tokens, MMLU/KMMLU | 높음 |
| RQ3 | **bge-m3 임베딩 + Qdrant RAG** 품질이 OpenAI text-embedding-3-small 대비 한국어 과학 문서에서 어떤가? | Recall@5/10, MRR, nDCG | 높음 |
| RQ4 | Gemma 4의 **256K 롱컨텍스트**가 RAG 없이(또는 RAG 보조로) ELN 프로토콜 전체 주입 시 정확도에 어떻게 기여하는가? | needle-in-haystack, 답변 정확도 vs 컨텍스트 길이 | 중간 |
| RQ5 | **LoRA/QLoRA 파인튜닝** on 사내 ELN 데이터로 품질을 얼마나 끌어올릴 수 있는가? (Base vs SFT) | 도메인 태스크 정확도 증분, 학습 비용 | 중간 |
| RQ6 | **멀티모달**(웨스턴블롯 / 그래프 이미지) 설명·판독에서 Gemma 4가 실용 수준인가? | 전문가 평가, 오판독률 | 낮음 |
| RQ7 | 온프레미스 배포의 **실효 TCO**(GPU 감가상각 + 전력 + 운영)는 OpenAI API 호출 대비 어떤가? | $/월, 손익분기 요청량 | 중간 |

---

## 2. 왜 이 프로젝트인가 — 기존 자산 매핑

LabNote가 이미 가진 것과 연구에서 쓰이는 모습.

| 기존 자산 | 연구 플랫폼에서의 역할 |
|---|---|
| **PostgreSQL (eln 스키마)** — Note, NoteRevision, Template, Protocol | **도메인 데이터 소스** — 평가셋·파인튜닝셋의 원천. PII 마스킹 후 HuggingFace Datasets 포맷으로 변환. |
| **Qdrant** — 벡터 저장 | **RAG 실험 기판** — 임베딩 모델 A/B에 컬렉션 별도 관리(`labnote_docs_1536` vs `labnote_docs_1024`)는 이미 구현됨. |
| **Redis (Streams + BullMQ)** | **실험 작업 큐** — 평가·파인튜닝·인덱싱 잡을 BullMQ로 관리. 이미 `ai-index` 큐 존재, 패턴 재사용. |
| **MinIO (S3 호환)** | **모델 아티팩트/평가셋 저장** — LoRA weights, 평가 리포트, 학습 체크포인트, 이미지 데이터(멀티모달). |
| **OpenSearch** | **검색 품질 베이스라인** — BM25/하이브리드 vs 순수 벡터 RAG 비교 대조군. |
| **감사로그 (signature-audit-service)** | **실험 재현성** — 모든 모델 호출·평가·파인튜닝 이벤트를 감사로그로 남겨 **연구 윤리·재현성** 확보. |
| **i18n (ko/en JSON)** | **다국어 평가셋** — 기존 i18n 리소스를 번역 품질 평가에 활용. |
| **PII 마스킹 (`@lab/shared/pii.ts`)** | **학습 데이터 전처리** — 파인튜닝 전 개인식별정보를 자동 제거. GDPR/내부 컴플라이언스 통과. |
| **api-gateway (JWT/멀티테넌시)** | **실험자별 격리** — 연구자별 API 키, 실험별 orgId로 리소스 분리. |
| **Jaeger (OpenTelemetry)** | **추론 레이턴시 분해** — vLLM/Ollama의 prefill vs decode, 큐잉 지연을 span으로 분석. |
| **ai-assistant-service** (provider 추상화 완료) | **모델 라우터의 씨앗** — 이미 `providers/llm.ts`가 있어 openai/ollama/vllm 3종 지원. 여기에 `gemma-gateway`를 올림. |

**결론**: "연구 플랫폼"에 필요한 인프라 레이어의 80%는 이미 존재한다. 추가할 것은 **평가·트래킹·파인튜닝 모듈**뿐.

---

## 3. 아키텍처 변경 설계

### 3.1 전체 구성도 (After)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       LabNote ELN (기존 유지)                        │
│  api-gateway ─ auth ─ eln ─ signature-audit ─ inventory ─ scheduler │
│           ─ search ─ file ─ collab ─ (frontend)                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ ai-assistant-svc │  │  gemma-gateway   │  │ eval-harness-svc │  ← 신규
│  (기존 + 확장)    │  │    (신규)        │  │  (신규)          │
│                  │  │ OpenAI호환 라우터 │  │ 벤치마크 실행     │
│ provider=gemma-gw│◀─│ openai/ollama/   │  │ MMLU/KMMLU/RAG   │
│                  │  │ vllm/bedrock     │  │ custom ELN eval  │
└─────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘
          │                    │                     │
          ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│        Model Backends (로컬 Docker | 원격 AWS GPU)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐    │
│  │  ollama  │  │  vllm    │  │  vllm    │  │  Bedrock /     │    │
│  │ gemma4:  │  │ gemma4-  │  │ gemma4-  │  │  SageMaker     │    │
│  │  e4b     │  │ 26B-A4B  │  │ 31B-Dense│  │  (managed)     │    │
│  │(개발)    │  │ (g6e/p5) │  │  (p5)    │  │                │    │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
          │                    │                     │
          ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│   Research Data Plane (기존 + 신규)                                │
│  Qdrant       PostgreSQL    MinIO          MLflow      HF Datasets │
│  (RAG)        (domain)      (artifacts)    (track)     (eval sets) │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  model-registry-svc │ experiment-tracker-svc │ fine-tune-jobs-svc │  ← 신규
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 신규 서비스 5종

| 서비스 | 언어/프레임워크 | 포트 | 책임 |
|---|---|---|---|
| **gemma-gateway** | Fastify + TS | 8010 | OpenAI 호환 `/v1` 라우터. `model:` prefix로 백엔드 선택 (`gemma4:26b@vllm-local`, `gemma4:e4b@ollama`, `gemma4:31b@aws-p5`). 레이트 리밋, 호출 로깅, 비용 집계. |
| **eval-harness-service** | Fastify + TS + Python sidecar | 8011 | 평가 실행기. 평가셋(`kmmlu`, `eln-qa-v1`, `rag-korean`, `needle`)을 큐로 실행, 결과를 MLflow에 기록. |
| **model-registry-service** | Fastify + TS | 8012 | 모델(base/LoRA) + 프롬프트 템플릿 + 평가셋의 **버전 관리 + 메타데이터**. PostgreSQL schema `research`. |
| **experiment-tracker-service** | Fastify + MLflow 프록시 | 8013 | MLflow 서버를 래핑, 실험 로그·메트릭·아티팩트 조회 API. UI는 MLflow 기본 UI 그대로. |
| **fine-tune-jobs-service** | Fastify + TS + BullMQ | 8014 | LoRA/QLoRA 학습 잡 큐잉·상태관리·GPU 리소스 배타 락. 실제 학습은 AWS SageMaker 또는 원격 vLLM 노드에서 실행. |

> **디자인 선택**: MLflow 자체 컨테이너를 띄우고 experiment-tracker-service가 **읽기 전용 프록시** 역할만 한다. 이유: MLflow UI가 이미 훌륭함, 이중 UI 개발 비용 회피.

### 3.3 기존 서비스 확장

- **ai-assistant-service**: `providers/llm.ts` 의 provider 선택을 **gemma-gateway 경유**로 단일화. 즉 `CHAT_PROVIDER=gemma-gateway` 하나만 쓰고, 백엔드 선택은 gateway가 한다.
- **signature-audit-service**: 감사로그에 **연구용 이벤트 타입** 추가 — `MODEL_CALLED`, `EVAL_STARTED`, `EVAL_COMPLETED`, `FINETUNE_STARTED`, `DATASET_ACCESSED`.
- **eln-service**: `GET /api/notes/internal/all` 엔드포인트 추가 (재인덱싱 + 데이터셋 익스포트용. PII 마스킹은 기본 on, 연구자 권한 체크 후 off 옵션).
- **file-service**: MinIO 버킷 4개 추가 — `research-datasets`, `research-models`, `research-checkpoints`, `research-reports`.
- **docker-compose.yml**: `profiles` 를 도입해 `research` 프로필로 연구 모듈만 기동 (`docker compose --profile research up`).

### 3.4 신규 Postgres 스키마: `research`

```prisma
// services/model-registry-service/prisma/schema.prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Model {
  id          String   @id @default(uuid())
  name        String   // "gemma4-26b-lora-eln-v1"
  baseModel   String   // "google/gemma-4-26B-A4B-it"
  kind        String   // "base" | "lora" | "full-ft" | "quantized"
  format      String   // "gguf" | "safetensors" | "awq"
  artifactUri String   // minio://research-models/...
  sizeBytes   BigInt
  createdBy   String
  createdAt   DateTime @default(now())
  evaluations Evaluation[]
  @@schema("research")
}

model PromptTemplate {
  id       String @id @default(uuid())
  name     String // "rag-answer-ko-v3"
  template String // Jinja2 또는 간단 템플릿
  version  Int
  createdAt DateTime @default(now())
  @@unique([name, version])
  @@schema("research")
}

model EvalDataset {
  id         String @id @default(uuid())
  name       String // "eln-qa-v1", "kmmlu-subset"
  version    Int
  sizeRows   Int
  sourceUri  String // minio://research-datasets/...
  schemaJson Json
  @@unique([name, version])
  @@schema("research")
}

model Experiment {
  id           String @id @default(uuid())
  name         String
  modelId      String
  datasetId    String
  promptId     String?
  mlflowRunId  String? // MLflow 연동
  status       String // "queued" | "running" | "completed" | "failed"
  metrics      Json   // { win_rate: 0.63, bleu: 0.41, ... }
  startedAt    DateTime?
  completedAt  DateTime?
  createdBy    String
  createdAt    DateTime @default(now())
  model        Model   @relation(fields: [modelId], references: [id])
  @@schema("research")
}
```

---

## 4. 인프라 옵션 — 로컬 Docker vs AWS

### 4.1 로컬 Docker (개발/PoC)

**대상**: 개발·디버깅, 단일 연구자, E4B 이하 모델.

```yaml
# services/docker-compose.yml (research profile)
ollama:         profile=[ollama]   # 기존 PoC용
vllm-local:     profile=[research] # 신규: 워크스테이션 GPU
mlflow:         profile=[research]
gemma-gateway:  profile=[research]
eval-harness:   profile=[research]
```

| 워크스테이션 GPU | 가능 모델 | 용도 |
|---|---|---|
| 없음 (CPU) | `gemma4:e2b` (매우 느림) | 기능 테스트만 |
| RTX 3090 24GB | `gemma4:e4b`, `gemma4:26b` (빠듯) | 단일 사용자 개발 |
| **RTX 4090 24GB** | `gemma4:e4b`, `gemma4:26b` (여유), `gemma4:31b` (짧은 컨텍스트) | **권장 개발 기본** |
| RTX 5090 32GB (또는 RTX Pro 6000 48GB) | 전 모델 여유 | 로컬 연구 슈퍼유저 |

**제약**: 처리량 부족, 여러 실험 병렬 불가, 대규모 평가엔 부적합 → AWS 필요.

### 4.2 AWS GPU 인스턴스 (본 연구)

**권장 SKU 매트릭스** (2026-04 기준, 가격은 on-demand USD/hr, 변동 가능):

| 인스턴스 | GPU | VRAM | 시간당 가격* | Spot 추정 | 용도 |
|---|---|---|---|---|---|
| `g5.xlarge` | 1× A10G | 24 GB | ~$1.00 | ~$0.30 | E4B 개발, 단일 벤치 |
| `g6.xlarge` | 1× L4 | 24 GB | ~$0.80 | ~$0.25 | E4B 추론, **비용 최적** |
| **`g6e.xlarge`** | **1× L40S** | **48 GB** | **~$1.86** | ~$0.55 | **26B MoE 서빙 기본값** |
| `g6e.2xlarge` | 1× L40S | 48 GB | ~$2.24 | ~$0.70 | 26B + 임베딩 공존 |
| `g5.12xlarge` | 4× A10G | 96 GB | ~$5.67 | ~$1.70 | 31B Dense, 텐서 병렬 |
| `p4d.24xlarge` | 8× A100 40GB | 320 GB | ~$32.77 | ~$10 | 풀 파인튜닝 |
| **`p5.48xlarge`** | **8× H100 80GB** | **640 GB** | **~$44.50** (2025-06 45% 인하 후) | ~$13 | 31B Dense 학습·대규모 배치 |

\* 가격은 us-east-1 기준 대략. 실제는 [AWS On-Demand Pricing](https://aws.amazon.com/ec2/pricing/on-demand/) 확인.

**권장 조합**:
- **평가 배치** → `g6e.xlarge` × Spot 1대 (26B MoE 서빙 + 평가 러너 동일 노드)
- **파인튜닝 (LoRA)** → `g6e.2xlarge` 또는 `g5.12xlarge` × Spot (24h 내 완료 가능)
- **풀 파인튜닝** → `p4d.24xlarge` × Spot (72h 한도 고려)
- **서빙 (연구자 대시보드용)** → `g6e.xlarge` × On-Demand 1대 상시 + Spot으로 평가 시 배치

### 4.3 AWS 배포 토폴로지

```
                  ┌──────────────────────┐
                  │  사내 네트워크 (VPN)   │
                  │                      │
                  │  LabNote docker      │
                  │  compose (PostgreSQL │
                  │  Qdrant, Redis...)   │
                  │                      │
                  └──────────┬───────────┘
                             │ VPN / PrivateLink
                             ▼
          ┌────────────────────────────────────┐
          │             AWS VPC                │
          │                                    │
          │  ┌──────────┐    ┌──────────────┐ │
          │  │ g6e.xl   │    │  s3://labnote│ │
          │  │ vllm     │    │  -research-  │ │
          │  │ gemma4   │◀──▶│  models      │ │
          │  │  26B     │    │  -datasets   │ │
          │  │          │    │  -reports    │ │
          │  └──────────┘    └──────────────┘ │
          │       ▲                            │
          │       │ (연구용 DNS                 │
          │       │  vllm-gemma4.internal)     │
          │       │                            │
          │  ┌────┴─────┐                      │
          │  │ ALB +    │                      │
          │  │ WAF      │                      │
          │  └──────────┘                      │
          └────────────────────────────────────┘
```

**연결**:
- 사내 LabNote의 `gemma-gateway` 가 VPN 너머 AWS의 vLLM 엔드포인트(`vllm-gemma4.internal`)를 호출.
- 모델 아티팩트는 MinIO ↔ S3 양방향 동기화(minio mirror). 대용량만 S3에 두고 메타데이터는 사내 `model-registry`.
- **PII 주의**: 사내 데이터가 AWS로 나가므로 반드시 `maskPII()` 경유. `gemma-gateway` 에 PII 검출 미들웨어 필수.

### 4.4 Bedrock / SageMaker 옵션

- **Bedrock**: Gemma는 Bedrock 카탈로그에 없을 가능성 있음 (Anthropic/Meta/Mistral 중심). 확인 필요.
- **SageMaker JumpStart**: Gemma 4 공식 이미지 제공 시 편리. 파인튜닝 잡도 JumpStart로 돌릴 수 있음. 관리 비용 ↓, 유연성 ↓.
- 권장: **1차는 EC2 직접 운영** (비용·유연성), **2차로 SageMaker 이관** (운영 편의).

---

## 5. 연구 트랙별 상세 설계

### Track A — 품질 벤치마크 (RQ1, RQ2)

**평가셋 구축**:
1. **KMMLU**, **HAE-RAE Bench**, **KoBEST** — 공개 한국어 벤치 (HuggingFace).
2. **ELN-QA-v1** (자체 구축): 사내 노트에서 질의 1000개 생성 → 전문가 정답 라벨링. PII 마스킹 후 MinIO 저장.
3. **ELN-Draft-v1**: "주제 → 실험 초안" 평가셋 500개. 전문가 평가 (3점 척도).

**프로토콜**:
- 모델: `gpt-4o-mini`, `gemma4:e4b`, `gemma4:26b` (MoE), `gemma4:31b` (Dense).
- 각 모델 × 각 데이터셋 × 3 seed 반복.
- 품질: (a) 참조 정답 대비 BERTScore/BLEU, (b) **LLM-as-judge** (Claude/GPT-4o를 중립 판정자로), (c) **전문가 3인 블라인드 pairwise**.
- 비용: 호출 수, 평균 토큰, $/호출(API) 또는 GPU-hr(온프레미스).
- 레이턴시: prefill, decode, total. vLLM 메트릭 + Jaeger span.

**저장**:
- 원 응답 → MinIO `research-reports/bench/<exp-id>/`
- 메트릭 → MLflow run
- 요약 테이블 → Postgres `research.Experiment.metrics`

### Track B — RAG 품질 (RQ3, RQ4)

**대조군 × 처리군**:
| 조합 | 임베딩 | 재순위 | LLM | 컨텍스트 |
|---|---|---|---|---|
| B1 (대조) | text-embedding-3-small | - | gpt-4o-mini | 8K |
| B2 | bge-m3 | - | gemma4:26b | 8K |
| B3 | bge-m3 | bge-reranker-v2-m3 | gemma4:26b | 8K |
| B4 | bge-m3 | - | gemma4:26b | **64K** |
| B5 | **없음** (전체 노트 주입) | - | gemma4:26b | **256K** |

**평가셋**: ELN-QA-v1 (위). 지표: Recall@5/10, MRR, **end-to-end 답변 정확도**.

**흥미 포인트**:
- B5가 B2/B3을 이기면 "RAG 불필요" 시나리오 — 단, 비용/토큰 폭증.
- B4 vs B3: 컨텍스트 확장의 한계 효용.

### Track C — 파인튜닝 (RQ5)

**데이터셋 준비**:
1. `eln-service` → `GET /api/notes/internal/all?format=sft` → (instruction, input, output) 튜플 생성.
2. `@lab/shared/pii.ts` 의 `maskPII()` 를 **모든 레코드에 전처리**. 통과하지 못한 레코드는 폐기.
3. MinIO `research-datasets/sft-eln-v1/` 에 JSONL로 저장, HuggingFace Datasets 포맷으로도 복제.

**학습 레시피**:
- **QLoRA 4-bit** on `gemma4:26b` (A4B), r=16, alpha=32, dropout=0.05.
- `fine-tune-jobs-service` 가 SageMaker training job 또는 EC2 (`g6e.2xlarge` × Spot) 에 위임.
- 학습 후 어댑터를 `research-models/lora-eln-v1/` 업로드 → `model-registry` 등록 → vLLM에 LoRA adapter 로드 옵션으로 서빙.

**평가**: Track A와 동일 프로토콜로 베이스 vs SFT 비교.

### Track D — 멀티모달 (RQ6)

**시나리오**:
1. 웨스턴블롯 이미지 → "밴드 개수와 강도를 서술" (기존 전문가 라벨 대비).
2. 실험 그래프(엑셀 차트 캡처) → "그래프 요약과 추세 기술".
3. 실험 설비 사진 → "설비 상태 이상 여부 판단".

**구현**: MinIO의 첨부파일 → `file-service` → `ai-assistant-service` 에 새 엔드포인트 `POST /api/ai/describe-image` 추가. 내부적으로 gemma-gateway 경유해 `gemma4:26b` 에 이미지 + 질문 전달.

### Track E — TCO 분석 (RQ7)

```
손익분기 계산 (월간):
  OpenAI:   $0.15/1M input + $0.60/1M output (gpt-4o-mini)
            월 1000만 토큰 → $3-8
  Gemma4 (자체):
            g6e.xlarge on-demand 720h × $1.86 = $1,339/월
            → 손익분기 약 2억 토큰/월 (약 200만 호출)

결론: 소규모(월 10만 호출 이하)는 API가 싸다.
       중규모(월 200만 호출 이상)는 자체 서빙이 싸다.
       연구 목적으론 비용보다 데이터 주권·재현성이 핵심.
```

---

## 6. gemma-gateway 설계 (핵심 신규 모듈)

OpenAI 호환 API를 그대로 유지하되, **model 이름**으로 백엔드를 결정한다.

```typescript
// services/gemma-gateway/src/router.ts
const ROUTING_TABLE = {
  // 프로덕션(연구 상시) — AWS vLLM
  'gemma4:26b':            { backend: 'vllm-aws-g6e',  url: 'http://vllm-gemma4.internal/v1', real: 'google/gemma-4-26B-A4B-it' },
  'gemma4:31b':            { backend: 'vllm-aws-p5',   url: 'http://vllm-31b.internal/v1',    real: 'google/gemma-4-31B-it' },
  // 개발/PoC — 로컬 Ollama
  'gemma4:e4b':            { backend: 'ollama-local',  url: 'http://ollama:11434/v1',         real: 'gemma4:e4b' },
  'gemma4:e2b':            { backend: 'ollama-local',  url: 'http://ollama:11434/v1',         real: 'gemma4:e2b' },
  // 임베딩
  'bge-m3':                { backend: 'ollama-local',  url: 'http://ollama:11434/v1',         real: 'bge-m3' },
  // 베이스라인
  'gpt-4o-mini':           { backend: 'openai',        url: 'https://api.openai.com/v1',      real: 'gpt-4o-mini', requiresKey: true },
  // LoRA 어댑터 — vLLM lora-modules 기능 활용
  'gemma4:26b+eln-lora-v1':{ backend: 'vllm-aws-g6e',  url: 'http://vllm-gemma4.internal/v1', real: 'gemma-4-26B-A4B-it', lora: 'eln-lora-v1' },
};
```

**게이트웨이 책임**:
1. OpenAI SDK 호환 `/v1/chat/completions`, `/v1/embeddings` 제공 → 클라이언트는 SDK 그대로.
2. 라우팅 테이블로 백엔드 선택, 실패 시 폴백(예: vllm-aws 다운 → ollama-local).
3. 호출 로깅 (감사로그 + MLflow).
4. **PII 스캐너 미들웨어** — 요청 payload에서 L1/L2 감지 시 차단 또는 마스킹.
5. 레이트 리밋 (실험자별).
6. 비용 집계 (`toks × unit_cost`).

**vLLM 서빙 명령** (AWS 노드):
```bash
# g6e.xlarge 에서
vllm serve google/gemma-4-26B-A4B-it \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --enable-lora \
  --lora-modules eln-lora-v1=s3://labnote-research-models/lora/eln-v1 \
  --quantization awq   # MXFP4는 v0.19.0 버그 있음 — AWQ 사용 권장
```

---

## 7. 데이터 파이프라인 & 컴플라이언스

### 7.1 흐름

```
Postgres (eln.Note)
      │  ① SELECT (PII 마스킹 ON)
      ▼
eln-service /api/notes/internal/all
      │  ② JSONL 변환
      ▼
MinIO  research-datasets/raw-eln-<date>.jsonl
      │  ③ SFT 전처리 (instruction 생성)
      ▼
MinIO  research-datasets/sft-eln-v1.jsonl
      │  ④ 학습 잡
      ▼
fine-tune-jobs-service → SageMaker/EC2
      │  ⑤ 어댑터 산출
      ▼
MinIO  research-models/lora-eln-v1/
      │  ⑥ 등록
      ▼
model-registry-service (Postgres research.Model)
      │  ⑦ 서빙 로드
      ▼
vLLM (lora-modules)
```

### 7.2 PII/보안 체크리스트

- [ ] 모든 데이터셋 export에 `maskPII()` 기본 ON, 해제하려면 연구자 권한 + 감사로그.
- [ ] MinIO research 버킷은 **signed URL만** 허용, 공개 ACL 금지.
- [ ] AWS로 데이터 전송 전 `PII scanner` 로 한 번 더 통과 (이중 방어).
- [ ] LoRA 어댑터가 학습 데이터를 **암기**할 수 있음 — 주기적 memorization test (완전 일치 추출 공격) 필수.
- [ ] 감사로그: `DATASET_ACCESSED`, `MODEL_CALLED`, `EVAL_STARTED`, `FINETUNE_STARTED`, `MODEL_DOWNLOADED` 이벤트.
- [ ] 연구자 접근 권한: 신규 역할 `RESEARCHER`, 권한 `research:read`, `research:write`, `research:finetune` 추가.

---

## 8. 로드맵 (Phase 0 → 4)

| Phase | 목표 | 산출물 | 의존 |
|---|---|---|---|
| **0. 인프라 정비** | 기존 provider 추상화 완성, Ollama PoC 검증 | `providers/llm.ts` (✅ 완료), `OLLAMA_POC.md` (✅ 완료), 로컬 GPU 검증 | 워크스테이션 GPU 1대 |
| **1. 기준선** | gpt-4o-mini vs Gemma 4 (E4B/26B) 기본 품질 | 벤치마크 리포트 v1, MLflow 대시보드, `eval-harness-service` | `gemma-gateway`, 평가셋 수집 |
| **2. RAG 품질** | bge-m3 vs OpenAI 임베딩, 롱컨텍스트 활용 | RAG 비교 리포트, 재인덱싱 스크립트 개선 | AWS g6e.xlarge Spot, Qdrant 분리 컬렉션 |
| **3. 파인튜닝** | ELN LoRA v1, 도메인 태스크 증분 측정 | `fine-tune-jobs-service`, `research.Model` 등록, LoRA weights | PII 마스킹 파이프라인, SageMaker 계정 |
| **4. 멀티모달** | 이미지 판독 실험 | `POST /api/ai/describe-image`, 전문가 평가 리포트 | 웨스턴블롯 샘플 수집, 라벨링 |

**의사결정 게이트**: Phase 1 결과로 "Gemma 4가 실사용 가능한가?" 판정. Yes → Phase 2~4 진행. No → 원인 분석 후 Phase 1 재실행 또는 연구 종료.

---

## 9. 도커 컴포즈 profiles 설계

```yaml
# services/docker-compose.yml — 개념적 스케치
services:
  # 기존 ELN 서비스들 (profile 없음 = 기본)
  postgres, redis, minio, qdrant, opensearch, auth-service, eln-service, ...

  # PoC용 (기존)
  ollama:
    profiles: [ollama, research]

  # 연구 모듈 (신규)
  vllm-local:
    profiles: [research]
    image: vllm/vllm-openai:latest
    runtime: nvidia
    command: >
      --model google/gemma-4-E4B-it
      --max-model-len 32768
      --gpu-memory-utilization 0.9
    volumes: [hf_cache:/root/.cache/huggingface]

  mlflow:
    profiles: [research]
    image: ghcr.io/mlflow/mlflow:latest
    command: mlflow server --backend-store-uri postgresql://... --artifacts-destination s3://... --host 0.0.0.0
    ports: ["5000:5000"]

  gemma-gateway:
    profiles: [research]
    build: ./gemma-gateway
    ports: ["8010:8010"]
    environment:
      - ROUTING_TABLE_PATH=/config/routing.json
      - MLFLOW_URL=http://mlflow:5000

  eval-harness-service:
    profiles: [research]
    build: ./eval-harness-service
    depends_on: [gemma-gateway, mlflow, postgres]

  model-registry-service:
    profiles: [research]
    build: ./model-registry-service

  experiment-tracker-service:
    profiles: [research]
    build: ./experiment-tracker-service

  fine-tune-jobs-service:
    profiles: [research]
    build: ./fine-tune-jobs-service
    environment:
      - AWS_REGION=${AWS_REGION}
      - SAGEMAKER_ROLE_ARN=${SAGEMAKER_ROLE_ARN}

volumes:
  hf_cache:
```

**기동**:
```bash
# 기존 ELN만
docker compose up -d

# ELN + 연구 모듈 전체 (로컬 GPU 필요)
docker compose --profile research up -d

# Ollama PoC만 추가
docker compose --profile ollama up -d
```

---

## 10. 리스크 / 제약

| 리스크 | 영향 | 완화책 |
|---|---|---|
| **한국어 품질 미검증** | Gemma 4가 ELN 도메인에서 기대 이하일 수 있음 | Phase 1 기준선 측정을 **연구 판단 게이트**로 사용 |
| **GPU 부족** | 실험 대기열 폭증, 연구 속도 저하 | AWS Spot + 시간대별 스케줄링. 로컬 GPU로 개발, 클라우드로 배치 |
| **PII 유출** | 사내 데이터가 AWS로 나감 | 이중 PII 스캐너 + 감사로그 + 전송 전 마스킹 강제 |
| **LoRA 암기** | 학습 데이터를 그대로 재생 | 정기 memorization test, 데이터 중복 제거, DP-SFT 고려 |
| **vLLM 버전 버그** | MXFP4 등 특정 조합 불안정 | AWQ 양자화 기본, 버전 고정 (0.20.x+), CI에서 smoke test |
| **Spot 인스턴스 강제 종료** | 학습 중단, 평가 실패 | 체크포인트 자주 저장(BullMQ 재시도), On-Demand 폴백 |
| **비용 초과** | 월 예산 오버런 | Budget Alert, 일일 GPU-hr 대시보드, 실험당 예상 비용 사전 계산 |
| **라이선스 pass-through** | Apache 2.0이지만 Gemma 브랜딩/고지 조건 확인 | 파생모델 README에 원본 고지 포함, 법무 재확인 |
| **재현성 저하** | 실험 기록 누락 | MLflow 필수, 모든 호출 → 감사로그, seed 고정 |

---

## 11. 다음 액션 (구체)

즉시 착수 가능한 것부터:

1. **[가장 작은 단위]** `eln-service`에 `GET /api/notes/internal/all` 엔드포인트 추가 — 재인덱싱·데이터셋 export 둘 다 가로막고 있음. (0.5일)
2. **[Phase 0 마무리]** 로컬 GPU 유무 확인 → 없으면 AWS g6e.xlarge Spot 1대 기동 → `gemma4:e4b` + `bge-m3` 로 ai-assistant-service 동작 검증. (1일)
3. **[Phase 1 착수]** `gemma-gateway` 신규 서비스 스캐폴딩 (라우팅 테이블 + OpenAI 호환 프록시만). (1-2일)
4. **[평가셋]** KMMLU 공개 벤치 실행할 수 있는 `eval-harness-service` 최소 버전. (2일)
5. **[MLflow]** 컨테이너 추가 + `research` profile에 등록. (0.5일)
6. **[데이터]** 사내 노트 100건 샘플로 `eln-qa-v1` 시드 평가셋 만들기 — 전문가 라벨링 세션 예약. (1주)

**선행 결정 필요**:
- [ ] AWS 계정/예산 승인 (월 예산은?)
- [ ] 연구자 명단 + 권한 부여 정책
- [ ] `RESEARCHER` 역할 + 권한 상수 추가 (`@lab/shared`)
- [ ] 법무: Gemma 4 Apache 2.0의 고지 요건 확인
- [ ] 보안: 사내→AWS 데이터 전송 가능 여부, VPN/PrivateLink 필요성

---

## 12. 참고 자료

- [Gemma 4 공식 블로그 — Google](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemma 4 — Google DeepMind](https://deepmind.google/models/gemma/gemma-4/)
- [Gemma 4 Core Docs — Google AI for Developers](https://ai.google.dev/gemma/docs/core)
- [gemma4 · Ollama Library](https://ollama.com/library/gemma4)
- [Welcome Gemma 4 — HuggingFace](https://huggingface.co/blog/gemma4)
- [Gemma 4 Usage Guide — vLLM Recipes](https://docs.vllm.ai/projects/recipes/en/latest/Google/Gemma4.html)
- [Announcing Gemma 4 on vLLM](https://vllm.ai/blog/gemma4)
- [Deploy Gemma 4 on GPU Cloud — Spheron](https://www.spheron.network/blog/deploy-gemma-4-gpu-cloud/)
- [EC2 G6e Instances — AWS](https://aws.amazon.com/ec2/instance-types/g6e/)
- [EC2 P5 Instances — AWS](https://aws.amazon.com/ec2/instance-types/p5/)
- [EC2 On-Demand Pricing — AWS](https://aws.amazon.com/ec2/pricing/on-demand/)
- 프로젝트 내 관련 문서:
  - `services/ai-assistant-service/docs/OLLAMA_POC.md` — Ollama/Gemma 4 PoC 운영 가이드
  - `.claude/rules/11-pii.md` — PII 처리 규칙
  - `CLAUDE.md` — 프로젝트 전반 구조
