# file-service Export 완성 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 MinIO-only file-service에 PostgreSQL 메타데이터 DB와 PDF/ZIP export job 시스템을 추가해 완전한 파일 플랫폼으로 완성한다.

**Architecture:** Express + TypeScript + Prisma(PostgreSQL) + MinIO(S3 SDK). 파일은 MinIO에 저장, 메타데이터와 export job 상태는 PostgreSQL에 저장. PDF/ZIP export는 in-process job worker가 비동기로 처리하며 eln-service internal API로 노트 데이터를 가져온다.

**Tech Stack:** Node.js 20, Express, Prisma 5, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, puppeteer (HTML→PDF), archiver (ZIP streaming), multer, TypeScript 5

---

## 현재 상태 파악

**이미 구현됨 (건드리지 말 것):**
- `src/lib/minio.ts` — S3Client 래퍼, presigned URL, streaming, ensureBucket
- `src/middlewares/auth.middleware.ts` — requireAuth, requireRole, requirePermission
- `src/controllers/file.controller.ts` — 업로드, 다운로드, 메타, 삭제 (MinIO only)
- `src/routes/file.routes.ts` — 파일 CRUD 라우트
- `src/index.ts` — Express 앱 진입점

**추가/수정할 파일:**

| 파일 | 유형 | 설명 |
|------|------|------|
| `prisma/schema.prisma` | 신규 | files, export_jobs 테이블 |
| `src/lib/prisma.ts` | 신규 | Prisma Client 싱글톤 |
| `src/lib/minio.ts` | 수정 | labnote-exports 버킷 추가 |
| `src/lib/elnClient.ts` | 신규 | eln-service internal API 클라이언트 |
| `src/lib/pdfGenerator.ts` | 신규 | HTML→PDF (puppeteer) |
| `src/lib/zipExporter.ts` | 신규 | ZIP streaming (archiver + S3 multipart) |
| `src/lib/jobWorker.ts` | 신규 | in-process export job 큐 |
| `src/controllers/file.controller.ts` | 수정 | DB 메타데이터 저장 통합 |
| `src/controllers/export.controller.ts` | 신규 | export job CRUD |
| `src/routes/export.routes.ts` | 신규 | /api/exports 라우트 |
| `src/index.ts` | 수정 | export 라우트 등록, job worker 시작, DB 헬스 |
| `Dockerfile` | 수정 | chromium 설치 (PDF 생성용) |
| `services/docker-compose.yml` | 수정 | DATABASE_URL, ELN_SERVICE_URL, INTERNAL_SECRET 추가 |

---

## Task 1: Prisma 설치 및 DB 스키마 생성

**Files:**
- Create: `services/file-service/prisma/schema.prisma`
- Create: `services/file-service/src/lib/prisma.ts`

- [ ] **Step 1: prisma 패키지 설치**

```bash
cd services/file-service
npm install @prisma/client
npm install -D prisma
```

- [ ] **Step 2: prisma/schema.prisma 생성**

```prisma
// services/file-service/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model File {
  id              String      @id @default(uuid())
  bucket          String
  objectKey       String      @unique
  originalName    String
  mimeType        String?
  sizeBytes       BigInt?
  checksumSha256  String?
  uploaderId      String
  refType         String?     // 'note' | 'project' | 'export' | 'attachment'
  refId           String?
  isDeleted       Boolean     @default(false)
  deletedAt       DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  exportJob       ExportJob?  @relation("ResultFile")

  @@index([refType, refId])
  @@index([uploaderId])
  @@index([isDeleted])
  @@map("files")
}

model ExportJob {
  id            String    @id @default(uuid())
  type          String    // 'pdf' | 'zip'
  status        String    @default("PENDING")
                          // PENDING | PROCESSING | COMPLETED | FAILED
  requestedBy   String
  params        Json      // PDF: {noteId} | ZIP: {scope, projectId?, noteIds?}
  resultFileId  String?   @unique
  resultFile    File?     @relation("ResultFile", fields: [resultFileId], references: [id])
  errorMessage  String?
  retryCount    Int       @default(0)
  startedAt     DateTime?
  completedAt   DateTime?
  expiresAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([status])
  @@index([requestedBy])
  @@map("export_jobs")
}
```

- [ ] **Step 3: src/lib/prisma.ts 생성**

```typescript
// services/file-service/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

- [ ] **Step 4: package.json에 prisma 스크립트 추가**

`services/file-service/package.json`의 `"scripts"` 섹션에 추가:

```json
"db:push": "prisma db push",
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev"
```

- [ ] **Step 5: DB가 뜬 상태에서 스키마 push 테스트**

```bash
cd services/file-service
DATABASE_URL="postgresql://labnote:labnote_secret_2024@localhost:5432/labnote?schema=file" \
  npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

> **참고:** `?schema=file`은 PostgreSQL 스키마(네임스페이스)를 `file`로 설정한다. Prisma `db push`가 해당 스키마를 자동 생성하므로 사전 생성 불필요.

- [ ] **Step 6: Commit**

```bash
cd services/file-service
git add prisma/schema.prisma src/lib/prisma.ts package.json package-lock.json
git commit -m "feat(file-service): add Prisma setup with files and export_jobs schema"
```

---

## Task 2: MinIO 클라이언트 확장 — labnote-exports 버킷 추가

**Files:**
- Modify: `services/file-service/src/lib/minio.ts`

- [ ] **Step 1: minio.ts 수정 — exports 버킷 추가**

`src/lib/minio.ts` 파일에서 상단에 추가:

```typescript
export const EXPORTS_BUCKET = process.env.MINIO_EXPORTS_BUCKET || 'labnote-exports';
```

기존 `ensureBucket` 함수를 다음으로 교체:

```typescript
/** 두 버킷 모두 존재 확인 / 생성 */
export async function ensureBuckets(): Promise<void> {
  for (const bucket of [BUCKET, EXPORTS_BUCKET]) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[file-service] 버킷 생성: ${bucket}`);
    }
  }
}

