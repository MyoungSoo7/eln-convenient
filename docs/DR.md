# Disaster Recovery Plan (DR)

> LabNote ELN 온프레미스 백업·복구 절차. 운영 시점부터 적용.

## 1. 보호 대상 / 목표

| 데이터 저장소 | 보호 대상 | RPO | RTO | 우선순위 |
|---|---|---|---|---|
| PostgreSQL (`labnote-postgres`) | 전 서비스 메타데이터, 감사로그, 서명 해시체인 | **15분** | 30분 | P0 (불가역) |
| MinIO (`labnote-minio`) | 첨부파일, 내보내기 PDF/ZIP | 1시간 | 1시간 | P0 |
| OpenSearch (`labnote-opensearch`) | 검색 인덱스 | 24시간 | 2시간 | P2 (재인덱싱 가능) |
| Qdrant (`labnote-qdrant`) | RAG 벡터 임베딩 | 24시간 | 2시간 | P2 (재임베딩 가능) |
| Redis (`labnote-redis`) | Stream / pub-sub / 캐시 | 실효 없음 | 즉시 | P3 (휘발 OK, AOF 권장) |

**RPO** = 데이터 손실 허용 시간, **RTO** = 복구까지 허용 시간.
P0는 손실 시 컴플라이언스 위반 위험 → 백업 실패 시 페이징 알림.

## 2. 백업 전략

### 2.1 PostgreSQL — 논리 백업 + WAL 아카이빙
- **일 1회** 전체 `pg_dump --format=custom --jobs=4` (야간 02:00 KST)
- **15분 간격** WAL 아카이빙 (RPO 15분 충족) — `archive_command`로 NAS/오브젝트 스토리지에 푸시
- 보관: 일별 14일, 주별 8주, 월별 12개월
- 스크립트: `scripts/backup/postgres.sh`

### 2.2 MinIO — `mc mirror` 증분
- **1시간 간격** 외부 MinIO/S3로 증분 미러링
- 보관: 30일 (delete marker로 소프트 삭제)
- 스크립트: `scripts/backup/minio.sh`

### 2.3 OpenSearch — Snapshot API
- **일 1회** snapshot repository → S3/공유 디스크
- 인덱스 이름: `notes`, `inventory`, `bookings` 등
- 손실 시 원본 DB(`eln`, `inventory`, `scheduler`)에서 재인덱싱 가능 → 백업은 RTO 단축 목적
- 스크립트: `scripts/backup/opensearch.sh`

### 2.4 Qdrant — Snapshot API
- **일 1회** collection snapshot
- 손실 시 ai-assistant-service의 재임베딩 잡으로 복구 가능
- 스크립트: `scripts/backup/qdrant.sh`

### 2.5 Redis — AOF 활성화 권장
- 운영 전환 시 `appendonly yes`, `appendfsync everysec` 설정
- Stream(`note:events`, `audit:events` 등) 손실은 idempotency consumer가 흡수해야 함 (Task ②)

## 3. 복구 절차 (Restore Drill)

### 3.1 Postgres — 전체 복구
```bash
# 1) 컨테이너 정지
docker compose stop postgres

# 2) 볼륨 초기화 (주의: 운영 시 사전 스냅샷)
docker volume rm services_postgres_data
docker compose up -d postgres

# 3) 덤프 복원
bash scripts/restore/postgres.sh /backup/postgres/2026-04-08.dump
```

### 3.2 MinIO — 버킷 복구
```bash
bash scripts/restore/minio.sh
```

### 3.3 OpenSearch — 인덱스 복구 (또는 재인덱싱)
- 옵션 A: snapshot 복원 → `scripts/restore/opensearch.sh`
- 옵션 B: 원본 재인덱싱 → 각 서비스의 reindex 엔드포인트 호출 (TODO: search-service에 reconcile job 추가 필요)

### 3.4 Qdrant — 컬렉션 복원 또는 재임베딩
- 옵션 A: snapshot 복원
- 옵션 B: ai-assistant-service의 `POST /api/ai/reindex-all` (운영 전 추가 예정)

## 4. 복구 리허설 (필수)

> **백업은 복구 리허설을 1회 이상 통과해야 백업으로 인정한다.**

분기별 1회, 별도 환경에서:
1. 가장 최근 백업 일체 가져오기
2. 위 절차로 전 스택 복구
3. 체크리스트 검증:
   - [ ] 최근 5건의 노트가 보이는가
   - [ ] 서명된 노트의 해시체인이 일관되는가 (`prev_hash` 연결 검증)
   - [ ] 첨부파일 다운로드 성공
   - [ ] 검색 결과가 채워지는가
   - [ ] 감사로그(AuditLog) 최근 1일치가 존재하는가

## 5. 운영 전환 체크리스트

- [ ] `archive_command` 설정 + WAL 아카이브 NAS 마운트
- [ ] MinIO 외부 미러 대상 구성 (별도 호스트)
- [ ] OpenSearch snapshot repository 등록
- [ ] Qdrant snapshot 디렉토리 마운트
- [ ] Redis AOF 활성화
- [ ] 백업 잡 cron 등록 (`crontab -e`)
- [ ] 백업 실패 알림 채널 (signature-audit notification 또는 Slack webhook)
- [ ] 분기별 복구 리허설 일정 등록

## 6. 책임자

| 역할 | 담당 |
|---|---|
| 백업 잡 모니터링 | DevOps |
| 복구 실행 | DevOps + 도메인 담당자 |
| 분기별 리허설 | DevOps |
| 컴플라이언스 보고 | 연구노트 PO |
