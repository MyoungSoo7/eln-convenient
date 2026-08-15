# 프로젝트 현황 (STATUS.md)

> 이 파일은 `.claude/hooks/update-status.sh`에 의해 자동 생성됩니다.
> 수동 갱신: `bash .claude/hooks/update-status.sh`

- **마지막 갱신**: 2026-08-16 01:06:44
- **현재 브랜치**: `main`
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
- ko/ 파일 수:       13
- en/ 파일 수:       13

## Claude Code 자동화 구성 (.claude/)

| 항목 | 개수 |
|------|------|
| agents/ |       26 |
| rules/ |       12 |
| hooks/ |        6 |
| commands/ |       10 |

## 최근 커밋

```
c74b161 Merge branch 'prep/main-baseline'
125f09b Merge branch 'eln' into main — AI 스택 복원
30666d8 test: rd-team 이 바꾼 계약에 테스트를 맞춘다 (문구 → 제약조건/에러코드)
662a89f fix(auth): 비밀번호 초기화 라우트의 조직 경계 복원 + 하드코딩 기본값 제거
ee308e6 Merge branch 'rd-team' into eln-without-ai
```