// 하위 호환 alias
export const ensureBucket = ensureBuckets;
```

multipart upload 지원 함수 추가:

```typescript
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

// (기존 함수들 유지)

/** Multipart Upload 시작 */
export async function createMultipartUpload(bucket: string, key: string, contentType: string) {
  const res = await s3.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }));
  return res.UploadId!;
}

/** Multipart 파트 업로드 */
export async function uploadPart(
  bucket: string, key: string, uploadId: string,
  partNumber: number, body: Buffer
): Promise<string> {
  const res = await s3.send(new UploadPartCommand({
    Bucket: bucket, Key: key, UploadId: uploadId,
    PartNumber: partNumber, Body: body,
  }));
  return res.ETag!;
}

/** Multipart Upload 완료 */
export async function completeMultipartUpload(
  bucket: string, key: string, uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

/** Multipart Upload 중단 (실패 시 cleanup) */
export async function abortMultipartUpload(
  bucket: string, key: string, uploadId: string
): Promise<void> {
  try {
    await s3.send(new AbortMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
    }));
  } catch (err) {
    console.error('[minio] abortMultipartUpload 실패 (무시):', err);
  }
}

/** 임의 버킷에 오브젝트 업로드 */
export async function uploadObjectToBucket(
  bucket: string, key: string, body: Buffer, contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body,
    ContentType: contentType, Metadata: metadata,
  }));
}

/** 임의 버킷 presigned URL */
export async function getPresignedUrlFromBucket(
  bucket: string, key: string, expiresIn = 300
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

/** 임의 버킷 오브젝트 삭제 */
export async function deleteObjectFromBucket(bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.error('[minio] deleteObjectFromBucket 실패 (무시):', err);
  }
}
```

- [ ] **Step 2: index.ts에서 ensureBucket → ensureBuckets 호출 확인**

`src/index.ts`에서 이미 `ensureBucket()`를 호출하므로 alias가 작동함. 변경 불필요.

- [ ] **Step 3: Commit**

```bash
git add services/file-service/src/lib/minio.ts
git commit -m "feat(file-service): add labnote-exports bucket and multipart upload helpers"
```

---

## Task 3: 파일 업로드/메타/삭제에 DB 영속화 통합

**Files:**
- Modify: `services/file-service/src/controllers/file.controller.ts`

**원칙: MinIO 먼저 → DB 저장. DB 실패 시 MinIO 롤백.**

- [ ] **Step 1: file.controller.ts 상단에 prisma import 추가**

파일 상단 import 섹션에 추가:

```typescript
import prisma from '../lib/prisma';
```

- [ ] **Step 2: uploadFile 함수 수정 — MinIO 성공 후 DB에 files 레코드 저장**

기존 `uploadFile` 함수에서 `await uploadObject(...)` 이후 `res.status(201)...` 전에 삽입:

```typescript
// MinIO 업로드 성공 → DB 저장
let dbFile: { id: string } | null = null;
try {
  dbFile = await prisma.file.create({
    data: {
      id: fileId,
      bucket: BUCKET,
      objectKey: key,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: BigInt(file.size),
      uploaderId: uploadedBy,
      refType: linkedEntityType,
      refId: linkedEntityId,
    },
    select: { id: true },
  });
} catch (dbErr) {
  // DB 실패 → MinIO 롤백
  console.error('[file-service] DB 저장 실패, MinIO 롤백:', dbErr);
  try { await deleteObject(key); } catch {}
  res.status(500).json({ ok: false, error: '파일 메타데이터 저장에 실패했습니다.' });
  return;
}

console.log(`[file-service] 업로드 완료: ${file.originalname} → ${key} (dbId: ${dbFile.id})`);
// 응답에서 refType/refId 필드명을 DB 모델과 통일 (기존 IFileMeta의 linkedEntityType/linkedEntityId 대체)
res.status(201).json({
  ok: true,
  data: {
    id: fileId,
    key,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storagePath: `${BUCKET}/${key}`,
    uploadedBy,
    refType: linkedEntityType,
    refId: linkedEntityId,
    createdAt: new Date().toISOString(),
  },
});
```

> **필드명 주의:** DB 모델은 `refType`/`refId`를 사용한다. 기존 `IFileMeta` 인터페이스의 `linkedEntityType`/`linkedEntityId`는 이 응답에서 더 이상 사용하지 않는다. 기존 클라이언트가 `linkedEntityType`을 읽고 있다면 `refType`으로 마이그레이션해야 한다.

- [ ] **Step 3: getFileMeta 함수 수정 — DB 우선 조회**

기존 `getFileMeta` 함수를 전면 교체:

```typescript
export async function getFileMeta(req: Request, res: Response): Promise<void> {
  try {
    // DB에서 먼저 조회
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, isDeleted: false },
    });
    if (file) {
      res.json({
        ok: true,
        data: {
          id: file.id,
          key: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
          storagePath: `${file.bucket}/${file.objectKey}`,
          uploadedBy: file.uploaderId,
          refType: file.refType,
          refId: file.refId,
          createdAt: file.createdAt.toISOString(),
        },
      });
      return;
    }
    // DB에 없으면 MinIO HeadObject fallback (레거시 파일 지원)
    const key = await resolveKey(req.params.id, req.query.key as string);
    if (!key) { res.status(404).json({ ok: false, error: '파일을 찾을 수 없습니다.' }); return; }
    const head = await headObject(key);
    const originalName = head.Metadata?.originalname
      ? decodeURIComponent(head.Metadata.originalname) : key;
    res.json({
      ok: true,
      data: {
        id: req.params.id,
        key,
        originalName,
        mimeType: head.ContentType,
        sizeBytes: head.ContentLength,
        storagePath: `${BUCKET}/${key}`,
        uploadedBy: head.Metadata?.uploadedby || 'unknown',
        refType: head.Metadata?.linkedentitytype || null,
        refId: head.Metadata?.linkedentityid || null,
        lastModified: head.LastModified?.toISOString(),
      },
    });
  } catch (err) {
    console.error('[file-service] 메타 조회 실패:', err);
    res.status(404).json({ ok: false, error: '파일을 찾을 수 없습니다.' });
  }
}
```

- [ ] **Step 4: deleteFile 함수 수정 — DB soft delete**

기존 `deleteFile` 함수를 교체:

```typescript
export async function deleteFile(req: Request, res: Response): Promise<void> {
  try {
    // DB에서 파일 조회
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, isDeleted: false },
    });
    if (file) {
      // DB soft delete
      await prisma.file.update({
        where: { id: req.params.id },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      // MinIO 비동기 삭제 (fire-and-forget)
      deleteObject(file.objectKey).catch((err) =>
        console.error('[file-service] MinIO soft-delete 비동기 삭제 실패:', err)
      );
      res.json({ ok: true, id: req.params.id, message: '파일이 삭제되었습니다.' });
      return;
    }
    // 레거시 MinIO-only 파일 처리
    const key = await resolveKey(req.params.id, req.query.key as string);
    if (!key) { res.status(404).json({ ok: false, error: '파일을 찾을 수 없습니다.' }); return; }
    await deleteObject(key);
    res.json({ ok: true, id: req.params.id, key, message: '파일이 삭제되었습니다.' });
  } catch (err) {
    console.error('[file-service] 삭제 실패:', err);
    res.status(502).json({ ok: false, error: '파일 삭제에 실패했습니다.' });
  }
}
```

- [ ] **Step 5: 수동 업로드 테스트**

```bash
# 서버 실행 후
curl -X POST http://localhost:8008/api/files \
  -H "x-user-id: test-user" \
  -H "x-user-permissions: [\"*\"]" \
  -F "file=@/path/to/test.txt"
