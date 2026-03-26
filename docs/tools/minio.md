# MinIO — 파일 스토리지 (S3 호환)

## 접속 정보

| 항목 | 값 |
|------|-----|
| 콘솔 URL | http://localhost:9001 |
| API 엔드포인트 | http://localhost:9000 |
| 로그인 | `.env`의 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |

## MinIO가 하는 일

연구노트에 첨부되는 **모든 파일**(이미지, PDF, 실험 데이터 등)을 저장하는 오브젝트 스토리지.
AWS S3와 동일한 API를 사용하므로, 나중에 AWS로 마이그레이션할 때 코드 변경 없이 엔드포인트만 바꾸면 된다.

## 버킷 구조

| 버킷 | 용도 | 자동 만료 |
|------|------|-----------|
| `labnote-files` | 일반 파일 업로드 (첨부파일, 이미지 등) | 없음 (영구 보관) |
| `labnote-exports` | PDF/ZIP 내보내기 결과물 | **7일 후 자동 삭제** |

서비스 시작 시 `ensureBuckets()`가 버킷이 없으면 자동 생성한다.

## 데이터 송수신 흐름

### 파일 업로드 (2가지 방식)

```
방식 1: 서버 경유 업로드
브라우저 → API Gateway → file-service → MinIO (PutObject)
                                      → PostgreSQL (메타데이터 저장)

방식 2: Presigned URL 직접 업로드 (대용량 파일)
브라우저 → API Gateway → file-service → presigned PUT URL 생성
브라우저 ──────────────────────────────→ MinIO (직접 업로드, 서버 부하 없음)
```

### 파일 다운로드

```
브라우저 → API Gateway → file-service → presigned GET URL 생성 (1시간 유효)
브라우저 ──────────────────────────────→ MinIO (직접 다운로드)
```

### PDF/ZIP 내보내기

```
사용자 요청 → signature-audit-service → BullMQ 작업 큐 등록
                                      ↓
              file-service (jobWorker) → Puppeteer PDF 생성
                                      → MinIO labnote-exports 버킷에 저장
                                      → presigned URL 생성 (24시간 유효)
```

## 연동 서비스

| 서비스 | 역할 |
|--------|------|
| **file-service** | 유일한 MinIO 직접 접근 서비스. 업/다운로드, presigned URL 생성, 삭제 |
| **signature-audit-service** | file-service에 내보내기 요청 → file-service가 MinIO에 저장 |
| **eln-service** | 노트 첨부파일 관리 → file-service API를 통해 간접 접근 |

## 콘솔 사용법

### 1. Object Browser
- 좌측 메뉴 **Object Browser** → `labnote-files` 또는 `labnote-exports` 클릭
- 파일 목록 확인, 미리보기, 수동 다운로드 가능
- 파일명 형식: `{UUID}.{확장자}` (예: `a7b5b0d6-f49b-4bd3-9047-785c915c2887.pdf`)

### 2. Buckets
- 버킷별 설정 확인 (Lifecycle 정책, Access Policy 등)
- `labnote-exports`의 7일 자동 만료 정책 확인 가능

### 3. Monitoring
- 좌측 메뉴 **Monitoring** → 스토리지 사용량, API 호출 횟수 확인

## 가장 중요하게 봐야 할 점

1. **버킷 존재 여부**: `labnote-files`와 `labnote-exports`가 모두 있는지 확인. 없으면 file-service 재시작 시 자동 생성됨
2. **스토리지 용량**: 온프레미스 환경에서 디스크 풀 시 모든 파일 업로드 실패. Monitoring에서 사용량 주시
3. **exports 만료 정책**: `labnote-exports`에 Lifecycle > Expiration: 7 Days가 설정되어 있는지 확인. 미설정 시 내보내기 파일이 영구 누적됨
4. **presigned URL 만료 시간**: 다운로드 1시간, 업로드 15분, 내보내기 24시간. 너무 짧거나 길면 `.env`에서 조정 불가(코드 수정 필요)
5. **MINIO_PUBLIC_URL**: 브라우저가 presigned URL로 직접 MinIO에 접근하므로, 이 값이 브라우저에서 도달 가능한 주소여야 한다. Docker 내부 주소(`minio:9000`)로 설정하면 다운로드 실패
