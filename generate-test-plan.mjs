import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'LabNote ELN QA';
workbook.created = new Date();

// ============================================================
// 공통 스타일 헬퍼
// ============================================================
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B579A' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: '맑은 고딕' };
const SUB_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
const SUB_HEADER_FONT = { bold: true, size: 10, name: '맑은 고딕' };
const DEFAULT_FONT = { size: 10, name: '맑은 고딕' };
const BORDER_THIN = {
  top: { style: 'thin' }, left: { style: 'thin' },
  bottom: { style: 'thin' }, right: { style: 'thin' }
};
const PRIORITY_FILL = {
  '상': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } },
  '중': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } },
  '하': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } },
};

const COLUMNS = [
  { header: 'No', key: 'no', width: 6 },
  { header: '서비스', key: 'service', width: 16 },
  { header: '기능 분류', key: 'category', width: 18 },
  { header: '테스트 항목', key: 'testItem', width: 32 },
  { header: '테스트 상세', key: 'detail', width: 52 },
  { header: '사전 조건', key: 'precondition', width: 30 },
  { header: '테스트 절차', key: 'steps', width: 52 },
  { header: '기대 결과', key: 'expected', width: 40 },
  { header: '우선순위', key: 'priority', width: 10 },
  { header: '유형', key: 'type', width: 12 },
  { header: '결과', key: 'result', width: 10 },
  { header: '비고', key: 'remark', width: 24 },
];

function addSheet(name, rows) {
  const ws = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = COLUMNS;

  // 헤더 스타일
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER_THIN;
  });

  // 자동 필터
  ws.autoFilter = { from: 'A1', to: `L${rows.length + 1}` };

  // 데이터 행
  rows.forEach((r, idx) => {
    const row = ws.addRow({
      no: idx + 1,
      ...r,
      result: '',
      remark: '',
    });
    row.eachCell(cell => {
      cell.font = DEFAULT_FONT;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = BORDER_THIN;
    });
    // 우선순위 색상
    const pCell = row.getCell('priority');
    if (PRIORITY_FILL[r.priority]) {
      pCell.fill = PRIORITY_FILL[r.priority];
    }
    pCell.alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('no').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('type').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('result').alignment = { vertical: 'middle', horizontal: 'center' };
  });

  return ws;
}

// ============================================================
// 1. 인증/사용자 (auth-service)
// ============================================================
const authRows = [
  // --- 로그인 ---
  { service: 'auth-service', category: '로그인', testItem: '정상 로그인', detail: '유효한 이메일/비밀번호로 로그인 시 Access Token + Refresh Token 발급', precondition: '활성(active) 상태의 사용자 계정 존재', steps: '1. POST /api/auth/login\n2. body: { email, password }\n3. 응답 확인', expected: '200 OK, { ok: true, token, refreshToken } 반환\ntoken은 JWT 형식, 15분 만료', priority: '상', type: '기능' },
  { service: 'auth-service', category: '로그인', testItem: '잘못된 비밀번호', detail: '올바른 이메일 + 잘못된 비밀번호로 로그인 시도', precondition: '유효한 사용자 계정', steps: '1. POST /api/auth/login\n2. body: { email, wrongPassword }', expected: '401 AUTH_INVALID_CREDENTIALS', priority: '상', type: '기능' },
  { service: 'auth-service', category: '로그인', testItem: '존재하지 않는 이메일', detail: '미등록 이메일로 로그인 시도', precondition: '없음', steps: '1. POST /api/auth/login\n2. body: { unknownEmail, password }', expected: '401 AUTH_INVALID_CREDENTIALS', priority: '상', type: '기능' },
  { service: 'auth-service', category: '로그인', testItem: '비활성 계정 로그인', detail: 'status=inactive 사용자 로그인 시도', precondition: 'inactive 상태 사용자', steps: '1. POST /api/auth/login\n2. body: { email, password }', expected: '403 AUTH_INACTIVE_ACCOUNT', priority: '상', type: '기능' },
  { service: 'auth-service', category: '로그인', testItem: 'JWT 페이로드 검증', detail: '발급된 토큰의 payload에 필수 필드(sub, role, permissions, orgId, teams) 포함 여부', precondition: '로그인 성공', steps: '1. 로그인 후 token 디코드\n2. payload 필드 확인', expected: 'sub, email, role, permissions[], orgId, teams[] 모두 포함', priority: '상', type: '기능' },

  // --- 회원가입 ---
  { service: 'auth-service', category: '회원가입', testItem: '정상 회원가입', detail: '유효한 정보로 자가 등록', precondition: '조직이 1개 이상 존재', steps: '1. POST /api/auth/register\n2. body: { name, email, password }', expected: '201 Created, viewer 역할 자동 배정', priority: '상', type: '기능' },
  { service: 'auth-service', category: '회원가입', testItem: '이메일 중복 가입', detail: '이미 등록된 이메일로 가입 시도', precondition: '동일 이메일 사용자 존재', steps: '1. POST /api/auth/register\n2. body: { name, existingEmail, password }', expected: '409 AUTH_EMAIL_EXISTS', priority: '상', type: '기능' },
  { service: 'auth-service', category: '회원가입', testItem: '조직 없이 가입', detail: 'DB에 조직이 하나도 없는 상태에서 가입', precondition: '조직 0개', steps: '1. POST /api/auth/register', expected: '400 AUTH_NO_ORGANIZATION', priority: '중', type: '기능' },

  // --- 토큰 갱신 ---
  { service: 'auth-service', category: '토큰 갱신', testItem: '정상 토큰 갱신', detail: '유효한 Refresh Token으로 새 토큰 발급', precondition: '유효 refreshToken 보유', steps: '1. POST /api/auth/refresh\n2. body: { refreshToken }', expected: '200 OK, 새 token + refreshToken 발급', priority: '상', type: '기능' },
  { service: 'auth-service', category: '토큰 갱신', testItem: '만료된 Refresh Token', detail: '만료된 refreshToken으로 갱신 시도', precondition: '만료된 refreshToken', steps: '1. POST /api/auth/refresh\n2. body: { expiredRefreshToken }', expected: '401 AUTH_TOKEN_EXPIRED', priority: '상', type: '기능' },
  { service: 'auth-service', category: '토큰 갱신', testItem: '블랙리스트 사용자 토큰 갱신', detail: '권한 변경으로 블랙리스트에 등록된 사용자의 refreshToken', precondition: 'Redis blacklist:user:{id} 존재', steps: '1. 사용자 역할 변경\n2. 기존 refreshToken으로 갱신 시도', expected: '401 토큰 무효화', priority: '상', type: '보안' },

  // --- 로그아웃 ---
  { service: 'auth-service', category: '로그아웃', testItem: '정상 로그아웃', detail: '로그아웃 후 토큰 블랙리스트 등록 확인', precondition: '로그인 상태', steps: '1. POST /api/auth/logout\n2. 같은 토큰으로 API 호출', expected: '로그아웃 200 OK\n이후 해당 토큰으로 요청 시 401', priority: '상', type: '기능' },

  // --- 내 정보 ---
  { service: 'auth-service', category: '내 정보', testItem: '내 프로필 조회', detail: 'GET /api/auth/me — 역할, 권한 배열, 조직 포함', precondition: '로그인 상태', steps: '1. GET /api/auth/me', expected: '200 OK, { id, email, name, role, permissions[], orgId }', priority: '중', type: '기능' },
  { service: 'auth-service', category: '내 정보', testItem: '미인증 프로필 조회', detail: 'JWT 없이 /me 접근', precondition: '없음', steps: '1. GET /api/auth/me (no Authorization header)', expected: '401 Unauthorized', priority: '상', type: '보안' },

  // --- 조직 관리 ---
  { service: 'auth-service', category: '조직 관리', testItem: '조직 생성 (Admin)', detail: 'Admin이 새 조직 생성', precondition: 'Admin 로그인', steps: '1. POST /api/auth/orgs\n2. body: { name, slug }', expected: '201 Created', priority: '중', type: '기능' },
  { service: 'auth-service', category: '조직 관리', testItem: '조직 생성 (비Admin)', detail: 'Researcher가 조직 생성 시도', precondition: 'Researcher 로그인', steps: '1. POST /api/auth/orgs', expected: '403 Forbidden', priority: '중', type: '권한' },
  { service: 'auth-service', category: '조직 관리', testItem: 'slug 중복 조직 생성', detail: '이미 존재하는 slug로 생성', precondition: '동일 slug 조직 존재', steps: '1. POST /api/auth/orgs\n2. body: { name, duplicateSlug }', expected: '409 AUTH_SLUG_EXISTS', priority: '중', type: '기능' },
  { service: 'auth-service', category: '조직 관리', testItem: '소속 사용자 있는 조직 삭제', detail: '사용자가 1명이라도 있는 조직 삭제 시도', precondition: '사용자 소속 조직', steps: '1. DELETE /api/auth/orgs/:id', expected: '400 AUTH_ORG_HAS_USERS', priority: '중', type: '기능' },

  // --- 팀 관리 ---
  { service: 'auth-service', category: '팀 관리', testItem: '팀 생성/수정/삭제', detail: 'Admin이 팀 CRUD 수행', precondition: 'Admin 로그인', steps: '1. POST /api/auth/teams (생성)\n2. PUT /api/auth/teams/:id (수정)\n3. DELETE /api/auth/teams/:id (삭제)', expected: '각각 201/200/200 정상 처리', priority: '중', type: '기능' },
  { service: 'auth-service', category: '팀 관리', testItem: '팀 멤버 추가/제거', detail: '팀에 사용자 추가 및 제거', precondition: 'Admin 로그인, 팀 및 사용자 존재', steps: '1. POST /api/auth/teams/:id/members\n2. DELETE /api/auth/teams/:id/members/:userId', expected: '201 추가 / 200 제거', priority: '중', type: '기능' },
  { service: 'auth-service', category: '팀 관리', testItem: '중복 팀 멤버 추가', detail: '이미 소속된 사용자를 다시 추가', precondition: '해당 사용자가 이미 팀 소속', steps: '1. POST /api/auth/teams/:id/members\n2. body: { userId: existingMember }', expected: '409 AUTH_TEAM_MEMBER_EXISTS', priority: '중', type: '기능' },

  // --- 사용자 관리 ---
  { service: 'auth-service', category: '사용자 관리', testItem: '사용자 목록 조회 (멀티테넌시)', detail: 'Admin이 사용자 목록 조회 시 자기 조직만 반환', precondition: '복수 조직에 사용자 존재', steps: '1. Admin으로 GET /api/auth/users\n2. 결과에 타 조직 사용자 포함 여부 확인', expected: '자기 orgId 사용자만 반환, 타 조직 사용자 미노출', priority: '상', type: '보안' },
  { service: 'auth-service', category: '사용자 관리', testItem: '사용자 역할 변경 → 토큰 무효화', detail: '역할 변경 시 해당 사용자의 모든 토큰이 즉시 무효화', precondition: 'Admin 로그인, 대상 사용자의 기존 토큰 보유', steps: '1. PUT /api/auth/users/:id → roleId 변경\n2. 대상 사용자의 기존 토큰으로 API 호출', expected: '역할 변경 200 OK\n기존 토큰으로 요청 시 401', priority: '상', type: '보안' },
  { service: 'auth-service', category: '사용자 관리', testItem: '자기 자신 삭제 불가', detail: 'Admin이 자신의 계정 삭제 시도', precondition: 'Admin 로그인', steps: '1. DELETE /api/auth/users/:myId', expected: '400 AUTH_SELF_DELETE', priority: '중', type: '기능' },
  { service: 'auth-service', category: '사용자 관리', testItem: '타 조직 사용자 수정 차단', detail: '다른 orgId 사용자를 수정 시도', precondition: '타 조직 사용자 ID 확보', steps: '1. PUT /api/auth/users/:otherOrgUserId', expected: '404 AUTH_USER_NOT_FOUND (데이터 유출 없음)', priority: '상', type: '보안' },

  // --- 역할 관리 ---
  { service: 'auth-service', category: '역할 관리', testItem: '역할 생성 (허용 역할명)', detail: 'admin/researcher/reviewer/viewer 역할명으로 생성', precondition: 'Admin 로그인', steps: '1. POST /api/auth/roles\n2. body: { orgId, name: "researcher", permissions: [...] }', expected: '201 Created', priority: '중', type: '기능' },
  { service: 'auth-service', category: '역할 관리', testItem: '비허용 역할명 생성', detail: '허용되지 않은 역할명으로 생성 시도', precondition: 'Admin 로그인', steps: '1. POST /api/auth/roles\n2. body: { name: "superadmin" }', expected: '400 AUTH_INVALID_ROLE_NAME', priority: '중', type: '기능' },
  { service: 'auth-service', category: '역할 관리', testItem: '권한 변경 → 전원 토큰 무효화', detail: '역할 권한 수정 시 해당 역할 전체 사용자 토큰 무효화', precondition: '해당 역할 소속 사용자 복수', steps: '1. PUT /api/auth/roles/:id/permissions\n2. body: { permissions: [새 배열] }\n3. 소속 사용자 토큰으로 요청', expected: '기존 토큰 모두 401', priority: '상', type: '보안' },
  { service: 'auth-service', category: '역할 관리', testItem: '사용자 있는 역할 삭제', detail: '소속 사용자가 있는 역할 삭제 시도', precondition: '해당 역할 소속 사용자 존재', steps: '1. DELETE /api/auth/roles/:id', expected: '400 AUTH_ROLE_HAS_USERS', priority: '중', type: '기능' },

  // --- 내부 API ---
  { service: 'auth-service', category: '내부 API', testItem: '비밀번호 검증 (내부)', detail: 'x-internal-secret으로 사용자 비밀번호 검증', precondition: 'INTERNAL_SECRET 설정', steps: '1. POST /api/auth/internal/verify-password\n2. headers: { x-internal-secret }\n3. body: { userId, password }', expected: '{ ok: true, verified: true/false }', priority: '중', type: '기능' },
  { service: 'auth-service', category: '내부 API', testItem: '내부 API 외부 접근 차단', detail: 'api-gateway를 통해 /internal/ 경로 접근 시 차단', precondition: '없음', steps: '1. GET http://localhost:8000/api/auth/internal/role-permissions', expected: '404 Not Found (gateway가 차단)', priority: '상', type: '보안' },
];