# Expected: {"ok":true,"data":{"id":"...","key":"...","originalName":"test.txt",...}}
```

- [ ] **Step 6: Commit**

```bash
git add services/file-service/src/controllers/file.controller.ts
git commit -m "feat(file-service): persist file metadata to PostgreSQL on upload/delete"
```

---

## Task 4: Export Job CRUD API

**Files:**
- Create: `services/file-service/src/controllers/export.controller.ts`
- Create: `services/file-service/src/routes/export.routes.ts`
- Modify: `services/file-service/src/index.ts`

- [ ] **Step 1: export.controller.ts 생성 — job 생성/조회/삭제**

```typescript
// services/file-service/src/controllers/export.controller.ts
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { jobQueue } from '../lib/jobWorker';

// ─── POST /api/exports/pdf ───────────────────────────────────────
export async function createPdfExport(req: Request, res: Response): Promise<void> {
  const { noteId } = req.body;
  if (!noteId) {
    res.status(400).json({ ok: false, error: 'noteId가 필요합니다.' });
    return;
  }
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.create({
      data: {
        type: 'pdf',
        status: 'PENDING',
        requestedBy,
        params: { noteId },
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
      },
    });
    jobQueue.push(job.id);
    res.status(202).json({ ok: true, data: toDto(job) });
  } catch (err) {
    console.error('[export] PDF job 생성 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 생성에 실패했습니다.' });
  }
}

// ─── POST /api/exports/zip ───────────────────────────────────────
export async function createZipExport(req: Request, res: Response): Promise<void> {
  const { scope, projectId, noteIds } = req.body;
  if (!scope || !['all', 'project', 'selected'].includes(scope)) {
    res.status(400).json({ ok: false, error: 'scope는 all | project | selected 중 하나입니다.' });
    return;
  }
  if (scope === 'project' && !projectId) {
    res.status(400).json({ ok: false, error: 'scope=project 이면 projectId가 필요합니다.' });
    return;
  }
  if (scope === 'selected' && (!Array.isArray(noteIds) || noteIds.length === 0)) {
    res.status(400).json({ ok: false, error: 'scope=selected 이면 noteIds 배열이 필요합니다.' });
    return;
  }
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.create({
      data: {
        type: 'zip',
        status: 'PENDING',
        requestedBy,
        params: { scope, projectId: projectId || null, noteIds: noteIds || null },
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    jobQueue.push(job.id);
    res.status(202).json({ ok: true, data: toDto(job) });
  } catch (err) {
    console.error('[export] ZIP job 생성 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 생성에 실패했습니다.' });
  }
}

// ─── GET /api/exports ────────────────────────────────────────────
export async function listExports(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  const { status, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  try {
    const where = {
      requestedBy,
      ...(status ? { status: status as string } : {}),
    };
    const [jobs, total] = await Promise.all([
      prisma.exportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.exportJob.count({ where }),
    ]);
    res.json({ ok: true, data: jobs.map(toDto), total, page: parseInt(page as string) });
  } catch (err) {
    console.error('[export] 목록 조회 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 목록 조회에 실패했습니다.' });
  }
}

// ─── GET /api/exports/:jobId ─────────────────────────────────────
export async function getExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.findFirst({
      where: { id: req.params.jobId, requestedBy },
    });
    if (!job) { res.status(404).json({ ok: false, error: 'Export job을 찾을 수 없습니다.' }); return; }
    res.json({ ok: true, data: toDto(job) });
  } catch (err) {
    console.error('[export] 조회 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 조회에 실패했습니다.' });
  }
}

// ─── GET /api/exports/:jobId/download ───────────────────────────
export async function downloadExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.findFirst({
      where: { id: req.params.jobId, requestedBy },
      include: { resultFile: true },
    });
    if (!job) { res.status(404).json({ ok: false, error: 'Export job을 찾을 수 없습니다.' }); return; }
    if (job.status !== 'COMPLETED' || !job.resultFile) {
      res.status(409).json({ ok: false, error: `Export가 완료되지 않았습니다. 현재 상태: ${job.status}` });
      return;
    }
    const { getPresignedUrlFromBucket } = await import('../lib/minio');
    const url = await getPresignedUrlFromBucket(job.resultFile.bucket, job.resultFile.objectKey, 300);
    res.redirect(url);
  } catch (err) {
    console.error('[export] download 실패:', err);
    res.status(502).json({ ok: false, error: '다운로드 URL 생성에 실패했습니다.' });
  }
}

