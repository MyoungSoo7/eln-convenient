// services/file-service/src/processors/zipProcessor.ts
import archiver from 'archiver';
import { PassThrough } from 'stream';
import prisma from '../lib/prisma';
import {
  EXPORTS_BUCKET,
  createMultipartUpload, uploadPart,
  completeMultipartUpload, abortMultipartUpload,
  deleteObjectFromBucket,
} from '../lib/minio';
import { getNoteForExport, getSignedNotes, getNotesByTag } from '../lib/elnClient';
import { generatePdf, markdownToHtml } from '../lib/pdfGenerator';
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
    await deleteObjectFromBucket(EXPORTS_BUCKET, objectKey);
    await failJob(jobId, `DB 저장 실패: ${message}`);
  }
}