// ============================================================
// 2. 연구노트 (eln-service)
// ============================================================
const elnRows = [
  // --- 노트 CRUD ---
  { service: 'eln-service', category: '노트 생성', testItem: '노트 정상 생성', detail: 'title 필수, status=draft로 고정, 리비전 1번 자동 생성', precondition: 'NOTE_WRITE 권한', steps: '1. POST /api/notes\n2. body: { title: "실험 기록" }\n3. 응답 확인', expected: '201, status=draft, revision 1 생성', priority: '상', type: '기능' },
  { service: 'eln-service', category: '노트 생성', testItem: '템플릿 기반 노트 생성', detail: 'templateId 지정 시 템플릿 useCount 증가', precondition: '템플릿 존재', steps: '1. POST /api/notes\n2. body: { title, templateId }\n3. 템플릿 useCount 확인', expected: '201, 템플릿 useCount +1', priority: '중', type: '기능' },
  { service: 'eln-service', category: '노트 조회', testItem: '노트 목록 조회 (팀 가시성)', detail: '비Admin 사용자는 내 노트 + 내 팀 노트 + teamId=null 노트만 조회', precondition: '복수 팀에 노트 존재', steps: '1. Researcher로 GET /api/notes\n2. 타 팀 노트 포함 여부 확인', expected: '타 팀 전용 노트는 미노출', priority: '상', type: '보안' },
  { service: 'eln-service', category: '노트 조회', testItem: '노트 목록 필터링', detail: 'status, tag, search, type, templateId 필터 동작', precondition: '다양한 상태/태그의 노트 존재', steps: '1. GET /api/notes?status=draft&tag=실험\n2. 결과 확인', expected: '필터 조건에 맞는 노트만 반환', priority: '중', type: '기능' },
  { service: 'eln-service', category: '노트 조회', testItem: '노트 배치 조회', detail: 'ID 배열로 최대 500건 일괄 조회', precondition: '복수 노트 ID', steps: '1. POST /api/notes/batch\n2. body: { ids: [id1, id2, ...] }', expected: '200 OK, 요청된 노트들 반환', priority: '중', type: '기능' },
  { service: 'eln-service', category: '노트 조회', testItem: '배치 조회 500건 초과', detail: '501개 이상 ID 전송', precondition: '없음', steps: '1. POST /api/notes/batch\n2. body: { ids: [501개] }', expected: '400 유효성 오류', priority: '중', type: '기능' },
  { service: 'eln-service', category: '노트 조회', testItem: '상태별 통계 조회', detail: 'GET /api/notes/stats — 상태별 카운트', precondition: '다양한 상태의 노트 존재', steps: '1. GET /api/notes/stats', expected: '{ draft, in_progress, locked, signed, total } 반환', priority: '중', type: '기능' },

  // --- 노트 수정 ---
  { service: 'eln-service', category: '노트 수정', testItem: '정상 수정 + 리비전 생성', detail: '수정 시 자동으로 새 리비전 생성', precondition: 'draft/in_progress 노트', steps: '1. PUT /api/notes/:id\n2. body: { title, content }\n3. GET /revisions 확인', expected: '200 OK, 새 리비전 번호 생성', priority: '상', type: '기능' },
  { service: 'eln-service', category: '노트 수정', testItem: 'locked 노트 수정 차단', detail: 'locked 상태 노트 수정 시도', precondition: 'locked 상태 노트', steps: '1. PUT /api/notes/:lockedId\n2. body: { title: "변경" }', expected: '403 NOTE_LOCKED', priority: '상', type: '기능' },
  { service: 'eln-service', category: '노트 수정', testItem: 'signed 노트 수정 차단', detail: 'signed 상태 노트 수정 시도', precondition: 'signed 상태 노트', steps: '1. PUT /api/notes/:signedId', expected: '403 NOTE_SIGNED', priority: '상', type: '기능' },
  { service: 'eln-service', category: '노트 수정', testItem: '타인 노트 수정 차단', detail: '소유자가 아닌 비Admin 사용자가 수정 시도', precondition: '타인 소유 노트', steps: '1. Researcher A로 PUT /api/notes/:noteByB', expected: '403 NOTE_PERMISSION_DENIED', priority: '상', type: '보안' },

  // --- 노트 삭제 ---
  { service: 'eln-service', category: '노트 삭제', testItem: '소프트 삭제', detail: 'deletedAt 설정, 물리 삭제 아님', precondition: 'draft 노트', steps: '1. DELETE /api/notes/:id\n2. DB에서 deletedAt 확인', expected: 'deletedAt 설정됨, 목록에서 미노출', priority: '상', type: '기능' },
  { service: 'eln-service', category: '노트 삭제', testItem: 'signed 노트 삭제 차단', detail: 'signed 상태 노트 삭제 시도', precondition: 'signed 상태 노트', steps: '1. DELETE /api/notes/:signedId', expected: '403 NOTE_SIGNED', priority: '상', type: '기능' },
  { service: 'eln-service', category: '노트 삭제', testItem: 'locked 노트 삭제 차단', detail: 'locked 상태 노트 삭제 시도', precondition: 'locked 상태 노트', steps: '1. DELETE /api/notes/:lockedId', expected: '403 NOTE_DELETE_LOCKED', priority: '상', type: '기능' },

  // --- 상태 전환 ---
  { service: 'eln-service', category: '상태 전환', testItem: 'draft → in_progress', detail: '정상 상태 전환', precondition: 'draft 노트', steps: '1. PATCH /api/notes/:id/status\n2. body: { status: "in_progress" }', expected: '200 OK, 상태 변경 + NoteStatusHistory 기록', priority: '상', type: '기능' },
  { service: 'eln-service', category: '상태 전환', testItem: 'in_progress → locked (Reviewer)', detail: 'Reviewer가 노트 잠금', precondition: 'in_progress 노트, Reviewer 역할', steps: '1. Reviewer로 PATCH /status\n2. body: { status: "locked" }', expected: '200 OK, 노트 잠김', priority: '상', type: '기능' },
  { service: 'eln-service', category: '상태 전환', testItem: 'in_progress → locked (Researcher 차단)', detail: 'Researcher가 노트 잠금 시도', precondition: 'in_progress 노트, Researcher 역할', steps: '1. Researcher로 PATCH /status\n2. body: { status: "locked" }', expected: '403 NOTE_LOCK_ROLE_REQUIRED', priority: '상', type: '권한' },
  { service: 'eln-service', category: '상태 전환', testItem: 'PATCH로 signed 직접 전환 차단', detail: '일반 사용자가 PATCH로 signed 전환 시도', precondition: 'in_progress 노트', steps: '1. PATCH /api/notes/:id/status\n2. body: { status: "signed" }', expected: '400 NOTE_STATUS_TRANSITION (허용되지 않은 전환)', priority: '상', type: '보안' },
  { service: 'eln-service', category: '상태 전환', testItem: 'signed → 다른 상태 전환 불가', detail: 'signed 노트의 어떤 상태 전환도 차단', precondition: 'signed 노트', steps: '1. PATCH /status { status: "draft" }', expected: '400 NOTE_STATUS_TRANSITION', priority: '상', type: '기능' },
  { service: 'eln-service', category: '상태 전환', testItem: '상태 전환 이력(History) 기록', detail: '모든 상태 전환 시 NoteStatusHistory 테이블에 기록', precondition: '상태 전환 가능 노트', steps: '1. 상태 전환 수행\n2. DB NoteStatusHistory 확인', expected: 'fromStatus, toStatus, changedBy, timestamp 기록', priority: '상', type: '기능' },

  // --- 관리자 잠금 해제 ---
  { service: 'eln-service', category: '관리자 잠금해제', testItem: '정상 잠금 해제', detail: 'Admin 비밀번호 인증 후 locked → draft 전환', precondition: 'locked 노트, Admin 로그인', steps: '1. POST /api/notes/:id/admin-unlock\n2. body: { adminPassword, reason }', expected: '200 OK, status=draft, isAdminAction=true 기록', priority: '상', type: '기능' },
  { service: 'eln-service', category: '관리자 잠금해제', testItem: '잘못된 비밀번호', detail: 'Admin 비밀번호 불일치', precondition: 'locked 노트, Admin 로그인', steps: '1. POST /admin-unlock\n2. body: { adminPassword: "wrong" }', expected: '400 NOTE_ADMIN_PASSWORD_INVALID', priority: '상', type: '기능' },
  { service: 'eln-service', category: '관리자 잠금해제', testItem: '비Admin 잠금 해제 차단', detail: 'Researcher/Reviewer가 잠금 해제 시도', precondition: 'locked 노트', steps: '1. Researcher로 POST /admin-unlock', expected: '403 Forbidden (requireRole(ADMIN))', priority: '상', type: '권한' },

  // --- 리비전 ---
  { service: 'eln-service', category: '리비전', testItem: '리비전 목록 조회', detail: '노트 수정 이력 전체 조회', precondition: '리비전이 복수 존재하는 노트', steps: '1. GET /api/notes/:id/revisions', expected: 'revision 번호 순 정렬 반환', priority: '중', type: '기능' },
  { service: 'eln-service', category: '리비전', testItem: '특정 리비전 조회', detail: '리비전 번호로 단건 조회', precondition: '해당 리비전 존재', steps: '1. GET /api/notes/:id/revisions/:rev', expected: '해당 리비전 데이터 반환', priority: '중', type: '기능' },

  // --- 첨부파일 ---
  { service: 'eln-service', category: '첨부파일', testItem: '첨부파일 등록/조회/삭제', detail: '노트에 파일 첨부, 목록 조회, 삭제', precondition: '노트 존재', steps: '1. POST /api/notes/:id/attachments\n2. GET /api/notes/:id/attachments\n3. DELETE /api/notes/:id/attachments/:aid', expected: '201 등록 / 200 목록 / 200 삭제', priority: '중', type: '기능' },
  { service: 'eln-service', category: '첨부파일', testItem: '타인 첨부파일 삭제 차단', detail: '업로더가 아닌 비Admin이 삭제 시도', precondition: '타인이 업로드한 첨부파일', steps: '1. DELETE /api/notes/:id/attachments/:aid', expected: '403 ATTACHMENT_PERMISSION_DENIED', priority: '중', type: '권한' },

  // --- 교차 참조 링크 ---
  { service: 'eln-service', category: '교차 참조', testItem: '링크 추가/조회/삭제', detail: '노트 간 교차 참조 링크 관리', precondition: '노트 존재', steps: '1. POST /api/notes/:id/links\n2. GET /api/notes/:id/links\n3. DELETE /api/notes/:id/links/:lid', expected: '201/200/200', priority: '중', type: '기능' },

  // --- 태그 ---
  { service: 'eln-service', category: '태그', testItem: '태그 목록 조회', detail: '조직 내 사용된 태그 목록 (중복 제거)', precondition: '태그가 있는 노트 존재', steps: '1. GET /api/tags?type=note', expected: '알파벳 정렬된 고유 태그 목록', priority: '하', type: '기능' },

  // --- 프로토콜 ---
  { service: 'eln-service', category: '프로토콜', testItem: '프로토콜 CRUD', detail: '/api/protocols 경로로 type=template 노트 관리', precondition: 'NOTE_WRITE 권한', steps: '1. POST /api/protocols\n2. GET /api/protocols\n3. PUT /api/protocols/:id\n4. DELETE /api/protocols/:id', expected: '노트 CRUD와 동일 동작, type=template 자동 적용', priority: '중', type: '기능' },

  // --- 템플릿 ---
  { service: 'eln-service', category: '템플릿', testItem: '템플릿 CRUD', detail: '별도 Template 모델의 CRUD', precondition: 'TEMPLATE_WRITE 권한', steps: '1. POST /api/templates\n2. GET /api/templates\n3. PUT /api/templates/:id\n4. DELETE /api/templates/:id', expected: '201/200/200/200', priority: '중', type: '기능' },
  { service: 'eln-service', category: '템플릿', testItem: '템플릿 복사', detail: '기존 템플릿 복사 → 새 템플릿 생성, 원본 copyCount +1', precondition: '템플릿 존재', steps: '1. POST /api/templates/:id/copy\n2. 원본 copyCount 확인', expected: '201, 복사본 생성, 원본 copyCount +1', priority: '중', type: '기능' },
  { service: 'eln-service', category: '템플릿', testItem: '타 조직 공개 템플릿 조회', detail: 'isPublic=true 템플릿은 타 조직에서도 조회 가능', precondition: '타 조직의 공개 템플릿', steps: '1. GET /api/templates', expected: '자기 조직 + isPublic=true 타 조직 템플릿 포함', priority: '중', type: '기능' },

  // --- 코드 ---
  { service: 'eln-service', category: '공통코드', testItem: '코드 CRUD (Admin)', detail: '공통 코드(카테고리 등) 관리', precondition: 'Admin 역할', steps: '1. POST /api/codes\n2. GET /api/codes?group=TEMPLATE_CATEGORY\n3. PUT /api/codes/:id\n4. DELETE /api/codes/:id', expected: '201/200/200/200', priority: '하', type: '기능' },

  // --- 이벤트 컨슈머 ---
  { service: 'eln-service', category: '이벤트', testItem: 'NOTE_SIGNED 이벤트 처리', detail: 'Redis Stream NOTE_SIGNED → in_progress→signed 자동 전환', precondition: '서명 완료된 노트', steps: '1. signature-service에서 서명 완료\n2. eln-service 로그/DB 확인', expected: '노트 status=signed, NoteStatusHistory 기록', priority: '상', type: '통합' },
];

