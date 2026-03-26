/**
 * 테스트 결과를 테스트계획서 엑셀에 반영하는 스크립트
 * 결과(PASS/FAIL/SKIP) + 비고 컬럼 업데이트
 */
import XLSX from 'xlsx';

const INPUT = 'docs/LabNote_ELN_테스트계획서.xlsx';
const OUTPUT = 'docs/LabNote_ELN_테스트결과보고서.xlsx';

// 테스트 결과 매핑
const RESULTS = {
  '1.인증_사용자': {
    1:  { result: 'PASS', note: '200 OK, token + refreshToken 정상 발급' },
    2:  { result: 'PASS', note: '401 AUTH_INVALID_CREDENTIALS 반환' },
    3:  { result: 'PASS', note: '401 AUTH_INVALID_CREDENTIALS 반환' },
    4:  { result: 'SKIP', note: 'inactive 상태 사용자 시드 데이터 없음' },
    5:  { result: 'PASS', note: 'JWT payload에 sub, email, role, permissions[], orgId, teams[] 모두 포함' },
    6:  { result: 'PASS', note: '201 정상 가입, viewer 역할 자동 배정' },
    7:  { result: 'PASS', note: '409 이메일 중복 오류 정상 반환' },
    8:  { result: 'SKIP', note: '기본 조직(default-lab)이 항상 존재하여 테스트 불가' },
    9:  { result: 'PASS', note: '200 OK, 새 token + refreshToken 발급' },
    10: { result: 'PASS', note: '401 만료/무효 토큰 정상 차단' },
    11: { result: 'SKIP', note: '역할 변경 후 토큰 무효화 시나리오 — 부작용 위험' },
    12: { result: 'PASS', note: '로그아웃 200 OK → 동일 토큰 재사용 시 401' },
    13: { result: 'PASS', note: '200 OK, id/email/name/role/permissions/orgId 포함' },
    14: { result: 'PASS', note: 'Authorization 없이 401 정상 반환' },
    15: { result: 'PASS', note: 'Admin 조직 생성 201 성공' },
    16: { result: 'PASS', note: 'Researcher 조직 생성 → 403 차단' },
    17: { result: 'PASS', note: '기존 slug 중복 생성 시 409 반환' },
    18: { result: 'PASS', note: '소속 사용자 있는 조직 삭제 시 400 반환' },
    19: { result: 'PASS', note: '팀 CRUD 정상 (orgId 필수 파라미터)' },
    20: { result: 'PASS', note: '팀 멤버 추가(201) → 제거(200) 정상' },
    21: { result: 'SKIP', note: '시드 팀 멤버 설정에 따라 다름' },
    22: { result: 'PASS', note: 'Admin 조회 시 자기 orgId만 반환 (멀티테넌시 격리 정상)' },
    23: { result: 'SKIP', note: '전용 테스트 사용자 필요 — 환경 오염 위험' },
    24: { result: 'PASS', note: 'Admin 자기 삭제 시도 → 400 AUTH_SELF_DELETE' },
    25: { result: 'PASS', note: '존재하지 않는 사용자 수정 시 400 반환 (유출 없음)' },
    26: { result: 'PASS', note: '허용 역할명(researcher) 생성 정상' },
    27: { result: 'PASS', note: '비허용 역할명(superadmin) → 400 반환' },
    28: { result: 'SKIP', note: '기존 역할 권한 변경 시 부작용 위험' },
    29: { result: 'PASS', note: '소속 사용자 있는 역할 삭제 시 400 반환' },
    30: { result: 'SKIP', note: 'internal API는 Docker 내부에서만 접근 가능' },
    31: { result: 'PASS', note: '/internal/* 경로 게이트웨이에서 404 차단 확인' },
  },
  '2.연구노트': {
    1:  { result: 'PASS', note: '201 생성, status=draft, 리비전 자동 생성' },
    2:  { result: 'SKIP', note: '템플릿 ID 사전 생성 필요' },
    3:  { result: 'PASS', note: '200 OK, 노트 배열 정상 반환' },
    4:  { result: 'PASS', note: 'status=draft 필터 정상 동작' },
    5:  { result: 'PASS', note: 'ID 배열로 일괄 조회 200 OK' },
    6:  { result: 'PASS', note: '501개 ID 전송 시 400 유효성 오류' },
    7:  { result: 'PASS', note: '200 OK, 상태별 카운트 반환' },
    8:  { result: 'PASS', note: '200 OK, 수정 후 새 리비전 생성' },
    9:  { result: 'PASS', note: 'locked 노트 수정 시 403 반환' },
    10: { result: 'SKIP', note: '서명 프로세스 선행 필요' },
    11: { result: 'PASS', note: '타인 노트 수정 시 403 반환' },
    12: { result: 'PASS', note: 'DELETE 200 OK, 소프트 삭제 확인' },
    13: { result: 'SKIP', note: '서명된 노트 필요' },
    14: { result: 'PASS', note: 'locked 노트 삭제 시 403 반환' },
    15: { result: 'PASS', note: 'draft → in_progress 200 OK' },
    16: { result: 'PASS', note: 'Reviewer in_progress → locked 200 OK' },
    17: { result: 'PASS', note: 'Researcher locked 전환 → 403 차단' },
    18: { result: 'PASS', note: 'PATCH /status로 signed 전환 → 400 차단' },
    19: { result: 'SKIP', note: '서명된 노트 필요' },
    20: { result: 'PASS', note: '상태 전환 이력 기록 확인' },
    21: { result: 'PASS', note: 'Admin 잠금해제 200 OK, isAdminAction=true' },
    22: { result: 'PASS', note: '잘못된 비밀번호 → 400 반환' },
    23: { result: 'PASS', note: 'Researcher admin-unlock → 403 차단' },
    24: { result: 'PASS', note: '리비전 목록 200 OK' },
    25: { result: 'PASS', note: '리비전 1번 조회 200 OK' },
    26: { result: 'SKIP', note: 'multipart 업로드는 파일 시트에서 테스트' },
    27: { result: 'SKIP', note: '첨부파일 사전 생성 필요' },
    28: { result: 'PASS', note: '링크 추가/조회/삭제 전체 정상' },
    29: { result: 'PASS', note: '200 OK, 조직 내 태그 목록 반환 (초기 재시작 직후 일시적 500 발생 → 안정화 후 정상)' },
    30: { result: 'PASS', note: 'POST /api/protocols 201 정상' },
    31: { result: 'PASS', note: '템플릿 생성 201 정상' },
    32: { result: 'SKIP', note: '템플릿 ID 필요' },
    33: { result: 'SKIP', note: '타 조직 시드 필요' },
    34: { result: 'PASS', note: 'GET /api/codes 200 OK' },
    35: { result: 'SKIP', note: 'Redis Stream 이벤트 통합 테스트' },
  },
  '3.전자서명_감사': {
    1:  { result: 'PASS', note: 'Reviewer 서명 201 OK, 해시체인 생성' },
    2:  { result: 'PASS', note: '자기 노트 서명 → 403 차단' },
    3:  { result: 'PASS', note: 'Researcher 서명 → 403 권한 없음' },
    4:  { result: 'PASS', note: '잘못된 비밀번호 → 401 검증 실패' },
    5:  { result: 'PASS', note: '해시체인 무결성 검증 200 OK 통과' },
    6:  { result: 'PASS', note: '서명 목록 200 OK, chainIndex 오름차순' },
    7:  { result: 'SKIP', note: '서명 ID 추출 필요' },
    8:  { result: 'SKIP', note: '취소된 서명 사전 생성 필요' },
    9:  { result: 'PASS', note: '컴플라이언스 통계 200 OK' },
    10: { result: 'PASS', note: '노트별 서명 상태 목록 200 OK' },
    11: { result: 'PASS', note: '편집 가능 여부 200 OK' },
    12: { result: 'PASS', note: '감사로그 목록 200 OK' },
    13: { result: 'SKIP', note: '감사로그 ID 확보 필요' },
    14: { result: 'PASS', note: 'action 목록 200 OK' },
    15: { result: 'SKIP', note: 'internal API Docker 내부 전용' },
    16: { result: 'PASS', note: '202 Accepted, /api/export/pdf/:noteId 경로로 PDF 비동기 생성 요청 성공' },
    17: { result: 'SKIP', note: 'BullMQ 비동기 작업' },
    18: { result: 'SKIP', note: 'BullMQ 비동기 작업' },
    19: { result: 'PASS', note: '200 OK, /api/export/list 경로로 내보내기 작업 목록 정상 반환' },
    20: { result: 'PASS', note: '알림 목록 200 OK' },
    21: { result: 'PASS', note: '미읽음 카운트 200 OK' },
    22: { result: 'PASS', note: '200 OK, 전체 알림 읽음 처리 정상 (빈 body {} 전송 필요)' },
    23: { result: 'SKIP', note: 'internal API + SSE 통합 테스트' },
  },
  '4.인벤토리': {
    1:  { result: 'PASS', note: '201 생성, status=available, 초기 이력 1건' },
    2:  { result: 'PASS', note: '동일 barcode → 409 반환' },
    3:  { result: 'PASS', note: 'barcode 조회 200 OK' },
    4:  { result: 'PASS', note: 'type=reagent 필터 200 OK' },
    5:  { result: 'SKIP', note: '두 번째 researcher 계정 필요' },
    6:  { result: 'PASS', note: 'Admin 삭제 200 OK' },
    7:  { result: 'PASS', note: '입고 +50 이력 기록 확인' },
    8:  { result: 'PASS', note: '출고 -30 이력 기록' },
    9:  { result: 'PASS', note: '재고 부족 출고 시 400 반환' },
    10: { result: 'PASS', note: '수량 0 → status=depleted 자동 전환' },
    11: { result: 'PASS', note: 'depleted → 입고 시 available 복구' },
    12: { result: 'PASS', note: 'adjust 수량 200 설정 정상' },
    13: { result: 'PASS', note: '이력 200 OK 최근순 정렬' },
    14: { result: 'PASS', note: '만료 임박 목록 200 OK' },
    15: { result: 'PASS', note: '재고 부족 목록 200 OK' },
    16: { result: 'PASS', note: 'Admin 카테고리 생성 + 조회 정상' },
    17: { result: 'PASS', note: '카테고리명 중복 시 409 반환' },
    18: { result: 'PASS', note: '타 조직 ID → 404 (유출 없음)' },
  },
  '5.예약': {
    1:  { result: 'PASS', note: 'Admin 자원 생성 201 OK' },
    2:  { result: 'SKIP', note: '활성 예약 사전 구성 필요' },
    3:  { result: 'PASS', note: 'Researcher 자원 생성 → 403' },
    4:  { result: 'PASS', note: '201 생성, status=PENDING' },
    5:  { result: 'PASS', note: '동일 시간대 → 409 충돌' },
    6:  { result: 'SKIP', note: '비활성 자원 사전 생성 필요' },
    7:  { result: 'PASS', note: 'endAt ≤ startAt → 400' },
    8:  { result: 'PASS', note: 'PENDING 수정 200 OK' },
    9:  { result: 'PASS', note: '200 OK, PENDING → APPROVED 전환 성공 (빈 body {} 전송 필요)' },
    10: { result: 'SKIP', note: 'race condition 시뮬레이션 필요' },
    11: { result: 'PASS', note: '반려 200 OK, rejectedReason 기록' },
    12: { result: 'PASS', note: '200 OK, APPROVED → CANCELLED 전환 성공' },
    13: { result: 'PASS', note: '200 OK, APPROVED → COMPLETED 전환 성공' },
    14: { result: 'PASS', note: '종단 상태 전환 → 400 차단' },
    15: { result: 'SKIP', note: '두 번째 researcher 필요' },
    16: { result: 'PASS', note: 'Researcher가 승인 시도 → 403 Forbidden 정상 차단' },
    17: { result: 'PASS', note: '캘린더 200 OK, APPROVED만 반환' },
    18: { result: 'PASS', note: 'to ≤ from → 400' },
  },
  '6.검색': {
    1:  { result: 'PASS', note: '200 OK, 검색 결과 + 하이라이트' },
    2:  { result: 'PASS', note: '빈 검색어 → 빈 결과 200 즉시 반환' },
    3:  { result: 'PASS', note: 'domainTypes=NOTE 필터 200 OK' },
    4:  { result: 'SKIP', note: 'TTL 비교 자동화 어려움' },
    5:  { result: 'PASS', note: '멀티테넌시 격리 정상' },
    6:  { result: 'PASS', note: '자동완성 suggestions 200 OK' },
    7:  { result: 'SKIP', note: 'internal API' },
    8:  { result: 'SKIP', note: 'internal API' },
    9:  { result: 'PASS', note: '검색 히스토리 200 OK' },
    10: { result: 'SKIP', note: '타인 히스토리 ID 확보 필요' },
    11: { result: 'PASS', note: '즐겨찾기 추가/조회 정상' },
    12: { result: 'SKIP', note: '동일 docId 재사용 필요' },
    13: { result: 'PASS', note: '검색어 즐겨찾기 추가/조회 정상' },
  },
  '7.파일': {
    1:  { result: 'PASS', note: 'multipart 업로드 201 OK' },
    2:  { result: 'PASS', note: '.exe 파일 업로드 400 차단' },
    3:  { result: 'SKIP', note: '50MB+ 파일 비실용적' },
    4:  { result: 'PASS', note: 'presigned URL 200 OK' },
    5:  { result: 'PASS', note: '302 Redirect to presigned URL' },
    6:  { result: 'PASS', note: 'URL 직접 반환 200 OK' },
    7:  { result: 'PASS', note: '스트리밍 200 OK' },
    8:  { result: 'PASS', note: '메타데이터 200 OK' },
    9:  { result: 'PASS', note: '200 OK, Admin으로 소프트 삭제 성공. file:delete는 Admin 전용 권한' },
    10: { result: 'SKIP', note: '타인 파일 ID 확보 필요' },
    11: { result: 'PASS', note: '존재하지 않는 ID → 404 (유출 없음)' },
    12: { result: 'PASS', note: 'Export 목록 200 OK' },
    13: { result: 'SKIP', note: 'BullMQ 비동기 ZIP' },
    14: { result: 'SKIP', note: '진행 중 작업 필요' },
    15: { result: 'SKIP', note: '미완료 작업 필요' },
  },
  '8.API_Gateway': {
    1:  { result: 'PASS', note: 'JWT 프록시 통과 200 OK' },
    2:  { result: 'PASS', note: 'JWT 없이 → 401' },
    3:  { result: 'PASS', note: '로그아웃 후 토큰 → 401 (블랙리스트 동작)' },
    4:  { result: 'SKIP', note: '역할 변경 시 환경 오염 위험' },
    5:  { result: 'SKIP', note: '커스텀 JWT 생성 필요' },
    6:  { result: 'PASS', note: '공개 경로 JWT 없이 정상 처리' },
    7:  { result: 'PASS', note: '/internal/* 경로 404 차단' },
    8:  { result: 'SKIP', note: '200+ 요청 시 Rate Limit 트리거 — 다른 테스트 영향' },
    9:  { result: 'SKIP', note: '20+ 로그인 시도 Rate Limit — 영향 위험' },
    10: { result: 'SKIP', note: '10+ 내보내기 요청 필요' },
    11: { result: 'PASS', note: '쿠키 세션 정상 설정' },
    12: { result: 'PASS', note: 'Set-Cookie: HttpOnly; SameSite 확인' },
    13: { result: 'PASS', note: '개인 대시보드 200 OK' },
    14: { result: 'PASS', note: '팀 대시보드 200 OK (Admin)' },
    15: { result: 'PASS', note: '조직 대시보드 200 OK (Admin)' },
    16: { result: 'PASS', note: 'Researcher 조직 대시보드 → 403' },
    17: { result: 'SKIP', note: '서비스 다운 시뮬레이션 필요' },
    18: { result: 'SKIP', note: 'Redis TTL 자동화 어려움' },
    19: { result: 'SKIP', note: 'SSE 스트리밍 별도 클라이언트 필요' },
    20: { result: 'SKIP', note: 'SSE 스트리밍 별도 클라이언트 필요' },
    21: { result: 'PASS', note: 'JWT 없이 SSE → 401' },
    22: { result: 'PASS', note: '프록시 헤더 주입 동작 확인' },
  },
  '9.실시간협업': {
    1:  { result: 'SKIP', note: 'WebSocket(ws) 클라이언트 미설치' },
    2:  { result: 'SKIP', note: 'WebSocket 테스트 환경 별도 구성' },
    3:  { result: 'SKIP', note: 'WebSocket 테스트 환경 별도 구성' },
    4:  { result: 'SKIP', note: 'WebSocket 2명 동시 접속 필요' },
    5:  { result: 'SKIP', note: 'WebSocket 테스트 환경 별도 구성' },
    6:  { result: 'SKIP', note: 'WebSocket awareness 이벤트' },
    7:  { result: 'SKIP', note: 'WebSocket 멀티 클라이언트 필요' },
    8:  { result: 'SKIP', note: 'WebSocket 연결 종료 이벤트' },
    9:  { result: 'SKIP', note: 'WebSocket 룸 해제 확인' },
    10: { result: 'SKIP', note: 'WebSocket 8명 순차 접속' },
    11: { result: 'SKIP', note: 'WebSocket 서버 측 userId 주입' },
    12: { result: 'SKIP', note: '알려진 설계 제한사항' },
  },
};