// ─── DELETE /api/exports/:jobId ──────────────────────────────────
export async function cancelExport(req: Request, res: Response): Promise<void> {
  const requestedBy = req.headers['x-user-id'] as string;
  try {
    const job = await prisma.exportJob.findFirst({
      where: { id: req.params.jobId, requestedBy },
    });
    if (!job) { res.status(404).json({ ok: false, error: 'Export job을 찾을 수 없습니다.' }); return; }
    if (!['PENDING', 'FAILED'].includes(job.status)) {
      res.status(409).json({ ok: false, error: `${job.status} 상태의 job은 취소할 수 없습니다.` });
      return;
    }
    await prisma.exportJob.delete({ where: { id: job.id } });
    res.json({ ok: true, message: 'Export job이 취소되었습니다.' });
  } catch (err) {
    console.error('[export] 취소 실패:', err);
    res.status(500).json({ ok: false, error: 'Export job 취소에 실패했습니다.' });
  }
}

// ─── DTO 변환 ────────────────────────────────────────────────────
function toDto(job: {
  id: string; type: string; status: string; requestedBy: string;
  params: unknown; resultFileId: string | null; errorMessage: string | null;
  retryCount: number; startedAt: Date | null; completedAt: Date | null;
  expiresAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    params: job.params,
    resultFileId: job.resultFileId,
    errorMessage: job.errorMessage,
    retryCount: job.retryCount,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}
```

- [ ] **Step 2: export.routes.ts 생성**

```typescript
// services/file-service/src/routes/export.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import * as ctrl from '../controllers/export.controller';

const router = Router();
router.use(requireAuth);

router.post('/pdf',          ctrl.createPdfExport);
router.post('/zip',          ctrl.createZipExport);
router.get('/',              ctrl.listExports);
router.get('/:jobId',        ctrl.getExport);
router.get('/:jobId/download', ctrl.downloadExport);
router.delete('/:jobId',    ctrl.cancelExport);

export default router;
```

- [ ] **Step 3: index.ts 수정 — export 라우트 등록**

`src/index.ts`를 다음과 같이 수정 (기존 import 4줄 뒤에 새 import, 기존 `/api/files` 라우트 뒤에 새 라우트 추가):

```typescript
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import fileRoutes from './routes/file.routes';
import exportRoutes from './routes/export.routes';      // ← 추가
import { swaggerDocument } from './swagger';
import { ensureBucket } from './lib/minio';

const app = express();
const PORT = process.env.PORT || 8008;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'file-service', timestamp: new Date().toISOString() });
});

app.use('/api/files', fileRoutes);
app.use('/api/exports', exportRoutes);                  // ← 추가

app.listen(PORT, async () => {
  console.log(`[file-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[file-service] Swagger: http://localhost:${PORT}/docs`);
  try {
    await ensureBucket();
    console.log('[file-service] MinIO 버킷 준비 완료');
  } catch (err) {
    console.error('[file-service] MinIO 버킷 초기화 실패 (나중에 재시도):', err);
  }
});

export default app;
```

`jobQueue`와 `registerProcessor` 등록은 Task 5에서 index.ts를 추가 수정한다.

- [ ] **Step 4: Commit**

```bash
git add services/file-service/src/controllers/export.controller.ts \
        services/file-service/src/routes/export.routes.ts \
        services/file-service/src/index.ts
git commit -m "feat(file-service): add export job CRUD API (POST pdf/zip, GET, DELETE)"
```

---

## Task 5: In-process Job Worker

**Files:**
- Create: `services/file-service/src/lib/jobWorker.ts`

- [ ] **Step 1: jobWorker.ts 생성**

```typescript
// services/file-service/src/lib/jobWorker.ts
import prisma from './prisma';

// ── 타입 ────────────────────────────────────────────────────────
type JobProcessor = (jobId: string) => Promise<void>;

// ── 간단한 in-process FIFO 큐 ─────────────────────────────────
export const jobQueue: string[] = [];
let processing = false;

const processors: Record<string, JobProcessor> = {};

export function registerProcessor(type: string, fn: JobProcessor) {
  processors[type] = fn;
}

export function startWorker() {
  setInterval(tick, 2000); // 2초마다 폴링
  console.log('[jobWorker] 시작됨 (2s 폴링)');
}

async function tick() {
  if (processing) return;
  // 1. 메모리 큐 처리
  if (jobQueue.length > 0) {
    const jobId = jobQueue.shift()!;
    await runJob(jobId);
    return;
  }
  // 2. DB에서 PENDING job 재수집 (재시작 후 복구)
  try {
    const pending = await prisma.exportJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    if (pending) await runJob(pending.id);
  } catch {
    // DB 연결 실패 무시
  }
}