// ============================================================
// 3. 전자서명/감사 (signature-audit-service)
// ============================================================
const sigRows = [
  // --- 전자서명 ---
  { service: 'signature-audit', category: '전자서명', testItem: '정상 서명', detail: '비밀번호 검증 + 해시체인 생성 + NOTE_SIGNED 이벤트 발행', precondition: 'Reviewer/Admin, in_progress 노트, 타인 소유', steps: '1. POST /api/signatures/sign/:noteId\n2. body: { password, comment }', expected: '201, 서명 생성, 해시체인 연결, 노트→signed', priority: '상', type: '기능' },
  { service: 'signature-audit', category: '전자서명', testItem: '자기 서명 차단', detail: '노트 작성자가 자기 노트에 서명 시도', precondition: 'Reviewer, 자기 소유 노트', steps: '1. POST /api/signatures/sign/:myNoteId', expected: '403 (자기 서명 차단, admin 예외)', priority: '상', type: '보안' },
  { service: 'signature-audit', category: '전자서명', testItem: 'Researcher 서명 차단', detail: 'Researcher가 서명 시도 (note:sign 권한 없음)', precondition: 'Researcher 역할', steps: '1. POST /api/signatures/sign/:noteId', expected: '403 권한 없음', priority: '상', type: '권한' },
  { service: 'signature-audit', category: '전자서명', testItem: '비밀번호 불일치', detail: '잘못된 비밀번호로 서명 시도', precondition: 'Reviewer', steps: '1. POST /api/signatures/sign/:noteId\n2. body: { password: "wrong" }', expected: '401/403 비밀번호 검증 실패', priority: '상', type: '기능' },
  { service: 'signature-audit', category: '전자서명', testItem: '해시체인 무결성 검증', detail: 'verify 엔드포인트로 체인 검증', precondition: '복수 서명이 존재하는 노트', steps: '1. GET /api/signatures/verify/:noteId', expected: '{ verified: true, chainLength, chainErrors 없음 }', priority: '상', type: '기능' },
  { service: 'signature-audit', category: '전자서명', testItem: '서명 목록 조회', detail: '노트의 전체 서명 목록', precondition: '서명된 노트', steps: '1. GET /api/signatures/:noteId', expected: '200, chainIndex 오름차순 정렬된 서명 목록', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '전자서명', testItem: '서명 취소 (Admin)', detail: 'Admin이 서명을 revoked 상태로 변경', precondition: 'Admin, 유효 서명 존재', steps: '1. POST /api/signatures/revoke/:signatureId\n2. body: { reason }', expected: '200, status=revoked', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '전자서명', testItem: '이미 취소된 서명 재취소', detail: 'revoked 서명 재취소 시도', precondition: 'revoked 서명', steps: '1. POST /api/signatures/revoke/:revokedId', expected: '400 SIGNATURE_ALREADY_REVOKED', priority: '중', type: '기능' },

  // --- 컴플라이언스 ---
  { service: 'signature-audit', category: '컴플라이언스', testItem: '통계 대시보드', detail: '상태별 노트 수 + 총 서명 수 조회', precondition: 'NOTE_READ 권한', steps: '1. GET /api/signatures/compliance/stats', expected: '{ signed, pending, locked, draft, totalSignatures }', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '컴플라이언스', testItem: '노트별 서명 상태 목록', detail: '노트 목록 + 서명 여부/개수 조합', precondition: 'NOTE_READ 권한', steps: '1. GET /api/signatures/compliance/list?status=signed', expected: '각 노트에 isSigned, signatureCount, editable 포함', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '컴플라이언스', testItem: '편집 가능 여부 확인', detail: '특정 노트의 editable 상태 조회', precondition: 'NOTE_READ 권한', steps: '1. GET /api/signatures/editable/:noteId', expected: 'draft/in_progress → editable:true, locked/signed → false', priority: '중', type: '기능' },

  // --- 감사로그 ---
  { service: 'signature-audit', category: '감사로그', testItem: '감사로그 목록 조회', detail: '다중 필터(entityType, actorId, action, 기간) + 페이징', precondition: 'AUDIT_READ 권한', steps: '1. GET /api/audit/?action=signed&dateFrom=...&dateTo=...', expected: '필터 조건에 맞는 감사로그 반환', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '감사로그', testItem: '감사로그 단건 조회', detail: 'ID로 상세 조회', precondition: 'AUDIT_READ 권한', steps: '1. GET /api/audit/:id', expected: '200, 상세 정보 반환', priority: '하', type: '기능' },
  { service: 'signature-audit', category: '감사로그', testItem: 'action 목록 조회', detail: '필터 UI용 사용된 action 목록', precondition: 'AUDIT_READ 권한', steps: '1. GET /api/audit/actions', expected: '사용된 action 문자열 배열', priority: '하', type: '기능' },
  { service: 'signature-audit', category: '감사로그', testItem: '내부 감사로그 생성', detail: '내부 서비스에서 감사로그 기록', precondition: 'INTERNAL_SECRET', steps: '1. POST /api/audit/internal\n2. headers: { x-internal-secret }\n3. body: { entityType, entityId, action, actorId }', expected: '201 Created', priority: '중', type: '기능' },

  // --- 내보내기 ---
  { service: 'signature-audit', category: '내보내기', testItem: 'PDF 단건 내보내기', detail: '노트 PDF 비동기 생성 요청', precondition: 'EXPORT_PDF 권한', steps: '1. POST /api/export/pdf/:noteId\n2. GET /api/export/status/:jobId (폴링)', expected: '202 Accepted → 완료 후 fileUrl 포함', priority: '상', type: '기능' },
  { service: 'signature-audit', category: '내보내기', testItem: 'ZIP 일괄 내보내기', detail: '복수 노트 ZIP 생성', precondition: 'EXPORT_PDF 권한', steps: '1. POST /api/export/zip\n2. body: { noteIds: [...] }', expected: '202 Accepted', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '내보내기', testItem: '종합 보고서 PDF', detail: '복수 노트를 단일 보고서로 생성', precondition: 'EXPORT_PDF 권한', steps: '1. POST /api/export/report\n2. body: { noteIds: [...] }', expected: '202 Accepted', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '내보내기', testItem: '작업 상태/목록 조회', detail: '내보내기 작업 상태 확인', precondition: 'EXPORT_PDF 권한', steps: '1. GET /api/export/status/:jobId\n2. GET /api/export/list', expected: '200, 상태/목록 반환', priority: '중', type: '기능' },

  // --- 알림 ---
  { service: 'signature-audit', category: '알림', testItem: '알림 목록 조회', detail: '내 알림 목록 (페이징, 읽음 필터)', precondition: '로그인 상태', steps: '1. GET /api/notifications?isRead=false', expected: '200, 미읽음 알림 목록', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '알림', testItem: '미읽음 알림 수 (캐시)', detail: 'Redis 캐시 적용된 미읽음 카운트', precondition: '로그인 상태', steps: '1. GET /api/notifications/unread-count', expected: '200, { count: N }', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '알림', testItem: '단건/전체 읽음 처리', detail: '알림 읽음 처리 및 Redis 캐시 갱신', precondition: '미읽음 알림 존재', steps: '1. PATCH /api/notifications/:id/read\n2. PATCH /api/notifications/read-all', expected: 'isRead=true, Redis 캐시 DECR/삭제', priority: '중', type: '기능' },
  { service: 'signature-audit', category: '알림', testItem: '내부 알림 생성 + 실시간 푸시', detail: '내부 서비스가 알림 생성 → Redis Pub/Sub → SSE', precondition: 'INTERNAL_SECRET', steps: '1. POST /api/notifications/internal\n2. SSE 구독 확인', expected: '201, Redis 채널 발행, 실시간 수신', priority: '중', type: '통합' },
];

