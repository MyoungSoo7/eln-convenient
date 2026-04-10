# 프로젝트 현황 (STATUS.md)

> 이 파일은 `.claude/hooks/update-status.sh`에 의해 자동 생성됩니다.
> 수동 갱신: `bash .claude/hooks/update-status.sh`

- **마지막 갱신**: 2026-04-10 10:00:03
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

```

## 프론트엔드 i18n

- 언어: `en ko `
- ko/ 파일 수: 13
- en/ 파일 수: 13

## Claude Code 자동화 구성 (.claude/)

| 항목 | 개수 |
|------|------|
| agents/ | 26 |
| rules/ | 12 |
| hooks/ | 6 |
| commands/ | 9 |

## 최근 커밋

```
20da3ef chore(infra): DR/감사로그/시크릿/PII 5종 인프라 강화
82b9de5 통합검색
84234d5 docs: enable agent teams flag and add team recipes
2e062cc ci: add Claude PR auto-review workflow
a4b0ab2 통합검색
```