async function runJob(jobId: string) {
  processing = true;
  try {
    const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'PENDING') return;

    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const processor = processors[job.type];
    if (!processor) {
      await failJob(jobId, `알 수 없는 job 타입: ${job.type}`);
      return;
    }

    await processor(jobId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[jobWorker] job ${jobId} 처리 중 예외:`, err);
    await failOrRetry(jobId, message);
  } finally {
    processing = false;
  }
}

export async function failJob(jobId: string, errorMessage: string) {
  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: 'FAILED', errorMessage, completedAt: new Date() },
  });
}

export async function failOrRetry(jobId: string, errorMessage: string) {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.retryCount < 3) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        errorMessage,
        retryCount: { increment: 1 },
      },
    });
    // 지수 백오프: 2^retryCount * 5s
    const delay = Math.pow(2, job.retryCount) * 5000;
    setTimeout(() => jobQueue.push(jobId), delay);
    console.log(`[jobWorker] job ${jobId} 재시도 예약 (${delay}ms, ${job.retryCount + 1}/3)`);
  } else {
    await failJob(jobId, errorMessage);
    console.error(`[jobWorker] job ${jobId} 최대 재시도 초과, FAILED 확정`);
  }
}

// 만료된 export job 정리 (1시간마다)
export function startExpiryCleanup() {
  setInterval(async () => {
    try {
      const expired = await prisma.exportJob.findMany({
        where: { status: 'COMPLETED', expiresAt: { lt: new Date() } },
        include: { resultFile: true },
      });
      for (const job of expired) {
        if (job.resultFile) {
          const { deleteObjectFromBucket } = await import('./minio');
          await deleteObjectFromBucket(job.resultFile.bucket, job.resultFile.objectKey);
          await prisma.file.update({
            where: { id: job.resultFile.id },
            data: { isDeleted: true, deletedAt: new Date() },
          });
        }
        await prisma.exportJob.delete({ where: { id: job.id } });
        console.log(`[jobWorker] 만료 job 정리: ${job.id}`);
      }
    } catch (err) {
      console.error('[jobWorker] 만료 정리 실패:', err);
    }
  }, 60 * 60 * 1000); // 1시간
}
```

- [ ] **Step 2: index.ts 수정 — worker 시작 (Task 4의 index.ts에서 이어서 수정)**

`src/index.ts` 전체를 다음으로 교체:

```typescript
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import fileRoutes from './routes/file.routes';
import exportRoutes from './routes/export.routes';
import { swaggerDocument } from './swagger';
import { ensureBucket } from './lib/minio';
import { startWorker, startExpiryCleanup, registerProcessor } from './lib/jobWorker';
import { processPdfJob } from './processors/pdfProcessor';    // Task 7에서 생성
import { processZipJob } from './processors/zipProcessor';    // Task 8에서 생성

const app = express();
const PORT = process.env.PORT || 8008;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'file-service', timestamp: new Date().toISOString() });
});

app.use('/api/files', fileRoutes);
app.use('/api/exports', exportRoutes);

app.listen(PORT, async () => {
  console.log(`[file-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[file-service] Swagger: http://localhost:${PORT}/docs`);

  // export job processors 등록
  registerProcessor('pdf', processPdfJob);
  registerProcessor('zip', processZipJob);

  // job worker 시작 (2s 폴링)
  startWorker();
  startExpiryCleanup();

  try {
    await ensureBucket();
    console.log('[file-service] MinIO 버킷 준비 완료');
  } catch (err) {
    console.error('[file-service] MinIO 버킷 초기화 실패 (나중에 재시도):', err);
  }
});

export default app;
```

> **주의:** `processPdfJob`과 `processZipJob` import는 Task 7, Task 8에서 파일이 생성된 후 컴파일 가능해진다. Task 5 단계에서는 TypeScript 오류가 발생하는 게 정상 — Task 7/8 완료 후 해소된다. 미리 작성해두면 Task 5 commit 이후 별도 index.ts 수정을 생략할 수 있다.

- [ ] **Step 3: Commit**

```bash
git add services/file-service/src/lib/jobWorker.ts services/file-service/src/index.ts
git commit -m "feat(file-service): add in-process job worker with retry and expiry cleanup"
```

---

## Task 6: eln-service Internal API 클라이언트

**Files:**
- Create: `services/file-service/src/lib/elnClient.ts`

- [ ] **Step 1: elnClient.ts 생성**

```typescript
// services/file-service/src/lib/elnClient.ts
import http from 'http';

const ELN_SERVICE_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 8000;

export interface NoteExportData {
  id: string;
  title: string;
  content: string;         // Markdown or HTML
  sections: unknown[];
  status: string;
  authorId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteListItem {
  id: string;
  title: string;
  status: string;
  authorId: string;
}

function request<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ELN_SERVICE_URL);
    const options = {
      hostname: url.hostname,
      port: parseInt(url.port || '8002'),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
        'Accept': 'application/json',
      },
      timeout: TIMEOUT_MS,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 404) {
            reject(new Error(`노트를 찾을 수 없습니다: ${path}`));
            return;
          }
          if (!parsed.ok) {
            reject(new Error(parsed.error || 'eln-service 오류'));
            return;
          }
          resolve(parsed.data as T);
        } catch {
          reject(new Error('eln-service 응답 파싱 실패'));
        }
      });
    });
    // Node.js의 timeout 이벤트는 소켓을 자동으로 닫지 않는다. req.destroy()를 명시적으로 호출해야 커넥션이 정리된다.
    req.on('timeout', () => { req.destroy(); reject(new Error('eln-service 응답 시간 초과')); });
    req.on('error', (err) => reject(new Error(`eln-service 연결 실패: ${err.message}`)));
    req.end();
  });
}

/** 단일 노트 데이터 조회 (export용) */
export async function getNoteForExport(noteId: string): Promise<NoteExportData> {
  return request<NoteExportData>(`/api/notes/${noteId}`);
}

/** 전체 노트 목록 (ZIP 전체 내보내기용, 서명된 노트만) */
export async function getSignedNotes(): Promise<NoteListItem[]> {
  return request<NoteListItem[]>(`/api/notes?status=signed&limit=1000`);
}

/** 프로젝트(태그) 기준 노트 목록 */
export async function getNotesByTag(tag: string): Promise<NoteListItem[]> {
  return request<NoteListItem[]>(`/api/notes?tag=${encodeURIComponent(tag)}&status=signed&limit=1000`);
}
```

- [ ] **Step 2: Commit**

```bash
git add services/file-service/src/lib/elnClient.ts
git commit -m "feat(file-service): add eln-service internal API client for note data fetch"
```

---

## Task 7: PDF 생성 (HTML→PDF, puppeteer)

**Files:**
- Modify: `services/file-service/Dockerfile`
- Modify: `services/file-service/package.json`
- Create: `services/file-service/src/lib/pdfGenerator.ts`
- Create: `services/file-service/src/processors/pdfProcessor.ts`

- [ ] **Step 1: puppeteer 설치**

```bash
cd services/file-service
npm install puppeteer
```

> puppeteer는 자체 Chromium 번들을 내려받는다. Docker 빌드 시 `PUPPETEER_SKIP_DOWNLOAD=false`(기본)로 자동 다운로드.

- [ ] **Step 2: Dockerfile 수정 — Alpine → Debian-slim + 시스템 의존성**

`services/file-service/Dockerfile`을 완전 교체:

```dockerfile
FROM node:20-slim