// ============================================================
// 4. 인벤토리 (inventory-service)
// ============================================================
const invRows = [
  { service: 'inventory', category: '아이템 CRUD', testItem: '아이템 생성', detail: '이름/유형 필수, status=available 고정, 초기 수량 이력 자동 생성', precondition: 'INVENTORY_WRITE 권한', steps: '1. POST /api/inventory/items\n2. body: { name, type, quantity: 100 }\n3. GET /items/:id/history 확인', expected: '201, status=available, 초기 입고 이력 1건', priority: '상', type: '기능' },
  { service: 'inventory', category: '아이템 CRUD', testItem: '바코드 중복 생성', detail: '이미 존재하는 barcode로 아이템 생성', precondition: '동일 barcode 아이템 존재', steps: '1. POST /api/inventory/items\n2. body: { name, type, barcode: "DUP" }', expected: '409 ITEM_BARCODE_EXISTS', priority: '중', type: '기능' },
  { service: 'inventory', category: '아이템 CRUD', testItem: '바코드 조회', detail: 'GET /items/barcode/:barcode', precondition: '바코드가 있는 아이템', steps: '1. GET /api/inventory/items/barcode/ABC123', expected: '200, 해당 아이템 반환', priority: '중', type: '기능' },
  { service: 'inventory', category: '아이템 CRUD', testItem: '아이템 목록 필터/검색/정렬', detail: 'type, status, category, q, tag, sortBy 필터', precondition: '다양한 아이템 존재', steps: '1. GET /items?type=reagent&q=NaCl&sortBy=quantity', expected: '조건에 맞는 아이템만, 지정 순 정렬', priority: '중', type: '기능' },
  { service: 'inventory', category: '아이템 CRUD', testItem: '아이템 수정 (소유권 검증)', detail: '소유자/Admin만 수정 가능', precondition: '타인 소유 아이템', steps: '1. Researcher B로 PUT /items/:itemByA', expected: '403 ITEM_PERMISSION_DENIED', priority: '상', type: '권한' },
  { service: 'inventory', category: '아이템 CRUD', testItem: '아이템 삭제 + 검색 인덱스 제거', detail: '물리 삭제 + OpenSearch 인덱스 제거', precondition: 'INVENTORY_DELETE 권한', steps: '1. DELETE /api/inventory/items/:id\n2. 검색에서 해당 아이템 조회', expected: '200 삭제, 검색 결과에서 미노출', priority: '중', type: '기능' },

  // --- 수량 조정 ---
  { service: 'inventory', category: '수량 조정', testItem: '입고(in)', detail: '재고 증가 + 이력 기록', precondition: '아이템 존재', steps: '1. POST /items/:id/quantity\n2. body: { changeType: "in", quantity: 50 }', expected: 'after = before + 50, 이력 기록', priority: '상', type: '기능' },
  { service: 'inventory', category: '수량 조정', testItem: '출고(out) 정상', detail: '재고 감소 + 이력 기록', precondition: '수량 100인 아이템', steps: '1. POST /items/:id/quantity\n2. body: { changeType: "out", quantity: 30 }', expected: 'after = 70, delta = -30', priority: '상', type: '기능' },
  { service: 'inventory', category: '수량 조정', testItem: '출고(out) 재고 부족', detail: '현재 수량 초과 출고 시도', precondition: '수량 10인 아이템', steps: '1. POST /items/:id/quantity\n2. body: { changeType: "out", quantity: 20 }', expected: '400 ITEM_STOCK_INSUFFICIENT', priority: '상', type: '기능' },
  { service: 'inventory', category: '수량 조정', testItem: '수량 0 → 자동 depleted', detail: '출고로 수량이 0이 되면 status 자동 변경', precondition: '수량 10인 아이템', steps: '1. POST /items/:id/quantity\n2. body: { changeType: "out", quantity: 10 }', expected: 'quantity=0, status=depleted 자동 전환', priority: '상', type: '기능' },
  { service: 'inventory', category: '수량 조정', testItem: 'depleted → 입고 시 available 복구', detail: 'depleted 상태에서 입고하면 available로 복구', precondition: 'depleted 상태 아이템', steps: '1. POST /items/:id/quantity\n2. body: { changeType: "in", quantity: 5 }', expected: 'quantity=5, status=available 자동 복구', priority: '상', type: '기능' },
  { service: 'inventory', category: '수량 조정', testItem: '절대값 조정(adjust)', detail: '수량을 직접 지정', precondition: '아이템 존재', steps: '1. body: { changeType: "adjust", quantity: 200 }', expected: 'after=200, delta=200-before', priority: '중', type: '기능' },
  { service: 'inventory', category: '수량 이력', testItem: '이력 조회', detail: '아이템 수량/상태 변경 이력 (최근 100건)', precondition: '이력이 있는 아이템', steps: '1. GET /items/:id/history', expected: '최근순 정렬, 최대 100건', priority: '중', type: '기능' },

  // --- 알림 ---
  { service: 'inventory', category: '알림', testItem: '만료 임박 아이템', detail: 'N일 이내 만료 예정 아이템 조회', precondition: '유효기간이 설정된 아이템', steps: '1. GET /alerts/expiring?days=30', expected: 'daysLeft, isExpired, isWarning 계산값 포함', priority: '중', type: '기능' },
  { service: 'inventory', category: '알림', testItem: '재고 부족 아이템', detail: 'minQuantity 이하인 아이템 조회', precondition: 'minQuantity 설정된 아이템', steps: '1. GET /alerts/low-stock', expected: '재고 ≤ minQuantity인 아이템 목록', priority: '중', type: '기능' },

  // --- 카테고리 ---
  { service: 'inventory', category: '카테고리', testItem: '카테고리 CRUD (Admin)', detail: '생성/수정/삭제 + Redis 캐시 무효화', precondition: 'Admin 역할', steps: '1. POST /categories\n2. GET /categories (캐시 확인)\n3. PUT /categories/:id\n4. DELETE /categories/:id', expected: '201/200/200/200, 캐시 갱신 반영', priority: '중', type: '기능' },
  { service: 'inventory', category: '카테고리', testItem: '카테고리명 중복', detail: '동일 조직 내 카테고리명 중복 생성', precondition: '동일 이름 카테고리 존재', steps: '1. POST /categories { name: "시약" }', expected: '409 CATEGORY_EXISTS', priority: '중', type: '기능' },

  // --- 멀티테넌시 ---
  { service: 'inventory', category: '멀티테넌시', testItem: '타 조직 아이템 접근 차단', detail: '다른 orgId 아이템 조회/수정/삭제 시 404', precondition: '타 조직 아이템 ID', steps: '1. GET/PUT/DELETE /items/:otherOrgItemId', expected: '404 ITEM_NOT_FOUND (데이터 유출 없음)', priority: '상', type: '보안' },
];

