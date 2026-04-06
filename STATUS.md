# 프로젝트 현황 (STATUS.md)

> 이 파일은 `.claude/hooks/update-status.sh`에 의해 자동 생성됩니다.
> 수동 갱신: `bash .claude/hooks/update-status.sh`

- **마지막 갱신**: 2026-04-06 11:26:56
- **현재 브랜치**: `eln`
- **백엔드 서비스 수**: 11

## 서비스 목록

```
ai-assistant-service
api-gateway
auth-service
collab-service
eln-service
file-service
inventory-frontend
inventory-service
scheduler-service
search-service
signature-audit-service
```

## 사용 포트 (docker-compose.yml)

`8000 8001 8002 8003 8004 8005 8006 8007 8008 8009 `

## Prisma 스키마 보유 서비스

`auth-service eln-service file-service inventory-service scheduler-service search-service signature-audit-service `

## Docker 컨테이너 상태

```
labnote-ai                   Up 43 minutes (healthy)
labnote-auth                 Up 43 minutes (healthy)
labnote-collab               Up 43 minutes (healthy)
labnote-dozzle               Up About an hour
labnote-eln                  Up 43 minutes (healthy)
labnote-file                 Up 43 minutes (healthy)
labnote-gateway              Up 40 minutes (healthy)
labnote-inventory            Up 43 minutes (healthy)
labnote-inventory-frontend   Up 40 minutes (healthy)
labnote-jaeger               Up About an hour (healthy)
labnote-minio                Up About an hour (healthy)
labnote-opensearch           Up About an hour (healthy)
labnote-postgres             Up About an hour (healthy)
labnote-qdrant               Up About an hour
labnote-redis                Up About an hour (healthy)
labnote-scheduler            Up 43 minutes (healthy)
labnote-search               Up 43 minutes (healthy)
labnote-signature            Up 40 minutes (healthy)
```

## 프론트엔드 i18n

- 언어: `en ko `
- ko/ 파일 수: 13
- en/ 파일 수: 13

## Claude Code 자동화 구성 (.claude/)

| 항목 | 개수 |
|------|------|
| agents/ | 25 |
| rules/ | 10 |
| hooks/ | 5 |
| commands/ | 9 |

## 최근 커밋

```
358950c 멀티테넌시
b05397e fix: 예약 승인 알림 미수신 수정 (orgId 누락 + SSE 인증)
b5a9adc 프로토콜 개선
2a35755 feat: ai-assistant-service 통합 (Qdrant RAG 기반)
fe253c4 기능명세서
```
