# 프로젝트 현황 (STATUS.md)

> 이 파일은 `.claude/hooks/update-status.sh`에 의해 자동 생성됩니다.
> 수동 갱신: `bash .claude/hooks/update-status.sh`

- **마지막 갱신**: 2026-04-07 18:14:53
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
labnote-ai                   Up 8 hours (healthy)
labnote-auth                 Up 8 hours (healthy)
labnote-collab               Up 8 hours (healthy)
labnote-dozzle               Up 8 hours
labnote-eln                  Up 2 hours (healthy)
labnote-file                 Up 8 hours (healthy)
labnote-gateway              Up 8 hours (healthy)
labnote-inventory            Up 2 hours (healthy)
labnote-inventory-frontend   Up 8 hours (healthy)
labnote-jaeger               Up 8 hours (healthy)
labnote-minio                Up 8 hours (healthy)
labnote-opensearch           Up 8 hours (healthy)
labnote-postgres             Up 8 hours (healthy)
labnote-qdrant               Up 8 hours
labnote-redis                Up 8 hours (healthy)
labnote-scheduler            Up 7 hours (healthy)
labnote-search               Up 2 hours (healthy)
labnote-signature            Up 8 hours (healthy)
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
2e062cc ci: add Claude PR auto-review workflow
a4b0ab2 통합검색
69ace71 알림 전체 메세지
4dd2bd5 fix(scheduler): 예약 카드가 지속 시간만큼 캘린더에 표시되도록 수정
b01d721 알림 전체 메세지
```