// ============================================================
// 5. 예약 (scheduler-service)
// ============================================================
const schedRows = [
  // --- 자원 ---
  { service: 'scheduler', category: '자원 관리', testItem: '자원 CRUD (Admin)', detail: '장비/회의실 생성/수정/삭제(비활성화)', precondition: 'Admin 역할', steps: '1. POST /api/scheduler/resources\n2. PUT /resources/:id\n3. DELETE /resources/:id', expected: '201/200/200, DELETE는 isActive=false', priority: '중', type: '기능' },
  { service: 'scheduler', category: '자원 관리', testItem: '활성 예약 있는 자원 비활성화 차단', detail: 'PENDING/APPROVED 예약이 있는 자원 삭제 시도', precondition: '활성 예약이 있는 자원', steps: '1. DELETE /api/scheduler/resources/:id', expected: '409 "진행 중인 예약이 N건 있어 비활성화할 수 없습니다"', priority: '중', type: '기능' },
  { service: 'scheduler', category: '자원 관리', testItem: '비Admin 자원 생성 차단', detail: 'Researcher가 자원 생성 시도', precondition: 'Researcher 역할', steps: '1. POST /api/scheduler/resources', expected: '403 Forbidden', priority: '중', type: '권한' },

  // --- 예약 CRUD ---
  { service: 'scheduler', category: '예약 관리', testItem: '예약 생성 (PENDING)', detail: '시간 충돌 없이 정상 예약', precondition: 'SCHEDULER_WRITE 권한, 활성 자원 존재', steps: '1. POST /api/scheduler/bookings\n2. body: { resourceId, title, startAt, endAt }', expected: '201, status=PENDING', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 관리', testItem: '예약 시간 충돌', detail: '기존 PENDING/APPROVED 예약과 시간 겹침', precondition: '동일 자원에 기존 예약 존재', steps: '1. POST /bookings (겹치는 시간)', expected: '409 + conflict 정보 포함', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 관리', testItem: '비활성 자원 예약 차단', detail: 'isActive=false 자원에 예약', precondition: '비활성 자원', steps: '1. POST /bookings { resourceId: inactiveId }', expected: '400 "비활성화된 자원입니다"', priority: '중', type: '기능' },
  { service: 'scheduler', category: '예약 관리', testItem: 'endAt ≤ startAt 차단', detail: '종료시간이 시작시간 이전', precondition: '없음', steps: '1. POST /bookings { startAt: "10:00", endAt: "09:00" }', expected: '400 유효성 오류', priority: '중', type: '기능' },
  { service: 'scheduler', category: '예약 관리', testItem: '예약 수정 (PENDING만)', detail: 'PENDING 상태 예약만 수정 허용', precondition: 'PENDING 예약 + APPROVED 예약', steps: '1. PUT /bookings/:pendingId (성공)\n2. PUT /bookings/:approvedId (실패)', expected: 'PENDING: 200 OK, APPROVED: 400', priority: '상', type: '기능' },

  // --- 상태 전환 ---
  { service: 'scheduler', category: '예약 상태', testItem: '승인 (PENDING → APPROVED)', detail: 'Admin/자원소유자가 예약 승인. 비관적 락 적용', precondition: 'Admin 또는 resource.ownerId', steps: '1. POST /bookings/:id/approve', expected: '200, status=APPROVED, approvedBy/At 기록', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 상태', testItem: '승인 시 시간 재충돌 체크', detail: '동시 승인으로 인한 race condition 방지', precondition: '겹치는 시간의 PENDING 2건', steps: '1. 예약A 승인\n2. 예약B 승인 시도', expected: '예약B: 409 "승인 시점에 시간 충돌"', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 상태', testItem: '반려 (PENDING → REJECTED)', detail: 'Admin/자원소유자가 예약 반려', precondition: 'PENDING 예약', steps: '1. POST /bookings/:id/reject\n2. body: { reason }', expected: '200, status=REJECTED, rejectedReason 기록', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 상태', testItem: '취소 (PENDING/APPROVED → CANCELLED)', detail: '본인/Admin이 예약 취소', precondition: 'PENDING 또는 APPROVED 예약', steps: '1. POST /bookings/:id/cancel', expected: '200, status=CANCELLED', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 상태', testItem: '완료 (APPROVED → COMPLETED)', detail: '사용 완료 처리', precondition: 'APPROVED 예약', steps: '1. POST /bookings/:id/complete', expected: '200, status=COMPLETED', priority: '중', type: '기능' },
  { service: 'scheduler', category: '예약 상태', testItem: '종단 상태에서 전환 차단', detail: 'REJECTED/CANCELLED/COMPLETED에서 어떤 전환도 차단', precondition: '종단 상태 예약', steps: '1. POST /bookings/:id/approve (REJECTED)', expected: '400 InvalidTransition', priority: '상', type: '기능' },
  { service: 'scheduler', category: '예약 상태', testItem: '타인 예약 수정/취소 차단', detail: '본인이 아닌 비Admin이 취소/수정 시도', precondition: '타인의 예약', steps: '1. POST /bookings/:othersId/cancel', expected: '403 "본인의 예약만 취소할 수 있습니다"', priority: '상', type: '권한' },
  { service: 'scheduler', category: '예약 상태', testItem: '비Admin/비Owner 승인 차단', detail: '자원 소유자도 Admin도 아닌 사용자가 승인', precondition: 'Researcher 역할, ownerId 미일치', steps: '1. POST /bookings/:id/approve', expected: '403 Forbidden', priority: '상', type: '권한' },

  // --- 캘린더 ---
  { service: 'scheduler', category: '캘린더', testItem: '캘린더 뷰 (APPROVED만)', detail: '기간 내 APPROVED 예약만 조회', precondition: 'PENDING + APPROVED 예약 존재', steps: '1. GET /calendar?from=...&to=...', expected: 'APPROVED 예약만 반환, PENDING 미포함', priority: '중', type: '기능' },
  { service: 'scheduler', category: '캘린더', testItem: 'to ≤ from 차단', detail: '잘못된 기간 파라미터', precondition: '없음', steps: '1. GET /calendar?from=2025-03-10&to=2025-03-09', expected: '400', priority: '하', type: '기능' },
];

