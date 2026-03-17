import { Worker, Job } from 'bullmq';
import puppeteer from 'puppeteer-core';
import Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { Writable } from 'stream';
import { ExportJobPayload, redisConnection } from '../lib/queue';
import { uploadBuffer, getPresignedUrl, BUCKET } from '../lib/minio';
import prisma from '../lib/prisma';

const ELN_URL = process.env.ELN_SERVICE_URL || 'http://localhost:8002';
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

// 템플릿 캐싱
const templateSrc = fs.readFileSync(
  path.join(__dirname, '../templates/note.html'),
  'utf-8'
);
const template = Handlebars.compile(templateSrc);

/** eln-service에서 노트 전체 정보 조회 */
async function fetchNote(noteId: string): Promise<any> {
  const res = await fetch(`${ELN_URL}/api/notes/${noteId}`);
  if (!res.ok) throw new Error(`노트 조회 실패: ${noteId} (${res.status})`);
  const body = await res.json() as any;
  return body.data ?? body;
}

/** 최신 전자서명 조회 */
async function fetchSignature(noteId: string): Promise<any> {
  return prisma.signature.findFirst({
    where: { noteId, status: 'valid' },
    orderBy: { chainIndex: 'desc' },
  });
}

/** 날짜 포맷 (YYYY-MM-DD HH:mm) */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** 노트 content → 섹션 파싱 (## 제목 기준) */
function parseSections(content: string): { title: string; content: string }[] {
  const lines = content.split('\n');
  const sections: { title: string; content: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push({ title: current.title, content: current.lines.join('\n').trim() });
      current = { title: line.replace('## ', '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ title: current.title, content: current.lines.join('\n').trim() });

  return sections.length > 0 ? sections : [];
}

/** 단일 노트 → PDF Buffer */
async function renderNoteToPdf(noteId: string): Promise<Buffer> {
  const [note, signature] = await Promise.all([
    fetchNote(noteId),
    fetchSignature(noteId),
  ]);

  const sections = note.content ? parseSections(note.content) : [];

  const html = template({
    note: {
      ...note,
      createdAt: formatDate(note.createdAt),
      updatedAt: formatDate(note.updatedAt),
      tags: note.tags ?? [],
    },
    sections,
    attachments: note.attachments ?? [],
    signature: signature ? {
      ...signature,
      timestamp: formatDate(signature.timestamp.toISOString()),
    } : null,
    printedAt: formatDate(new Date().toISOString()),
  });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '25mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: false,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/** ZIP buffer 생성 (복수 PDF) */
async function buildZip(pdfMap: Map<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
    });
    sink.on('finish', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);

    const archive = (archiver as any).default('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.pipe(sink);

    for (const [noteId, pdf] of pdfMap) {
      archive.append(pdf, { name: `note-${noteId}.pdf` });
    }
    archive.finalize();
  });
}

/** 잡 처리 메인 로직 */
async function processExportJob(job: Job<ExportJobPayload>): Promise<void> {
  const { jobId, noteId, format, noteIds, requestedBy } = job.data;

  console.log(`[export-worker] 잡 시작: ${format} / jobId=${jobId} / noteId=${noteId}`);

  // DB → processing
  await prisma.exportJob.update({ where: { id: jobId }, data: { status: 'processing' } });

  let fileUrl: string;

  if (format === 'pdf') {
    await job.updateProgress(10);
    const pdfBuffer = await renderNoteToPdf(noteId);
    await job.updateProgress(80);

    const key = `exports/${jobId}.pdf`;
    await uploadBuffer(key, pdfBuffer, 'application/pdf');
    fileUrl = await getPresignedUrl(key, 86400 * 7); // 7일 유효

  } else {
    // ZIP — 복수 노트
    const targets = noteIds ?? [noteId];
    const pdfMap = new Map<string, Buffer>();

    for (let i = 0; i < targets.length; i++) {
      pdfMap.set(targets[i], await renderNoteToPdf(targets[i]));
      await job.updateProgress(Math.floor(((i + 1) / targets.length) * 75));
    }

    const zipBuffer = await buildZip(pdfMap);
    await job.updateProgress(90);

    const key = `exports/${jobId}.zip`;
    await uploadBuffer(key, zipBuffer, 'application/zip');
    fileUrl = await getPresignedUrl(key, 86400 * 7);
  }

  // DB → completed
  await prisma.exportJob.update({
    where: { id: jobId },
    data: { status: 'completed', fileUrl, completedAt: new Date() },
  });

  // 완료 감사로그
  await prisma.auditLog.create({
    data: {
      id: uuidv4(),
      entityType: 'export',
      entityId: jobId,
      action: 'export_completed',
      actorId: requestedBy,
      details: { jobId, format, noteId, fileUrl },
    },
  });

  await job.updateProgress(100);
  console.log(`[export-worker] 잡 완료: ${jobId} → ${fileUrl.slice(0, 60)}...`);
}

/** 워커 인스턴스 생성 및 시작 */
export const exportWorker = new Worker<ExportJobPayload>(
  'labnote-export',
  processExportJob,
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

exportWorker.on('failed', (job, err) => {
  console.error(`[export-worker] 잡 실패: ${job?.id}`, err.message);
  if (job?.data?.jobId) {
    const { jobId, format, noteId, requestedBy } = job.data;
    prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMsg: err.message.slice(0, 500) },
    }).catch(() => {});

    prisma.auditLog.create({
      data: {
        id: uuidv4(),
        entityType: 'export',
        entityId: jobId,
        action: 'export_failed',
        actorId: requestedBy ?? 'system',
        details: { jobId, format, noteId, error: err.message.slice(0, 500) },
      },
    }).catch(() => {});
  }
});

exportWorker.on('completed', (job) => {
  console.log(`[export-worker] 완료 확인: ${job.id}`);
});

console.log('[export-worker] PDF/ZIP 변환 워커 시작됨');
