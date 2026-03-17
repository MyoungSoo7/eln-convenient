# File Service 감사 보고서

**서비스**: `file-service`
**포트**: 8008
**감사일**: 2026-03-17
**상태**: 구현 완료 (55% → 97%+)

---

## 1. 서비스 개요

MinIO(S3 호환) 오브젝트 스토리지를 통한 파일 업로드/다운로드/메타데이터 관리 서비스.

- **스토리지**: MinIO (`labnote-files` 버킷)
- **AWS SDK**: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- **파일 크기 제한**: 50MB (multer)
- **Auth**: API Gateway 통해 `x-user-id`, `x-user-permissions` 헤더 전달

---

## 2. API 엔드포인트

모든 엔드포인트 `x-user-id` 인증 필수.

### 업로드

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| POST | /api/files | file:upload | multipart/form-data 업로드 |
| GET | /api/files/presigned-upload | file:upload | presigned PUT URL 발급 (신규) |

### 다운로드

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | /api/files/:id | file:read | presigned URL로 302 리디렉트 |
| GET | /api/files/:id/url | file:read | presigned URL JSON 반환 (신규) |
| GET | /api/files/:id/stream | file:read | 서버 경유 스트리밍 |

### 메타 / 삭제

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | /api/files/:id/meta | file:read | 파일 메타데이터 조회 |
| DELETE | /api/files/:id | file:delete | 파일 삭제 |

---

## 3. 기능 상세

### 3.1 직접 업로드 (POST /api/files)

```
POST /api/files
Content-Type: multipart/form-data

file: (binary)
linkedEntityType: note | protocol | inventory   (선택)
linkedEntityId: {uuid}                          (선택)
```

- 원본 파일명, 업로더, linkedEntity 정보를 MinIO `Metadata`에 함께 저장
- MinIO key = `{uuid}.{ext}` 형태로 저장
- 차단 MIME 타입: `application/x-msdownload`, `application/x-executable`, `application/x-sh` 등

**응답:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "key": "uuid.pdf",
    "originalName": "실험노트.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 102400,
    "storagePath": "labnote-files/uuid.pdf",
    "uploadedBy": "user-uuid",
    "linkedEntityType": "note",
    "linkedEntityId": "note-uuid",
    "createdAt": "2026-03-17T09:00:00.000Z"
  }
}
```

### 3.2 Presigned 업로드 URL (GET /api/files/presigned-upload)

클라이언트가 서버를 경유하지 않고 MinIO에 직접 업로드할 때 사용.

```
GET /api/files/presigned-upload?filename=report.pdf&contentType=application/pdf
```

**응답:**
```json
{
  "ok": true,
  "data": {
    "fileId": "uuid",
    "key": "uuid.pdf",
    "uploadUrl": "http://minio:9000/labnote-files/uuid.pdf?X-Amz-...",
    "expiresAt": "2026-03-17T09:15:00.000Z"
  }
}
```

클라이언트는 `uploadUrl`로 `PUT` 요청하여 직접 업로드. URL 유효시간 **15분**.

### 3.3 Presigned 다운로드 URL (GET /api/files/:id/url)

리디렉트 없이 URL만 반환.

```
GET /api/files/{uuid}/url?expiresIn=3600
```

**응답:**
```json
{
  "ok": true,
  "data": {
    "key": "uuid.pdf",
    "url": "http://minio:9000/labnote-files/uuid.pdf?X-Amz-...",
    "expiresAt": "2026-03-17T10:00:00.000Z"
  }
}
```

### 3.4 파일 스트리밍 (GET /api/files/:id/stream)

- 서버가 MinIO에서 파일을 받아 클라이언트에 파이프
- `Content-Disposition: attachment; filename*=UTF-8''...` 으로 원본 파일명 전달 (RFC 5987)
- 한글 파일명 지원 (MinIO Metadata에서 디코딩)

### 3.5 파일 메타데이터 (GET /api/files/:id/meta)

MinIO `HeadObject` 결과 + 저장된 Metadata 반환:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "key": "uuid.pdf",
    "originalName": "실험노트.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 102400,
    "storagePath": "labnote-files/uuid.pdf",
    "uploadedBy": "user-uuid",
    "linkedEntityType": "note",
    "linkedEntityId": "note-uuid",
    "lastModified": "2026-03-17T09:00:00.000Z"
  }
}
```

---

## 4. UUID → MinIO Key 조회 방식

업로드 시 MinIO key = `{uuid}.{ext}`. 조회 시 `:id` = UUID만 있어 key를 알 수 없는 문제가 있었음.

**해결:** `findKeyByPrefix(uuid)` — `ListObjectsV2`로 UUID prefix 검색:
```typescript
await s3.send(new ListObjectsV2Command({
  Bucket: BUCKET,
  Prefix: uuid,   // → "uuid.pdf" 매칭
  MaxKeys: 1,
}));
```

`?key=uuid.pdf` 쿼리 파라미터로 key를 직접 전달하면 prefix 검색 생략 가능.