// ============================================================
// 6. 검색 (search-service)
// ============================================================
const searchRows = [
  { service: 'search-service', category: '통합 검색', testItem: '키워드 검색', detail: 'OpenSearch multi_match 검색, 가중치(title^4, tags^3)', precondition: '인덱싱된 문서 존재', steps: '1. GET /api/search?q=실험&size=10', expected: '검색 결과 + 하이라이트 + domainType별 카운트', priority: '상', type: '기능' },
  { service: 'search-service', category: '통합 검색', testItem: '빈 검색어 처리', detail: 'q="" 시 OpenSearch 미호출', precondition: '없음', steps: '1. GET /api/search?q=', expected: '즉시 빈 결과 반환', priority: '중', type: '기능' },
  { service: 'search-service', category: '통합 검색', testItem: 'domainType 필터', detail: 'NOTE, PROTOCOL, TEMPLATE, INVENTORY 필터', precondition: '다양한 타입 문서', steps: '1. GET /api/search?q=test&domainTypes=NOTE,TEMPLATE', expected: '지정 타입만 반환', priority: '중', type: '기능' },
  { service: 'search-service', category: '통합 검색', testItem: '검색 캐시 (Redis)', detail: '동일 쿼리 두 번째 호출은 캐시에서 반환 (3분 TTL)', precondition: '첫 검색 완료', steps: '1. GET /api/search?q=test\n2. 동일 쿼리 재호출', expected: '두 번째 응답이 캐시에서 반환 (더 빠름)', priority: '중', type: '성능' },
  { service: 'search-service', category: '통합 검색', testItem: '멀티테넌시 격리', detail: '타 조직 문서 검색 불가', precondition: '복수 조직의 문서 인덱싱', steps: '1. 조직A 사용자로 검색\n2. 조직B 문서 포함 여부 확인', expected: '조직B 문서 미노출', priority: '상', type: '보안' },
  { service: 'search-service', category: '자동완성', testItem: '자동완성 제안', detail: 'phrase_prefix 기반 제안 (최대 7건)', precondition: '인덱싱된 문서', steps: '1. GET /api/search/suggest?q=연', expected: '{ suggestions: [...] } 최대 7건', priority: '중', type: '기능' },

  // --- 색인 관리 ---
  { service: 'search-service', category: '색인 관리', testItem: '문서 색인/벌크 색인', detail: '내부 서비스가 문서 색인 (캐시 무효화)', precondition: 'INTERNAL_SECRET', steps: '1. POST /api/search/index\n2. POST /api/search/index/bulk', expected: '색인 성공 + Redis 캐시 삭제', priority: '중', type: '기능' },
  { service: 'search-service', category: '색인 관리', testItem: '문서 소프트 삭제', detail: 'docStatus=deleted로 변경 → 검색 제외', precondition: 'INTERNAL_SECRET', steps: '1. DELETE /api/search/index/:id\n2. 검색 결과 확인', expected: '해당 문서 검색 미노출', priority: '중', type: '기능' },

  // --- 히스토리 ---
  { service: 'search-service', category: '검색 히스토리', testItem: '최근 검색어 조회/삭제', detail: '최근 20건 조회, 단건/전체 삭제', precondition: '검색 수행 이력', steps: '1. GET /api/search/history\n2. DELETE /api/search/history/:id\n3. DELETE /api/search/history', expected: '최근 20건 / 단건 삭제 / 전체 삭제', priority: '중', type: '기능' },
  { service: 'search-service', category: '검색 히스토리', testItem: '타인 히스토리 삭제 차단', detail: '타인의 검색 기록 삭제 시도', precondition: '타인의 히스토리 ID', steps: '1. DELETE /api/search/history/:othersId', expected: '403 SEARCH_PERMISSION_DENIED', priority: '중', type: '보안' },

  // --- 즐겨찾기 ---
  { service: 'search-service', category: '문서 즐겨찾기', testItem: '추가/조회/삭제', detail: '특정 문서 즐겨찾기 관리', precondition: '로그인 상태', steps: '1. POST /favorites { docType, docId, title }\n2. GET /favorites\n3. DELETE /favorites/:id', expected: '201/200/200', priority: '중', type: '기능' },
  { service: 'search-service', category: '문서 즐겨찾기', testItem: '중복 즐겨찾기', detail: '동일 (docType, docId) 재등록', precondition: '이미 즐겨찾기된 문서', steps: '1. POST /favorites (동일 docType+docId)', expected: '409 SEARCH_FAVORITE_EXISTS', priority: '중', type: '기능' },
  { service: 'search-service', category: '검색어 즐겨찾기', testItem: '검색어 즐겨찾기 CRUD', detail: '자주 쓰는 검색어 저장/조회/삭제', precondition: '로그인 상태', steps: '1. POST /keyword-favorites\n2. GET /keyword-favorites\n3. DELETE /keyword-favorites/:id', expected: '201/200/200', priority: '하', type: '기능' },
];

// ============================================================
// 7. 파일 (file-service)
// ============================================================
const fileRows = [
  { service: 'file-service', category: '파일 업로드', testItem: '직접 업로드 (multipart)', detail: '서버 경유 파일 업로드, DB + MinIO 저장', precondition: 'FILE_UPLOAD 권한', steps: '1. POST /api/files (multipart/form-data)\n2. file 필드에 파일 첨부', expected: '201, { id, key, originalName, mimeType, sizeBytes }', priority: '상', type: '기능' },
  { service: 'file-service', category: '파일 업로드', testItem: '실행 파일 차단', detail: '.exe, .sh, .bat 등 BLOCKED_MIME 업로드 시도', precondition: '없음', steps: '1. POST /api/files\n2. application/x-msdownload MIME 파일', expected: '400 차단', priority: '상', type: '보안' },
  { service: 'file-service', category: '파일 업로드', testItem: '50MB 초과 파일', detail: '파일 크기 제한 검증', precondition: '없음', steps: '1. POST /api/files (51MB 파일)', expected: '413 Payload Too Large', priority: '중', type: '기능' },
  { service: 'file-service', category: '파일 업로드', testItem: 'Presigned Upload URL 발급', detail: '클라이언트 직접 업로드용 URL', precondition: 'FILE_UPLOAD 권한', steps: '1. GET /api/files/presigned-upload?filename=test.pdf&contentType=application/pdf', expected: '200, { uploadUrl, fileId, expiresAt }', priority: '중', type: '기능' },

  { service: 'file-service', category: '파일 다운로드', testItem: 'Presigned URL 리디렉트', detail: 'GET /files/:id → 302 리디렉트', precondition: '업로드된 파일', steps: '1. GET /api/files/:id', expected: '302 Redirect → presigned URL', priority: '상', type: '기능' },
  { service: 'file-service', category: '파일 다운로드', testItem: 'URL 직접 반환', detail: 'GET /files/:id/url', precondition: '업로드된 파일', steps: '1. GET /api/files/:id/url', expected: '200, { url, expiresAt }', priority: '중', type: '기능' },
  { service: 'file-service', category: '파일 다운로드', testItem: '스트리밍 다운로드', detail: 'GET /files/:id/stream — 서버 직접 스트리밍', precondition: '업로드된 파일', steps: '1. GET /api/files/:id/stream', expected: 'Content-Disposition: attachment 헤더 포함 바이너리', priority: '중', type: '기능' },
  { service: 'file-service', category: '파일 다운로드', testItem: '메타데이터 조회', detail: 'GET /files/:id/meta', precondition: '업로드된 파일', steps: '1. GET /api/files/:id/meta', expected: '200, 파일 메타 정보 반환', priority: '하', type: '기능' },

  { service: 'file-service', category: '파일 삭제', testItem: '소프트 삭제 (소유자/Admin)', detail: 'isDeleted=true, 비동기 MinIO 삭제', precondition: '본인 업로드 파일', steps: '1. DELETE /api/files/:id', expected: '200, 24시간 유예 후 물리 삭제', priority: '중', type: '기능' },
  { service: 'file-service', category: '파일 삭제', testItem: '타인 파일 삭제 차단', detail: '업로더가 아닌 비Admin이 삭제 시도', precondition: '타인 파일', steps: '1. DELETE /api/files/:othersFileId', expected: '403', priority: '중', type: '권한' },
  { service: 'file-service', category: '파일 멀티테넌시', testItem: '타 조직 파일 접근 차단', detail: '다른 orgId 파일 다운로드 시도', precondition: '타 조직 파일 ID', steps: '1. GET /api/files/:otherOrgFileId', expected: '404 (데이터 유출 없음)', priority: '상', type: '보안' },

  // --- Export ---
  { service: 'file-service', category: 'Export', testItem: 'PDF 내보내기', detail: 'PDF 비동기 생성 → 완료 후 다운로드', precondition: '노트 존재', steps: '1. POST /api/exports { type: "pdf", noteId }\n2. GET /exports/:jobId (폴링)\n3. GET /exports/:jobId/download', expected: '202 → COMPLETED → 302 다운로드', priority: '상', type: '기능' },
  { service: 'file-service', category: 'Export', testItem: 'ZIP 내보내기', detail: '복수 노트 ZIP 생성', precondition: '복수 노트', steps: '1. POST /exports { type: "zip", scope: "selected", noteIds }', expected: '202 Accepted', priority: '중', type: '기능' },
  { service: 'file-service', category: 'Export', testItem: 'Export 취소', detail: 'PENDING/FAILED만 취소 가능', precondition: 'PENDING 상태 job', steps: '1. DELETE /exports/:jobId (PENDING → 성공)\n2. DELETE /exports/:jobId (PROCESSING → 실패)', expected: 'PENDING: 200 / PROCESSING: 409 EXPORT_NOT_CANCELLABLE', priority: '중', type: '기능' },
  { service: 'file-service', category: 'Export', testItem: '미완료 Export 다운로드 차단', detail: 'PENDING/PROCESSING 상태에서 다운로드 시도', precondition: '미완료 job', steps: '1. GET /exports/:pendingJobId/download', expected: '409 EXPORT_NOT_COMPLETED', priority: '중', type: '기능' },
];

