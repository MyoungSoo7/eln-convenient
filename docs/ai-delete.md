# AI 어시스턴트 서비스 제거 내역

> 제거 일자: 2026-03-18
> 사유: 이사 지시로 ai-assistant-service 전체 삭제

---

## 제거된 파일

| 파일 | 설명 |
|------|------|
| `src/api/ai.ts` | AI 서비스 API 클라이언트 (`/api/ai/*`) |
| `src/pages/AIAssistantPage.tsx` | AI 어시스턴트 UI 페이지 |
| `src/pages/AIAssistantPage.test.tsx` | AI 페이지 테스트 |
| `services/ai-assistant-service/` | 백엔드 서비스 디렉토리 (별도 삭제) |

---

## 수정된 파일

### `src/App.tsx`
- `AIAssistantPage` import 제거
- Route `/ai-assistant` 제거

### `src/components/AppSidebar.tsx`
- `Bot` lucide 아이콘 import 제거
- `mainItems` 배열에서 `AI 어시스턴트` 메뉴 항목 제거

### `services/api-gateway/src/routes/proxy.ts`
- `/api/ai` → `http://ai-assistant-service:8007` 프록시 항목 제거

### `services/docker-compose.yml`
- `ai-assistant-service` 서비스 블록 전체 제거 (포트 8007, qdrant/redis 의존성 포함)
- `api-gateway` 환경변수에서 `AI_SERVICE_URL` 제거
- `api-gateway` depends_on에서 `ai-assistant-service` 제거

### `services/.env`, `services/.env.example`
- `AI_PORT=8007` 제거

---

## 관련 인프라 (qdrant)

`qdrant` 컨테이너는 AI 서비스 전용으로 사용되었으며, 다른 서비스에서 사용하지 않아 함께 제거함.

- `docker-compose.yml` 에서 `qdrant` 서비스 블록 제거
- `volumes` 에서 `qdrant_data` 제거

---

## 제거된 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/ai/recommend-template` | 실험 주제 기반 템플릿 추천 |
| POST | `/api/ai/draft` | 초안 자동 생성 |
| POST | `/api/ai/ask` | 연구노트 기반 질의응답 |
| GET  | `/api/ai/index-status` | 벡터 인덱싱 상태 조회 |
