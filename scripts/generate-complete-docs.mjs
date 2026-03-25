/**
 * 프로젝트 완료 산출물 일괄 생성 스크립트
 * docs/complete/ 폴더에 DOCX, PPTX, XLSX 파일 생성
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageBreak,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'docs', 'complete');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── 공통 스타일 ──
const PROJECT_NAME = 'LabNote ELN (전자연구노트 협업 플랫폼)';
const COMPANY = '주식회사 OOO';
const DATE_STR = '2026년 03월';

function docTitle(title) {
  return new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 36, font: '맑은 고딕' })],
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  });
}

function docSubtitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, font: '맑은 고딕', color: '666666' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  });
}

function docHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 24, font: '맑은 고딕' })],
    heading: level,
    spacing: { before: 300, after: 200 },
  });
}

function docPara(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: '맑은 고딕' })],
    spacing: { after: 120 },
  });
}

function docBullet(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: '맑은 고딕' })],
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

function makeTableCell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, size: 20, font: '맑은 고딕', bold: opts.bold || false })],
      alignment: opts.align || AlignmentType.LEFT,
    })],
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shading ? { fill: opts.shading } : undefined,
  });
}

function makeHeaderRow(cells) {
  return new TableRow({
    children: cells.map(text => makeTableCell(text, { bold: true, shading: 'D9E2F3', align: AlignmentType.CENTER })),
    tableHeader: true,
  });
}

function makeRow(cells) {
  return new TableRow({ children: cells.map(text => makeTableCell(text)) });
}

async function saveDocx(doc, filename) {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), buf);
  console.log(`  -> ${filename}`);
}

// ════════════════════════════════════════════════════════════
// 1. 운영 이행 계획서.docx
// ════════════════════════════════════════════════════════════
async function createOperationTransitionPlan() {
  const doc = new Document({
    sections: [{
      children: [
        docTitle('운영 이행 계획서'),
        docSubtitle(PROJECT_NAME),
        docSubtitle(`${COMPANY} | ${DATE_STR}`),
        docHeading('1. 개요'),
        docPara('본 문서는 LabNote ELN 시스템의 개발 환경에서 운영 환경으로의 전환 계획을 정의한다.'),
        docHeading('2. 이행 범위'),
        docBullet('API Gateway 및 8개 마이크로서비스 (auth, eln, signature-audit, inventory, scheduler, search, file, collab)'),
        docBullet('인프라: PostgreSQL 15, Redis 7, MinIO, OpenSearch 2, Keycloak 24'),
        docBullet('프론트엔드: React SPA (메인 + 인벤토리)'),
        docBullet('모니터링: Jaeger (트레이싱), Dozzle (로그 뷰어)'),
        docHeading('3. 이행 일정'),
        new Table({
          rows: [
            makeHeaderRow(['단계', '기간', '담당', '주요 활동']),
            makeRow(['사전 준비', 'D-14 ~ D-7', '인프라팀', '운영 서버 구성, 네트워크/방화벽 설정']),
            makeRow(['환경 구성', 'D-7 ~ D-3', '인프라팀', 'Docker Compose 배포, DB 마이그레이션']),
            makeRow(['데이터 이관', 'D-3 ~ D-2', '개발팀', '시드 데이터 적재, MinIO 버킷 생성']),
            makeRow(['통합 테스트', 'D-2 ~ D-1', 'QA팀', '운영 환경 통합 테스트 수행']),
            makeRow(['서비스 전환', 'D-Day', '전체', 'DNS 전환, 서비스 오픈, 모니터링 가동']),
            makeRow(['안정화', 'D+1 ~ D+7', '개발/운영팀', '장애 대응, 성능 모니터링']),
          ],
        }),
        docHeading('4. 이행 전 체크리스트'),
        docBullet('운영 서버 하드웨어/OS 준비 완료'),
        docBullet('Docker, Docker Compose 설치 확인'),
        docBullet('환경변수(.env) 운영용 값 설정 완료'),
        docBullet('SSL 인증서 적용 (HTTPS)'),
        docBullet('방화벽 포트 개방 (8000, 5173, 3000, 9001)'),
        docBullet('DB 백업/복원 절차 검증'),
        docBullet('Keycloak Realm 설정 이관'),
        docHeading('5. 롤백 계획'),
        docPara('이행 과정에서 치명적 장애 발생 시, 이전 환경으로 즉시 롤백한다.'),
        docBullet('DB 스냅샷 기반 복원 (이행 직전 백업본)'),
        docBullet('Docker 이미지 태그 기반 이전 버전 배포'),
        docBullet('DNS 원복 (TTL 최소화 적용)'),
        docHeading('6. 비상 연락망'),
        new Table({
          rows: [
            makeHeaderRow(['역할', '담당자', '연락처']),
            makeRow(['프로젝트 관리자(PM)', 'OOO', '010-XXXX-XXXX']),
            makeRow(['인프라 담당', 'OOO', '010-XXXX-XXXX']),
            makeRow(['개발 리드', 'OOO', '010-XXXX-XXXX']),
            makeRow(['DB 관리자', 'OOO', '010-XXXX-XXXX']),
          ],
        }),
      ],
    }],
  });
  await saveDocx(doc, '운영_이행_계획서.docx');
}

// ════════════════════════════════════════════════════════════
// 2. 운영자 매뉴얼.docx
// ════════════════════════════════════════════════════════════
async function createOperatorManual() {
  const doc = new Document({
    sections: [{
      children: [
        docTitle('운영자 매뉴얼'),
        docSubtitle(PROJECT_NAME),
        docSubtitle(`${COMPANY} | ${DATE_STR}`),
        docHeading('1. 시스템 구성'),
        docPara('LabNote ELN은 Docker Compose 기반 MSA 아키텍처로 구성되며, 9개 서비스와 5개 인프라 컴포넌트로 운영된다.'),
        docHeading('1.1 서비스 포트 맵', HeadingLevel.HEADING_2),
        new Table({
          rows: [
            makeHeaderRow(['서비스', '포트', '설명']),
            makeRow(['api-gateway', '8000', 'JWT 검증, 프록시, Rate Limit']),
            makeRow(['auth-service', '8001', '조직/팀/사용자 CRUD, RBAC, JWT']),
            makeRow(['eln-service', '8002', '연구노트/프로토콜/템플릿 CRUD']),
            makeRow(['signature-audit-service', '8003', '전자서명, 감사로그, PDF 변환']),
            makeRow(['inventory-service', '8004', '시약/샘플/장비 관리']),
            makeRow(['scheduler-service', '8005', '장비/회의실 예약']),
            makeRow(['search-service', '8006', '통합검색 (OpenSearch)']),
            makeRow(['file-service', '8008', '파일 업/다운로드 (MinIO)']),
            makeRow(['collab-service', '8009', 'WebSocket 실시간 협업']),
          ],
        }),
        docHeading('2. 서비스 기동/중지'),
        docPara('# 전체 서비스 기동'),
        docPara('docker compose up -d'),
        docPara('# 전체 서비스 중지'),
        docPara('docker compose down'),
        docPara('# 특정 서비스 재빌드 후 기동'),
        docPara('docker compose up -d --build <서비스명>'),
        docHeading('3. 로그 확인'),
        docBullet('실시간 로그: docker compose logs -f <컨테이너명>'),
        docBullet('Dozzle 웹 UI: http://localhost:9999'),
        docBullet('Jaeger 트레이싱: http://localhost:16686'),
        docHeading('4. DB 관리'),
        docBullet('마이그레이션: docker exec <컨테이너> npx prisma migrate deploy'),
        docBullet('시드 데이터: docker exec <컨테이너> npx prisma db seed'),
        docBullet('DB GUI: docker exec <컨테이너> npx prisma studio'),
        docBullet('백업: pg_dump -h localhost -U labnote -d labnote > backup.sql'),
        docHeading('5. MinIO 파일 스토리지 관리'),
        docBullet('콘솔: http://localhost:9001'),
        docBullet('버킷: labnote-files, labnote-exports'),
        docBullet('정기 정리: 만료된 presigned URL 파일 자동 삭제 정책 적용'),
        docHeading('6. 장애 대응 절차'),
        docBullet('1단계: Dozzle/Jaeger에서 에러 로그 확인'),
        docBullet('2단계: 해당 서비스 컨테이너 재시작 (docker compose restart <서비스>)'),
        docBullet('3단계: 서비스 재빌드 (docker compose up -d --build <서비스>)'),
        docBullet('4단계: DB 연결 확인 (PostgreSQL, Redis 상태 체크)'),
        docBullet('5단계: 필요 시 롤백 (이전 이미지 태그로 배포)'),
        docHeading('7. 보안 관리'),
        docBullet('JWT 토큰: api-gateway에서 검증, 각 서비스에서 권한 체크'),
        docBullet('내부 통신: x-internal-secret 헤더로 인증'),
        docBullet('SSL: Nginx 리버스 프록시에서 종단'),
        docBullet('환경변수: .env 파일로 관리 (Git 커밋 금지)'),
      ],
    }],
  });
  await saveDocx(doc, '운영자_매뉴얼.docx');
}

// ════════════════════════════════════════════════════════════
// 3. 사용자 매뉴얼.docx
// ════════════════════════════════════════════════════════════
async function createUserManual() {
  const doc = new Document({
    sections: [{
      children: [
        docTitle('사용자 매뉴얼'),
        docSubtitle(PROJECT_NAME),
        docSubtitle(`${COMPANY} | ${DATE_STR}`),
        docHeading('1. 시스템 접속'),
        docPara('웹 브라우저에서 시스템 URL에 접속하여 로그인합니다.'),
        docBullet('지원 브라우저: Chrome, Edge, Firefox 최신 버전'),
        docBullet('로그인: 이메일/비밀번호 또는 SSO(Keycloak) 인증'),
        docHeading('2. 대시보드'),
        docPara('로그인 후 대시보드에서 최근 노트, 알림, 예약 현황 등을 한눈에 확인할 수 있습니다.'),
        docHeading('3. 연구노트 관리'),
        docHeading('3.1 노트 작성', HeadingLevel.HEADING_2),
        docBullet('좌측 메뉴 > 연구노트 > 새 노트 작성'),
        docBullet('제목, 내용(리치 텍스트 에디터), 태그 입력'),
        docBullet('실시간 협업: 다른 사용자와 동시 편집 가능 (WebSocket 기반)'),
        docBullet('자동 저장: 편집 중 자동으로 리비전 생성'),
        docHeading('3.2 노트 상태', HeadingLevel.HEADING_2),
        new Table({
          rows: [
            makeHeaderRow(['상태', '설명', '가능한 작업']),
            makeRow(['초안(draft)', '작성 중인 노트', '편집, 삭제, 진행 중 전환']),
            makeRow(['진행 중(in_progress)', '실험 진행 중', '편집, 초안 전환, 잠금, 서명 요청']),
            makeRow(['잠김(locked)', '관리자가 잠근 노트', '열람만 가능 (Admin 잠금해제 가능)']),
            makeRow(['서명완료(signed)', '전자서명 완료', '열람만 가능 (변경 불가)']),
          ],
        }),
        docHeading('3.3 전자서명', HeadingLevel.HEADING_2),
        docPara('Reviewer/Admin 권한을 가진 사용자가 노트에 전자서명을 수행할 수 있습니다.'),
        docBullet('노트 상세 > 서명 버튼 클릭'),
        docBullet('비밀번호 확인 후 해시체인 기반 서명 생성'),
        docBullet('서명 완료 시 노트는 영구적으로 변경 불가 상태가 됩니다.'),
        docHeading('4. 프로토콜 관리'),
        docBullet('실험 프로토콜(SOP)을 템플릿 기반으로 생성'),
        docBullet('단계별 체크리스트, 시약/장비 연결'),
        docBullet('버전 관리 및 승인 프로세스'),
        docHeading('5. 인벤토리 관리'),
        docBullet('시약, 샘플, 장비 등록/조회/수정'),
        docBullet('바코드 스캔으로 빠른 조회'),
        docBullet('수량 변동 이력 자동 기록'),
        docBullet('부족 수량 알림 설정'),
        docHeading('6. 장비/회의실 예약'),
        docBullet('캘린더 뷰에서 장비/회의실 예약'),
        docBullet('예약 승인/거절/취소 워크플로우'),
        docBullet('예약 알림 (이메일/시스템 알림)'),
        docHeading('7. 통합 검색'),
        docBullet('상단 검색바에서 노트, 프로토콜, 인벤토리 통합 검색'),
        docBullet('자동완성, 검색 히스토리, 즐겨찾기 기능'),
        docHeading('8. 파일 관리'),
        docBullet('노트/프로토콜에 파일 첨부 (드래그 앤 드롭)'),
        docBullet('PDF/ZIP 내보내기 (전자서명 포함)'),
        docHeading('9. 다국어 지원'),
        docPara('시스템은 한국어/영어를 지원합니다. 우측 상단 언어 설정에서 전환할 수 있습니다.'),
      ],
    }],
  });
  await saveDocx(doc, '사용자_매뉴얼.docx');
}

// ════════════════════════════════════════════════════════════
// 4. 교육 계획서/교육자료.pptx
// ════════════════════════════════════════════════════════════
async function createTrainingMaterial() {
  const pptx = new PptxGenJS();
  pptx.title = '교육 계획서 및 교육자료';
  pptx.subject = PROJECT_NAME;
  pptx.author = COMPANY;
  pptx.layout = 'LAYOUT_16x9';

  // 표지
  let slide = pptx.addSlide();
  slide.addText('교육 계획서 및 교육자료', { x: 0.5, y: 1.5, w: 9, h: 1.5, fontSize: 32, bold: true, color: '1F4E79', fontFace: '맑은 고딕', align: 'center' });
  slide.addText(PROJECT_NAME, { x: 0.5, y: 3.0, w: 9, h: 0.8, fontSize: 18, color: '666666', fontFace: '맑은 고딕', align: 'center' });
  slide.addText(`${COMPANY} | ${DATE_STR}`, { x: 0.5, y: 3.8, w: 9, h: 0.6, fontSize: 14, color: '999999', fontFace: '맑은 고딕', align: 'center' });

  // 목차
  slide = pptx.addSlide();
  slide.addText('목차', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '1. 교육 개요\n', options: { fontSize: 18 } },
    { text: '2. 교육 일정\n', options: { fontSize: 18 } },
    { text: '3. 대상별 교육 내용\n', options: { fontSize: 18 } },
    { text: '4. 시스템 접속 및 로그인\n', options: { fontSize: 18 } },
    { text: '5. 연구노트 작성 가이드\n', options: { fontSize: 18 } },
    { text: '6. 전자서명 프로세스\n', options: { fontSize: 18 } },
    { text: '7. 인벤토리/예약 사용법\n', options: { fontSize: 18 } },
    { text: '8. Q&A 및 실습\n', options: { fontSize: 18 } },
  ], { x: 1, y: 1.3, w: 8, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.5 });

  // 교육 개요
  slide = pptx.addSlide();
  slide.addText('1. 교육 개요', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addTable([
    [{ text: '항목', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '내용', options: { bold: true, fill: { color: 'D9E2F3' } } }],
    ['교육 목적', 'LabNote ELN 시스템의 효과적 활용을 위한 사용자 역량 확보'],
    ['교육 대상', '전체 사용자 (연구원, 리뷰어, 관리자)'],
    ['교육 방식', '집합 교육 + 실습 (온라인 병행 가능)'],
    ['교육 시간', '총 8시간 (2일, 1일 4시간)'],
    ['교육 장소', '사내 교육장 / 온라인 화상회의'],
  ], { x: 0.5, y: 1.3, w: 9, h: 3.5, fontSize: 14, fontFace: '맑은 고딕', border: { pt: 1, color: 'CCCCCC' }, colW: [2.5, 6.5] });

  // 교육 일정
  slide = pptx.addSlide();
  slide.addText('2. 교육 일정', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addTable([
    [{ text: '일차', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '시간', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '내용', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '대상', options: { bold: true, fill: { color: 'D9E2F3' } } }],
    ['1일차', '10:00~12:00', '시스템 개요, 접속/로그인, 대시보드', '전체'],
    ['1일차', '13:00~15:00', '연구노트 작성, 협업 편집, 파일 관리', '전체'],
    ['2일차', '10:00~12:00', '전자서명, 노트 상태관리, 감사로그', '리뷰어/관리자'],
    ['2일차', '13:00~15:00', '인벤토리, 장비예약, 통합검색, Q&A', '전체'],
  ], { x: 0.5, y: 1.3, w: 9, h: 3, fontSize: 13, fontFace: '맑은 고딕', border: { pt: 1, color: 'CCCCCC' }, colW: [1.2, 2, 4, 1.8] });

  // 시스템 접속
  slide = pptx.addSlide();
  slide.addText('4. 시스템 접속 및 로그인', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '접속 방법\n', options: { fontSize: 20, bold: true } },
    { text: '1. 웹 브라우저(Chrome/Edge) 실행\n', options: { fontSize: 16 } },
    { text: '2. 시스템 URL 입력\n', options: { fontSize: 16 } },
    { text: '3. 이메일/비밀번호 입력 후 로그인\n', options: { fontSize: 16 } },
    { text: '4. SSO(Keycloak) 연동 시 기업 계정으로 로그인\n\n', options: { fontSize: 16 } },
    { text: '역할별 권한\n', options: { fontSize: 20, bold: true } },
    { text: '- Researcher: 노트 작성/편집\n', options: { fontSize: 16 } },
    { text: '- Reviewer: 노트 검토, 서명, 잠금\n', options: { fontSize: 16 } },
    { text: '- Admin: 전체 관리, 잠금해제, 사용자 관리\n', options: { fontSize: 16 } },
  ], { x: 0.8, y: 1.3, w: 8.5, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.3 });

  // 연구노트 작성
  slide = pptx.addSlide();
  slide.addText('5. 연구노트 작성 가이드', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '노트 작성 흐름\n\n', options: { fontSize: 20, bold: true } },
    { text: '  [새 노트 작성] -> [제목/내용 입력] -> [파일 첨부] -> [저장]\n', options: { fontSize: 16, color: '1F4E79' } },
    { text: '  -> [진행 중 전환] -> [실험 기록] -> [서명 요청]\n\n', options: { fontSize: 16, color: '1F4E79' } },
    { text: '주요 기능\n', options: { fontSize: 20, bold: true } },
    { text: '- 리치 텍스트 에디터 (볼드, 이탤릭, 테이블, 이미지)\n', options: { fontSize: 16 } },
    { text: '- 실시간 협업 편집 (여러 사용자 동시 편집)\n', options: { fontSize: 16 } },
    { text: '- 자동 리비전 저장 (변경 이력 추적)\n', options: { fontSize: 16 } },
    { text: '- 템플릿 기반 빠른 작성\n', options: { fontSize: 16 } },
  ], { x: 0.8, y: 1.3, w: 8.5, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.3 });

  // 전자서명
  slide = pptx.addSlide();
  slide.addText('6. 전자서명 프로세스', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '서명 프로세스\n\n', options: { fontSize: 20, bold: true } },
    { text: '  1. 노트 상태: in_progress 확인\n', options: { fontSize: 16 } },
    { text: '  2. [서명] 버튼 클릭 (Reviewer/Admin만)\n', options: { fontSize: 16 } },
    { text: '  3. 비밀번호 입력하여 본인 확인\n', options: { fontSize: 16 } },
    { text: '  4. 해시체인 기반 전자서명 생성\n', options: { fontSize: 16 } },
    { text: '  5. 노트 상태 자동 전환: signed\n', options: { fontSize: 16 } },
    { text: '  6. 서명 완료 후 노트는 영구 불변\n\n', options: { fontSize: 16 } },
    { text: '주의사항\n', options: { fontSize: 20, bold: true, color: 'CC0000' } },
    { text: '- 서명 후에는 어떤 역할도 노트를 수정/삭제할 수 없습니다\n', options: { fontSize: 16, color: 'CC0000' } },
    { text: '- 감사로그에 서명 이력이 영구 보관됩니다\n', options: { fontSize: 16 } },
  ], { x: 0.8, y: 1.3, w: 8.5, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.3 });

  // Q&A
  slide = pptx.addSlide();
  slide.addText('8. Q&A 및 실습', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '실습 과제\n\n', options: { fontSize: 20, bold: true } },
    { text: '1. 연구노트 작성 및 파일 첨부\n', options: { fontSize: 16 } },
    { text: '2. 다른 사용자와 실시간 협업 편집\n', options: { fontSize: 16 } },
    { text: '3. 노트 상태 전환 (draft -> in_progress)\n', options: { fontSize: 16 } },
    { text: '4. 인벤토리 항목 등록 및 검색\n', options: { fontSize: 16 } },
    { text: '5. 장비 예약 및 승인 프로세스 체험\n\n', options: { fontSize: 16 } },
    { text: '문의처\n', options: { fontSize: 20, bold: true } },
    { text: '- 시스템 관리자: admin@company.com\n', options: { fontSize: 16 } },
    { text: '- 교육 담당: training@company.com\n', options: { fontSize: 16 } },
  ], { x: 0.8, y: 1.3, w: 8.5, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.3 });

  const outPath = path.join(OUTPUT_DIR, '교육_계획서_교육자료.pptx');
  await pptx.writeFile({ fileName: outPath });
  console.log('  -> 교육_계획서_교육자료.pptx');
}

// ════════════════════════════════════════════════════════════
// 5. 하자보수 계획서.docx
// ════════════════════════════════════════════════════════════
async function createMaintenancePlan() {
  const doc = new Document({
    sections: [{
      children: [
        docTitle('하자보수 계획서'),
        docSubtitle(PROJECT_NAME),
        docSubtitle(`${COMPANY} | ${DATE_STR}`),
        docHeading('1. 개요'),
        docPara('본 문서는 LabNote ELN 시스템의 하자보수 기간, 절차, SLA를 정의한다.'),
        docHeading('2. 하자보수 기간'),
        new Table({
          rows: [
            makeHeaderRow(['구분', '기간', '비고']),
            makeRow(['하자보수 기간', '검수 완료일로부터 12개월', '계약서 기준']),
            makeRow(['무상 보수', '하자보수 기간 내', '결함/장애 무상 수정']),
            makeRow(['유상 보수', '하자보수 기간 이후', '별도 유지보수 계약 체결']),
          ],
        }),
        docHeading('3. SLA (서비스 수준 협약)'),
        new Table({
          rows: [
            makeHeaderRow(['등급', '정의', '대응 시간', '복구 시간']),
            makeRow(['Critical', '전체 시스템 장애, 데이터 손실 위험', '30분 이내', '4시간 이내']),
            makeRow(['High', '핵심 기능 장애 (서명, 노트 작성 불가)', '1시간 이내', '8시간 이내']),
            makeRow(['Medium', '부가 기능 장애 (검색, 알림 등)', '4시간 이내', '24시간 이내']),
            makeRow(['Low', '경미한 UI 오류, 개선 요청', '1영업일 이내', '5영업일 이내']),
          ],
        }),
        docHeading('4. 하자보수 절차'),
        docBullet('1단계: 장애/결함 접수 (이메일, 전화, 이슈 트래커)'),
        docBullet('2단계: 등급 분류 및 담당자 배정'),
        docBullet('3단계: 원인 분석 및 수정'),
        docBullet('4단계: 테스트 환경 검증'),
        docBullet('5단계: 운영 환경 배포'),
        docBullet('6단계: 완료 보고 및 재발 방지 대책 수립'),
        docHeading('5. 하자보수 범위'),
        docHeading('5.1 포함 항목', HeadingLevel.HEADING_2),
        docBullet('소프트웨어 결함(버그) 수정'),
        docBullet('성능 저하 원인 분석 및 개선'),
        docBullet('보안 취약점 패치'),
        docBullet('DB 마이그레이션 지원'),
        docBullet('운영 환경 장애 복구'),
        docHeading('5.2 제외 항목', HeadingLevel.HEADING_2),
        docBullet('신규 기능 개발'),
        docBullet('사용자 과실에 의한 데이터 손실'),
        docBullet('하드웨어/네트워크 장애'),
        docBullet('3rd-party 소프트웨어 라이선스 문제'),
        docHeading('6. 비상 연락망'),
        new Table({
          rows: [
            makeHeaderRow(['역할', '담당자', '연락처', '비고']),
            makeRow(['하자보수 총괄', 'OOO', '010-XXXX-XXXX', '평일 09-18시']),
            makeRow(['긴급 장애 대응', 'OOO', '010-XXXX-XXXX', '24/7']),
            makeRow(['DB 전문가', 'OOO', '010-XXXX-XXXX', '평일 09-18시']),
          ],
        }),
      ],
    }],
  });
  await saveDocx(doc, '하자보수_계획서.docx');
}

// ════════════════════════════════════════════════════════════
// 6. 최종 산출물 목록.xlsx
// ════════════════════════════════════════════════════════════
async function createDeliverablesList() {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY;
  const ws = wb.addWorksheet('산출물 목록');

  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: '단계', key: 'phase', width: 15 },
    { header: '산출물명', key: 'name', width: 35 },
    { header: '형식', key: 'format', width: 12 },
    { header: '버전', key: 'version', width: 10 },
    { header: '작성일', key: 'date', width: 15 },
    { header: '작성자', key: 'author', width: 12 },
    { header: '비고', key: 'note', width: 25 },
  ];

  // 헤더 스타일
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  ws.getRow(1).height = 25;

  const data = [
    ['착수', '프로젝트 착수 보고서', 'PPTX', 'v1.0', '2025-10', 'PM', ''],
    ['착수', '프로젝트 수행 계획서', 'DOCX', 'v1.0', '2025-10', 'PM', ''],
    ['분석', '요구사항 정의서', 'DOCX', 'v2.0', '2025-11', 'PM/개발리드', ''],
    ['분석', '요구사항 추적표', 'XLSX', 'v2.0', '2025-11', 'PM', ''],
    ['설계', '시스템 아키텍처 설계서', 'DOCX', 'v1.0', '2025-12', '개발리드', 'MSA 아키텍처'],
    ['설계', 'DB 설계서 (ERD)', 'DOCX/PNG', 'v2.0', '2025-12', '개발리드', 'Prisma 스키마 기반'],
    ['설계', 'API 설계서', 'DOCX', 'v2.0', '2025-12', '개발리드', 'RESTful API'],
    ['설계', 'UI/UX 설계서', 'FIGMA/PDF', 'v1.0', '2025-12', '디자이너', ''],
    ['구현', '소스코드', 'Git', 'v1.0', '2026-02', '개발팀', 'GitLab 저장소'],
    ['구현', '단위 테스트 코드', 'Git', 'v1.0', '2026-02', '개발팀', ''],
    ['테스트', '테스트 계획서', 'DOCX', 'v1.0', '2026-02', 'QA', ''],
    ['테스트', '테스트 결과 보고서', 'XLSX', 'v1.0', '2026-03', 'QA', ''],
    ['테스트', '기능 명세서', 'XLSX', 'v1.0', '2026-03', '개발리드', ''],
    ['이행', '운영 이행 계획서', 'DOCX', 'v1.0', '2026-03', 'PM', '본 산출물'],
    ['이행', '운영자 매뉴얼', 'DOCX', 'v1.0', '2026-03', '개발리드', '본 산출물'],
    ['이행', '사용자 매뉴얼', 'DOCX', 'v1.0', '2026-03', '개발리드', '본 산출물'],
    ['이행', '교육 계획서/교육자료', 'PPTX', 'v1.0', '2026-03', 'PM', '본 산출물'],
    ['이행', '하자보수 계획서', 'DOCX', 'v1.0', '2026-03', 'PM', '본 산출물'],
    ['이행', '최종 산출물 목록', 'XLSX', 'v1.0', '2026-03', 'PM', '본 문서'],
    ['완료', '프로젝트 완료보고서', 'PPTX', 'v1.0', '2026-03', 'PM', '본 산출물'],
    ['완료', '검수 조서', 'DOCX', 'v1.0', '2026-03', 'PM', '본 산출물'],
  ];

  data.forEach((row, i) => {
    const r = ws.addRow({ no: i + 1, phase: row[0], name: row[1], format: row[2], version: row[3], date: row[4], author: row[5], note: row[6] });
    r.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
      cell.alignment = { vertical: 'middle' };
    });
    r.getCell('no').alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell('format').alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell('version').alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell('date').alignment = { horizontal: 'center', vertical: 'middle' };
    if (row[6] === '본 산출물' || row[6] === '본 문서') {
      r.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFF0' } }; });
    }
  });

  ws.autoFilter = 'A1:H22';

  const outPath = path.join(OUTPUT_DIR, '최종_산출물_목록.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('  -> 최종_산출물_목록.xlsx');
}

// ════════════════════════════════════════════════════════════
// 7. 프로젝트 완료보고서.pptx
// ════════════════════════════════════════════════════════════
async function createCompletionReport() {
  const pptx = new PptxGenJS();
  pptx.title = '프로젝트 완료보고서';
  pptx.subject = PROJECT_NAME;
  pptx.layout = 'LAYOUT_16x9';

  // 표지
  let slide = pptx.addSlide();
  slide.addText('프로젝트 완료보고서', { x: 0.5, y: 1.5, w: 9, h: 1.5, fontSize: 36, bold: true, color: '1F4E79', fontFace: '맑은 고딕', align: 'center' });
  slide.addText(PROJECT_NAME, { x: 0.5, y: 3.2, w: 9, h: 0.8, fontSize: 20, color: '666666', fontFace: '맑은 고딕', align: 'center' });
  slide.addText(`${COMPANY} | ${DATE_STR}`, { x: 0.5, y: 4.0, w: 9, h: 0.6, fontSize: 14, color: '999999', fontFace: '맑은 고딕', align: 'center' });

  // 프로젝트 개요
  slide = pptx.addSlide();
  slide.addText('1. 프로젝트 개요', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addTable([
    [{ text: '항목', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '내용', options: { bold: true, fill: { color: 'D9E2F3' } } }],
    ['프로젝트명', PROJECT_NAME],
    ['수행 기간', '2025년 10월 ~ 2026년 3월 (6개월)'],
    ['발주 기관', 'OOO'],
    ['수행 업체', COMPANY],
    ['프로젝트 목표', '사내 구축형 전자연구노트 협업 플랫폼 구축'],
  ], { x: 0.5, y: 1.3, w: 9, h: 3.5, fontSize: 14, fontFace: '맑은 고딕', border: { pt: 1, color: 'CCCCCC' }, colW: [2.5, 6.5] });

  // 주요 성과
  slide = pptx.addSlide();
  slide.addText('2. 주요 수행 성과', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '아키텍처\n', options: { fontSize: 18, bold: true } },
    { text: '- Docker Compose 기반 MSA (9개 마이크로서비스)\n', options: { fontSize: 15 } },
    { text: '- Fastify + Prisma + TypeScript 통일 기술 스택\n\n', options: { fontSize: 15 } },
    { text: '핵심 기능\n', options: { fontSize: 18, bold: true } },
    { text: '- 전자연구노트: 작성, 버전관리, 실시간 협업 편집\n', options: { fontSize: 15 } },
    { text: '- 전자서명: 해시체인 기반 무결성 보장, 감사로그\n', options: { fontSize: 15 } },
    { text: '- RBAC 권한관리: 조직/팀/역할 기반 접근제어\n', options: { fontSize: 15 } },
    { text: '- 인벤토리: 시약/샘플/장비 관리, 바코드\n', options: { fontSize: 15 } },
    { text: '- 장비/회의실 예약 시스템\n', options: { fontSize: 15 } },
    { text: '- 통합검색 (OpenSearch, 한국어 형태소 분석)\n', options: { fontSize: 15 } },
    { text: '- 다국어 지원 (한국어/영어)\n', options: { fontSize: 15 } },
  ], { x: 0.8, y: 1.2, w: 8.5, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.2 });

  // 시스템 구성도
  slide = pptx.addSlide();
  slide.addText('3. 시스템 구성도', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '        [React Frontend :5173]\n', options: { fontSize: 14, fontFace: 'Consolas' } },
    { text: '                  |\n', options: { fontSize: 14, fontFace: 'Consolas' } },
    { text: '        [API Gateway :8000]\n', options: { fontSize: 14, fontFace: 'Consolas', bold: true } },
    { text: '     /    |    |    |    |    |   \\\n', options: { fontSize: 14, fontFace: 'Consolas' } },
    { text: '  auth  eln  sig  inv  sched srch file collab\n', options: { fontSize: 13, fontFace: 'Consolas' } },
    { text: '  :8001 :8002 :8003 :8004 :8005 :8006 :8008 :8009\n', options: { fontSize: 13, fontFace: 'Consolas' } },
    { text: '     \\    |    |    |    |    |   /\n', options: { fontSize: 14, fontFace: 'Consolas' } },
    { text: '  [PostgreSQL] [Redis] [MinIO] [OpenSearch]\n', options: { fontSize: 14, fontFace: 'Consolas', bold: true } },
  ], { x: 0.5, y: 1.5, w: 9, h: 3.5, fontFace: 'Consolas', lineSpacingMultiple: 1.1 });

  // 일정 준수 현황
  slide = pptx.addSlide();
  slide.addText('4. 일정 준수 현황', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addTable([
    [{ text: '단계', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '계획', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '실적', options: { bold: true, fill: { color: 'D9E2F3' } } }, { text: '상태', options: { bold: true, fill: { color: 'D9E2F3' } } }],
    ['착수/분석', '2025.10 ~ 2025.11', '2025.10 ~ 2025.11', '완료'],
    ['설계', '2025.11 ~ 2025.12', '2025.11 ~ 2025.12', '완료'],
    ['구현', '2025.12 ~ 2026.02', '2025.12 ~ 2026.02', '완료'],
    ['테스트', '2026.02 ~ 2026.03', '2026.02 ~ 2026.03', '완료'],
    ['이행/교육', '2026.03', '2026.03', '완료'],
  ], { x: 0.5, y: 1.3, w: 9, h: 3, fontSize: 14, fontFace: '맑은 고딕', border: { pt: 1, color: 'CCCCCC' }, colW: [2, 2.5, 2.5, 2] });

  // 향후 계획
  slide = pptx.addSlide();
  slide.addText('5. 향후 계획', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1F4E79', fontFace: '맑은 고딕' });
  slide.addText([
    { text: '하자보수 (12개월)\n', options: { fontSize: 18, bold: true } },
    { text: '- SLA 기반 장애 대응 체계 운영\n', options: { fontSize: 16 } },
    { text: '- 보안 패치 및 성능 최적화\n\n', options: { fontSize: 16 } },
    { text: '운영 안정화\n', options: { fontSize: 18, bold: true } },
    { text: '- 사용자 피드백 반영\n', options: { fontSize: 16 } },
    { text: '- 모니터링 체계 고도화 (Jaeger, Dozzle)\n\n', options: { fontSize: 16 } },
    { text: '확장 계획\n', options: { fontSize: 18, bold: true } },
    { text: '- AI 기반 실험 데이터 분석 기능\n', options: { fontSize: 16 } },
    { text: '- 외부 LIMS 시스템 연동\n', options: { fontSize: 16 } },
    { text: '- 모바일 앱 지원\n', options: { fontSize: 16 } },
  ], { x: 0.8, y: 1.2, w: 8.5, h: 4, fontFace: '맑은 고딕', lineSpacingMultiple: 1.3 });

  const outPath = path.join(OUTPUT_DIR, '프로젝트_완료보고서.pptx');
  await pptx.writeFile({ fileName: outPath });
  console.log('  -> 프로젝트_완료보고서.pptx');
}

// ════════════════════════════════════════════════════════════
// 8. 검수 조서.docx
// ════════════════════════════════════════════════════════════
async function createInspectionReport() {
  const doc = new Document({
    sections: [{
      children: [
        docTitle('검수 조서'),
        docSubtitle(PROJECT_NAME),
        docSubtitle(`${COMPANY} | ${DATE_STR}`),
        docHeading('1. 검수 대상'),
        new Table({
          rows: [
            makeHeaderRow(['항목', '내용']),
            makeRow(['프로젝트명', PROJECT_NAME]),
            makeRow(['수행 업체', COMPANY]),
            makeRow(['계약 기간', '2025년 10월 ~ 2026년 3월']),
            makeRow(['검수 일자', '2026년 3월 OO일']),
          ],
        }),
        docHeading('2. 검수 항목'),
        new Table({
          rows: [
            makeHeaderRow(['No', '검수 항목', '검수 기준', '결과', '비고']),
            makeRow(['1', '요구사항 충족', '요구사항 정의서 대비 100% 구현', 'Pass / Fail', '']),
            makeRow(['2', '기능 테스트', '테스트 케이스 통과율 95% 이상', 'Pass / Fail', '']),
            makeRow(['3', '성능 테스트', '동시 접속 50명 기준 응답시간 3초 이내', 'Pass / Fail', '']),
            makeRow(['4', '보안 테스트', 'OWASP Top 10 취약점 없음', 'Pass / Fail', '']),
            makeRow(['5', '산출물 제출', '전체 산출물 목록 대비 100% 제출', 'Pass / Fail', '']),
            makeRow(['6', '교육 완료', '사용자 교육 수행 완료', 'Pass / Fail', '']),
            makeRow(['7', '운영 이행', '운영 환경 정상 가동 확인', 'Pass / Fail', '']),
            makeRow(['8', '매뉴얼 제출', '운영자/사용자 매뉴얼 제출', 'Pass / Fail', '']),
          ],
        }),
        docHeading('3. 검수 의견'),
        docPara('(검수자 의견 기재란)'),
        docPara(''),
        docPara(''),
        docPara(''),
        docHeading('4. 검수 결과'),
        docPara('위 검수 항목을 확인한 결과, 본 프로젝트의 산출물이 계약 내용에 부합함을 확인합니다.'),
        docPara(''),
        docPara(''),
        new Table({
          rows: [
            makeHeaderRow(['구분', '소속', '성명', '서명', '일자']),
            makeRow(['검수자', '', '', '', '2026.03.  ']),
            makeRow(['확인자', '', '', '', '2026.03.  ']),
            makeRow(['승인자', '', '', '', '2026.03.  ']),
          ],
        }),
        docPara(''),
        docPara(''),
        new Paragraph({
          children: [new TextRun({ text: '발주기관: OOO', size: 24, font: '맑은 고딕', bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '수행업체: ' + COMPANY, size: 24, font: '맑은 고딕', bold: true })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    }],
  });
  await saveDocx(doc, '검수_조서.docx');
}

// ════════════════════════════════════════════════════════════
// 실행
// ════════════════════════════════════════════════════════════
console.log(`\n산출물 생성 시작 → ${OUTPUT_DIR}\n`);

await createOperationTransitionPlan();
await createOperatorManual();
await createUserManual();
await createTrainingMaterial();
await createMaintenancePlan();
await createDeliverablesList();
await createCompletionReport();
await createInspectionReport();

console.log(`\n전체 8개 산출물 생성 완료!\n`);