// ============================================================
// 8. API Gateway
// ============================================================
const gwRows = [
  // --- JWT 검증 ---
  { service: 'api-gateway', category: 'JWT 검증', testItem: 'JWT 정상 검증', detail: '유효 JWT로 프록시 통과', precondition: '로그인된 사용자 토큰', steps: '1. GET /api/notes (Authorization: Bearer valid-token)', expected: '200 OK (다운스트림 서비스 응답)', priority: '상', type: '기능' },
  { service: 'api-gateway', category: 'JWT 검증', testItem: 'JWT 없이 요청', detail: 'Authorization 헤더 없이 보호 경로 접근', precondition: '없음', steps: '1. GET /api/notes (no Authorization)', expected: '401', priority: '상', type: '보안' },
  { service: 'api-gateway', category: 'JWT 검증', testItem: '블랙리스트 토큰', detail: 'Redis blacklist에 등록된 토큰', precondition: '로그아웃된 토큰', steps: '1. 로그아웃 후 같은 토큰으로 요청', expected: '401 "만료된 세션"', priority: '상', type: '보안' },
  { service: 'api-gateway', category: 'JWT 검증', testItem: '권한 변경 후 토큰 무효화', detail: 'Redis blacklist:user:{id} 검증', precondition: '역할 변경된 사용자 토큰', steps: '1. Admin이 사용자 역할 변경\n2. 변경 전 발급 토큰으로 요청', expected: '401 "권한이 변경됨"', priority: '상', type: '보안' },
  { service: 'api-gateway', category: 'JWT 검증', testItem: 'orgId 없는 토큰 차단', detail: 'orgId가 없는 JWT', precondition: 'orgId 미포함 JWT', steps: '1. orgId 없는 토큰으로 요청', expected: '403 "조직 정보가 없는 토큰"', priority: '상', type: '보안' },
  { service: 'api-gateway', category: 'JWT 검증', testItem: '공개 경로 우회', detail: 'login, register, refresh, health는 JWT 불필요', precondition: '없음', steps: '1. POST /api/auth/login (no JWT)', expected: '정상 처리 (JWT 검증 skip)', priority: '상', type: '기능' },

  // --- 내부 경로 차단 ---
  { service: 'api-gateway', category: '보안', testItem: '/internal/ 경로 외부 차단', detail: '게이트웨이가 /internal/ 패턴 요청을 차단', precondition: '없음', steps: '1. GET /api/auth/internal/verify-password\n2. POST /api/audit/internal', expected: '404 Not Found', priority: '상', type: '보안' },

  // --- Rate Limit ---
  { service: 'api-gateway', category: 'Rate Limit', testItem: '글로벌 Rate Limit (200/분)', detail: '200회/분 초과 시 429', precondition: '없음', steps: '1. 200회 이상 빠르게 요청', expected: '429 Too Many Requests', priority: '중', type: '보안' },
  { service: 'api-gateway', category: 'Rate Limit', testItem: '인증 엔드포인트 (20/분)', detail: '/api/auth 경로 20회/분 제한', precondition: '없음', steps: '1. POST /api/auth/login 21회 반복', expected: '21번째 요청에서 429', priority: '상', type: '보안' },
  { service: 'api-gateway', category: 'Rate Limit', testItem: '내보내기 엔드포인트 (10/분)', detail: '/api/export 경로 10회/분 제한', precondition: '없음', steps: '1. POST /api/export/pdf/:noteId 11회', expected: '11번째 요청에서 429', priority: '중', type: '보안' },

  // --- 세션 ---
  { service: 'api-gateway', category: '세션 관리', testItem: 'httpOnly 쿠키 세션', detail: 'Refresh Token 쿠키 저장/갱신/삭제', precondition: '로그인 완료', steps: '1. POST /api/auth/session { refreshToken }\n2. POST /api/auth/session/refresh\n3. DELETE /api/auth/session', expected: '쿠키 설정/갱신/삭제', priority: '중', type: '기능' },
  { service: 'api-gateway', category: '세션 관리', testItem: '쿠키 보안 속성', detail: 'httpOnly, SameSite=Strict 확인', precondition: '없음', steps: '1. POST /api/auth/session\n2. Set-Cookie 헤더 검사', expected: 'HttpOnly; SameSite=Strict; Path=/api/auth/session', priority: '상', type: '보안' },

  // --- 대시보드 ---
  { service: 'api-gateway', category: '대시보드', testItem: '개인 대시보드', detail: '내 노트 현황 + 오늘 예약 + 미읽음 알림 + 감사로그', precondition: '로그인 상태', steps: '1. GET /api/dashboard/personal', expected: '집계 데이터 반환 (null 허용 — 서비스 장애 시)', priority: '중', type: '기능' },
  { service: 'api-gateway', category: '대시보드', testItem: '팀 대시보드 (admin/leader)', detail: 'admin 또는 팀 리더만 접근', precondition: 'admin 또는 해당 팀 leader', steps: '1. GET /api/dashboard/team/:teamId', expected: '200 팀 집계 데이터', priority: '중', type: '기능' },
  { service: 'api-gateway', category: '대시보드', testItem: '조직 대시보드 (admin only)', detail: 'admin만 접근 가능', precondition: 'Admin 역할', steps: '1. GET /api/dashboard/org', expected: '200 전체 조직 집계', priority: '중', type: '기능' },
  { service: 'api-gateway', category: '대시보드', testItem: '비Admin 조직 대시보드 차단', detail: 'Researcher가 조직 대시보드 접근', precondition: 'Researcher 역할', steps: '1. GET /api/dashboard/org', expected: '403', priority: '중', type: '권한' },
  { service: 'api-gateway', category: '대시보드', testItem: '서비스 장애 시 graceful degradation', detail: '일부 서비스 다운 시 null 반환', precondition: 'eln-service 다운', steps: '1. GET /api/dashboard/personal', expected: '200 (실패 항목은 null, 나머지 정상)', priority: '중', type: '장애허용' },
  { service: 'api-gateway', category: '대시보드', testItem: '대시보드 캐시 TTL', detail: '개인 2분, 팀 3분, 조직 5분 캐시', precondition: '없음', steps: '1. 첫 호출 → 캐시 저장\n2. TTL 이내 재호출', expected: '캐시에서 빠르게 반환', priority: '하', type: '성능' },

  // --- SSE ---
  { service: 'api-gateway', category: 'SSE', testItem: 'Export 상태 SSE', detail: 'GET /api/events/exports — 실시간 내보내기 상태', precondition: '로그인 + Export 작업 진행 중', steps: '1. GET /api/events/exports (EventSource)\n2. Export 작업 완료 대기', expected: 'text/event-stream, 상태 이벤트 수신', priority: '중', type: '기능' },
  { service: 'api-gateway', category: 'SSE', testItem: '알림 SSE', detail: 'GET /api/events/notifications — 실시간 알림', precondition: '로그인', steps: '1. GET /api/events/notifications (EventSource)\n2. 알림 발생 대기', expected: 'text/event-stream, 알림 이벤트 수신', priority: '중', type: '기능' },
  { service: 'api-gateway', category: 'SSE', testItem: 'SSE 미인증 차단', detail: 'JWT 없이 SSE 접속', precondition: '없음', steps: '1. GET /api/events/notifications (no JWT)', expected: '401', priority: '상', type: '보안' },

  // --- 프록시 ---
  { service: 'api-gateway', category: '프록시', testItem: '헤더 주입 확인', detail: 'JWT 검증 후 x-user-id, x-user-role 등 헤더 주입', precondition: '유효 JWT', steps: '1. 요청 전달 후 다운스트림 서비스 로그 확인', expected: 'x-user-id, x-user-role, x-user-permissions, x-user-org-id 주입', priority: '상', type: '기능' },
];

