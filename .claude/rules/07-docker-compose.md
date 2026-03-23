---
description: docker-compose.yml 및 인프라 설정 수정 시 규칙
globs: services/docker-compose.yml, services/Dockerfile*, services/**/Dockerfile
---

# Docker Compose / 인프라 규칙

## 서비스 포트 맵
| 서비스 | 포트 |
|--------|------|
| api-gateway | 8000 |
| auth-service | 8001 |
| eln-service | 8002 |
| signature-audit-service | 8003 |
| inventory-service | 8004 |
| scheduler-service | 8005 |
| search-service | 8006 |
| file-service | 8008 |
| collab-service (ws) | 8009 |

## 규칙

1. **필수 환경변수**: `${VAR:?설명}` 패턴으로 누락 시 즉시 실패하도록 설정
2. **헬스체크 필수**: 모든 서비스에 healthcheck 정의
3. **의존성**: `depends_on` + `condition: service_healthy`로 기동 순서 보장
4. **내부 네트워크**: 서비스 간 통신은 Docker 내부 DNS 사용 (`http://auth-service:8001`)
5. **볼륨**: 영속 데이터는 named volume 사용 (`postgres_data`, `redis_data` 등)
6. **새 서비스 추가 시**: 포트 충돌 확인, INTERNAL_SECRET 환경변수 포함