// ── 엑셀 업데이트 ────────────────────────────────────────
const wb = XLSX.readFile(INPUT);

for (const sheetName of wb.SheetNames) {
  if (sheetName === '요약') continue;

  const ws = wb.Sheets[sheetName];
  const resultData = RESULTS[sheetName];
  if (!resultData) continue;

  // 범위 확장: 기존 범위에 K, L 열 추가
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.e.c = Math.max(range.e.c, 11); // L열 = index 11
  ws['!ref'] = XLSX.utils.encode_range(range);

  // 헤더 추가 (K1=결과, L1=비고)
  ws['K1'] = { t: 's', v: '결과' };
  ws['L1'] = { t: 's', v: '비고' };

  // 데이터 행 업데이트
  for (const [noStr, { result, note }] of Object.entries(resultData)) {
    const no = parseInt(noStr);
    const rowIdx = no; // 1-based (row 0=header, row 1=TC-001)
    const kCell = `K${rowIdx + 1}`;
    const lCell = `L${rowIdx + 1}`;
    ws[kCell] = { t: 's', v: result };
    ws[lCell] = { t: 's', v: note };
  }

  // 열 너비 설정
  if (!ws['!cols']) ws['!cols'] = [];
  ws['!cols'][10] = { wch: 8 };  // K=결과
  ws['!cols'][11] = { wch: 60 }; // L=비고
}

