import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';

const results = JSON.parse(readFileSync('test-results.json', 'utf-8'));
const workbook = new ExcelJS.Workbook();
workbook.creator = 'LabNote ELN QA';
workbook.created = new Date();

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A5C' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: '맑은 고딕' };
const PASS_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8E6C9' } };
const FAIL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };
const SKIP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
const BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const FONT = { size: 10, name: '맑은 고딕' };

// ─── 요약 시트 ─────────────────────────────────────────────
const summary = workbook.addWorksheet('요약', {
  properties: { tabColor: { argb: 'FF1B3A5C' } },
});

const total = results.length;
const pass = results.filter(r => r.result === 'PASS').length;
const fail = results.filter(r => r.result === 'FAIL').length;
const skipCount = results.filter(r => r.detail.startsWith('SKIP')).length;
const actualPass = results.filter(r => r.result === 'PASS' && !r.detail.startsWith('SKIP')).length;
const passRate = (pass / total * 100).toFixed(1);

// 보고서 헤더
summary.mergeCells('A1:G1');
const titleCell = summary.getCell('A1');
titleCell.value = 'LabNote ELN 테스트 수행 결과 보고서';
titleCell.font = { bold: true, size: 18, name: '맑은 고딕', color: { argb: 'FF1B3A5C' } };
titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
summary.getRow(1).height = 40;

summary.mergeCells('A2:G2');
summary.getCell('A2').value = `수행일시: ${new Date().toLocaleDateString('ko-KR')} ${new Date().toLocaleTimeString('ko-KR')} | 수행환경: Docker Compose (localhost:8000)`;
summary.getCell('A2').font = { size: 10, name: '맑은 고딕', color: { argb: 'FF666666' } };
summary.getCell('A2').alignment = { horizontal: 'center' };

// 전체 통계
summary.getCell('A4').value = '전체 통계';
summary.getCell('A4').font = { bold: true, size: 14, name: '맑은 고딕' };

const statsData = [
  ['항목', '값'],
  ['총 테스트 케이스', total],
  ['PASS', pass],
  ['FAIL', fail],
  ['통과율', `${passRate}%`],
  ['실제 실행(SKIP 제외)', total - skipCount],
  ['SKIP(코드 검증)', skipCount],
];

statsData.forEach((row, idx) => {
  const r = summary.getRow(5 + idx);
  r.getCell(1).value = row[0];
  r.getCell(2).value = row[1];
  r.getCell(1).font = idx === 0 ? { bold: true, ...FONT } : FONT;
  r.getCell(2).font = idx === 0 ? { bold: true, ...FONT } : { ...FONT, bold: idx === 3 };
  r.getCell(1).border = BORDER;
  r.getCell(2).border = BORDER;
  if (idx === 0) {
    r.getCell(1).fill = HEADER_FILL;
    r.getCell(1).font = HEADER_FONT;
    r.getCell(2).fill = HEADER_FILL;
    r.getCell(2).font = HEADER_FONT;
  }
  if (idx === 4) { // 통과율
    r.getCell(2).font = { ...FONT, bold: true, size: 14, color: { argb: parseFloat(passRate) >= 90 ? 'FF2E7D32' : 'FFC62828' } };
  }
});

// 서비스별 통계
summary.getCell('A14').value = '서비스별 통계';
summary.getCell('A14').font = { bold: true, size: 14, name: '맑은 고딕' };

const sheetNames = [...new Set(results.map(r => r.sheet))];
const serviceStats = sheetNames.map(s => {
  const rows = results.filter(r => r.sheet === s);
  const p = rows.filter(r => r.result === 'PASS').length;
  const f = rows.filter(r => r.result === 'FAIL').length;
  return { sheet: s, total: rows.length, pass: p, fail: f, rate: (p / rows.length * 100).toFixed(1) };
});

summary.columns = [
  { key: 'A', width: 24 }, { key: 'B', width: 14 }, { key: 'C', width: 10 },
  { key: 'D', width: 10 }, { key: 'E', width: 10 }, { key: 'F', width: 12 }, { key: 'G', width: 40 },
];

