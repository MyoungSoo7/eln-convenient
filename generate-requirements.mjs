/**
 * LabNote ELN 요구사항분석서 엑셀 생성
 * CLAUDE.md + docs + 실제 코드 분석 결과 기반
 */
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'LabNote ELN';
workbook.created = new Date();

// ─── 스타일 ────────────────────────────────────────────────
const H1_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A5C' } };
const H1_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: '맑은 고딕' };
const H2_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
const H2_FONT = { bold: true, size: 10, name: '맑은 고딕' };
const FONT = { size: 10, name: '맑은 고딕' };
const B = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const CAT_FILLS = {
  '기능': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } },
  '보안': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } },
  '성능': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } },
  '인프라': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } },
  '데이터': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E5F5' } },
};
const PRI = {
  '필수': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } },
  '권장': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } },
  '선택': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8E6C9' } },
};

function makeSheet(name, columns, rows, opts = {}) {
  const ws = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: opts.tabColor ? { argb: opts.tabColor } : undefined },
  });
  ws.columns = columns;
  const hr = ws.getRow(1);
  hr.height = 28;
  hr.eachCell(c => { c.fill = H1_FILL; c.font = H1_FONT; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = B; });
  ws.autoFilter = { from: 'A1', to: String.fromCharCode(64 + columns.length) + '1' };

  rows.forEach((r, i) => {
    const row = ws.addRow({ no: i + 1, ...r });
    row.eachCell(c => { c.font = FONT; c.alignment = { vertical: 'top', wrapText: true }; c.border = B; });
    row.getCell('no').alignment = { horizontal: 'center', vertical: 'middle' };
    if (r.category && CAT_FILLS[r.category]) row.getCell('category').fill = CAT_FILLS[r.category];
    if (r.priority && PRI[r.priority]) {
      const pc = row.getCell('priority');
      pc.fill = PRI[r.priority];
      pc.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });
  return ws;
}

// ─── 공통 컬럼 ─────────────────────────────────────────────
const REQ_COLS = [
  { header: 'No', key: 'no', width: 6 },
  { header: '요구사항 ID', key: 'reqId', width: 14 },
  { header: '분류', key: 'category', width: 8 },
  { header: '대분류', key: 'major', width: 16 },
  { header: '중분류', key: 'minor', width: 18 },
  { header: '요구사항명', key: 'title', width: 32 },
  { header: '상세 설명', key: 'description', width: 60 },
  { header: '입력/출력', key: 'io', width: 40 },
  { header: '비즈니스 규칙 / 제약조건', key: 'rules', width: 50 },
  { header: '우선순위', key: 'priority', width: 10 },
  { header: '관련 서비스', key: 'service', width: 16 },
  { header: '관련 API', key: 'api', width: 30 },
  { header: '비고', key: 'remark', width: 24 },
];

// ============================================================
// 1. 개요 시트
// ============================================================
const overviewWs = workbook.addWorksheet('1.개요', { properties: { tabColor: { argb: 'FF1B3A5C' } } });
overviewWs.columns = [{ key: 'A', width: 20 }, { key: 'B', width: 80 }];

const overviewData = [
  ['프로젝트명', 'LabNote ELN (Electronic Laboratory Notebook)'],
  ['프로젝트 유형', '사내 구축형 전자연구노트(ELN) 협업 플랫폼'],
  ['배포 방식', '온프레미스 Docker Compose 기반 MSA'],
  ['작성일', new Date().toLocaleDateString('ko-KR')],
  ['작성 근거', 'CLAUDE.md (프로젝트 지시서), docs/ 폴더 문서, 실제 소스 코드 분석'],
  ['', ''],
  ['기술 스택 (프론트엔드)', 'React + Vite + TypeScript, shadcn/ui, TanStack Query, react-i18next (ko/en)'],
  ['기술 스택 (백엔드)', 'Fastify (전 서비스 통일), Prisma ORM, TypeScript'],
  ['기술 스택 (인프라)', 'PostgreSQL 15, Redis 7, MinIO (S3 호환), OpenSearch 2'],
  ['기술 스택 (모니터링)', 'Jaeger (OpenTelemetry), Dozzle (로그 뷰어)'],
  ['', ''],
  ['서비스 구성 (9개)', ''],
  ['  api-gateway', 'JWT 검증, 프록시, Rate Limit, SSE, 대시보드 집계 (:8000)'],
  ['  auth-service', '조직/팀/사용자/역할 CRUD, RBAC, JWT 발급, SSO (:8001)'],
  ['  eln-service', '연구노트/프로토콜/템플릿 CRUD, 버전관리, 상태 흐름 (:8002)'],
  ['  signature-audit-service', '전자서명(해시체인), 감사로그, PDF/ZIP 변환, 알림 (:8003)'],
  ['  inventory-service', '시약/샘플/장비 CRUD, 바코드, 수량관리 (:8004)'],
  ['  scheduler-service', '장비/회의실 예약, 승인/거절/취소/완료 (:8005)'],
  ['  search-service', '통합검색(OpenSearch), 자동완성, 히스토리, 즐겨찾기 (:8006)'],
  ['  file-service', '파일 업/다운로드(MinIO), presigned URL, 내보내기 (:8008)'],
  ['  collab-service', 'WebSocket 실시간 협업 편집, Redis pub/sub (:8009)'],
  ['', ''],
  ['역할 체계 (4개)', 'admin, researcher, reviewer, viewer'],
  ['권한 수', '22개 (Permission 상수)'],
  ['다국어', '한국어(ko), 영어(en)'],
];

overviewData.forEach((d, i) => {
  const row = overviewWs.getRow(i + 1);
  row.getCell(1).value = d[0];
  row.getCell(2).value = d[1];
  row.getCell(1).font = d[0] && !d[0].startsWith(' ') ? { bold: true, ...FONT } : FONT;
  row.getCell(2).font = FONT;
  if (i === 0) {
    row.getCell(1).font = { bold: true, size: 14, name: '맑은 고딕' };
    row.getCell(2).font = { bold: true, size: 14, name: '맑은 고딕' };
  }
});