# puppeteer/chromium 의존성
RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxss1 \
  wget \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 8008
CMD ["npm", "start"]
```

- [ ] **Step 3: pdfGenerator.ts 생성**

```typescript
// services/file-service/src/lib/pdfGenerator.ts
import puppeteer, { Browser } from 'puppeteer';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
  }
  return browserInstance;
}

export interface PdfRenderOptions {
  title: string;
  htmlContent: string;
  headerHtml?: string;
  footerHtml?: string;
}

/** HTML → PDF Buffer */
export async function generatePdf(options: PdfRenderOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const fullHtml = buildHtml(options);
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: options.headerHtml || `
        <div style="font-size:9px;width:100%;text-align:center;color:#666;font-family:sans-serif;">
          ${options.title}
        </div>`,
      footerTemplate: options.footerHtml || `
        <div style="font-size:9px;width:100%;text-align:center;color:#666;font-family:sans-serif;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

function buildHtml({ title, htmlContent }: PdfRenderOptions): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
    h1 { font-size: 24px; font-weight: 700; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 16px; }
    h2 { font-size: 18px; font-weight: 600; margin-top: 24px; }
    h3 { font-size: 15px; font-weight: 600; margin-top: 16px; }
    p { margin: 8px 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    img { max-width: 100%; height: auto; }
    .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
    .section { margin-bottom: 24px; border-left: 3px solid #4f81bd; padding-left: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="content">${htmlContent}</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 최소한의 Markdown → HTML 변환. pdfProcessor/zipProcessor 모두 이 함수를 import해서 사용 (DRY) */
export function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)/, '<p>$1</p>');
}
```

- [ ] **Step 4: pdfProcessor.ts 생성 — PDF export job 실행 로직**

```typescript
// services/file-service/src/processors/pdfProcessor.ts
import prisma from '../lib/prisma';
import { getNoteForExport } from '../lib/elnClient';
import { generatePdf, markdownToHtml } from '../lib/pdfGenerator';  // markdownToHtml은 pdfGenerator에서 단일 정의
import { uploadObjectToBucket, EXPORTS_BUCKET } from '../lib/minio';
import { failJob } from '../lib/jobWorker';

export async function processPdfJob(jobId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const params = job.params as { noteId: string };

  // 1. eln-service에서 노트 데이터 가져오기
  let note;
  try {
    note = await getNoteForExport(params.noteId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, `노트 조회 실패: ${message}`);
    return;
  }

  // 2. 노트 내용을 HTML로 변환 (Markdown → HTML 간단 처리)
  const htmlContent = markdownToHtml(note.content);

  // 3. PDF 생성
  let pdfBuffer;
  try {
    pdfBuffer = await generatePdf({
      title: note.title,
      htmlContent,
      headerHtml: `<div style="font-size:9px;width:100%;text-align:right;padding-right:20px;color:#666;">${note.title} | ${new Date().toLocaleDateString('ko-KR')}</div>`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, `PDF 생성 실패: ${message}`);
    return;
  }

  // 4. MinIO에 업로드 (labnote-exports 버킷)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const objectKey = `pdf/${jobId}/note-${dateStr}.pdf`;
  try {
    await uploadObjectToBucket(EXPORTS_BUCKET, objectKey, pdfBuffer, 'application/pdf', {
      jobid: jobId,
      noteid: params.noteId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, `MinIO 업로드 실패: ${message}`);
    return;
  }

  // 5. files 레코드 생성 + job 완료 처리 (트랜잭션)
  try {
    await prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          bucket: EXPORTS_BUCKET,
          objectKey,
          originalName: `note-${dateStr}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: BigInt(pdfBuffer.length),
          uploaderId: job.requestedBy,
          refType: 'export',
          refId: jobId,
        },
      });
      await tx.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          resultFileId: file.id,
          completedAt: new Date(),
        },
      });
    });
    console.log(`[pdfProcessor] job ${jobId} COMPLETED`);
  } catch (err: unknown) {
    // DB 실패 → MinIO 정리 후 FAILED
    const message = err instanceof Error ? err.message : String(err);
    const { deleteObjectFromBucket } = await import('../lib/minio');
    await deleteObjectFromBucket(EXPORTS_BUCKET, objectKey);
    await failJob(jobId, `DB 저장 실패: ${message}`);
  }
}

// markdownToHtml은 pdfGenerator.ts에서 export하므로 여기서 중복 정의하지 않는다.
```

- [ ] **Step 5: processor 등록은 Task 5에서 작성한 index.ts에 이미 포함됨**

Task 5 Step 2에서 `index.ts` 전체를 작성했고, `registerProcessor('pdf', processPdfJob)` 호출이 이미 포함되어 있다. 추가 수정 불필요 — 이 단계는 확인만 한다.

```bash
# pdfProcessor.ts가 생성되었으므로 이제 index.ts 컴파일이 가능해진다
cd services/file-service && npx tsc --noEmit
# Expected: 오류 없음 (zipProcessor.ts가 없으면 해당 import 오류는 남아있음 — Task 8 후 해소)
```

- [ ] **Step 6: Commit**

```bash
git add services/file-service/Dockerfile \
        services/file-service/src/lib/pdfGenerator.ts \
        services/file-service/src/processors/pdfProcessor.ts \
        services/file-service/package.json \
        services/file-service/package-lock.json \
        services/file-service/src/index.ts