const svcHeader = summary.getRow(15);
['서비스 (시트)', '총 TC', 'PASS', 'FAIL', '통과율', '상태', 'FAIL 항목'].forEach((v, i) => {
  const c = svcHeader.getCell(i + 1);
  c.value = v;
  c.fill = HEADER_FILL;
  c.font = HEADER_FONT;
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  c.border = BORDER;
});
svcHeader.height = 24;

serviceStats.forEach((s, idx) => {
  const row = summary.getRow(16 + idx);
  const failItems = results.filter(r => r.sheet === s.sheet && r.result === 'FAIL').map(r => r.testItem).join(', ');
  [s.sheet, s.total, s.pass, s.fail, `${s.rate}%`, parseFloat(s.rate) === 100 ? 'ALL PASS' : `${s.fail}건 FAIL`, failItems || '-'].forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    c.font = FONT;
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = BORDER;
    if (i === 4) c.font = { ...FONT, bold: true, color: { argb: parseFloat(s.rate) >= 100 ? 'FF2E7D32' : parseFloat(s.rate) >= 80 ? 'FFEF6C00' : 'FFC62828' } };
    if (i === 5) {
      c.fill = parseFloat(s.rate) === 100 ? PASS_FILL : FAIL_FILL;
      c.font = { ...FONT, bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });
});

// FAIL 항목 상세
const failResults = results.filter(r => r.result === 'FAIL');
if (failResults.length > 0) {
  const failStartRow = 16 + serviceStats.length + 2;
  summary.getCell(`A${failStartRow}`).value = 'FAIL 항목 상세';
  summary.getCell(`A${failStartRow}`).font = { bold: true, size: 14, name: '맑은 고딕' };

  const fHeader = summary.getRow(failStartRow + 1);
  ['No', '서비스', '테스트 항목', '상세'].forEach((v, i) => {
    const c = fHeader.getCell(i + 1);
    c.value = v;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC62828' } };
    c.font = HEADER_FONT;
    c.border = BORDER;
  });

  failResults.forEach((fr, idx) => {
    const row = summary.getRow(failStartRow + 2 + idx);
    [idx + 1, fr.service, fr.testItem, fr.detail].forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = FONT;
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = BORDER;
    });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  });
}

// ─── 상세 결과 시트 (서비스별) ──────────────────────────────
sheetNames.forEach(sheetName => {
  const sheetResults = results.filter(r => r.sheet === sheetName);
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: '서비스', key: 'service', width: 16 },
    { header: '기능 분류', key: 'category', width: 16 },
    { header: '테스트 항목', key: 'testItem', width: 30 },
    { header: '결과', key: 'result', width: 8 },
    { header: '상세/비고', key: 'detail', width: 65 },
    { header: '소요시간(ms)', key: 'duration', width: 14 },
  ];

  const hRow = ws.getRow(1);
  hRow.height = 26;
  hRow.eachCell(c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER;
  });

  ws.autoFilter = { from: 'A1', to: `G${sheetResults.length + 1}` };

  sheetResults.forEach((sr, idx) => {
    const row = ws.addRow({
      no: sr.no,
      service: sr.service,
      category: sr.category,
      testItem: sr.testItem,
      result: sr.result,
      detail: sr.detail,
      duration: sr.duration || '',
    });
    row.eachCell(c => {
      c.font = FONT;
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = BORDER;
    });
    const resCell = row.getCell('result');
    resCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (sr.result === 'PASS') {
      if (sr.detail.startsWith('SKIP') || sr.detail.startsWith('CONFIRMED') || sr.detail.startsWith('TC ')) {
        resCell.fill = SKIP_FILL;
        resCell.value = 'PASS*';
      } else {
        resCell.fill = PASS_FILL;
      }
    } else {
      resCell.fill = FAIL_FILL;
    }
    resCell.font = { ...FONT, bold: true };
    row.getCell('no').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('duration').alignment = { horizontal: 'right', vertical: 'middle' };
  });
});

// ─── 저장 ──────────────────────────────────────────────────
const outPath = 'LabNote_ELN_테스트결과보고서.xlsx';
await workbook.xlsx.writeFile(outPath);
console.log(`\n테스트 결과 보고서 생성 완료: ${outPath}`);
console.log(`총 ${total}건 | PASS ${pass}건 | FAIL ${fail}건 | 통과율 ${passRate}%`);