// ============================================================
// 2. 기능 요구사항
// ============================================================
const funcReqs = [
  // ─── 인증/사용자 관리 ─────────────────────────────────────
  { reqId: 'FR-AUTH-001', category: '기능', major: '인증', minor: '로그인', title: '이메일/비밀번호 로그인', description: '사용자가 이메일과 비밀번호를 입력하여 시스템에 로그인한다. Access Token(15분)과 Refresh Token(8시간)을 발급한다.', io: '입력: email, password\n출력: token, refreshToken, user 정보', rules: '- bcrypt 해시 비교\n- inactive 사용자는 403 반환\n- JWT payload: sub, email, role, permissions, orgId, teams[]', priority: '필수', service: 'auth-service', api: 'POST /api/auth/login', remark: '' },
  { reqId: 'FR-AUTH-002', category: '기능', major: '인증', minor: '회원가입', title: '사용자 자가 등록', description: '신규 사용자가 이름, 이메일, 비밀번호로 계정을 생성한다. 최초 생성 조직에 자동 배정되며, viewer 역할이 부여된다.', io: '입력: name, email, password, orgId?(선택)\n출력: 201 Created', rules: '- 이메일 중복 시 409\n- orgId 미지정 시 최초 조직 자동 배정\n- bcrypt 10 라운드 해싱\n- 조직 없으면 400', priority: '필수', service: 'auth-service', api: 'POST /api/auth/register', remark: '' },
  { reqId: 'FR-AUTH-003', category: '기능', major: '인증', minor: '토큰 갱신', title: 'Refresh Token 기반 토큰 갱신', description: '만료된 Access Token을 Refresh Token으로 재발급한다. 블랙리스트 검증을 포함한다.', io: '입력: refreshToken\n출력: 새 token, refreshToken', rules: '- type === "refresh" 확인\n- Redis blacklist:user:{id} 확인\n- inactive 사용자 401\n- 토큰 발급시각 < 블랙리스트 시각 → 거부', priority: '필수', service: 'auth-service', api: 'POST /api/auth/refresh', remark: '' },
  { reqId: 'FR-AUTH-004', category: '기능', major: '인증', minor: '로그아웃', title: '토큰 블랙리스트 등록', description: '현재 Access Token을 Redis 블랙리스트에 등록하여 즉시 무효화한다.', io: '입력: Authorization 헤더\n출력: 200 OK', rules: '- 남은 TTL만큼 Redis에 블랙리스트 키 저장\n- Redis 오류 시에도 성공 반환 (fire-and-forget)', priority: '필수', service: 'auth-service', api: 'POST /api/auth/logout', remark: '' },
  { reqId: 'FR-AUTH-005', category: '기능', major: '인증', minor: '세션', title: 'httpOnly 쿠키 세션 관리', description: 'Refresh Token을 httpOnly 쿠키로 저장하여 XSS 공격을 방지한다.', io: '입력: refreshToken\n출력: Set-Cookie 헤더', rules: '- SameSite=Strict\n- 프로덕션 시 Secure 플래그\n- Max-Age: 28800초(8시간)\n- Path: /api/auth/session', priority: '필수', service: 'api-gateway', api: 'POST /api/auth/session\nPOST /api/auth/session/refresh\nDELETE /api/auth/session', remark: '' },
  { reqId: 'FR-AUTH-006', category: '기능', major: '사용자 관리', minor: '조직', title: '조직 CRUD', description: 'Admin이 조직(Organization)을 생성, 수정, 삭제한다. slug는 고유해야 한다.', io: '입력: name, slug\n출력: Organization 객체', rules: '- Admin만 CUD 가능\n- slug 중복 시 409\n- 소속 사용자가 있는 조직 삭제 불가 (400)\n- 감사 로그 기록', priority: '필수', service: 'auth-service', api: 'GET/POST /api/auth/orgs\nPUT/DELETE /api/auth/orgs/:id', remark: '' },
  { reqId: 'FR-AUTH-007', category: '기능', major: '사용자 관리', minor: '팀', title: '팀 CRUD 및 멤버 관리', description: 'Admin이 팀을 생성/수정/삭제하고, 팀에 멤버를 추가/제거한다.', io: '입력: orgId, name, userId\n출력: Team/TeamMember 객체', rules: '- Admin만 CUD 가능\n- 중복 멤버 추가 시 409\n- 팀 삭제 시 TeamMember cascade 삭제\n- 감사 로그 기록', priority: '필수', service: 'auth-service', api: 'GET/POST /api/auth/teams\nPUT/DELETE /api/auth/teams/:id\nGET/POST /teams/:id/members\nDELETE /teams/:id/members/:userId', remark: '' },
  { reqId: 'FR-AUTH-008', category: '기능', major: '사용자 관리', minor: '사용자', title: '사용자 CRUD 및 역할/상태 관리', description: 'Admin이 사용자를 생성, 조회, 수정(역할/상태 변경), 삭제한다. 역할/상태 변경 시 기존 토큰을 즉시 무효화한다.', io: '입력: email, name, password, roleId, status\n출력: User 객체', rules: '- Admin만 CUD 가능\n- orgId 스코프 필터 (멀티테넌시)\n- roleId/status 변경 시 Redis 블랙리스트 등록\n- 자기 자신 삭제 불가 (400)\n- 타 조직 사용자 접근 시 404', priority: '필수', service: 'auth-service', api: 'GET/POST /api/auth/users\nPUT/DELETE /api/auth/users/:id', remark: '' },
  { reqId: 'FR-AUTH-009', category: '기능', major: '사용자 관리', minor: '역할', title: '역할 및 권한 관리', description: 'Admin이 역할을 생성하고 권한을 배정한다. 4개 허용 역할명(admin, researcher, reviewer, viewer)만 생성 가능하다.', io: '입력: orgId, name, permissions[]\n출력: Role 객체', rules: '- 허용 역할명 외 400\n- 권한 변경 시 해당 역할 전원 토큰 무효화\n- 사용자 있는 역할 삭제 불가 (400)\n- Redis 캐시 무효화', priority: '필수', service: 'auth-service', api: 'GET/POST /api/auth/roles\nPUT /api/auth/roles/:id/permissions\nDELETE /api/auth/roles/:id', remark: '' },

  // ─── 연구노트 ─────────────────────────────────────────────
  { reqId: 'FR-ELN-001', category: '기능', major: '연구노트', minor: '노트 CRUD', title: '연구노트 생성', description: '사용자가 제목, 내용, 섹션, 태그를 입력하여 연구노트를 생성한다. 초기 상태는 draft이며 리비전 1번이 자동 생성된다.', io: '입력: title(필수), content, sections[], templateId, tags[]\n출력: Note 객체 (status=draft)', rules: '- NOTE_WRITE 권한 필요\n- status는 항상 draft로 고정\n- 리비전 1번 자동 생성\n- templateId 지정 시 useCount +1\n- OpenSearch 인덱싱 (비동기)', priority: '필수', service: 'eln-service', api: 'POST /api/notes', remark: '' },
  { reqId: 'FR-ELN-002', category: '기능', major: '연구노트', minor: '노트 CRUD', title: '연구노트 조회 (목록/상세/배치)', description: '목록 조회(필터/페이징/팀 가시성), 단건 조회, ID 배열 배치 조회(최대 500건)를 지원한다.', io: '입력: status, tag, search, page, limit, type, authorId, teamId\n출력: Note[] + total + page', rules: '- NOTE_READ 권한 필요\n- 비Admin은 내 노트 + 내 팀 노트 + teamId=null만 조회\n- Admin은 조직 전체\n- orgId 멀티테넌시 필터\n- deletedAt=null (소프트 삭제 제외)', priority: '필수', service: 'eln-service', api: 'GET /api/notes\nGET /api/notes/:id\nPOST /api/notes/batch', remark: '' },
  { reqId: 'FR-ELN-003', category: '기능', major: '연구노트', minor: '노트 CRUD', title: '연구노트 수정', description: '소유자 또는 Admin이 노트를 수정한다. 수정 시 자동으로 새 리비전이 생성된다.', io: '입력: title, content, sections[], tags[], changeSummary\n출력: 업데이트된 Note', rules: '- NOTE_WRITE 권한 + 소유자/Admin\n- locked 상태 → 403 (NOTE_LOCKED)\n- signed 상태 → 403 (NOTE_SIGNED)\n- 타인 노트 비Admin → 403\n- 리비전 자동 채번', priority: '필수', service: 'eln-service', api: 'PUT /api/notes/:id', remark: '' },
  { reqId: 'FR-ELN-004', category: '기능', major: '연구노트', minor: '노트 CRUD', title: '연구노트 소프트 삭제', description: '소유자 또는 Admin이 노트를 삭제한다. deletedAt 필드를 설정하는 소프트 삭제 방식이다.', io: '입력: noteId\n출력: { ok, message, id }', rules: '- NOTE_DELETE 권한 + 소유자/Admin\n- signed 상태 → 삭제 불가 (403)\n- locked 상태 → 삭제 불가 (403)\n- OpenSearch에서 제거', priority: '필수', service: 'eln-service', api: 'DELETE /api/notes/:id', remark: '' },
  { reqId: 'FR-ELN-005', category: '기능', major: '연구노트', minor: '상태 관리', title: '노트 상태 전환', description: '노트의 상태를 전환한다. 역할별 허용 전환이 다르며, DB 트리거가 최종 안전장치 역할을 한다.', io: '입력: { status }\n출력: 업데이트된 Note', rules: '- draft ↔ in_progress (전 역할)\n- in_progress → locked (Reviewer/Admin만)\n- in_progress → signed (system만, 서명 프로세스)\n- locked → draft (Admin 잠금해제만)\n- signed → 변경 불가\n- DB FOR UPDATE 락, NoteStatusHistory 기록', priority: '필수', service: 'eln-service', api: 'PATCH /api/notes/:id/status', remark: '' },
  { reqId: 'FR-ELN-006', category: '기능', major: '연구노트', minor: '상태 관리', title: '관리자 잠금 해제', description: 'Admin이 비밀번호를 입력하여 locked 노트를 draft로 강제 해제한다.', io: '입력: adminPassword, reason?\n출력: 업데이트된 Note + auditLog', rules: '- requireRole(ADMIN) + NOTE_UNLOCK 권한\n- auth-service 내부 API로 비밀번호 검증\n- isAdminAction=true로 이력 기록\n- 노트 작성자에게 NOTE_UNLOCKED 알림', priority: '필수', service: 'eln-service', api: 'POST /api/notes/:id/admin-unlock', remark: '' },
  { reqId: 'FR-ELN-007', category: '기능', major: '연구노트', minor: '버전 관리', title: '리비전(버전) 관리', description: '노트 수정 시 자동 생성되는 리비전을 목록/단건 조회한다.', io: '입력: noteId, rev?\n출력: NoteRevision[] 또는 단건', rules: '- NOTE_READ 권한\n- revision 번호 오름차순 정렬\n- orgId 스코프 확인', priority: '필수', service: 'eln-service', api: 'GET /api/notes/:id/revisions\nGET /api/notes/:id/revisions/:rev', remark: '' },
  { reqId: 'FR-ELN-008', category: '기능', major: '연구노트', minor: '첨부파일', title: '노트 첨부파일 관리', description: '노트에 파일 메타데이터를 등록, 목록 조회, 삭제한다.', io: '입력: fileId, fileName, mimeType, sizeBytes\n출력: Attachment 객체', rules: '- FILE_UPLOAD/READ/DELETE 권한\n- 삭제: 업로더 또는 Admin만\n- FK 위반 시 404', priority: '권장', service: 'eln-service', api: 'POST/GET/DELETE /api/notes/:id/attachments', remark: '' },
  { reqId: 'FR-ELN-009', category: '기능', major: '연구노트', minor: '교차 참조', title: '노트 교차 참조 링크', description: '노트 간 또는 노트-인벤토리 간 교차 참조 링크를 추가/조회/삭제한다.', io: '입력: targetType(inventory|equipment|template|note), targetId, label\n출력: NoteLink 객체', rules: '- NOTE_WRITE/READ 권한\n- 삭제: 링크 생성자, 노트 소유자, 또는 Admin', priority: '권장', service: 'eln-service', api: 'POST/GET/DELETE /api/notes/:id/links', remark: '' },
  { reqId: 'FR-ELN-010', category: '기능', major: '연구노트', minor: '프로토콜', title: '프로토콜(SOP) 관리', description: '/api/protocols 경로로 type=template 노트를 관리한다. 노트와 동일한 CRUD/상태 관리를 지원한다.', io: '노트와 동일 (type=template 자동 적용)', rules: '- 노트 CRUD 핸들러 재사용\n- type=template 자동 주입', priority: '권장', service: 'eln-service', api: 'GET/POST/PUT/DELETE/PATCH /api/protocols', remark: '' },
  { reqId: 'FR-ELN-011', category: '기능', major: '연구노트', minor: '템플릿', title: '노트 템플릿 관리', description: '별도 Template 모델의 CRUD, 복사, 추천 기능을 제공한다. isPublic=true 템플릿은 타 조직에서도 조회 가능하다.', io: '입력: title, category, description, content, sections[], tags[], isPublic\n출력: Template 객체', rules: '- TEMPLATE_READ/WRITE 권한\n- 수정/삭제: 작성자 또는 Admin\n- 복사 시 copyCount +1, 트랜잭션 처리\n- OpenSearch 인덱싱', priority: '권장', service: 'eln-service', api: 'GET/POST/PUT/DELETE /api/templates\nPOST /api/templates/:id/copy\nPOST /api/templates/recommend', remark: '' },
  { reqId: 'FR-ELN-012', category: '기능', major: '연구노트', minor: '통계', title: '노트 상태별 통계', description: '대시보드용 상태별 노트 카운트를 조회한다.', io: '입력: type, authorId?, teamId?\n출력: { draft, in_progress, locked, signed, total }', rules: '- NOTE_READ 권한\n- 없는 상태는 0으로 채움', priority: '권장', service: 'eln-service', api: 'GET /api/notes/stats', remark: '' },

  // ─── 전자서명/감사 ────────────────────────────────────────
  { reqId: 'FR-SIG-001', category: '기능', major: '전자서명', minor: '서명', title: '전자서명 (해시체인)', description: 'Reviewer/Admin이 비밀번호 인증 후 노트에 전자서명한다. SHA-256 해시체인으로 무결성을 보장한다.', io: '입력: password, comment?\n출력: Signature 객체 (해시, chainIndex)', rules: '- NOTE_SIGN 권한 (Reviewer/Admin)\n- 자기 서명 차단 (admin 예외)\n- 해시: sha256(noteId:signerId:timestamp:prevHash:comment)\n- genesis 서명: prevHash="genesis"\n- Redis Stream NOTE_SIGNED 이벤트 → eln-service\n- 실패 시 HTTP 폴백', priority: '필수', service: 'signature-audit', api: 'POST /api/signatures/sign/:noteId', remark: '' },
  { reqId: 'FR-SIG-002', category: '기능', major: '전자서명', minor: '검증', title: '서명 체인 무결성 검증', description: '노트의 전체 서명 체인을 검증하여 위변조 여부를 확인한다.', io: '입력: noteId\n출력: { verified, chainLength, chainErrors? }', rules: '- prevHash ↔ 이전 signatureHash 일치 검사\n- chainIndex 연속성 검사\n- 유효 서명 없으면 verified=false', priority: '필수', service: 'signature-audit', api: 'GET /api/signatures/verify/:noteId', remark: '' },
  { reqId: 'FR-SIG-003', category: '기능', major: '전자서명', minor: '취소', title: '서명 취소 (Admin)', description: 'Admin이 서명을 revoked 상태로 변경한다. 해시체인 보존을 위해 물리 삭제하지 않는다.', io: '입력: signatureId, reason\n출력: 업데이트된 Signature', rules: '- Admin 전용\n- 이미 revoked면 400\n- 물리 삭제 불가 (체인 무결성)\n- AuditLog 기록', priority: '권장', service: 'signature-audit', api: 'POST /api/signatures/revoke/:signatureId', remark: '' },
  { reqId: 'FR-SIG-004', category: '기능', major: '전자서명', minor: '컴플라이언스', title: '컴플라이언스 대시보드', description: '상태별 노트 수, 총 서명 수, 노트별 서명 상태, 편집 가능 여부를 조회한다.', io: '출력: { signed, pending, locked, draft, totalSignatures }', rules: '- NOTE_READ 권한\n- eln-service 장애 시 503', priority: '권장', service: 'signature-audit', api: 'GET /api/signatures/compliance/stats\nGET /api/signatures/compliance/list\nGET /api/signatures/editable/:noteId', remark: '' },

  // ─── 감사로그 ─────────────────────────────────────────────
  { reqId: 'FR-AUD-001', category: '기능', major: '감사로그', minor: '기록/조회', title: '감사로그 기록 및 조회', description: '모든 주요 행위(CRUD, 상태 변경, 서명, 역할 변경 등)를 AuditLog에 기록하고, 다중 필터로 조회한다.', io: '입력: entityType, entityId, action, actorId, dateFrom, dateTo\n출력: AuditLog[]', rules: '- AUDIT_READ 권한\n- orgId 멀티테넌시 필터\n- 내부 서비스: x-internal-secret으로 기록\n- createdAt DESC 정렬', priority: '필수', service: 'signature-audit', api: 'GET /api/audit/\nGET /api/audit/:id\nGET /api/audit/actions\nPOST /api/audit/internal', remark: '' },

  // ─── 내보내기 ─────────────────────────────────────────────
  { reqId: 'FR-EXP-001', category: '기능', major: '내보내기', minor: 'PDF/ZIP', title: '노트 PDF/ZIP/보고서 내보내기', description: '노트를 PDF, ZIP(복수 노트), 종합 보고서 형태로 비동기 내보내기한다.', io: '입력: noteId 또는 noteIds[]\n출력: 202 Accepted → 완료 후 fileUrl', rules: '- EXPORT_PDF 권한\n- BullMQ 큐 또는 인프로세스 큐\n- Puppeteer + Handlebars 렌더링\n- 최대 3회 재시도 (지수 백오프)\n- PDF 24시간, ZIP 48시간 만료', priority: '필수', service: 'signature-audit\nfile-service', api: 'POST /api/export/pdf/:noteId\nPOST /api/export/zip\nPOST /api/export/report\nGET /api/export/status/:jobId\nGET /api/export/list', remark: '' },

  // ─── 알림 ─────────────────────────────────────────────────
  { reqId: 'FR-NTF-001', category: '기능', major: '알림', minor: '실시간 알림', title: '알림 관리 및 실시간 푸시', description: '서명/잠금/해제/예약승인 시 알림을 생성하고, Redis Pub/Sub + SSE로 실시간 전달한다.', io: '출력: Notification[] + unread count', rules: '- Redis 캐시: notif-unread:{orgId}:{userId} (5분 TTL)\n- 생성 시 INCR, 읽음 시 DECR\n- 전체 읽음 시 키 삭제\n- SSE: notifications:{userId} 채널', priority: '권장', service: 'signature-audit\napi-gateway', api: 'GET /api/notifications\nGET /api/notifications/unread-count\nPATCH /api/notifications/:id/read\nPATCH /api/notifications/read-all\nGET /api/events/notifications', remark: '' },

  // ─── 인벤토리 ─────────────────────────────────────────────
  { reqId: 'FR-INV-001', category: '기능', major: '인벤토리', minor: '아이템 CRUD', title: '시약/샘플/장비 아이템 관리', description: '아이템 생성(status=available), 목록(필터/검색/정렬), 바코드 조회, 수정(소유권), 삭제를 지원한다.', io: '입력: name, type, quantity, unit, location, barcode, minQuantity, expiryDate, tags[], metadata\n출력: InventoryItem 객체', rules: '- INVENTORY_READ/WRITE/DELETE 권한\n- 수정/삭제: 소유자 또는 Admin\n- barcode DB 유니크 제약 (중복 409)\n- 초기 quantity 있으면 입고 이력 자동 생성\n- OpenSearch 인덱싱', priority: '필수', service: 'inventory-service', api: 'GET/POST /api/inventory/items\nGET /items/barcode/:barcode\nGET/PUT/DELETE /items/:id', remark: '' },
  { reqId: 'FR-INV-002', category: '기능', major: '인벤토리', minor: '수량 관리', title: '수량 조정 (입고/출고/절대값)', description: '아이템의 수량을 입고(in), 출고(out), 절대값(adjust)으로 조정한다. 이력을 자동 기록한다.', io: '입력: changeType(in|out|adjust), quantity, reason?\n출력: 갱신된 Item + history { before, after, delta }', rules: '- INVENTORY_WRITE 권한\n- out 시 재고 부족 → 400\n- quantity=0 → status 자동 depleted\n- depleted에서 입고 → available 자동 복구\n- Prisma 트랜잭션 원자 처리', priority: '필수', service: 'inventory-service', api: 'POST /api/inventory/items/:id/quantity\nGET /api/inventory/items/:id/history', remark: '' },
  { reqId: 'FR-INV-003', category: '기능', major: '인벤토리', minor: '알림', title: '만료 임박/재고 부족 알림', description: '유효기간 N일 이내 만료 예정 아이템과 minQuantity 이하 아이템을 조회한다.', io: '입력: days?(기본 90)\n출력: Item[] + daysLeft, isExpired, isWarning', rules: '- INVENTORY_READ 권한\n- disposed/depleted 제외\n- 만료: expiryDate asc 정렬', priority: '권장', service: 'inventory-service', api: 'GET /api/inventory/alerts/expiring\nGET /api/inventory/alerts/low-stock', remark: '' },
  { reqId: 'FR-INV-004', category: '기능', major: '인벤토리', minor: '카테고리', title: '카테고리 관리', description: 'Admin이 카테고리를 CRUD한다. Redis 캐시(30분) 적용.', io: '입력: name\n출력: Category 객체', rules: '- Admin 역할 전용\n- (orgId, name) 유니크 제약\n- CUD 시 Redis 캐시 무효화', priority: '권장', service: 'inventory-service', api: 'GET/POST/PUT/DELETE /api/inventory/categories', remark: '' },

  // ─── 예약 ─────────────────────────────────────────────────
  { reqId: 'FR-SCH-001', category: '기능', major: '예약', minor: '자원 관리', title: '장비/회의실 자원 관리', description: 'Admin이 자원(EQUIPMENT/ROOM)을 생성, 수정, 비활성화(soft delete)한다.', io: '입력: name, type, location, description, capacity, ownerId\n출력: Resource 객체', rules: '- Admin 전용\n- DELETE는 isActive=false (물리 삭제 아님)\n- 활성 예약(PENDING/APPROVED) 있으면 비활성화 불가 (409)', priority: '필수', service: 'scheduler-service', api: 'GET/POST/PUT/DELETE /api/scheduler/resources', remark: '' },
  { reqId: 'FR-SCH-002', category: '기능', major: '예약', minor: '예약 CRUD', title: '예약 생성/수정/조회', description: '사용자가 자원을 예약(PENDING)하고, PENDING 상태에서만 수정할 수 있다.', io: '입력: resourceId, title, description, startAt, endAt\n출력: Booking 객체', rules: '- SCHEDULER_WRITE 권한\n- endAt > startAt 필수\n- 비활성 자원 예약 불가\n- PENDING/APPROVED 예약과 시간 충돌 시 409\n- 수정은 PENDING만, 본인/Admin만', priority: '필수', service: 'scheduler-service', api: 'GET/POST/PUT /api/scheduler/bookings', remark: '' },
  { reqId: 'FR-SCH-003', category: '기능', major: '예약', minor: '상태 관리', title: '예약 승인/반려/취소/완료', description: '예약 상태 머신: PENDING → APPROVED/REJECTED/CANCELLED, APPROVED → COMPLETED/CANCELLED', io: '입력: reason?(반려 시)\n출력: 업데이트된 Booking', rules: '- 승인/반려: Admin 또는 자원 ownerId만\n- 취소/완료: 본인 또는 Admin만\n- 비관적 락 (SELECT FOR UPDATE, 5초 타임아웃)\n- 승인 시 APPROVED 예약과 재충돌 체크\n- 종단 상태(REJECTED/CANCELLED/COMPLETED) → 전환 불가', priority: '필수', service: 'scheduler-service', api: 'POST /bookings/:id/approve\nPOST /bookings/:id/reject\nPOST /bookings/:id/cancel\nPOST /bookings/:id/complete', remark: '' },
  { reqId: 'FR-SCH-004', category: '기능', major: '예약', minor: '캘린더', title: '캘린더 뷰', description: '지정 기간의 APPROVED 예약만 캘린더 형태로 조회한다.', io: '입력: from(필수), to(필수), type?\n출력: Booking[]', rules: '- SCHEDULER_READ 권한\n- APPROVED 상태만 반환\n- to > from 필수\n- 구간 교차 체크', priority: '권장', service: 'scheduler-service', api: 'GET /api/scheduler/calendar', remark: '' },

  // ─── 검색 ─────────────────────────────────────────────────
  { reqId: 'FR-SRC-001', category: '기능', major: '통합검색', minor: '검색', title: '통합 검색 (OpenSearch)', description: 'NOTE, PROTOCOL, TEMPLATE, INVENTORY를 대상으로 키워드 통합 검색한다. 가중치, 하이라이트, 집계를 지원한다.', io: '입력: q, domainTypes, page, size, dateFrom, dateTo\n출력: results[], total, counts, took', rules: '- NOTE_READ 권한\n- 필드 가중치: title^4, tags^3, summary^2, content^1\n- fuzziness: AUTO\n- Redis 캐시 3분 (SHA-256 키)\n- orgId + 권한 기반 필터\n- docStatus=active만', priority: '필수', service: 'search-service', api: 'GET /api/search', remark: '' },
  { reqId: 'FR-SRC-002', category: '기능', major: '통합검색', minor: '자동완성', title: '검색어 자동완성', description: '입력 중 실시간 제안 (phrase_prefix, 최대 7건)', io: '입력: q\n출력: suggestions[{ text, domainType, docId }]', rules: '- NOTE_READ 권한\n- 빈 쿼리 → 빈 결과 즉시 반환\n- 오류 시 빈 배열 (graceful degradation)', priority: '권장', service: 'search-service', api: 'GET /api/search/suggest', remark: '' },
  { reqId: 'FR-SRC-003', category: '기능', major: '통합검색', minor: '히스토리/즐겨찾기', title: '검색 히스토리 및 즐겨찾기', description: '검색 히스토리(자동+수동 저장, 최근 20건), 문서 즐겨찾기, 검색어 즐겨찾기를 관리한다.', io: '입력: query, docType, docId, title, keyword\n출력: 각각의 목록', rules: '- 로그인 사용자 전체\n- userId+orgId 스코프\n- 중복 즐겨찾기 409\n- 타인 항목 삭제 403', priority: '권장', service: 'search-service', api: 'GET/POST/DELETE /api/search/history\nGET/POST/DELETE /api/search/favorites\nGET/POST/DELETE /api/search/keyword-favorites', remark: '' },

  // ─── 파일 ─────────────────────────────────────────────────
  { reqId: 'FR-FILE-001', category: '기능', major: '파일', minor: '업로드', title: '파일 업로드 (직접/Presigned)', description: '서버 경유 multipart 업로드(50MB)와 클라이언트 직접 업로드(Presigned PUT URL, 15분) 두 방식을 지원한다.', io: '입력: file(multipart) 또는 filename+contentType\n출력: { id, key, uploadUrl }', rules: '- FILE_UPLOAD 권한\n- 실행 파일(.exe, .sh, .bat) MIME 차단\n- 50MB 크기 제한 (내부 200MB)\n- UUID 기반 파일키\n- DB 실패 시 MinIO 롤백 (원자성)', priority: '필수', service: 'file-service', api: 'POST /api/files\nGET /api/files/presigned-upload', remark: '' },
  { reqId: 'FR-FILE-002', category: '기능', major: '파일', minor: '다운로드', title: '파일 다운로드 (리디렉트/URL/스트림)', description: 'Presigned URL 302 리디렉트, URL 직접 반환(최대 24시간), 서버 직접 스트리밍 3가지 방식을 지원한다.', io: '입력: fileId, key?, expiresIn?\n출력: 302 리디렉트 | { url } | 바이너리 스트림', rules: '- FILE_READ 권한\n- orgId 멀티테넌시 검증\n- Content-Disposition: attachment (UTF-8 인코딩)\n- 레거시 파일(DB 없음) key 파라미터 지원', priority: '필수', service: 'file-service', api: 'GET /api/files/:id\nGET /api/files/:id/url\nGET /api/files/:id/stream\nGET /api/files/:id/meta', remark: '' },
  { reqId: 'FR-FILE-003', category: '기능', major: '파일', minor: '삭제', title: '파일 소프트 삭제', description: '소유자 또는 Admin이 파일을 소프트 삭제한다. 24시간 유예 후 MinIO 물리 삭제(6시간 배치).', io: '입력: fileId\n출력: { ok, id, message }', rules: '- FILE_DELETE + 소유자/Admin\n- isDeleted=true, deletedAt 설정\n- MinIO 비동기 삭제 (fire-and-forget)\n- 24시간 유예 → 6시간 배치 물리 삭제', priority: '필수', service: 'file-service', api: 'DELETE /api/files/:id', remark: '' },

  // ─── 실시간 협업 ──────────────────────────────────────────
  { reqId: 'FR-COL-001', category: '기능', major: '실시간 협업', minor: 'WebSocket', title: '실시간 공동 편집', description: 'WebSocket으로 노트 실시간 공동 편집을 지원한다. 콘텐츠 동기화, 커서 위치 공유, 사용자 입퇴장 알림을 제공한다.', io: '입력: WS /collab/notes/:noteId?token=JWT\n이벤트: content-update, awareness, user-joined, user-left', rules: '- JWT 쿼리 파라미터 인증\n- Redis pub/sub 멀티 인스턴스 동기화\n- 서버 측 userId 주입 (클라이언트 값 무시)\n- 8색 순환 색상 할당\n- 마지막 사용자 퇴장 시 룸 메모리 해제', priority: '권장', service: 'collab-service', api: 'WS /collab/notes/:noteId', remark: '포트 8009' },

  // ─── 대시보드 ─────────────────────────────────────────────
  { reqId: 'FR-DASH-001', category: '기능', major: '대시보드', minor: '집계', title: '개인/팀/조직 대시보드', description: 'API Gateway가 여러 서비스 데이터를 병렬 집계하여 단일 응답으로 반환한다. 서비스 장애 시 해당 항목만 null.', io: '출력: 노트 현황, 최근 노트, 예약, 알림, 감사로그, 인벤토리 통계', rules: '- 개인: 로그인 사용자 (2분 캐시)\n- 팀: Admin/팀 리더 (3분 캐시)\n- 조직: Admin 전용 (5분 캐시)\n- Promise.allSettled (graceful degradation)', priority: '권장', service: 'api-gateway', api: 'GET /api/dashboard/personal\nGET /api/dashboard/team/:teamId\nGET /api/dashboard/org', remark: '' },
];

