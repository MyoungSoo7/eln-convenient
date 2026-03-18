// services/file-service/src/processors/pdfProcessor.ts
import prisma from '../lib/prisma';
import { getNoteForExport } from '../lib/elnClient';
import { generatePdf, markdownToHtml, escapeHtml } from '../lib/pdfGenerator';
import { uploadObjectToBucket, EXPORTS_BUCKET, deleteObjectFromBucket } from '../lib/minio';
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
      headerHtml: `<div style="font-size:9px;width:100%;text-align:right;padding-right:20px;color:#666;">${escapeHtml(note.title)} | ${new Date().toLocaleDateString('ko-KR')}</div>`,
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
    await deleteObjectFromBucket(EXPORTS_BUCKET, objectKey);
    await failJob(jobId, `DB 저장 실패: ${message}`);
  }
}
