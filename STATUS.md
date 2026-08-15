# 프로젝트 현황 (STATUS.md)

> 이 파일은 `.claude/hooks/update-status.sh`에 의해 자동 생성됩니다.
> 수동 갱신: `bash .claude/hooks/update-status.sh`

- **마지막 갱신**: 2026-04-13 13:53:43
- **현재 브랜치**: `eln`
- **백엔드 서비스 수**: 16

## 서비스 목록

```
ai-assistant-service
api-gateway
auth-service
collab-service
eln-service
eval-harness-service
experiment-tracker-service
file-service
fine-tune-jobs-service
gemma-gateway
inventory-frontend
inventory-service
model-registry-service
scheduler-service
search-service
signature-audit-service
```

## 사용 포트 (docker-compose.yml)

`8000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011 8012 8013 8014 `

## Prisma 스키마 보유 서비스

`auth-service eln-service file-service fine-tune-jobs-service inventory-service model-registry-service scheduler-service search-service signature-audit-service `

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
b38b5fe docs: OMC 운영 가이드, DB 용량 산정, ccmonitor 문서 추가 및 OMC 플러그인 활성화
2d2ebb1 chore(harness): Claude Code 하네스 강화 — 단일 디스패처, 메타룰, deny 룰 확장
3422330 feat(research): Gemma 4 연구 플랫폼 구축 — provider 추상화, gemma-gateway, eval-harness, MLflow
20da3ef chore(infra): DR/감사로그/시크릿/PII 5종 인프라 강화
82b9de5 통합검색
```