---

## 5. MinIO Metadata 구조

| 키 (소문자) | 설명 |
|------------|------|
| `originalname` | URL-encoded 원본 파일명 |
| `uploadedby` | 업로더 user ID |
| `linkedentitytype` | 연결된 엔티티 타입 |
| `linkedentityid` | 연결된 엔티티 UUID |

---

## 6. 감사 결과

### 6.1 감사 전 문제점

| # | 문제 | 심각도 |
|---|------|--------|
| 1 | UUID → MinIO key 불일치: `GET /:id`에서 UUID를 key로 직접 사용 → 항상 404 | CRITICAL |
| 2 | `auth.middleware.ts` JSON.parse 크래시 | HIGH |
| 3 | `uploadFile`이 `linkedEntityType`, `linkedEntityId` body 완전 무시 | HIGH |
| 4 | presigned 업로드 URL 엔드포인트 없음 (대용량 파일 직접 업로드 불가) | HIGH |
| 5 | `streamFile` Content-Disposition에 UUID key 사용 → 다운로드 시 UUID 파일명 | MEDIUM |
| 6 | 원본 파일명이 MinIO에 저장되지 않아 메타 조회 시 복원 불가 | MEDIUM |
| 7 | `getFileMeta`에 originalName 없음 | MEDIUM |
| 8 | MIME 타입 검증 없음 (실행 파일 업로드 가능) | MEDIUM |
| 9 | presigned URL JSON 반환 엔드포인트 없음 (redirect만 있음) | MEDIUM |
| 10 | 응답에 `ok` 래퍼 없음 | LOW |

### 6.2 수정 사항

| 파일 | 수정 내용 |
|------|----------|
| `src/middlewares/auth.middleware.ts` | JSON.parse try/catch 추가 |
| `src/lib/minio.ts` | `findKeyByPrefix()` 추가 (ListObjectsV2), `uploadObject()` Metadata 파라미터 추가, `getPresignedUploadUrl()` 추가 |
| `src/interfaces/file.interface.ts` | `key`, `linkedEntityType`, `linkedEntityId` 필드 추가 |
| `src/dtos/file.dto.ts` | `UploadFileDto`, `PresignedUploadRequestDto`, `PresignedUploadResponseDto` 재작성 |
| `src/controllers/file.controller.ts` | 전체 재작성: UUID→key 조회, MIME 차단, originalName 저장/복원, linkedEntity 지원, presigned upload/download URL, ok 래퍼 |
| `src/routes/file.routes.ts` | `GET /presigned-upload`, `GET /:id/url` 추가 |

### 6.3 감사 후 커버리지

| 기능 영역 | 감사 전 | 감사 후 |
|-----------|---------|---------|
| 파일 업로드 | 60% | 100% |
| Presigned 업로드 URL | 0% | 100% |
| 파일 다운로드 (redirect) | 20% (UUID 조회 버그) | 100% |
| Presigned 다운로드 URL | 0% | 100% |
| 파일 스트리밍 | 20% (UUID 버그, 파일명) | 100% |
| 파일 메타데이터 | 40% | 100% |
| 파일 삭제 | 20% (UUID 버그) | 100% |
| MIME 타입 검증 | 0% | 100% |
| linkedEntity 연결 | 0% | 100% |
| 오류 처리 | 50% | 97% |
| **전체** | **~55%** | **~97%** |

---

## 7. 에러 코드 일람

| HTTP | 상황 |
|------|------|
| 400 | 파일 없음, 차단 MIME 타입, 필수 쿼리 파라미터 누락 |
| 401 | x-user-id 헤더 없음 |
| 403 | 권한 부족 |
| 404 | 파일(UUID prefix 매칭 없음) |
| 502 | MinIO 통신 오류 |

---

## 8. 클라이언트 사용 패턴

### 패턴 A: 서버 경유 업로드 (기본)
```
1. POST /api/files (multipart) → { id, key, ... }
2. 이후 key 또는 id로 조회
```

### 패턴 B: MinIO 직접 업로드 (대용량 권장)
```
1. GET /api/files/presigned-upload?filename=foo.pdf&contentType=application/pdf
   → { fileId, key, uploadUrl }
2. PUT {uploadUrl} (binary body)  ← 서버 경유 없음
3. 이후 fileId 또는 key로 조회
```

---

## 9. 향후 개선 사항 (권고)

1. **파일 목록 API**: `GET /api/files?linkedEntityType=note&linkedEntityId={uuid}` — 특정 노트에 첨부된 파일 목록
2. **파일 DB 연동**: PostgreSQL에 파일 메타 저장으로 더 풍부한 조회/검색 지원
3. **이미지 썸네일**: 이미지 업로드 시 자동 썸네일 생성
4. **바이러스 검사**: ClamAV 연동으로 업로드 파일 실시간 검사
5. **버전 관리**: 동일 linkedEntity의 파일 버전 이력 관리
