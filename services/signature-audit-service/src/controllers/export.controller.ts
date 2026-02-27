import { FastifyRequest, FastifyReply } from 'fastify';

export async function exportPdf(req: FastifyRequest<{ Params: { noteId: string } }>, reply: FastifyReply) {
  // TODO: 실제 PDF 변환 로직 (puppeteer / pdfkit 등)
  reply.code(202);
  return {
    ok: true,
    data: {
      jobId: 'job-pdf-001',
      noteId: req.params.noteId,
      status: 'queued',
      message: 'PDF 내보내기 작업이 대기열에 추가되었습니다.',
    },
  };
}

export async function getExportStatus(req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) {
  return {
    ok: true,
    data: {
      jobId: req.params.jobId,
      status: 'completed',
      downloadUrl: `/api/files/export-${req.params.jobId}.pdf`,
    },
  };
}

export async function exportZip(req: FastifyRequest, reply: FastifyReply) {
  // TODO: 다건 ZIP 내보내기
  reply.code(202);
  return {
    ok: true,
    data: {
      jobId: 'job-zip-001',
      status: 'queued',
      message: 'ZIP 내보내기 작업이 대기열에 추가되었습니다.',
    },
  };
}