// ============================================================
// 3. 비기능 요구사항
// ============================================================
const nfReqs = [
  // ─── 보안 ─────────────────────────────────────────────────
  { reqId: 'NFR-SEC-001', category: '보안', major: '인증/인가', minor: 'JWT 검증', title: 'API Gateway JWT 검증', description: 'api-gateway가 모든 요청에 대해 JWT를 검증하고, 내부 서비스로 사용자 정보 헤더를 주입한다.', io: '주입 헤더: x-user-id, x-user-role, x-user-email, x-user-permissions, x-user-org-id, x-user-team-ids, x-user-team-roles', rules: '- 공개 경로: /health, /login, /register, /refresh, /session*\n- /internal/ 경로 외부 차단 (404)\n- Redis 블랙리스트 검증 (토큰 + 사용자 단위)\n- orgId 없는 토큰 → 403', priority: '필수', service: 'api-gateway', api: '', remark: '' },
  { reqId: 'NFR-SEC-002', category: '보안', major: '인증/인가', minor: 'RBAC', title: '역할 기반 접근 제어 (4역할, 22권한)', description: 'requireAuth → requireRole → requirePermission → requireOwnerOrAdmin 4계층 접근 제어를 적용한다.', io: '', rules: '- admin: 전체 권한 (*)\n- researcher: 노트 읽기/쓰기, 인벤토리 읽기/쓰기\n- reviewer: 노트 읽기/상태변경/서명, 인벤토리 읽기\n- viewer: 읽기 전용', priority: '필수', service: '@lab/shared', api: '', remark: '' },
  { reqId: 'NFR-SEC-003', category: '보안', major: '데이터 보호', minor: '멀티테넌시', title: '조직 단위 데이터 격리 (멀티테넌시)', description: '모든 데이터 쿼리에 orgId 필터를 적용하여 조직 간 데이터를 완전 격리한다.', io: '', rules: '- getOrgId(headers) + withOrgScope() 필수\n- orgId 없이 조회 → 보안 위반\n- 타 조직 데이터 접근 시 404 (존재 여부 노출 방지)', priority: '필수', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-SEC-004', category: '보안', major: '데이터 보호', minor: '비밀번호', title: '비밀번호 안전 관리', description: '비밀번호는 bcrypt 10 라운드로 해싱하여 저장한다. 평문 저장/전송 금지.', io: '', rules: '- bcrypt 10 라운드\n- 시크릿 하드코딩 금지 (환경변수 관리)\n- .env 파일 커밋 금지', priority: '필수', service: 'auth-service', api: '', remark: '' },
  { reqId: 'NFR-SEC-005', category: '보안', major: '네트워크', minor: 'Rate Limit', title: 'API Rate Limiting', description: '엔드포인트별 요청 횟수 제한으로 브루트포스/DoS를 방지한다.', io: '', rules: '- 글로벌: 200회/분 (인증 사용자 userId, 미인증 IP)\n- /api/auth: 20회/분\n- /api/export: 10회/분\n- /api/search: 60회/분\n- /api/files: 30회/분\n- Redis 분산 카운터 (장애 시 fail-open)', priority: '필수', service: 'api-gateway', api: '', remark: '' },
  { reqId: 'NFR-SEC-006', category: '보안', major: '네트워크', minor: '보안 헤더', title: 'HTTP 보안 헤더 (Helmet)', description: '@fastify/helmet으로 CSP, HSTS 등 보안 헤더를 자동 설정한다.', io: '', rules: '- Content-Security-Policy\n- Strict-Transport-Security\n- X-Content-Type-Options\n- CORS: CORS_ORIGIN 환경변수, credentials=true', priority: '필수', service: 'api-gateway', api: '', remark: '' },
  { reqId: 'NFR-SEC-007', category: '보안', major: '네트워크', minor: '내부 통신', title: '서비스 간 내부 인증', description: '마이크로서비스 간 통신 시 x-internal-secret 헤더로 인증한다.', io: '', rules: '- INTERNAL_SECRET 환경변수 공유\n- requireInternalSecretFastify 미들웨어\n- 게이트웨이에서 /internal/ 경로 외부 차단', priority: '필수', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-SEC-008', category: '보안', major: '입력 검증', minor: 'Zod', title: '요청 데이터 검증 (Zod)', description: '모든 요청 body/query/params를 Zod 스키마로 검증한다.', io: '', rules: '- validate() preHandler 미들웨어\n- Prisma ORM 사용 ($queryRawUnsafe 금지)\n- XSS: dangerouslySetInnerHTML 금지\n- 실행 파일 MIME 차단', priority: '필수', service: '전 서비스', api: '', remark: '' },

  // ─── 성능 ─────────────────────────────────────────────────
  { reqId: 'NFR-PERF-001', category: '성능', major: '캐싱', minor: 'Redis', title: 'Redis 캐싱 전략', description: '검색 결과, 대시보드, 카테고리, 알림 카운트 등에 Redis 캐싱을 적용한다.', io: '', rules: '- 검색: 3분 TTL (SHA-256 키)\n- 대시보드: 개인 2분, 팀 3분, 조직 5분\n- 카테고리: 30분\n- 알림 카운트: 5분\n- 색인 변경 시 캐시 무효화', priority: '권장', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-PERF-002', category: '성능', major: '비동기 처리', minor: '큐', title: '비동기 작업 큐 (BullMQ/인프로세스)', description: 'PDF/ZIP 생성 등 무거운 작업을 비동기 큐로 처리한다.', io: '', rules: '- 최대 3회 재시도, 지수 백오프\n- signature-audit: BullMQ\n- file-service: 인프로세스 FIFO 큐\n- 작업 상태: PENDING → PROCESSING → COMPLETED/FAILED', priority: '필수', service: 'signature-audit\nfile-service', api: '', remark: '' },
  { reqId: 'NFR-PERF-003', category: '성능', major: '검색', minor: 'OpenSearch', title: 'OpenSearch 검색 최적화', description: '한국어 분석기, 필드 가중치, fuzziness로 검색 품질을 최적화한다.', io: '', rules: '- 한국어 nori 분석기 적용\n- multi_match + fuzziness: AUTO\n- 하이라이트 150자\n- 소프트 삭제(docStatus) 필터', priority: '권장', service: 'search-service', api: '', remark: '' },

  // ─── 인프라 ───────────────────────────────────────────────
  { reqId: 'NFR-INF-001', category: '인프라', major: 'Docker', minor: 'Compose', title: 'Docker Compose 배포', description: '전체 서비스를 docker-compose.yml로 정의하고, 헬스체크와 의존성 순서를 보장한다.', io: '', rules: '- 필수 환경변수: ${VAR:?설명} 패턴\n- 모든 서비스 healthcheck 필수\n- depends_on + condition: service_healthy\n- 서비스 간: Docker 내부 DNS\n- 영속 데이터: named volume', priority: '필수', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-INF-002', category: '인프라', major: '모니터링', minor: '트레이싱', title: 'OpenTelemetry 분산 트레이싱', description: 'Jaeger로 서비스 간 호출 흐름을 추적한다.', io: '', rules: '- OTEL_EXPORTER_OTLP_ENDPOINT 설정 시 자동 활성\n- Node.js 자동 계측\n- Jaeger UI: :16686', priority: '권장', service: 'api-gateway\n전 서비스', api: '', remark: '' },
  { reqId: 'NFR-INF-003', category: '인프라', major: '로깅', minor: 'Pino', title: '구조화 로깅 (Pino)', description: '@lab/shared의 createLogger/createHttpLogger로 JSON 구조화 로깅을 적용한다.', io: '', rules: '- console.log 대신 logger.info/warn/error\n- Dozzle로 웹 로그 뷰 (:9999)', priority: '권장', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-INF-004', category: '인프라', major: '스토리지', minor: 'MinIO', title: 'MinIO/S3 호환 스토리지', description: 'StorageProvider 패턴으로 MinIO/S3/로컬 디스크 전환을 지원한다.', io: '', rules: '- labnote-uploads: 파일 업로드\n- labnote-exports: PDF/ZIP\n- Presigned URL: 업로드 15분, 다운로드 최대 24시간\n- 만료 Export 1시간 정리 배치', priority: '필수', service: 'file-service', api: '', remark: '' },

  // ─── 데이터 ───────────────────────────────────────────────
  { reqId: 'NFR-DATA-001', category: '데이터', major: 'DB', minor: 'Prisma', title: '서비스별 Prisma 스키마 분리', description: '하나의 PostgreSQL에 서비스별 스키마를 분리하여 관리한다.', io: '', rules: '- auth: Organization, Role, User, Team\n- eln: Note, NoteRevision, Template, Attachment\n- signature: Signature(해시체인), AuditLog, ExportJob\n- inventory: InventoryItem, Category\n- scheduler: Resource, Booking\n- search: SearchHistory, Favorite\n- file: File, ExportJob', priority: '필수', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-DATA-002', category: '데이터', major: 'DB', minor: '무결성', title: 'DB 레벨 데이터 무결성 보장', description: 'DB 트리거와 유니크 제약으로 데이터 무결성을 보장한다.', io: '', rules: '- check_note_status_transition() DB 트리거 (수정 금지)\n- 모든 주요 테이블에 orgId 필드\n- orgId 포함 복합 인덱스\n- 마이그레이션 파일 직접 수정 금지', priority: '필수', service: '전 서비스', api: '', remark: '' },
  { reqId: 'NFR-DATA-003', category: '데이터', major: '이벤트', minor: 'Redis Stream', title: '서비스 간 이벤트 기반 통신', description: 'Redis Stream으로 서비스 간 비동기 이벤트를 처리한다. HTTP 콜백 폴백을 제공한다.', io: '', rules: '- note.signed: signature → eln\n- note.locked: eln → signature\n- note.created/updated: eln → search\n- inventory.updated: inventory → search\n- 60초마다 XCLAIM 재처리, 5회 초과 dead letter', priority: '필수', service: '전 서비스', api: '', remark: '' },

  // ─── 프론트엔드 ───────────────────────────────────────────
  { reqId: 'NFR-FE-001', category: '기능', major: '프론트엔드', minor: 'i18n', title: '다국어 지원 (한국어/영어)', description: 'react-i18next로 한국어(ko)와 영어(en)를 지원한다.', io: '', rules: '- 하드코딩 금지\n- ko/, en/ 두 곳 모두 반영\n- useTranslation("namespace") 사용\n- 키 네이밍: camelCase', priority: '필수', service: '프론트엔드', api: '', remark: '' },
  { reqId: 'NFR-FE-002', category: '기능', major: '프론트엔드', minor: 'API 클라이언트', title: 'API 클라이언트 (JWT 자동 관리)', description: 'apiClient 싱글턴이 JWT 자동 주입, 토큰 갱신, 401 자동 리디렉트를 처리한다.', io: '', rules: '- ApiResponse<T> = { ok, data, error? }\n- 401 시 자동 리디렉트\n- 토큰 자동 갱신', priority: '필수', service: '프론트엔드', api: '', remark: '' },
];

// ============================================================
// 시트 생성
// ============================================================
makeSheet('2.기능요구사항', REQ_COLS, funcReqs, { tabColor: 'FF1565C0' });
makeSheet('3.비기능요구사항', REQ_COLS, nfReqs, { tabColor: 'FF2E7D32' });

// ============================================================
// 4. 요구사항 추적 매트릭스 (RTM)
// ============================================================
const rtmCols = [
  { header: 'No', key: 'no', width: 6 },
  { header: '요구사항 ID', key: 'reqId', width: 14 },
  { header: '요구사항명', key: 'title', width: 32 },
  { header: '구현 상태', key: 'implStatus', width: 12 },
  { header: '구현 위치 (서비스/파일)', key: 'implLocation', width: 40 },
  { header: 'API 엔드포인트', key: 'api', width: 30 },
  { header: '테스트 TC ID', key: 'testId', width: 20 },
  { header: '테스트 결과', key: 'testResult', width: 12 },
  { header: '비고', key: 'remark', width: 24 },
];

const allReqs = [...funcReqs, ...nfReqs];
const rtmRows = allReqs.map(r => ({
  reqId: r.reqId,
  title: r.title,
  implStatus: '구현 완료',
  implLocation: r.service,
  api: r.api || '-',
  testId: r.reqId.startsWith('FR-') ? '테스트계획서 참조' : '-',
  testResult: r.reqId.startsWith('FR-') ? '테스트결과보고서 참조' : '-',
  remark: '',
}));

makeSheet('4.추적매트릭스(RTM)', rtmCols, rtmRows, { tabColor: 'FFEF6C00' });

// ============================================================
// 저장
// ============================================================
const outPath = 'docs/LabNote_ELN_요구사항분석서.xlsx';
await workbook.xlsx.writeFile(outPath);
console.log(`\n요구사항분석서 생성 완료: ${outPath}`);
console.log(`기능 요구사항: ${funcReqs.length}건, 비기능 요구사항: ${nfReqs.length}건, 총 ${allReqs.length}건`);
