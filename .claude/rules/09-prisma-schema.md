---
description: Prisma 스키마 수정 시 규칙
globs: services/*/prisma/schema.prisma, services/*/prisma/migrations/**
---

# Prisma 스키마 규칙

## 구조
하나의 PostgreSQL 인스턴스, 서비스별 스키마 분리:
- `auth` — Organization, Role, User, Team
- `eln` — Note, NoteRevision, Template, Attachment
- `signature` — Signature(해시체인), AuditLog, ExportJob
- `inventory` — InventoryItem, Category
- `scheduler` — Resource, Booking
- `search` — SearchHistory, Favorite
- `file` — File, ExportJob

## 규칙

1. **멀티테넌시**: 모든 주요 테이블에 `orgId String` 필드 필수
2. **인덱스**: `orgId` 포함 복합 인덱스 추가 (쿼리 성능)
3. **마이그레이션 파일 직접 수정 금지**: `prisma migrate dev`로 생성
4. **DB 트리거**: `check_note_status_transition()` 등 기존 트리거 삭제/수정 금지
5. **스키마 변경 후**: 컨테이너 내에서 `npx prisma migrate dev --name <설명>` 실행 필요
