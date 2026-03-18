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

export function escapeHtml(str: string): string {
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
