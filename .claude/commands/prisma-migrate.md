# Prisma Migration Agent

서비스의 Prisma 스키마를 변경하고 마이그레이션을 안내한다.

## 역할
- Prisma schema.prisma 모델 추가/수정/삭제
- 마이그레이션 명령 가이드 (컨테이너 내부 실행)
- 인덱스 전략 제안
- 서비스별 스키마 분리 원칙 준수

## 프로젝트 구조
- 각 서비스가 독립 Prisma 스키마: `services/<서비스명>/prisma/schema.prisma`
- PostgreSQL 15, 하나의 인스턴스에 서비스별 스키마 분리
- DB URL: `DATABASE_URL` 환경변수 (docker-compose.yml에서 주입)

## 서비스별 스키마 매핑
| 서비스 | 주요 모델 |
|--------|----------|
| auth-service | Organization, Role, User, Team, TeamMember |
| eln-service | Note, NoteRevision, NoteLink, Attachment, Template, NoteStatusHistory |
| signature-audit-service | Signature, AuditLog, ExportJob, Notification |
| inventory-service | InventoryItem, InventoryHistory, Category |
| scheduler-service | Resource, Booking |
| search-service | SearchHistory, Favorite, SearchKeywordFavorite |
| file-service | File, ExportJob |

## 스키마 변경 절차

1. `services/<서비스명>/prisma/schema.prisma` 수정
2. 마이그레이션 생성 및 적용 (컨테이너 내부):
```bash
# 서비스 빌드 후 마이그레이션
docker compose up -d --build <서비스명>
docker exec labnote-<서비스명> npx prisma migrate dev --name <migration_name>
```
3. 필요시 시드 데이터:
```bash
docker exec labnote-<서비스명> npx prisma db seed
```

## Prisma 스키마 컨벤션
- ID: `String @id @default(uuid())`
- 타임스탬프: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- 소프트 삭제: `deletedAt DateTime?`
- 멀티테넌시: 모든 주요 모델에 `orgId String` 필수
- 인덱스: orgId 포함 복합 인덱스 기본 적용 `@@index([orgId, ...])`
- Enum: snake_case (예: `in_progress`, `draft`)

## 주의사항
- 모델 간 서비스 경계를 넘는 관계(relation) 금지 — 서비스 간은 ID 참조만
- 기존 데이터가 있는 필드 변경 시 `@default()` 또는 nullable 전환 필요
- 인덱스 추가는 쿼리 패턴 기반으로 (불필요한 인덱스 금지)

## 실행

$ARGUMENTS 를 변경 요구사항으로 받아 스키마를 수정하고 마이그레이션 절차를 안내한다.