// 요약 시트 업데이트 — PASS/FAIL/SKIP 카운트 열 추가
const summaryWs = wb.Sheets['요약'];
if (summaryWs) {
  const range = XLSX.utils.decode_range(summaryWs['!ref']);
  range.e.c = Math.max(range.e.c, 15); // P열까지
  summaryWs['!ref'] = XLSX.utils.encode_range(range);

  // 헤더
  summaryWs['N1'] = { t: 's', v: 'PASS' };
  summaryWs['O1'] = { t: 's', v: 'FAIL' };
  summaryWs['P1'] = { t: 's', v: 'SKIP' };

  const sheetOrder = [
    '1.인증_사용자', '2.연구노트', '3.전자서명_감사', '4.인벤토리',
    '5.예약', '6.검색', '7.파일', '8.API_Gateway', '9.실시간협업'
  ];

  let totalP = 0, totalF = 0, totalS = 0;
  sheetOrder.forEach((name, i) => {
    const data = RESULTS[name];
    if (!data) return;
    let p = 0, f = 0, s = 0;
    for (const tc of Object.values(data)) {
      if (tc.result === 'PASS') p++;
      else if (tc.result === 'FAIL') f++;
      else if (tc.result === 'SKIP') s++;
    }
    const row = i + 2;
    summaryWs[`N${row}`] = { t: 'n', v: p };
    summaryWs[`O${row}`] = { t: 'n', v: f };
    summaryWs[`P${row}`] = { t: 'n', v: s };
    totalP += p; totalF += f; totalS += s;
  });

  // 합계 행
  const totalRow = sheetOrder.length + 2;
  summaryWs[`N${totalRow}`] = { t: 'n', v: totalP };
  summaryWs[`O${totalRow}`] = { t: 'n', v: totalF };
  summaryWs[`P${totalRow}`] = { t: 'n', v: totalS };
}

XLSX.writeFile(wb, OUTPUT);
console.log(`테스트 결과 반영 완료: ${OUTPUT}`);

// 통계
let p = 0, f = 0, s = 0;
for (const sheet of Object.values(RESULTS)) {
  for (const tc of Object.values(sheet)) {
    if (tc.result === 'PASS') p++;
    else if (tc.result === 'FAIL') f++;
    else if (tc.result === 'SKIP') s++;
  }
}
console.log(`PASS: ${p}  |  FAIL: ${f}  |  SKIP: ${s}  |  합계: ${p + f + s}`);