// ============================================================
// 9. 실시간 협업 (collab-service)
// ============================================================
const collabRows = [
  { service: 'collab-service', category: 'WebSocket 연결', testItem: 'JWT 인증 성공', detail: '유효 JWT로 WebSocket 연결', precondition: '유효 JWT', steps: '1. WS /collab/notes/:noteId?token=validJWT', expected: '101 Upgrade, joined 이벤트 수신', priority: '상', type: '기능' },
  { service: 'collab-service', category: 'WebSocket 연결', testItem: 'JWT 없이 연결', detail: '토큰 없이 WebSocket 연결 시도', precondition: '없음', steps: '1. WS /collab/notes/:noteId (no token)', expected: '401 Unauthorized, 소켓 종료', priority: '상', type: '보안' },
  { service: 'collab-service', category: 'WebSocket 연결', testItem: '잘못된 경로 연결', detail: '경로 패턴 불일치', precondition: '없음', steps: '1. WS /invalid/path?token=valid', expected: '400 Bad Request, 소켓 종료', priority: '중', type: '기능' },

  { service: 'collab-service', category: '실시간 편집', testItem: '콘텐츠 브로드캐스트', detail: 'content-update 이벤트가 다른 참여자에게 전달', precondition: '동일 노트에 2명 이상 접속', steps: '1. 사용자A: content-update 전송\n2. 사용자B: 수신 확인', expected: 'B가 A의 content-update 수신 (userId, content 포함)', priority: '상', type: '기능' },
  { service: 'collab-service', category: '실시간 편집', testItem: '본인 메시지 미수신', detail: '자신이 보낸 content-update는 수신하지 않음', precondition: '노트 접속 상태', steps: '1. 사용자A: content-update 전송', expected: 'A 자신에게는 이벤트 미전달', priority: '중', type: '기능' },
  { service: 'collab-service', category: '실시간 편집', testItem: '커서 위치 공유 (awareness)', detail: 'awareness 이벤트로 커서 위치 실시간 공유', precondition: '2명 이상 접속', steps: '1. 사용자A: awareness { cursorLine: 42 } 전송\n2. 사용자B: 수신 확인', expected: 'B가 { userId, userName, colorIdx, cursorLine: 42 } 수신', priority: '중', type: '기능' },

  { service: 'collab-service', category: '사용자 입퇴장', testItem: '입장 브로드캐스트', detail: '새 사용자 입장 시 기존 참여자에게 user-joined 전달', precondition: '1명 이상 접속 중', steps: '1. 사용자B 입장\n2. 사용자A: user-joined 수신 확인', expected: 'A가 { userId, userName, colorIdx } 수신', priority: '중', type: '기능' },
  { service: 'collab-service', category: '사용자 입퇴장', testItem: '퇴장 브로드캐스트', detail: '사용자 연결 종료 시 user-left 전달', precondition: '2명 이상 접속', steps: '1. 사용자A 연결 종료\n2. 사용자B: user-left 수신 확인', expected: 'B가 { userId, userName } 수신', priority: '중', type: '기능' },
  { service: 'collab-service', category: '사용자 입퇴장', testItem: '빈 룸 자동 삭제', detail: '마지막 사용자 퇴장 시 룸 메모리 해제', precondition: '1명만 접속 중', steps: '1. 마지막 사용자 연결 종료\n2. /health rooms 확인', expected: 'rooms 수 감소', priority: '하', type: '기능' },
  { service: 'collab-service', category: '사용자 입퇴장', testItem: '색상 인덱스 할당', detail: '입장 순서대로 0~7 색상 할당', precondition: '없음', steps: '1. 8명 순차 접속\n2. colorIdx 확인', expected: '각 사용자 고유 colorIdx (0~7)', priority: '하', type: '기능' },

  { service: 'collab-service', category: '보안', testItem: '서버 측 userId 주입', detail: '클라이언트가 보낸 userId 무시, 서버가 JWT 기반 주입', precondition: '접속 중', steps: '1. content-update에 위조된 userId 전송\n2. 수신 측 userId 확인', expected: '수신된 userId는 JWT에서 추출한 값', priority: '상', type: '보안' },
  { service: 'collab-service', category: '보안', testItem: '노트 접근 권한 미검증 (알려진 제한)', detail: '유효 JWT면 어떤 noteId든 접근 가능', precondition: '유효 JWT', steps: '1. 타 조직 noteId로 접속', expected: '접속 허용됨 (현재 설계 제한사항)', priority: '중', type: '보안' },
];

// ============================================================
// 시트 생성
// ============================================================
addSheet('1.인증_사용자', authRows);
addSheet('2.연구노트', elnRows);
addSheet('3.전자서명_감사', sigRows);
addSheet('4.인벤토리', invRows);
addSheet('5.예약', schedRows);
addSheet('6.검색', searchRows);
addSheet('7.파일', fileRows);
addSheet('8.API_Gateway', gwRows);
addSheet('9.실시간협업', collabRows);

// ============================================================
// 요약 시트 (맨 앞)
// ============================================================
// 요약 시트를 맨 앞에 삽입하기 위해 기존 시트 순서 조정
const sheetNames = workbook.worksheets.map(ws => ws.name);
const summaryWs = workbook.addWorksheet('요약', {
  properties: { tabColor: { argb: 'FF2B579A' } },
});
// orderNo를 0으로 설정하여 맨 앞으로
summaryWs.orderNo = 0;
workbook.worksheets.sort((a, b) => (a.orderNo || 0) - (b.orderNo || 0));

const allSheets = [
  { name: '1.인증_사용자', rows: authRows },
  { name: '2.연구노트', rows: elnRows },
  { name: '3.전자서명_감사', rows: sigRows },
  { name: '4.인벤토리', rows: invRows },
  { name: '5.예약', rows: schedRows },
  { name: '6.검색', rows: searchRows },
  { name: '7.파일', rows: fileRows },
  { name: '8.API_Gateway', rows: gwRows },
  { name: '9.실시간협업', rows: collabRows },
];

summaryWs.columns = [
  { header: 'No', key: 'no', width: 6 },
  { header: '시트명', key: 'sheet', width: 20 },
  { header: '서비스', key: 'service', width: 18 },
  { header: '전체 TC', key: 'total', width: 10 },
  { header: '상', key: 'high', width: 8 },
  { header: '중', key: 'mid', width: 8 },
  { header: '하', key: 'low', width: 8 },
  { header: '기능', key: 'func', width: 8 },
  { header: '보안', key: 'sec', width: 8 },
  { header: '권한', key: 'perm', width: 8 },
  { header: '통합', key: 'integ', width: 8 },
  { header: '성능', key: 'perf', width: 8 },
  { header: '장애허용', key: 'fault', width: 10 },
];

const summaryHeaderRow = summaryWs.getRow(1);
summaryHeaderRow.height = 28;
summaryHeaderRow.eachCell(cell => {
  cell.fill = HEADER_FILL;
  cell.font = HEADER_FONT;
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = BORDER_THIN;
});

let grandTotal = 0;
allSheets.forEach((s, i) => {
  const total = s.rows.length;
  grandTotal += total;
  const high = s.rows.filter(r => r.priority === '상').length;
  const mid = s.rows.filter(r => r.priority === '중').length;
  const low = s.rows.filter(r => r.priority === '하').length;
  const func = s.rows.filter(r => r.type === '기능').length;
  const sec = s.rows.filter(r => r.type === '보안').length;
  const perm = s.rows.filter(r => r.type === '권한').length;
  const integ = s.rows.filter(r => r.type === '통합').length;
  const perf = s.rows.filter(r => r.type === '성능').length;
  const fault = s.rows.filter(r => r.type === '장애허용').length;
  const services = [...new Set(s.rows.map(r => r.service))].join(', ');
  const row = summaryWs.addRow({
    no: i + 1, sheet: s.name, service: services,
    total, high, mid, low, func, sec, perm, integ, perf, fault,
  });
  row.eachCell(cell => {
    cell.font = DEFAULT_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_THIN;
  });
});

// 합계 행
const totalRow = summaryWs.addRow({
  no: '', sheet: '합계', service: '',
  total: grandTotal,
  high: allSheets.reduce((a, s) => a + s.rows.filter(r => r.priority === '상').length, 0),
  mid: allSheets.reduce((a, s) => a + s.rows.filter(r => r.priority === '중').length, 0),
  low: allSheets.reduce((a, s) => a + s.rows.filter(r => r.priority === '하').length, 0),
  func: allSheets.reduce((a, s) => a + s.rows.filter(r => r.type === '기능').length, 0),
  sec: allSheets.reduce((a, s) => a + s.rows.filter(r => r.type === '보안').length, 0),
  perm: allSheets.reduce((a, s) => a + s.rows.filter(r => r.type === '권한').length, 0),
  integ: allSheets.reduce((a, s) => a + s.rows.filter(r => r.type === '통합').length, 0),
  perf: allSheets.reduce((a, s) => a + s.rows.filter(r => r.type === '성능').length, 0),
  fault: allSheets.reduce((a, s) => a + s.rows.filter(r => r.type === '장애허용').length, 0),
});
totalRow.eachCell(cell => {
  cell.font = { ...SUB_HEADER_FONT, size: 11 };
  cell.fill = SUB_HEADER_FILL;
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = BORDER_THIN;
});

// ============================================================
// 저장
// ============================================================
const outPath = 'LabNote_ELN_테스트계획서.xlsx';
await workbook.xlsx.writeFile(outPath);
console.log(`\n✅ 테스트계획서 생성 완료: ${outPath}`);
console.log(`   총 ${grandTotal}개 테스트 케이스, ${allSheets.length + 1}개 시트`);
