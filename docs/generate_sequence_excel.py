"""시퀀스 다이어그램을 엑셀 파일로 변환하는 스크립트"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# 스타일 정의
HEADER_FONT = Font(name='맑은 고딕', bold=True, size=11, color='FFFFFF')
HEADER_FILL = PatternFill(start_color='2F5496', end_color='2F5496', fill_type='solid')
SUB_HEADER_FILL = PatternFill(start_color='D6E4F0', end_color='D6E4F0', fill_type='solid')
SUB_HEADER_FONT = Font(name='맑은 고딕', bold=True, size=10)
NORMAL_FONT = Font(name='맑은 고딕', size=10)
TITLE_FONT = Font(name='맑은 고딕', bold=True, size=14, color='2F5496')
SECTION_FONT = Font(name='맑은 고딕', bold=True, size=11, color='2F5496')
THIN_BORDER = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)
WRAP_ALIGN = Alignment(wrap_text=True, vertical='top')
CENTER_ALIGN = Alignment(horizontal='center', vertical='center', wrap_text=True)

# 색상
COLORS = {
    'async': PatternFill(start_color='FFF2CC', end_color='FFF2CC', fill_type='solid'),
    'error': PatternFill(start_color='FCE4EC', end_color='FCE4EC', fill_type='solid'),
    'success': PatternFill(start_color='E8F5E9', end_color='E8F5E9', fill_type='solid'),
    'tx': PatternFill(start_color='E3F2FD', end_color='E3F2FD', fill_type='solid'),
    'event': PatternFill(start_color='F3E5F5', end_color='F3E5F5', fill_type='solid'),
}


def style_header_row(ws, row, cols):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = CENTER_ALIGN
        cell.border = THIN_BORDER


def style_data_row(ws, row, cols, fill=None):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = NORMAL_FONT
        cell.alignment = WRAP_ALIGN
        cell.border = THIN_BORDER
        if fill:
            cell.fill = fill


def add_data_row(ws, row, data, fill=None):
    for c, val in enumerate(data, 1):
        ws.cell(row=row, column=c, value=val)
    style_data_row(ws, row, len(data), fill)
    return row + 1


def set_col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ── 시퀀스 데이터 정의 ──

HEADERS = ['단계', '발신자(From)', '수신자(To)', '메서드/액션', 'API 경로 / 메시지', '데이터 / 페이로드', '비고 / 조건', '유형']

sequences = {
    '1-1. 로그인': [
        ('1', '사용자', 'Frontend', '클릭', '로그인 버튼', '{email, password}', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/auth/login', '{email, password}', '공개 경로 — JWT 검증 생략', ''),
        ('3', 'API Gateway', 'Auth Service', '프록시', '전달', '', '', ''),
        ('4', 'Auth Service', 'PostgreSQL', 'SELECT', 'user WHERE email', '+ role, teams 조인', '', ''),
        ('5', 'Auth Service', 'Auth Service', '검증', 'bcrypt.compare(password, hash)', '', '', ''),
        ('5-E', 'Auth Service', 'Frontend', '401', '응답', '{ok:false, error:"이메일 또는 비밀번호가 올바르지 않습니다"}', '비밀번호 불일치 또는 비활성 계정', 'error'),
        ('6', 'Auth Service', 'Auth Service', '생성', 'Access Token (15분)', 'payload: sub, email, role, permissions, orgId, teams', '', ''),
        ('7', 'Auth Service', 'Auth Service', '생성', 'Refresh Token (8시간)', 'payload: sub, type:refresh', '', ''),
        ('8', 'Auth Service', 'API Gateway', '200', '응답', '{ok:true, data:{token, refreshToken, user}}', '', 'success'),
        ('9', 'API Gateway', 'Frontend', '200', '응답 전달', '', '', ''),
        ('10', 'Frontend', 'Frontend', '저장', 'Access Token → 메모리 저장', '', '', ''),
        ('11', 'Frontend', 'API Gateway', 'POST', '/api/auth/session', '{refreshToken}', '', ''),
        ('12', 'API Gateway', 'API Gateway', '설정', 'Set-Cookie: labnote_rt', 'HttpOnly; Secure; SameSite=Strict; Path=/api/auth/session; Max-Age=28800', '', ''),
        ('13', 'Frontend', '사용자', '이동', '대시보드', '', '', ''),
    ],
    '1-2. 토큰 갱신': [
        ('1', 'Frontend', 'Frontend', '감지', 'Access Token 만료 (15분)', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/auth/session/refresh', 'Cookie: labnote_rt={refreshToken}', '', ''),
        ('3', 'API Gateway', 'API Gateway', '추출', '쿠키에서 Refresh Token 추출', '', '', ''),
        ('4', 'API Gateway', 'Auth Service', 'POST', '/api/auth/refresh', 'x-user-id 헤더 주입', '', ''),
        ('5', 'Auth Service', 'Auth Service', '검증', 'Refresh Token 서명 검증', "type='refresh' 확인", '', ''),
        ('6', 'Auth Service', 'Redis', 'GET', 'blacklist:user:{userId}', '', '', ''),
        ('6-E', 'Auth Service', 'Frontend', '401', '응답', '"권한이 변경되었습니다"', '사용자 무효화 존재 & token.iat < 무효화 시각', 'error'),
        ('7', 'Auth Service', 'Auth Service', '발급', '새 Access Token (15분)', '', '', ''),
        ('8', 'Auth Service', 'Auth Service', '발급', '새 Refresh Token (8시간)', '', '', ''),
        ('9', 'Auth Service', 'API Gateway', '200', '응답', '{token, refreshToken}', '', 'success'),
        ('10', 'API Gateway', 'API Gateway', '설정', 'Set-Cookie: labnote_rt={newRefreshToken}', '기존 쿠키 교체', '', ''),
        ('11', 'API Gateway', 'Frontend', '200', '응답', '{ok:true, data:{token}}', '', ''),
        ('12', 'Frontend', 'Frontend', '교체', '새 Access Token → 메모리 교체', '', '', ''),
    ],
    '1-3. 로그아웃': [
        ('1', '사용자', 'Frontend', '클릭', '로그아웃', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/auth/logout', 'Authorization: Bearer {accessToken}', '', ''),
        ('3', 'API Gateway', 'Auth Service', '프록시', '전달', '', '', ''),
        ('4', 'Auth Service', 'Auth Service', '추출', '토큰에서 만료시각(exp) 추출', '', '', ''),
        ('5', 'Auth Service', 'Redis', 'SET', 'blacklist:{token} "1"', 'TTL = 남은 만료 시간', '', ''),
        ('6', 'Auth Service', 'API Gateway', '200', '응답', '{ok:true}', '', 'success'),
        ('7', 'Frontend', 'API Gateway', 'DELETE', '/api/auth/session', '', '', ''),
        ('8', 'API Gateway', 'API Gateway', '설정', 'Set-Cookie: labnote_rt=;', 'Max-Age=0 (쿠키 삭제)', '', ''),
        ('9', 'Frontend', 'Frontend', '삭제', '메모리의 Access Token 삭제', '', '', ''),
        ('10', 'Frontend', '사용자', '이동', '로그인 페이지로 이동', '', '', ''),
    ],
    '1-4. JWT 검증': [
        ('1', 'Frontend', 'API Gateway', '요청', 'API 요청', 'Authorization: Bearer {token}', '', ''),
        ('2', 'API Gateway', 'API Gateway', '제거', '① 내부 헤더 제거', 'x-user-id, x-user-role 등 스푸핑 방지', '', ''),
        ('3', 'API Gateway', 'API Gateway', '확인', '② 공개 경로 확인', '/health, /login 등', '', ''),
        ('4', 'API Gateway', 'API Gateway', '차단', '③ /internal 경로 차단 (404)', '', '', ''),
        ('5', 'API Gateway', 'Redis', 'GET', '④ blacklist:{token}', '', '', ''),
        ('5-E', 'API Gateway', 'Frontend', '401', '응답', '"만료된 세션"', '블랙리스트 존재', 'error'),
        ('6', 'API Gateway', 'API Gateway', '검증', '⑤ JWT 서명 검증 (JWT_SECRET)', '', '', ''),
        ('7', 'API Gateway', 'Redis', 'GET', '⑥ blacklist:user:{userId}', '', '', ''),
        ('7-E', 'API Gateway', 'Frontend', '401', '응답', '"권한이 변경되었습니다"', '사용자 무효화 & iat < 무효화 시각', 'error'),
        ('8', 'API Gateway', 'API Gateway', '주입', '⑦ 내부 헤더 주입', 'x-user-id, x-user-role, x-user-email, x-user-permissions, x-user-org-id, x-user-team-ids, x-user-team-roles', '', ''),
        ('9', 'API Gateway', '내부 서비스', '프록시', '⑧ 프록시 전달', '+ 주입된 헤더', '', ''),
        ('10', '내부 서비스', 'API Gateway', '응답', '응답', '', '', ''),
        ('11', 'API Gateway', 'Frontend', '응답', '응답 전달', '', '', ''),
    ],
    '2-1. 노트 생성': [
        ('1', '연구자', 'Frontend', '클릭', '새 연구노트 작성', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/notes', '{title, content, type:note, tags, templateId?}', '', ''),
        ('3', 'API Gateway', 'API Gateway', '검증', 'JWT 검증 + 헤더 주입', '', '', ''),
        ('4', 'API Gateway', 'ELN Service', '프록시', '전달', '', '', ''),
        ('5', 'ELN Service', 'PostgreSQL', 'INSERT', 'note', '{id, title, content, status:draft, authorId, orgId, tags}', '', ''),
        ('6', 'ELN Service', 'PostgreSQL', 'INSERT', 'noteRevision', '{revision:1, content, changedBy, changeSummary:노트 생성}', '', ''),
        ('7', 'ELN Service', 'PostgreSQL', 'UPDATE', 'template SET useCount+1', '', 'templateId가 있는 경우', ''),
        ('8', 'ELN Service', 'Search Service', 'POST (비동기)', '/api/search/index', '{id, domainType:NOTE, title, content, tags, orgId}', 'x-internal-secret 인증', 'async'),
        ('9', 'ELN Service', 'Signature-Audit', 'POST (비동기)', '감사로그', "{action:'note.created', entityId, actorId}", '', 'async'),
        ('10', 'ELN Service', 'API Gateway', '201', '응답', '{ok:true, data:note}', '', 'success'),
        ('11', 'API Gateway', 'Frontend', '201', '응답 전달', '', '', ''),
        ('12', 'Frontend', '연구자', '이동', '에디터 화면으로 이동', '', '', ''),
    ],
    '2-2. 노트 수정': [
        ('1', '연구자', 'Frontend', '저장', '노트 내용 수정 후 저장', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'PUT', '/api/notes/:id', '{title, content, sections, tags, changeSummary}', '', ''),
        ('3', 'API Gateway', 'ELN Service', '프록시', '전달', '', '', ''),
        ('4', 'ELN Service', 'PostgreSQL', 'SELECT', 'note WHERE id AND orgId', '', '', ''),
        ('4-E1', 'ELN Service', 'Frontend', '404', '응답', 'NOTE_NOT_FOUND', '노트 없음', 'error'),
        ('4-E2', 'ELN Service', 'Frontend', '403', '응답', 'NOTE_LOCKED / NOTE_SIGNED', '상태가 locked 또는 signed', 'error'),
        ('5', 'ELN Service', 'ELN Service', '확인', '소유자 또는 Admin 확인', '', '', ''),
        ('6', 'ELN Service', 'PostgreSQL', 'UPDATE', 'note SET title, content, sections, tags', '', '', ''),
        ('7', 'ELN Service', 'PostgreSQL', 'SELECT', 'COUNT(*) FROM noteRevision WHERE noteId', '', '', ''),
        ('8', 'ELN Service', 'PostgreSQL', 'INSERT', 'noteRevision', '{revision: count+1, content, changedBy, changeSummary:노트 수정}', '', ''),
        ('9', 'ELN Service', 'Search Service', 'POST (비동기)', '/api/search/index (재인덱싱)', '', '', 'async'),
        ('10', 'ELN Service', 'Signature-Audit', 'POST (비동기)', '감사로그', "{action:'note.updated', changedFields:[...]}", '', 'async'),
        ('11', 'ELN Service', 'API Gateway', '200', '응답', '{ok:true, data:updatedNote}', '', 'success'),
        ('12', 'API Gateway', 'Frontend', '200', '응답 전달', '', '', ''),
        ('13', 'Frontend', '연구자', '표시', '저장 완료 토스트', '', '', ''),
    ],
    '3. 실시간 협업 편집': [
        ('1', 'Alice', 'Collab Service', 'WebSocket', 'ws://.../collab/notes/{noteId}?token={jwt}', '', 'Alice가 먼저 진입', ''),
        ('2', 'Collab Service', 'Collab Service', '처리', 'JWT 검증 + 사용자 정보 추출', '', '', ''),
        ('3', 'Collab Service', 'Collab Service', '처리', '방(Room)에 Alice 추가, colorIdx:0 할당', '', '', ''),
        ('4', 'Collab Service', 'Alice', '응답', "{type:'joined', users:[]}", '', '', ''),
        ('5', 'Bob', 'Collab Service', 'WebSocket', '연결', '', 'Bob이 같은 노트에 진입', ''),
        ('6', 'Collab Service', 'Collab Service', '처리', '방에 Bob 추가, colorIdx:1', '', '', ''),
        ('7', 'Collab Service', 'Bob', '응답', "{type:'joined', users:[{id:'alice', colorIdx:0}]}", '', '', ''),
        ('8', 'Collab Service', 'Alice', '알림', "{type:'user-joined', userId:'bob', colorIdx:1}", '', '', ''),
        ('9', 'Collab Service', 'Redis', 'PUBLISH', 'labnote:collab', "{noteId, payload:'user-joined', sourceUserId:'bob'}", '', 'event'),
        ('10', 'Alice', 'Collab Service', '메시지', "{type:'content-update', content:'실험 결과...'}", '', '400ms 디바운스 후 전송', ''),
        ('11', 'Collab Service', 'Bob', '전달', "{type:'content-update', userId:'alice', content, colorIdx:0}", '', '1초 이내 자신 편집이면 무시, 아니면 반영 (last-write-wins)', ''),
        ('12', 'Collab Service', 'Redis', 'PUBLISH', 'labnote:collab', "{noteId, payload:'content-update', sourceUserId:'alice'}", '', 'event'),
        ('13', 'Alice', 'Collab Service', '메시지', "{type:'awareness', cursorLine:15}", '', '커서 이동', ''),
        ('14', 'Collab Service', 'Bob', '전달', "{type:'awareness', userId:'alice', cursorLine:15, colorIdx:0}", '', '', ''),
        ('15', 'Bob', 'Collab Service', '종료', 'WebSocket 연결 종료', '', 'Bob이 편집 화면을 떠남', ''),
        ('16', 'Collab Service', 'Collab Service', '처리', '방에서 Bob 제거', '', '', ''),
        ('17', 'Collab Service', 'Alice', '알림', "{type:'user-left', userId:'bob'}", '', '', ''),
        ('18', 'Collab Service', 'Redis', 'PUBLISH', 'labnote:collab', "{noteId, payload:'user-left', sourceUserId:'bob'}", '', 'event'),
    ],
    '4. 전자서명 → 상태 전환': [
        ('1', '검토자(Reviewer)', 'Frontend', '입력', '서명 버튼 클릭 + 비밀번호 입력', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/signatures/sign/:noteId', '{password, comment}', '', ''),
        ('3', 'API Gateway', 'API Gateway', '검증', 'JWT 검증 + 헤더 주입', '', '', ''),
        ('4', 'API Gateway', 'Signature-Audit', '프록시', '전달', '', '', ''),
        ('5', 'Signature-Audit', 'Auth Service', 'POST', '/api/auth/internal/verify-password', '{userId, password}', 'x-internal-secret 인증', ''),
        ('6', 'Auth Service', 'Auth Service', '검증', 'bcrypt.compare', '', '', ''),
        ('7', 'Auth Service', 'Signature-Audit', '응답', '{verified: true}', '', '', 'success'),
        ('7-E', 'Signature-Audit', 'Frontend', '400', '응답', 'SIGNATURE_PASSWORD_INVALID', '비밀번호 불일치', 'error'),
        ('8', 'Signature-Audit', 'ELN Service', 'GET', '/api/notes/:noteId (내부 호출)', '', '노트 정보 조회 (authorId, teamId, status)', ''),
        ('9', 'ELN Service', 'Signature-Audit', '응답', '노트 정보', '', '', ''),
        ('10', 'Signature-Audit', 'Signature-Audit', '검증', '권한 검증', '', '자기 서명 차단 (admin 제외), reviewer/admin/팀장 확인', ''),
        ('11', 'Signature-Audit', 'PostgreSQL', 'SELECT', 'signature WHERE noteId ORDER BY chainIndex DESC LIMIT 1', '', '이전 서명 (prevHash) 조회', ''),
        ('12', 'Signature-Audit', 'Signature-Audit', '생성', '해시체인 생성', 'hashInput = noteId:signerId:timestamp:prevHash:comment → sha256', '', ''),
        ('13', 'Signature-Audit', 'PostgreSQL', 'INSERT', 'signature', "{noteId, signerId, signatureHash, prevHash, chainIndex, status:'valid'}", '', ''),
        ('14', 'Signature-Audit', 'PostgreSQL', 'INSERT', 'auditLog', "{action:'signed', entityId:noteId}", '', ''),
        ('15', 'Signature-Audit', 'Redis Stream', 'XADD', 'labnote:events *', 'type=NOTE_SIGNED noteId={id} status=signed userId={signerId}', 'Redis Stream 이벤트 발행', 'event'),
        ('15-F', 'Signature-Audit', 'ELN Service', 'PATCH (폴백)', "/api/notes/:id/status {status:'signed'}", 'x-user-role: system', 'Redis 실패 시 HTTP 폴백', ''),
        ('16', 'Signature-Audit', 'PostgreSQL', 'INSERT', 'notification', "{recipientId:authorId, type:'NOTE_SIGNED'}", '서명자 ≠ 작성자인 경우', ''),
        ('17', 'Signature-Audit', 'API Gateway', '201', '응답', '{ok:true, data:signature}', '', 'success'),
        ('18', 'API Gateway', 'Frontend', '201', '응답 전달', '', '', ''),
        ('19', 'Frontend', '검토자', '표시', '서명 완료 안내', '', '', ''),
        ('20', 'Redis Stream', 'ELN Service', '이벤트', 'NOTE_SIGNED 이벤트 수신', '', '비동기 이벤트 소비 (Consumer Group: eln-service)', 'event'),
        ('21', 'ELN Service', 'PostgreSQL', 'UPDATE', "note SET status='signed' WHERE id={noteId}", '', '', ''),
        ('22', 'ELN Service', 'PostgreSQL', 'INSERT', 'noteStatusHistory', "{fromStatus:'in_progress', toStatus:'signed'}", '', ''),
        ('23', 'ELN Service', 'PostgreSQL', 'INSERT', 'auditLog (이중 기록)', '', '', ''),
        ('24', 'ELN Service', 'Redis Stream', 'XACK', 'labnote:events (처리 완료)', '', '', ''),
    ],
    '5. 관리자 잠금 해제': [
        ('1', '관리자(Admin)', 'Frontend', '입력', '잠금 해제 클릭 + 비밀번호/사유 입력', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/notes/:id/admin-unlock', '{adminPassword, reason}', '', ''),
        ('3', 'API Gateway', 'API Gateway', '검증', 'JWT 검증 + 헤더 주입', '', '', ''),
        ('4', 'API Gateway', 'ELN Service', '프록시', '전달', '', '', ''),
        ('5', 'ELN Service', 'ELN Service', '확인', 'requireRole(ADMIN) + requirePermission(NOTE_UNLOCK)', '', '', ''),
        ('6', 'ELN Service', 'PostgreSQL', 'SELECT', 'note WHERE id AND orgId', '', '', ''),
        ('6-E1', 'ELN Service', 'Frontend', '404', '응답', 'NOTE_NOT_FOUND', '노트 없음', 'error'),
        ('6-E2', 'ELN Service', 'Frontend', '400', '응답', '"잠긴 상태가 아닙니다"', '상태가 locked가 아닌 경우', 'error'),
        ('7', 'ELN Service', 'Auth Service', 'POST', '/api/auth/internal/verify-password', '{userId:adminId, password:adminPassword}', 'x-internal-secret 인증', ''),
        ('8', 'Auth Service', 'Auth Service', '검증', 'bcrypt.compare', '', '', ''),
        ('9', 'Auth Service', 'ELN Service', '응답', '{verified: true}', '', '', 'success'),
        ('9-E', 'ELN Service', 'Frontend', '400', '응답', 'NOTE_ADMIN_PASSWORD_INVALID', '비밀번호 불일치', 'error'),
        ('10', 'ELN Service', 'PostgreSQL', 'UPDATE', "note SET status='draft' WHERE id={noteId}", '', '', ''),
        ('11', 'ELN Service', 'PostgreSQL', 'INSERT', 'noteStatusHistory', "{fromStatus:'locked', toStatus:'draft', changedBy:adminId, reason, isAdminAction:true}", '', ''),
        ('12', 'ELN Service', 'Signature-Audit', 'POST (비동기)', '감사로그', "{action:'note.admin_unlocked', reason}", '', 'async'),
        ('13', 'ELN Service', 'Signature-Audit', 'POST (비동기)', '알림 발송', "{recipientId:authorId, type:'NOTE_UNLOCKED'}", '작성자 ≠ 관리자인 경우', 'async'),
        ('14', 'ELN Service', 'API Gateway', '200', '응답', "{ok:true, data:note, message:'잠금이 해제되었습니다'}", '', 'success'),
        ('15', 'API Gateway', 'Frontend', '200', '응답 전달', '', '', ''),
        ('16', 'Frontend', '관리자', '표시', '상태 변경 반영 (locked → draft)', '', '', ''),
    ],
    '6. PDF/ZIP 내보내기': [
        ('1', '사용자', 'Frontend', '클릭', 'PDF 내보내기', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/export/pdf/:noteId', '', '', ''),
        ('3', 'API Gateway', 'Signature-Audit', '프록시', '전달', '', '', ''),
        ('4', 'Signature-Audit', 'PostgreSQL', 'INSERT', 'exportJob', "{noteId, format:'pdf', status:'pending', requestedBy, orgId}", '', ''),
        ('5', 'Signature-Audit', 'BullMQ', 'add', "exportQueue.add('pdf', {jobId, noteId, format, requestedBy, orgId})", '', '', ''),
        ('6', 'Signature-Audit', 'PostgreSQL', 'INSERT', 'auditLog', "{action:'export_requested'}", '', ''),
        ('7', 'Signature-Audit', 'API Gateway', '202', 'Accepted', '{jobId, status:pending}', '', 'success'),
        ('8', 'API Gateway', 'Frontend', '202', '응답 전달', '', '', ''),
        ('9', 'Frontend', 'API Gateway', 'GET (SSE)', '/api/events/exports', '', 'SSE 연결', ''),
        ('10', 'API Gateway', 'Redis', 'SUBSCRIBE', 'export-status', '', 'SSE 연결 유지 (30초 heartbeat)', ''),
        ('11', 'BullMQ', 'Export Worker', '수신', '작업 수신', '', 'concurrency: 2', ''),
        ('12', 'Export Worker', 'PostgreSQL', 'UPDATE', "exportJob SET status='processing'", '', '', ''),
        ('13', 'Export Worker', 'Redis', 'PUBLISH', 'export-status', '{jobId, progress:10%}', '', 'event'),
        ('14', 'Redis → GW → FE', '사용자', 'SSE', 'event: {progress:10%}', '', '', ''),
        ('15', 'Export Worker', 'ELN Service', 'GET', '/api/notes/:noteId (내부 호출)', '', '노트 데이터 조회', ''),
        ('16', 'Export Worker', 'PostgreSQL', 'SELECT', 'signature WHERE noteId', '', '서명 정보 조회', ''),
        ('17', 'Export Worker', 'Export Worker', '처리', 'Handlebars 템플릿 컴파일', '', '', ''),
        ('18', 'Export Worker', 'Puppeteer', '변환', 'HTML → PDF', 'A4, printBackground', '', ''),
        ('19', 'Export Worker', 'Redis', 'PUBLISH', 'export-status', '{jobId, progress:80%}', '', 'event'),
        ('20', 'Redis → GW → FE', '사용자', 'SSE', 'event: {progress:80%}', '', '', ''),
        ('21', 'Export Worker', 'File Service', 'POST', '/api/exports/internal/upload', 'FormData: {file, jobId, format}', 'x-internal-secret 인증', ''),
        ('22', 'File Service', 'MinIO', 'PutObject', "bucket:'labnote-exports'", "key:'pdf/{jobId}/export-{date}.pdf'", '', ''),
        ('23', 'File Service', 'MinIO', 'PresignedGetObject', '24시간 유효', '', '', ''),
        ('24', 'File Service', 'Export Worker', '응답', '{fileId, downloadUrl}', '', '', 'success'),
        ('25', 'Export Worker', 'PostgreSQL', 'UPDATE', "exportJob SET status='completed'", 'fileUrl, fileId, completedAt', '', ''),
        ('26', 'Export Worker', 'PostgreSQL', 'INSERT', 'auditLog', "{action:'export_completed'}", '', ''),
        ('27', 'Export Worker', 'Redis', 'PUBLISH', 'export-status', '{jobId, status:completed, fileUrl, progress:100%}', '', 'event'),
        ('28', 'Redis → GW → FE', '사용자', 'SSE', "event: {status:'completed', fileUrl}", '', '다운로드 버튼 활성화', ''),
        ('29', '사용자', 'Frontend', '클릭', '다운로드', '', '', ''),
        ('30', 'Frontend', 'MinIO', 'GET', 'presigned URL (직접 다운로드)', '', 'PDF 파일 스트림', ''),
    ],
    '7. 통합 검색': [
        ('1', '사용자', 'Frontend', '입력', '검색어 타이핑 (예: "세포 배양")', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'GET', '/api/search/suggest?q=세포 배양', '', '자동완성', ''),
        ('3', 'API Gateway', 'Search Service', '프록시', '전달', '', '', ''),
        ('4', 'Search Service', 'OpenSearch', 'multi_match', '쿼리', 'fields: title^3, tags^2, type: phrase_prefix, filter: orgId, docStatus=active', '', ''),
        ('5', 'OpenSearch', 'Search Service', '응답', '상위 7건 매칭 결과', '', '', ''),
        ('6', 'Search Service', 'Frontend', '응답', '[{text, domainType, docId}, ...]', '', '', ''),
        ('7', 'Frontend', '사용자', '표시', '자동완성 드롭다운', '', '', ''),
        ('8', '사용자', 'Frontend', '클릭', '검색 실행 (Enter 또는 검색 버튼)', '', '', ''),
        ('9', 'Frontend', 'API Gateway', 'GET', '/api/search?q=세포 배양&domainTypes=NOTE,PROTOCOL&page=1&size=20', '', '', ''),
        ('10', 'API Gateway', 'Search Service', '프록시', '전달', '', '', ''),
        ('11', 'Search Service', 'Search Service', '생성', '캐시 키 생성', 'SHA256(q + domainTypes + page + userId + orgId)', '', ''),
        ('12', 'Search Service', 'Redis', 'GET', 'cache:{hash}', '', '3분 TTL', ''),
        ('12-H', 'Redis', 'Search Service', '응답', '캐시된 결과', '', '캐시 히트 시 즉시 응답', 'success'),
        ('13', 'Search Service', 'OpenSearch', 'bool 쿼리', '실행', 'must: multi_match (title^4, tags^3, summary^2, content^1, fuzziness:AUTO), filter: orgId, docStatus, domainTypes, 권한 필터', '', ''),
        ('14', 'OpenSearch', 'Search Service', '응답', '검색 결과 + 하이라이트 + domainType별 집계', '', '', ''),
        ('15', 'Search Service', 'Search Service', '처리', '결과 매핑', 'docId, title, snippet, score, highlight', '', ''),
        ('16', 'Search Service', 'PostgreSQL', 'INSERT (비동기)', 'searchHistory', '{userId, query, orgId}', '', 'async'),
        ('17', 'Search Service', 'Redis', 'SET (비동기)', 'cache:{hash}', '{results} EX 180 (3분 캐시)', '', 'async'),
        ('18', 'Search Service', 'API Gateway', '200', '응답', '{results[], counts:{NOTE:12, PROTOCOL:3}, pagination, took}', '', 'success'),
        ('19', 'API Gateway', 'Frontend', '200', '응답 전달', '', '', ''),
        ('20', 'Frontend', '사용자', '표시', '검색 결과 목록 + 도메인별 탭 카운트', '', '', ''),
    ],
    '8-1. 수량 입출고': [
        ('1', '연구자', 'Frontend', '입력', '시약 출고 수량 입력', '예: Ethanol 500ml 출고', '', ''),
        ('2', 'Frontend', 'API Gateway', 'POST', '/api/inventory/items/:id/quantity', "{changeType:'out', quantity:500, reason:'실험 사용'}", '', ''),
        ('3', 'API Gateway', 'Inventory Service', '프록시', '전달', '', '', ''),
        ('4', 'Inventory Service', 'PostgreSQL', 'SELECT', 'inventoryItem WHERE id AND orgId', '', '', ''),
        ('5', 'Inventory Service', 'Inventory Service', '확인', '현재 수량 확인 (예: 2000ml)', '', '', ''),
        ('6', 'Inventory Service', 'Inventory Service', '계산', 'before=2000, delta=-500, after=1500', '', '', ''),
        ('6-E', 'Inventory Service', 'Frontend', '400', '응답', 'ITEM_STOCK_INSUFFICIENT "재고가 부족합니다"', "changeType='out' & 재고 부족", 'error'),
        ('7', 'Inventory Service', 'Inventory Service', '판단', '자동 상태 전환', "after=0 → 'depleted', depleted & after>0 → 'available'", '', ''),
        ('8', 'Inventory Service', 'PostgreSQL', 'UPDATE (TX)', "inventoryItem SET quantity=1500, status='available'", '', '트랜잭션 시작', 'tx'),
        ('9', 'Inventory Service', 'PostgreSQL', 'INSERT (TX)', 'inventoryHistory', "{changeType:'out', quantityBefore:2000, quantityAfter:1500, quantityDelta:-500, reason, performedBy}", '트랜잭션 커밋', 'tx'),
        ('10', 'Inventory Service', 'Search Service', 'POST (비동기)', '/api/search/index (재인덱싱)', '', '', 'async'),
        ('11', 'Inventory Service', 'API Gateway', '200', '응답', '{ok:true, data:{item, before:2000, after:1500, delta:-500}}', '', 'success'),
        ('12', 'API Gateway', 'Frontend', '200', '응답 전달', '', '', ''),
        ('13', 'Frontend', '연구자', '표시', '수량 변경 완료', '', '', ''),
    ],
    '8-2. 재고 경고 (대시보드)': [
        ('1', '관리자', 'Frontend', '접근', '대시보드 접근', '', '', ''),
        ('2', 'Frontend', 'API Gateway', 'GET', '/api/dashboard/org', '', '', ''),
        ('3', 'API Gateway', 'Redis', 'GET', 'cache:dashboard:org:{orgId}', '', '5분 TTL', ''),
        ('3-H', 'Redis', 'API Gateway', '응답', '캐시된 결과', '', '캐시 히트 시 즉시 응답', 'success'),
        ('4a', 'API Gateway', 'Inventory Service', 'GET (병렬)', '/api/inventory/alerts/low-stock', '', 'Promise.allSettled 병렬 요청', ''),
        ('4b', 'API Gateway', 'Inventory Service', 'GET (병렬)', '/api/inventory/alerts/expiring?days=30', '', '', ''),
        ('4c', 'API Gateway', '기타 서비스', 'GET (병렬)', 'ELN, Scheduler, Audit 통계', '', '', ''),
        ('5a', 'Inventory Service', 'PostgreSQL', 'SELECT', "items WHERE quantity <= minQuantity AND status NOT IN ('disposed','depleted')", '', '재고 부족 조회', ''),
        ('5b', 'Inventory Service', 'PostgreSQL', 'SELECT', "items WHERE expiryDate <= NOW() + 30일 AND status NOT IN ('disposed','depleted')", '', '만료 임박 조회', ''),
        ('6a', 'Inventory Service', 'API Gateway', '응답', '재고 부족 항목 목록', '', '', ''),
        ('6b', 'Inventory Service', 'API Gateway', '응답', '만료 임박 항목 목록', 'daysLeft, isExpired, isWarning 계산 포함', '', ''),
        ('7', 'API Gateway', 'API Gateway', '집계', '응답 집계', 'lowStockItems 상위 5건, expiringItems 상위 5건', '', ''),
        ('8', 'API Gateway', 'Redis', 'SET', 'cache:dashboard:org:{orgId}', 'EX 300 (5분 캐시)', '', ''),
        ('9', 'API Gateway', 'Frontend', '200', '대시보드 데이터', '', '', 'success'),
        ('10', 'Frontend', '관리자', '표시', '재고 부족 경고 카드 + 만료 임박 경고 카드', '', '', ''),
    ],
}

# 이벤트 흐름 매핑 데이터
event_mapping = [
    ('NOTE_SIGNED', 'Redis Stream (labnote:events)', 'Signature-Audit', 'ELN Service', '전자서명 완료'),
    ('note.created/updated', 'HTTP POST (내부)', 'ELN Service', 'Search Service', '노트 CRUD'),
    ('inventory.indexed', 'HTTP POST (내부)', 'Inventory Service', 'Search Service', '인벤토리 CRUD'),
    ('export-status', 'Redis Pub/Sub', 'Export Worker', 'API Gateway (SSE)', '내보내기 진행률'),
    ('labnote:collab', 'Redis Pub/Sub', 'Collab Service', 'Collab Service (다른 인스턴스)', '실시간 편집'),
    ('NOTE_LOCKED/UNLOCKED', 'HTTP POST (내부)', 'ELN Service', 'Signature-Audit (알림)', '상태 변경'),
]

# ── 엑셀 생성 ──

wb = openpyxl.Workbook()

# 1) 목차 시트
ws_toc = wb.active
ws_toc.title = '목차'
ws_toc.cell(row=1, column=1, value='LabNote ELN - 시퀀스 다이어그램 정리').font = TITLE_FONT
ws_toc.cell(row=2, column=1, value='전자연구노트(ELN) 협업 플랫폼의 핵심 흐름을 정리한 문서').font = NORMAL_FONT
ws_toc.cell(row=4, column=1, value='시트명').font = SUB_HEADER_FONT
ws_toc.cell(row=4, column=1).fill = SUB_HEADER_FILL
ws_toc.cell(row=4, column=2, value='설명').font = SUB_HEADER_FONT
ws_toc.cell(row=4, column=2).fill = SUB_HEADER_FILL
ws_toc.cell(row=4, column=3, value='관련 서비스').font = SUB_HEADER_FONT
ws_toc.cell(row=4, column=3).fill = SUB_HEADER_FILL

toc_items = [
    ('1-1. 로그인', '사용자 이메일/비밀번호 로그인 → JWT 발급 흐름', 'Frontend, API Gateway, Auth, PostgreSQL, Redis'),
    ('1-2. 토큰 갱신', 'Access Token 만료 시 자동 갱신 흐름', 'Frontend, API Gateway, Auth, Redis'),
    ('1-3. 로그아웃', '토큰 블랙리스트 등록 및 세션 정리', 'Frontend, API Gateway, Auth, Redis'),
    ('1-4. JWT 검증', 'API 요청 시 Gateway의 JWT 검증 파이프라인', 'Frontend, API Gateway, Redis, 내부 서비스'),
    ('2-1. 노트 생성', '연구노트 생성 + 검색 인덱싱 + 감사로그', 'Frontend, API Gateway, ELN, PostgreSQL, Search, Signature-Audit'),
    ('2-2. 노트 수정', '노트 수정 + 리비전 생성 + 재인덱싱', 'Frontend, API Gateway, ELN, PostgreSQL, Search, Signature-Audit'),
    ('3. 실시간 협업', 'WebSocket 기반 실시간 협업 편집 (last-write-wins)', 'Collab Service, Redis (Pub/Sub)'),
    ('4. 전자서명', '전자서명 + 해시체인 + Redis Stream 상태 전환', 'Signature-Audit, Auth, ELN, PostgreSQL, Redis Stream'),
    ('5. 잠금 해제', '관리자 비밀번호 확인 후 잠금 해제', 'ELN, Auth, PostgreSQL, Signature-Audit'),
    ('6. PDF 내보내기', 'BullMQ → Puppeteer PDF → MinIO 업로드 → SSE 진행률', 'Signature-Audit, BullMQ, Puppeteer, File, MinIO, Redis'),
    ('7. 통합 검색', 'OpenSearch 검색 + 자동완성 + 캐싱', 'Search, OpenSearch, Redis, PostgreSQL'),
    ('8-1. 수량 입출고', '인벤토리 수량 변경 (트랜잭션)', 'Inventory, PostgreSQL, Search'),
    ('8-2. 재고 경고', '대시보드 재고 경고 (병렬 집계)', 'API Gateway, Inventory, PostgreSQL, Redis'),
    ('이벤트 흐름', '서비스 간 이벤트 발행/구독 매핑 요약', '전체 서비스'),
]

for i, (name, desc, svcs) in enumerate(toc_items, 5):
    ws_toc.cell(row=i, column=1, value=name).font = NORMAL_FONT
    ws_toc.cell(row=i, column=2, value=desc).font = NORMAL_FONT
    ws_toc.cell(row=i, column=3, value=svcs).font = NORMAL_FONT
    for c in range(1, 4):
        ws_toc.cell(row=i, column=c).border = THIN_BORDER

ws_toc.column_dimensions['A'].width = 22
ws_toc.column_dimensions['B'].width = 55
ws_toc.column_dimensions['C'].width = 55

# 범례
legend_row = len(toc_items) + 7
ws_toc.cell(row=legend_row, column=1, value='행 색상 범례').font = SUB_HEADER_FONT
legends = [
    ('노란색', COLORS['async'], '비동기 호출 (fire-and-forget)'),
    ('분홍색', COLORS['error'], '에러 / 예외 흐름'),
    ('연두색', COLORS['success'], '최종 성공 응답'),
    ('하늘색', COLORS['tx'], '트랜잭션 내 작업'),
    ('보라색', COLORS['event'], '이벤트 발행 (Redis Stream/Pub/Sub)'),
]
for j, (label, fill, desc) in enumerate(legends, legend_row + 1):
    ws_toc.cell(row=j, column=1, value=label).font = NORMAL_FONT
    ws_toc.cell(row=j, column=1).fill = fill
    ws_toc.cell(row=j, column=2, value=desc).font = NORMAL_FONT

# 2) 각 시퀀스 시트
for sheet_name, rows in sequences.items():
    # 시트 이름: 특수문자 제거 + 길이 제한 (31자)
    safe_name = sheet_name.replace('/', '_').replace('→', '-')[:31]
    ws = wb.create_sheet(title=safe_name)
    set_col_widths(ws, [8, 22, 22, 16, 40, 45, 35, 10])

    # 헤더
    for c, h in enumerate(HEADERS, 1):
        ws.cell(row=1, column=c, value=h)
    style_header_row(ws, 1, len(HEADERS))

    # 데이터
    r = 2
    for row_data in rows:
        fill = COLORS.get(row_data[7]) if row_data[7] else None
        r = add_data_row(ws, r, row_data, fill)

    # 자동 필터
    ws.auto_filter.ref = f'A1:H{r-1}'
    ws.freeze_panes = 'A2'

# 3) 이벤트 흐름 시트
ws_ev = wb.create_sheet(title='이벤트 흐름')
ev_headers = ['이벤트명', '통신 방식', '발행자 (Publisher)', '구독자 (Subscriber)', '트리거 조건']
set_col_widths(ws_ev, [25, 28, 25, 30, 20])
for c, h in enumerate(ev_headers, 1):
    ws_ev.cell(row=1, column=c, value=h)
style_header_row(ws_ev, 1, len(ev_headers))

for i, ev in enumerate(event_mapping, 2):
    for c, val in enumerate(ev, 1):
        ws_ev.cell(row=i, column=c, value=val)
    style_data_row(ws_ev, i, len(ev_headers))

ws_ev.auto_filter.ref = f'A1:E{len(event_mapping)+1}'
ws_ev.freeze_panes = 'A2'

# 저장
output_path = r'C:\vscode\lab\lab-companion-feature-phase1-backend-infra\docs\LabNote_ELN_시퀀스다이어그램.xlsx'
wb.save(output_path)
print(f'생성 완료: {output_path}')