git commit -m "feat(file-service): add puppeteer PDF generation and PDF export job processor"
```

---

## Task 8: ZIP Streaming Export

**Files:**
- Modify: `services/file-service/package.json`
- Create: `services/file-service/src/processors/zipProcessor.ts`
- Modify: `services/file-service/src/index.ts`

- [ ] **Step 1: archiver 설치**

```bash
cd services/file-service
npm install archiver
npm install -D @types/archiver
```

- [ ] **Step 2: zipProcessor.ts 생성**

```typescript
// services/file-service/src/processors/zipProcessor.ts
import archiver from 'archiver';
import { PassThrough } from 'stream';
import prisma from '../lib/prisma';
import {
  EXPORTS_BUCKET,
  createMultipartUpload, uploadPart,
  completeMultipartUpload, abortMultipartUpload,
} from '../lib/minio';
import { getNoteForExport, getSignedNotes, getNotesByTag } from '../lib/elnClient';
import { generatePdf, markdownToHtml } from '../lib/pdfGenerator';  // markdownToHtml은 pdfGenerator에서 단일 정의 (DRY)
import { failJob } from '../lib/jobWorker';

const PART_SIZE = 5 * 1024 * 1024; // 5MB — S3 multipart 최소 단위

export async function processZipJob(jobId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const params = job.params as {
    scope: 'all' | 'project' | 'selected';
    projectId?: string;
    noteIds?: string[];
  };

  // 1. 내보낼 노트 ID 목록 수집
  let noteIds: string[];
  try {
    if (params.scope === 'selected') {
      noteIds = params.noteIds!;
    } else if (params.scope === 'project') {
      const notes = await getNotesByTag(params.projectId!);
      noteIds = notes.map((n) => n.id);
    } else {
      const notes = await getSignedNotes();
      noteIds = notes.map((n) => n.id);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, `노트 목록 조회 실패: ${message}`);
    return;
  }

  if (noteIds.length === 0) {
    await failJob(jobId, '내보낼 노트가 없습니다.');
    return;
  }

  // 2. MinIO multipart upload 시작
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const objectKey = `zip/${jobId}/export-${dateStr}.zip`;
  let uploadId = '';  // TypeScript strict 모드 미초기화 오류 방지; 첫 번째 catch에서 early return하므로 빈 문자열로 도달하지 않는다
  try {
    uploadId = await createMultipartUpload(EXPORTS_BUCKET, objectKey, 'application/zip');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(jobId, `MinIO multipart 시작 실패: ${message}`);
    return;
  }

  // 3. archiver → PassThrough → 버퍼 누적 → multipart parts
  const parts: { PartNumber: number; ETag: string }[] = [];
  let partNumber = 1;
  let totalSize = 0;
  let buffer = Buffer.alloc(0);

  try {
    await new Promise<void>((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 6 } });
      const passThrough = new PassThrough();

      archive.pipe(passThrough);
      archive.on('error', reject);

      passThrough.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        totalSize += chunk.length;
      });

      passThrough.on('end', resolve);
      passThrough.on('error', reject);

      // 각 노트를 PDF로 변환 후 ZIP에 추가
      (async () => {
        for (const noteId of noteIds) {
          try {
            const note = await getNoteForExport(noteId);
            const htmlContent = markdownToHtml(note.content);
            const pdfBuf = await generatePdf({ title: note.title, htmlContent });
            const safeName = note.title.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 100);
            archive.append(pdfBuf, { name: `${safeName}.pdf` });
          } catch (err) {
            console.warn(`[zipProcessor] 노트 ${noteId} PDF 생성 실패, 건너뜀:`, err);
          }
        }
        archive.finalize();
      })();
    });

    // 버퍼를 5MB 단위로 multipart 업로드
    let offset = 0;
    while (offset < buffer.length) {
      const chunk = buffer.slice(offset, offset + PART_SIZE);
      // 마지막 파트가 5MB 미만이어도 CompleteMultipartUpload에서 허용됨
      const etag = await uploadPart(EXPORTS_BUCKET, objectKey, uploadId, partNumber, chunk);
      parts.push({ PartNumber: partNumber, ETag: etag });
      partNumber++;
      offset += PART_SIZE;
    }

    await completeMultipartUpload(EXPORTS_BUCKET, objectKey, uploadId, parts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await abortMultipartUpload(EXPORTS_BUCKET, objectKey, uploadId);
    await failJob(jobId, `ZIP 생성/업로드 실패: ${message}`);
    return;
  }

  // 4. DB 저장 + job 완료
  try {
    await prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          bucket: EXPORTS_BUCKET,
          objectKey,
          originalName: `export-${dateStr}.zip`,
          mimeType: 'application/zip',
          sizeBytes: BigInt(totalSize),
          uploaderId: job.requestedBy,
          refType: 'export',
          refId: jobId,
        },
      });
      await tx.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          resultFileId: file.id,
          completedAt: new Date(),
        },
      });
    });
    console.log(`[zipProcessor] job ${jobId} COMPLETED (${noteIds.length}개 노트, ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const { deleteObjectFromBucket } = await import('../lib/minio');
    await deleteObjectFromBucket(EXPORTS_BUCKET, objectKey);
    await failJob(jobId, `DB 저장 실패: ${message}`);
  }
}

// markdownToHtml은 pdfGenerator.ts에서 import했으므로 여기서 중복 정의하지 않는다.
```

- [ ] **Step 3: index.ts ZIP processor 등록 확인**

Task 5 Step 2에서 작성한 `index.ts`에 이미 `registerProcessor('zip', processZipJob)` 호출이 포함되어 있다. `zipProcessor.ts`가 생성되었으므로 이제 컴파일이 성공한다.

```bash
cd services/file-service && npx tsc --noEmit
# Expected: 오류 없음
```

- [ ] **Step 4: Commit**

```bash
git add services/file-service/src/processors/zipProcessor.ts \
        services/file-service/package.json \
        services/file-service/package-lock.json \
        services/file-service/src/index.ts
git commit -m "feat(file-service): add ZIP streaming export processor with archiver + S3 multipart"
```

---

## Task 9: docker-compose 연동 + 전체 통합 테스트

**Files:**
- Modify: `services/docker-compose.yml`
- Modify: `services/file-service/src/index.ts` (헬스체크 개선)

- [ ] **Step 1: docker-compose.yml — file-service 환경변수 추가**

`services/docker-compose.yml`의 `file-service` 섹션 `environment` 블록에 추가:

```yaml
environment:
  - PORT=8008
  - MINIO_ENDPOINT=minio
  - MINIO_PORT=9000
  - MINIO_ACCESS_KEY=${MINIO_ROOT_USER:-minioadmin}
  - MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD:-minioadmin123}
  - MINIO_BUCKET=labnote-files
  - MINIO_EXPORTS_BUCKET=labnote-exports          # 추가
  - DATABASE_URL=postgresql://labnote:labnote_secret_2024@postgres:5432/labnote?schema=file  # 추가
  - ELN_SERVICE_URL=http://eln-service:8002        # 추가
  - INTERNAL_SECRET=${INTERNAL_SECRET:-}           # 추가
```

`depends_on`에 `postgres` 추가:

```yaml
depends_on:
  minio:
    condition: service_healthy
  postgres:                       # 추가
    condition: service_healthy
```

- [ ] **Step 2: index.ts 헬스체크 개선 — DB + MinIO 연결 상태 포함**

`src/index.ts`의 `/health` 핸들러를 교체:

```typescript
app.get('/health', async (_req, res) => {
  let dbOk = false;
  let minioOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  try {
    const { s3, BUCKET } = await import('./lib/minio');
    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    minioOk = true;
  } catch {}
  const healthy = dbOk && minioOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'file-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
    minio: minioOk ? 'ok' : 'error',
  });
});
```

- [ ] **Step 3: Dockerfile CMD 수정 — DB push 후 서버 시작**

`RUN npx prisma generate`는 Task 7 Step 2에서 이미 Dockerfile에 추가했다. 이 단계에서는 `CMD` 한 줄만 수정한다:

```dockerfile
# 기존:
CMD ["npm", "start"]

# 교체:
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
```

- [ ] **Step 4: Docker 이미지 재빌드 및 컨테이너 재시작**

```bash
cd services
docker compose build file-service
docker compose up -d file-service
```

- [ ] **Step 5: 헬스체크 확인**

```bash
sleep 10 && curl -s http://localhost:8008/health
# Expected: {"status":"ok","service":"file-service","db":"ok","minio":"ok",...}
```

- [ ] **Step 6: 파일 업로드 통합 테스트**

```bash
# 파일 업로드
curl -X POST http://localhost:8008/api/files \
  -H "x-user-id: user1" \
  -H 'x-user-permissions: ["*"]' \
  -F "file=@/tmp/test.txt;type=text/plain" \
  -F "refType=note" \
  -F "refId=test-note-1"
# Expected: {"ok":true,"data":{"id":"<uuid>","key":"<uuid>.txt",...}}

# 저장된 ID로 메타 조회
FILE_ID="<위에서 받은 id>"
curl -s "http://localhost:8008/api/files/${FILE_ID}/meta" \
  -H "x-user-id: user1" \
  -H 'x-user-permissions: ["*"]'
# Expected: {"ok":true,"data":{"id":"...","originalName":"test.txt",...}}
```

- [ ] **Step 7: PDF export 통합 테스트**

```bash
# PDF export job 생성 (실제 노트 ID가 있어야 함)
curl -X POST http://localhost:8008/api/exports/pdf \
  -H "x-user-id: user1" \
  -H 'x-user-permissions: ["*"]' \
  -H "Content-Type: application/json" \
  -d '{"noteId":"<실제-노트-uuid>"}'
# Expected: {"ok":true,"data":{"id":"<jobId>","status":"PENDING",...}}

JOB_ID="<위에서 받은 id>"

# 2-5초 후 상태 폴링
sleep 5 && curl -s "http://localhost:8008/api/exports/${JOB_ID}" \
  -H "x-user-id: user1" \
  -H 'x-user-permissions: ["*"]'
# Expected: {"ok":true,"data":{"status":"COMPLETED","resultFileId":"...",...}}

# 다운로드 (302 리디렉트)
curl -L "http://localhost:8008/api/exports/${JOB_ID}/download" \
  -H "x-user-id: user1" \
  -H 'x-user-permissions: ["*"]' \
  -o /tmp/exported.pdf
# Expected: PDF 파일 다운로드 성공
```

- [ ] **Step 8: ZIP export 통합 테스트**

```bash
curl -X POST http://localhost:8008/api/exports/zip \
  -H "x-user-id: user1" \
  -H 'x-user-permissions: ["*"]' \
  -H "Content-Type: application/json" \
  -d '{"scope":"all"}'
# Expected: {"ok":true,"data":{"id":"<jobId>","status":"PENDING",...}}
```

- [ ] **Step 9: Final commit**

```bash
git add services/docker-compose.yml \
        services/file-service/Dockerfile \
        services/file-service/src/index.ts
git commit -m "feat(file-service): wire docker-compose DATABASE_URL/ELN_SERVICE_URL, add DB+MinIO health check"
```

---

## 구현 완료 기준

| 기능 | 확인 방법 |
|------|----------|
| TypeScript 컴파일 오류 없음 | `npm run build` 성공 |
| `/health` → `{"db":"ok","minio":"ok"}` | curl |
| 파일 업로드 → DB files 레코드 생성 | curl + DB 조회 |
| 파일 메타 → DB 우선 조회 | curl |
| Soft delete → `is_deleted=true` | curl + DB 조회 |
| PDF export → PENDING→PROCESSING→COMPLETED | curl 폴링 |
| PDF 다운로드 → 실제 PDF 파일 | curl -L -o |
| ZIP export → PENDING→COMPLETED | curl 폴링 |
| 실패 재시도 → 3회 후 FAILED | 로그 확인 |
| 만료 파일 자동 삭제 | 48h 후 확인 |
