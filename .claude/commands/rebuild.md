# Service Rebuild Agent

백엔드 서비스를 빌드하고 재시작한 뒤 정상 동작을 확인한다.

## 역할
- Docker Compose로 서비스 빌드 & 재시작
- 빌드 로그에서 에러 감지
- 헬스체크로 정상 기동 확인
- 실패 시 원인 분석

## 서비스 매핑

| 서비스명 | docker-compose 서비스명 | 컨테이너명 | 포트 |
|----------|----------------------|-----------|------|
| auth-service | auth | labnote-auth | 8001 |
| eln-service | eln | labnote-eln | 8002 |
| signature-audit-service | signature-audit | labnote-signature-audit | 8003 |
| inventory-service | inventory | labnote-inventory | 8004 |
| scheduler-service | scheduler | labnote-scheduler | 8005 |
| search-service | search | labnote-search | 8006 |
| file-service | file | labnote-file | 8008 |
| collab-service | collab | labnote-collab | 8009 |
| api-gateway | api-gateway | labnote-api-gateway | 8000 |

## 실행 절차

$ARGUMENTS 를 서비스명(들)으로 받는다. 인자가 없으면 어떤 서비스를 빌드할지 물어본다.

### 1단계: 빌드 & 재시작
```bash
cd services && docker compose up -d --build <서비스명>
```

### 2단계: 빌드 로그 확인 (최근 50줄)
```bash
docker compose logs --tail=50 <서비스명>
```
- TypeScript 컴파일 에러, 모듈 누락 등 감지
- 에러 발견 시 원인 분석 후 사용자에게 보고

### 3단계: 헬스체크
```bash
curl -sf http://localhost:<포트>/health
```
- 응답이 없으면 30초 대기 후 재시도 (최대 1회)
- 실패 시 로그 재확인

### 4단계: 결과 보고
- 빌드 성공/실패 여부
- 서비스 기동 상태
- 에러가 있다면 핵심 에러 메시지와 수정 제안

## 복수 서비스 빌드
쉼표 또는 공백으로 여러 서비스를 지정할 수 있다:
```
/rebuild auth eln
/rebuild auth,eln,search
```

## 전체 빌드
`all` 또는 `전체`를 인자로 받으면:
```bash
cd services && docker compose up -d --build
```

## 주의사항
- shared 패키지 수정 시 의존하는 모든 서비스를 함께 빌드해야 함
- Prisma 스키마 수정 시 마이그레이션이 필요할 수 있음 — `/prisma-migrate` 스킬 안내
