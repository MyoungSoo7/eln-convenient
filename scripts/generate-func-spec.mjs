import XLSX from 'xlsx';

const features = [
  {
    no: 1, group: '인증/계정', name: '로그인 및 세션 관리',
    overview: '사용자가 이메일/비밀번호로 인증하여 시스템에 접근하고, JWT 기반 세션을 유지하며, 안전하게 로그아웃하는 기능을 제공한다.',
    scenario: `1. 사용자가 로그인 페이지에서 이메일/비밀번호를 입력하고 "로그인" 버튼 클릭.
2. 시스템이 자격 증명을 검증하고, 액세스 토큰(15분)과 리프레시 토큰(8시간)을 발급한다.
3. 리프레시 토큰은 httpOnly 쿠키(labnote_rt)에 저장된다.
4. 액세스 토큰 만료 시 리프레시 토큰으로 자동 갱신한다.
5. 사용자가 로그아웃 시 JWT가 Redis 블랙리스트에 등록되고 쿠키가 삭제된다.
6. 로그인 페이지에서 한국어/English 언어 전환이 가능하다.`,
    policy: `• 비밀번호는 bcrypt 해시로 저장하며 평문 비교 금지.
• 액세스 토큰 유효기간: 15분, 리프레시 토큰: 8시간.
• 리프레시 토큰은 반드시 httpOnly/Secure/SameSite 쿠키로만 전달.
• 로그아웃 시 JWT를 Redis 블랙리스트에 TTL 기반 등록하여 재사용 차단.
• 동시 세션 수 제한 없음 (멀티 디바이스 허용).`,
    uiux: `• 이메일/비밀번호 미입력 시 필드 하단에 "필수 입력 항목입니다" 표시.
• 로그인 실패 시 "이메일 또는 비밀번호가 올바르지 않습니다" 얼럿.
• 네트워크 오류 시 "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요" 얼럿.
• 토큰 갱신 실패(리프레시 만료) 시 로그인 페이지로 자동 리디렉트 + "세션이 만료되었습니다" 안내.`
  },
  {
    no: 2, group: '인증/계정', name: '회원가입 및 초기 설정',
    overview: '새로운 사용자가 이메일/이름/비밀번호를 입력하여 계정을 생성하고, 기본 역할(viewer)과 첫 번째 조직에 자동 배정되는 기능을 제공한다.',
    scenario: `1. 사용자가 로그인 페이지에서 "회원가입" 링크를 클릭한다.
2. 이메일, 이름, 비밀번호를 입력하고 "가입" 버튼 클릭.
3. 시스템이 이메일 중복 여부를 확인한다.
4. 계정 생성 시 viewer 역할이 자동 부여되고, 첫 번째 조직에 배정된다.
5. 가입 완료 후 로그인 페이지로 이동하며 "가입 완료" 메시지를 표시한다.`,
    policy: `• 이메일은 시스템 전체에서 고유해야 한다.
• 비밀번호는 최소 8자 이상이어야 한다.
• 신규 가입자는 반드시 viewer 역할로 생성 (역할 승격은 Admin만 가능).
• 조직이 없는 경우 가입 불가 (최소 1개 조직 필요).`,
    uiux: `• 이메일 형식 오류 시 "올바른 이메일 형식을 입력해주세요" 표시.
• 비밀번호 8자 미만 시 "비밀번호는 8자 이상이어야 합니다" 표시.
• 이메일 중복 시 "이미 등록된 이메일입니다" 얼럿.
• 가입 성공 시 "회원가입이 완료되었습니다" 토스트 메시지.`
  },
  {
    no: 3, group: '인증/계정', name: '사용자/팀/조직 관리',
    overview: 'Admin이 조직, 팀, 사용자, 역할을 생성/수정/삭제하고, 권한을 할당하여 시스템 접근을 체계적으로 관리하는 기능을 제공한다.',
    scenario: `1. Admin이 관리 메뉴(/admin/users)에 접근한다.
2. [조직 탭] 조직 목록 조회, 조직 생성(이름/slug)/수정/삭제.
3. [팀 탭] 팀 목록 조회, 팀 생성/수정/삭제, 팀원 추가(leader/member)/제거.
4. [사용자 탭] 사용자 목록 조회, 사용자 생성(이름/이메일/비밀번호/역할)/수정/삭제.
5. [역할 탭] 역할 목록 조회, 역할 생성(이름+권한 체크박스)/수정/삭제.`,
    policy: `• Admin 역할만 접근 가능 (requireRole(ADMIN)).
• 역할별 권한: admin(전체), reviewer(note:sign 포함), researcher(기본 CRUD), viewer(읽기 전용).
• 사용자 삭제 시 관련 데이터 잔존 — 소프트 삭제 또는 상태 변경(suspended) 처리.
• 팀 멤버십은 userId+teamId 복합키로 중복 방지.
• 모든 관리 작업은 AuditLog에 기록된다.`,
    uiux: `• 삭제 시 "정말 삭제하시겠습니까?" 확인 다이얼로그 노출.
• 역할 삭제 시 해당 역할의 사용자가 있으면 "사용 중인 역할은 삭제할 수 없습니다" 표시.
• 사용자 생성 시 이메일 중복이면 "이미 등록된 이메일입니다" 표시.
• Admin이 자기 자신의 역할을 변경하려 하면 "자신의 역할은 변경할 수 없습니다" 경고.`
  },
  {
    no: 4, group: '연구노트', name: '연구노트 작성 및 편집',
    overview: '연구자가 마크다운 기반 연구노트를 생성/편집하고, 저장 시 자동으로 리비전(버전)이 생성되며, 첨부파일과 인벤토리 연결을 관리하는 기능을 제공한다.',
    scenario: `1. 사용자가 노트 목록(/notes)에서 "새 노트" 버튼을 클릭하거나, 프로토콜에서 "노트 작성"을 선택한다.
2. 편집기 페이지에서 제목과 마크다운 본문을 작성한다.
3. [첨부파일 탭] 파일을 드래그앤드롭 또는 클릭으로 업로드하고, 목록에서 다운로드/삭제한다.
4. [연결 항목 탭] 인벤토리 시약/장비를 검색하여 노트에 연결하거나 해제한다.
5. [버전 이력 탭] 리비전 타임라인을 확인하고 특정 버전을 조회한다.
6. "저장" 클릭 시 노트가 저장되고 리비전이 자동 생성된다.
7. 프로토콜 기반 생성 시 카테고리/제목이 자동으로 채워진다.`,
    policy: `• 신규 노트는 draft 상태로 생성되며 리비전 1이 자동 생성된다.
• 저장(PUT) 시마다 새 리비전이 생성된다 (변경 이력 보존).
• locked/signed 상태의 노트는 편집 불가 — 편집기 비활성화 처리.
• 첨부파일은 소유자 또는 Admin만 삭제 가능.
• 모든 데이터는 orgId 스코프로 격리 (멀티테넌시).
• 팀 가시성: 내 노트 + 내 팀 노트 + 팀 미배정 노트만 조회 가능.`,
    uiux: `• 제목 미입력 시 "제목을 입력해주세요" 유효성 검증 표시.
• 저장 성공 시 "저장되었습니다" 토스트.
• locked/signed 노트 접근 시 편집기 상단에 "읽기 전용" 배너 표시.
• 파일 업로드 실패 시 "파일 업로드에 실패했습니다" 얼럿 + 재시도 안내.
• 대용량 파일(exe/sh/bat) 업로드 시도 시 "허용되지 않는 파일 형식입니다" 차단 메시지.`
  },
  {
    no: 5, group: '연구노트', name: '실시간 협업 편집',
    overview: '여러 사용자가 동일한 연구노트를 WebSocket 기반으로 동시에 편집하고, 커서 위치와 변경 사항이 실시간으로 동기화되는 기능을 제공한다.',
    scenario: `1. 사용자가 노트 편집기에 진입하면 WebSocket 연결이 수립된다 (JWT 인증).
2. 다른 사용자가 같은 노트에 진입하면 참여자 아바타(색상)가 표시된다.
3. 각 사용자의 편집 내용이 실시간으로 다른 참여자 화면에 반영된다.
4. 커서 위치(awareness)가 다른 편집자에게 공유된다.
5. 사용자가 편집기를 떠나면 퇴장 알림이 표시되고 아바타가 제거된다.`,
    policy: `• WebSocket upgrade 시 JWT 토큰 검증 필수.
• Redis pub/sub 기반으로 멀티 인스턴스 간 동기화 지원.
• 참여자 아바타 색상은 8색 순환 배정.
• content-update 이벤트로 콘텐츠 동기화, awareness 이벤트로 커서 공유.
• locked/signed 노트에서는 읽기 전용 모드로 WebSocket 연결 (편집 이벤트 무시).`,
    uiux: `• WebSocket 연결 실패 시 "실시간 협업 연결에 실패했습니다. 단독 편집 모드로 전환합니다" 안내.
• 네트워크 단절 시 자동 재연결 시도 (최대 5회, 지수 백오프).
• 재연결 실패 시 "연결이 끊어졌습니다. 새로고침해주세요" 배너 표시.
• 참여자 입장/퇴장 시 편집기 상단에 일시적 토스트 알림.`
  },
  {
    no: 6, group: '연구노트', name: '연구노트 상태 전환',
    overview: '연구노트의 생명주기(draft/in_progress/locked/signed)를 역할 기반 권한에 따라 전환하고, 모든 전환을 이중 기록하는 기능을 제공한다.',
    scenario: `1. 작성자가 draft 상태의 노트에서 "진행 시작" 버튼을 클릭하면 in_progress로 전환된다.
2. in_progress 상태에서 "초안으로 되돌리기"를 클릭하면 draft로 복원된다.
3. Reviewer/Admin이 in_progress 노트에서 "잠금" 버튼을 클릭하면 locked로 전환된다.
4. 노트 목록에서 상태 드롭다운으로도 직접 상태 변경이 가능하다.
5. 모든 상태 전환은 NoteStatusHistory + AuditLog에 이중 기록된다.`,
    policy: `• draft → in_progress, in_progress → draft: 모든 역할(Researcher 이상) 가능.
• in_progress → locked: Reviewer/Admin만 가능 (x-user-role 검증).
• locked → draft: Admin만 가능 (별도 잠금해제 프로세스).
• signed 상태는 서명 프로세스만으로 전환 가능 — PATCH /status로 직접 signed 전환 불가.
• signed 상태는 불변 — 어떤 역할도 다른 상태로 변경 불가.
• DB 트리거 check_note_status_transition()이 최종 안전장치.
• SELECT FOR UPDATE로 동시성 제어.`,
    uiux: `• 허용되지 않은 전환 시도 시 "이 상태 변경은 권한이 없습니다" 얼럿.
• Researcher가 잠금 시도 시 "잠금은 Reviewer 이상만 가능합니다" 메시지.
• signed/locked 노트의 상태 드롭다운은 비활성화.
• 상태 전환 성공 시 "상태가 변경되었습니다" 토스트 + 목록 자동 갱신.`
  },
  {
    no: 7, group: '연구노트', name: '연구노트 최종 전자서명 및 잠금',
    overview: '작성이 완료된 연구노트에 대해 검토자가 전자서명을 수행하고, 데이터를 위변조 불가능한 상태로 고정한다.',
    scenario: `1. Reviewer/Admin이 in_progress 상태의 노트를 열고 "서명하기" 버튼을 클릭한다.
2. 본인 확인을 위해 비밀번호 재입력 팝업이 노출된다.
3. 비밀번호 검증 후 해시체인 서명이 생성된다 (noteId:signerId:timestamp:prevHash → SHA-256).
4. Redis Stream NOTE_SIGNED 이벤트가 발행되고, eln-service가 소비하여 노트 상태를 signed로 전환한다.
5. 노트 작성자에게 "서명 완료" 알림이 발송된다.
6. signed 상태의 노트는 편집/삭제가 완전히 차단된다.`,
    policy: `• 본인 서명 불가: 작성자와 서명자가 동일인일 경우 서명 버튼 비활성화.
• Researcher는 note:sign 권한이 없으므로 서명 요청 자체가 불가.
• 수정 제한: locked 또는 signed 상태에서는 이미지/텍스트 수정 및 삭제 불가.
• 해시 체인: 서명 시점의 데이터 해시값을 이전 서명값과 결합하여 DB에 저장.
• 서명 취소(revoke)는 Admin만 가능하며, 삭제가 아닌 상태 변경(revoked) 처리.
• 누구도 PATCH /status로 직접 signed로 변경 불가 — 반드시 서명 프로세스를 거쳐야 한다.`,
    uiux: `• 비밀번호 3회 오류 시 "10분 후 재시도" 안내 문구 노출.
• 서명 중 네트워크 단절 시 "서명 실패" 얼럿 노출 및 상태 유지.
• 작성자 본인이 서명 페이지 접근 시 서명 버튼이 비활성 + "본인의 노트는 서명할 수 없습니다" 안내.
• 서명 완료 시 "전자서명이 완료되었습니다" 성공 메시지 + 노트 상태 즉시 갱신.`
  },
  {
    no: 8, group: '연구노트', name: '관리자 잠금 해제',
    overview: 'Admin이 locked 상태의 노트에 대해 비밀번호 인증을 거쳐 잠금을 해제하고 draft 상태로 복원하는 기능을 제공한다.',
    scenario: `1. Admin이 노트 목록에서 locked 상태의 노트를 찾는다.
2. "잠금 해제" 버튼을 클릭한다.
3. 비밀번호 재입력 다이얼로그가 노출된다.
4. auth-service의 내부 API로 비밀번호를 검증한다.
5. 검증 성공 시 노트 상태가 locked → draft로 전환된다.
6. 전환 이력이 NoteStatusHistory + AuditLog에 관리자 행위(isAdminAction)로 기록된다.
7. 노트 작성자에게 "잠금 해제" 알림이 발송된다.`,
    policy: `• Admin 역할 + NOTE_UNLOCK 권한 필수 (requireRole(ADMIN) + requirePermission(NOTE_UNLOCK)).
• 비밀번호 인증 필수 — auth-service 내부 API(/api/auth/internal/verify-password) 호출.
• signed 상태의 노트는 잠금 해제 불가 (signed는 불변).
• 잠금 해제 시 isAdminAction: true로 감사로그에 명확히 구분 기록.`,
    uiux: `• Admin이 아닌 사용자에게는 "잠금 해제" 버튼 자체가 노출되지 않음.
• 비밀번호 오류 시 "비밀번호가 올바르지 않습니다" 표시.
• signed 노트에 잠금 해제 시도 시 "서명 완료된 노트는 잠금 해제할 수 없습니다" 안내.
• 해제 성공 시 "잠금이 해제되었습니다" 토스트 + 노트 상태 즉시 갱신.`
  },
  {
    no: 9, group: '템플릿/프로토콜', name: '프로토콜 템플릿 관리',
    overview: '재사용 가능한 실험 프로토콜 템플릿을 생성/수정/복사/삭제하고, 라이브러리로 관리하여 연구노트 작성의 표준화를 지원한다.',
    scenario: `1. 사용자가 프로토콜 관리 페이지(/protocols)에 접근한다.
2. 카드 그리드 형태로 템플릿 목록이 표시된다 (제목/카테고리/사용횟수).
3. "새 프로토콜" 버튼으로 제목/카테고리/내용/태그를 입력하여 생성한다.
4. 기존 프로토콜을 클릭하여 수정 다이얼로그에서 편집한다.
5. "복사" 버튼으로 기존 프로토콜의 복사본을 즉시 생성한다.
6. "삭제" 버튼으로 확인 후 삭제한다.
7. "노트 보기"로 해당 프로토콜 기반 노트 목록으로 이동한다.`,
    policy: `• template:read 권한으로 조회, template:write 권한으로 생성/수정/삭제.
• 카테고리는 코드 테이블(TEMPLATE_CATEGORY)에서 관리 — Admin이 코드 관리에서 추가/수정.
• 복사 시 copiedFromId에 원본 ID 기록, copyCount 증가.
• 공개(isPublic) 템플릿은 조직 내 모든 사용자가 조회 가능.
• 삭제 시 해당 템플릿을 참조하는 노트의 templateId는 유지 (참조 무결성).`,
    uiux: `• 제목 미입력 시 "제목을 입력해주세요" 유효성 검증.
• 삭제 시 "이 프로토콜을 삭제하시겠습니까?" 확인 다이얼로그.
• viewer 역할은 생성/수정/삭제 버튼 미노출.
• 검색 결과 없을 시 "검색 결과가 없습니다" 빈 상태 표시.`
  },
  {
    no: 10, group: '템플릿/프로토콜', name: '프로토콜 기반 노트 생성',
    overview: '기존 프로토콜 템플릿을 선택하여 연구노트를 자동 생성하고, 템플릿의 제목/카테고리/내용이 자동으로 채워지는 기능을 제공한다.',
    scenario: `1. 사용자가 프로토콜 목록에서 원하는 프로토콜의 "노트 작성" 버튼을 클릭한다.
2. 노트 편집기 페이지로 이동하며, 프로토콜의 제목/카테고리/내용이 자동으로 채워진다.
3. 사용자가 내용을 수정/보완한 후 저장한다.
4. 생성된 노트의 templateId에 원본 프로토콜 ID가 기록된다.
5. 프로토콜의 useCount가 1 증가한다.`,
    policy: `• note:write 권한 필요.
• 템플릿의 content/sections/tags가 새 노트에 복사된다.
• 노트 type은 "note"로 생성 (template 아님).
• templateId로 역추적 가능 — 어떤 프로토콜에서 생성되었는지 기록.
• 프로토콜이 삭제되어도 이미 생성된 노트에는 영향 없음.`,
    uiux: `• "노트 작성" 클릭 시 편집기로 즉시 이동 (추가 확인 불필요).
• 자동 채워진 필드에 "프로토콜에서 가져옴" 라벨 표시.
• 프로토콜 내용이 비어있을 경우에도 빈 노트로 정상 생성.`
  },
  {
    no: 11, group: '파일/내보내기', name: '파일 업로드 및 다운로드',
    overview: '연구노트에 첨부할 파일을 MinIO(S3 호환) 스토리지에 업로드하고, presigned URL 기반으로 안전하게 다운로드하는 기능을 제공한다.',
    scenario: `1. 사용자가 노트 편집기의 첨부파일 탭에서 파일을 드래그앤드롭 또는 클릭으로 선택한다.
2. Multipart 방식으로 file-service에 업로드되고, MinIO 버킷에 저장된다.
3. 업로드 완료 시 파일 메타데이터(이름/크기/타입/SHA-256 체크섬)가 DB에 기록된다.
4. 첨부파일 목록에서 파일명을 클릭하면 presigned URL이 발급되어 다운로드된다.
5. 소유자 또는 Admin이 파일을 삭제하면 소프트 삭제(isDeleted) 처리된다.`,
    policy: `• 차단 확장자: exe, sh, bat — 보안 위험 파일 업로드 불가.
• 업로드 시 SHA-256 체크섬 자동 생성 및 저장 (무결성 검증).
• Presigned URL은 시간 제한 (만료 후 접근 불가).
• 파일 삭제는 소유자(uploaderId) 또는 Admin만 가능.
• locked/signed 노트의 첨부파일은 삭제 불가.
• 모든 파일은 orgId로 격리 (멀티테넌시).`,
    uiux: `• 차단 확장자 파일 선택 시 "허용되지 않는 파일 형식입니다 (exe, sh, bat)" 즉시 차단.
• 업로드 진행 중 프로그레스 바 표시.
• 업로드 실패 시 "파일 업로드에 실패했습니다. 다시 시도해주세요" 얼럿.
• 다운로드 URL 만료 시 "링크가 만료되었습니다. 다시 다운로드해주세요" 안내.`
  },
  {
    no: 12, group: '파일/내보내기', name: 'PDF/ZIP 내보내기',
    overview: '서명/잠금된 연구노트를 PDF 또는 ZIP 형태로 비동기 변환하고, BullMQ 작업 큐와 SSE로 진행 상태를 실시간 제공하는 기능을 제공한다.',
    scenario: `1. 사용자가 내보내기 페이지(/exports)에서 개별 노트의 PDF/ZIP 버튼을 클릭한다.
2. 또는 "전체 ZIP" 버튼으로 서명/잠금 노트를 일괄 내보내기한다.
3. 또는 여러 노트를 선택하여 "통합 리포트" PDF를 생성한다.
4. BullMQ 작업이 생성되고, Puppeteer가 PDF를 렌더링한다.
5. 진행 상태가 3초 폴링 + SSE 실시간 알림으로 표시된다.
6. 완료 시 presigned URL로 다운로드 링크가 제공된다.
7. 작업 이력에서 과거 내보내기 성공/실패를 확인할 수 있다.`,
    policy: `• export:pdf 권한 필요.
• 내보내기 대상은 signed/locked 상태의 노트만 가능.
• BullMQ 비동기 처리 — 대용량 노트도 타임아웃 없이 처리.
• ExportJob 상태: pending → processing → completed/failed.
• 생성된 파일은 MinIO에 저장, presigned URL로 다운로드 제공.
• 실패 시 errorMsg에 원인 기록.`,
    uiux: `• 내보내기 시작 시 "내보내기 작업이 시작되었습니다" 토스트.
• 진행 중 상태 표시: 스피너 + "변환 중..." 텍스트.
• SSE로 완료 알림 수신 시 "다운로드 준비 완료" 토스트 + 다운로드 버튼 활성화.
• 변환 실패 시 "내보내기에 실패했습니다" 얼럿 + 작업 이력에 실패 표시.
• draft/in_progress 노트에 내보내기 시도 시 "서명 또는 잠금된 노트만 내보낼 수 있습니다" 안내.`
  },
  {
    no: 13, group: '파일/내보내기', name: '노트-인벤토리 연결 관리',
    overview: '연구노트와 인벤토리 항목(시약/장비) 간의 교차 참조를 생성/해제하여 실험에 사용된 자원을 추적하는 기능을 제공한다.',
    scenario: `1. 사용자가 노트 편집기의 "연결 항목" 탭에 접근한다.
2. 인벤토리 항목을 검색하여 선택한다 (시약명/장비명 검색).
3. "연결" 버튼으로 NoteLink가 생성된다 (targetType: inventory).
4. 연결된 항목 목록에서 라벨과 상세 정보를 확인한다.
5. "연결 해제" 버튼으로 링크를 제거한다.`,
    policy: `• note:write 권한으로 연결 생성/해제 가능.
• NoteLink 모델: noteId, targetType(inventory/note), targetId, label, createdBy.
• locked/signed 노트에서는 연결 추가/해제 불가.
• 인벤토리 항목이 삭제되어도 NoteLink는 유지 (이력 보존).
• 동일 항목 중복 연결 방지.`,
    uiux: `• locked/signed 노트에서는 연결/해제 버튼 비활성화.
• 검색 결과 없을 시 "해당 인벤토리 항목을 찾을 수 없습니다" 표시.
• 연결 성공 시 항목이 목록에 즉시 추가.
• 연결 해제 시 "연결을 해제하시겠습니까?" 확인 다이얼로그.`
  },
  {
    no: 14, group: '인벤토리', name: '인벤토리 항목 관리',
    overview: '실험실 시약/샘플/장비/소모품 등의 인벤토리 항목을 생성/수정/삭제하고, 유형/상태별로 필터링하여 관리하는 기능을 제공한다.',
    scenario: `1. 사용자가 인벤토리 관리 페이지(/inventory)에 접근한다.
2. 유형 탭(reagent/sample/equipment 등)으로 필터링한다.
3. 상태 필터, 이름/유형 검색(300ms 디바운스)으로 항목을 찾는다.
4. "항목 추가" 버튼으로 이름/유형/상태/위치/수량/단위/최소수량/바코드/만료일/태그를 입력한다.
5. 기존 항목을 클릭하여 상세 정보를 확인하고 수정한다.
6. 바코드로 직접 검색하여 항목을 빠르게 조회한다.
7. 불필요한 항목을 삭제한다.`,
    policy: `• inventory:read로 조회, inventory:write로 생성/수정/삭제.
• 유형은 코드 테이블(INVENTORY_ITEM_TYPE)에서 동적 로드 — Admin이 관리.
• 상태: available, in_use, depleted, expired, disposed, maintenance.
• 바코드는 조직 내 고유해야 한다.
• 모든 변경은 InventoryHistory에 기록.
• orgId 스코프 필수 (멀티테넌시).`,
    uiux: `• 필수 필드(이름/유형) 미입력 시 유효성 검증 표시.
• 바코드 중복 시 "이미 등록된 바코드입니다" 표시.
• 삭제 시 "이 항목을 삭제하시겠습니까?" 확인 다이얼로그.
• 만료 임박 항목은 목록에서 경고 아이콘 표시.
• 재고 부족 항목(quantity <= minQuantity)은 빨간색 하이라이트.`
  },
  {
    no: 15, group: '인벤토리', name: '수량 입출고 및 이력',
    overview: '인벤토리 항목의 수량을 입고(in)/출고(out)/조정(adjust)하고, 모든 변경 내역을 이력으로 기록하여 추적하는 기능을 제공한다.',
    scenario: `1. 사용자가 인벤토리 항목 상세에서 "수량 조정" 버튼을 클릭한다.
2. 변경 유형(입고/출고/절대값 조정)을 선택한다.
3. 수량과 사유를 입력한다.
4. 변경 전/후 수량 미리보기가 표시된다.
5. "확인" 클릭 시 수량이 반영되고 InventoryHistory에 기록된다.
6. 항목 상세의 이력 탭에서 모든 수량 변경 내역을 시간순으로 확인한다.`,
    policy: `• inventory:write 권한 필요.
• in(입고): 현재 수량 + delta.
• out(출고): 현재 수량 - delta (음수 불가 — 재고 이하로 출고 차단).
• adjust(조정): 절대값으로 수량 설정.
• InventoryHistory에 quantityBefore/After/Delta, reason, performedBy 기록.
• 수량 변경 후 search-service에 인덱스 갱신 이벤트 발행.`,
    uiux: `• 출고 시 재고보다 많은 수량 입력 시 "재고가 부족합니다 (현재: N개)" 표시.
• 수량 0 입력 시 "0보다 큰 값을 입력해주세요" 검증.
• 변경 전/후 수량 미리보기로 실수 방지.
• 사유 미입력 시 "변경 사유를 입력해주세요" 유효성 검증.`
  },
  {
    no: 16, group: '인벤토리', name: '재고 경고 (부족/만료)',
    overview: '최소수량 이하로 떨어진 재고 부족 항목과 만료일 임박 항목을 자동 감지하여 대시보드와 인벤토리 페이지에 경고를 표시하는 기능을 제공한다.',
    scenario: `1. 시스템이 인벤토리 항목의 수량과 만료일을 주기적으로 확인한다.
2. quantity <= minQuantity인 항목은 재고 부족 경고 대상이 된다.
3. expiryDate가 expiryWarningDays 이내인 항목은 만료 임박 경고 대상이 된다.
4. 대시보드에 재고 부족/만료 임박 경고 배너가 표시된다.
5. 인벤토리 목록에서 해당 항목에 경고 아이콘이 표시된다.`,
    policy: `• 재고 부족 기준: quantity <= minQuantity (항목별 설정).
• 만료 임박 기준: expiryDate - today <= expiryWarningDays (항목별 설정).
• 만료된 항목(expiryDate < today)은 expired 상태로 자동 전환 권장.
• 경고 데이터는 API 호출 시 실시간 조회 (별도 배치 없음).`,
    uiux: `• 대시보드 경고 배너: 주황색(만료 임박), 빨간색(재고 부족) 구분.
• 경고 배너 클릭 시 인벤토리 목록으로 이동 (해당 필터 적용).
• 경고 항목이 없으면 배너 미표시.
• 인벤토리 목록에서 만료 임박은 날짜 셀 주황색, 재고 부족은 수량 셀 빨간색 하이라이트.`
  },
  {
    no: 17, group: '스케줄러', name: '장비/회의실 예약',
    overview: '실험 장비와 회의실을 주간 캘린더에서 시간 단위로 예약하고, 시간 충돌을 자동 검증하여 이중 예약을 방지하는 기능을 제공한다.',
    scenario: `1. 사용자가 스케줄러 페이지(/scheduler)의 예약 탭에 접근한다.
2. 주간 캘린더 그리드(08:00~17:00, 7일)에서 예약 현황을 확인한다.
3. 이전/다음/오늘 버튼으로 주간 네비게이션한다.
4. "새 예약" 버튼으로 자원 선택, 목적, 날짜, 시작/종료 시간을 입력한다.
5. 시스템이 시간 충돌을 자동 검증한다.
6. 예약이 PENDING 상태로 생성되고, 승인을 기다린다.
7. 사용자가 자신의 예약을 취소할 수 있다.`,
    policy: `• scheduler:read로 조회, scheduler:write로 예약 생성.
• 시간 충돌 검증: 동일 자원의 기존 승인/대기 예약과 시간대 겹침 시 생성 차단.
• 예약 상태 흐름: PENDING → APPROVED/REJECTED/CANCELLED → COMPLETED.
• 비활성 자원(isActive=false)은 예약 불가.
• 과거 시간대 예약 차단.`,
    uiux: `• 시간 충돌 시 "해당 시간대에 이미 예약이 있습니다" 얼럿.
• 비활성 자원 선택 시 "현재 사용할 수 없는 자원입니다" 표시.
• 과거 시간 선택 시 "과거 시간에는 예약할 수 없습니다" 검증.
• 예약 생성 성공 시 "예약이 등록되었습니다 (승인 대기 중)" 토스트.
• 취소 시 "예약을 취소하시겠습니까?" 확인 다이얼로그.`
  },
  {
    no: 18, group: '스케줄러', name: '예약 승인/반려/완료',
    overview: 'Admin 또는 자원 소유자가 대기 중인 예약을 승인/반려하고, 완료된 예약을 마감 처리하는 기능을 제공한다.',
    scenario: `1. Admin/자원소유자가 예약 목록에서 PENDING 상태의 예약을 확인한다.
2. "승인" 버튼 클릭 시 예약이 APPROVED 상태로 전환된다.
3. "반려" 버튼 클릭 시 반려 사유를 입력하고 REJECTED 상태로 전환된다.
4. 예약 시간이 종료된 후 "완료" 처리로 COMPLETED 상태로 전환된다.
5. 예약자에게 승인/반려 알림이 발송된다.`,
    policy: `• 예약 승인/반려: Admin 또는 해당 자원의 소유자(ownerId)만 가능.
• 반려 시 rejectedReason 필수 입력.
• 이미 승인된 예약은 취소만 가능 (재반려 불가).
• COMPLETED는 APPROVED 상태에서만 전환 가능.
• 모든 상태 전환은 AuditLog에 기록.`,
    uiux: `• 승인 권한이 없는 사용자에게는 승인/반려 버튼 미노출.
• 반려 시 사유 미입력 시 "반려 사유를 입력해주세요" 검증.
• 승인 성공 시 "예약이 승인되었습니다" 토스트.
• 반려 성공 시 "예약이 반려되었습니다" 토스트.`
  },
  {
    no: 19, group: '검색/대시보드', name: '통합 검색',
    overview: 'OpenSearch 기반으로 연구노트, 템플릿, 인벤토리를 통합 검색하고, 한국어 형태소 분석과 하이라이팅을 제공하는 기능을 제공한다.',
    scenario: `1. 사용자가 통합검색 페이지(/search)에서 검색어를 입력한다 (300ms 디바운스).
2. OpenSearch에서 연구노트/템플릿/인벤토리를 동시 검색한다.
3. 결과가 탭별로 분류되어 표시된다 (각 탭에 건수 표시).
4. 검색 결과에서 매칭된 부분이 하이라이트 처리된다.
5. 자동완성 추천이 입력 중 표시된다.
6. 검색 이력이 자동 저장된다.`,
    policy: `• 검색 결과는 orgId + 사용자 권한으로 필터링 (접근 불가 문서 미노출).
• OpenSearch 한국어 형태소 분석(nori) 적용.
• 검색 인덱스는 eln-service/inventory-service에서 데이터 변경 시 HTTP 내부 호출로 갱신.
• 결과 페이지네이션: page/size 파라미터.
• 하이라이트는 HTML 태그로 반환.`,
    uiux: `• 검색어 미입력 시 최근 검색어와 즐겨찾기 검색어 목록 표시.
• 검색 결과 없을 시 "검색 결과가 없습니다" + 추천 검색어 표시.
• 검색 중 스피너 표시.
• 하이라이트된 결과 텍스트에서 매칭 부분 굵게 표시.`
  },
  {
    no: 20, group: '검색/대시보드', name: '검색 이력 및 즐겨찾기',
    overview: '사용자의 검색 이력을 자동 저장하고, 자주 사용하는 검색어와 문서를 즐겨찾기로 관리하는 기능을 제공한다.',
    scenario: `1. 검색 수행 시 검색어가 SearchHistory에 자동 저장된다.
2. 검색 페이지에서 최근 검색어 목록이 표시된다.
3. 검색어 옆 별 버튼으로 즐겨찾기를 토글한다.
4. 즐겨찾기 검색어 목록에서 클릭으로 재검색한다.
5. 최근 검색어 전체 삭제가 가능하다.
6. 문서(노트/인벤토리)를 즐겨찾기에 추가/제거한다.`,
    policy: `• SearchHistory는 사용자별/조직별 격리.
• SearchKeywordFavorite는 userId+keyword 유니크 제약.
• Favorite(문서 즐겨찾기)는 userId+docType+docId 유니크 제약.
• 검색 이력은 최신순 정렬.`,
    uiux: `• 즐겨찾기 토글 시 별 아이콘 색상 즉시 변경 (낙관적 업데이트).
• 전체 삭제 시 "검색 이력을 모두 삭제하시겠습니까?" 확인 다이얼로그.
• 이력/즐겨찾기 없을 시 빈 상태 메시지 표시.`
  },
  {
    no: 21, group: '검색/대시보드', name: '대시보드 통계',
    overview: '개인/팀/조직 단위의 주요 지표(노트 수, 실험 현황, 인벤토리, 예약, 규정 준수)를 집계하여 대시보드에 시각적으로 제공하는 기능.',
    scenario: `1. 사용자가 메인 페이지(/)에 접근하면 개인 대시보드가 표시된다.
2. [내 대시보드] 내 노트 수, 진행 중 실험, 인벤토리 총수, 알림 수 통계 카드.
3. 최근 노트 5건 (상태 배지, 클릭 시 편집기 이동).
4. 예정된 예약 5건 (승인/대기 배지).
5. 최근 활동(감사로그) 10건.
6. 재고 부족/만료 임박 경고 배너.
7. [Admin] 조직 대시보드: 조직 전체 통계, 규정 준수 현황.`,
    policy: `• 개인 대시보드: 로그인 사용자 접근 가능.
• 팀 대시보드: Admin/Team Leader만 접근 가능.
• 조직 대시보드: Admin만 접근 가능.
• Redis 캐시 적용: 개인(2분), 팀(3분), 조직(5분).
• api-gateway가 내부 서비스(eln/inventory/scheduler/signature-audit)에 병렬 요청으로 집계.`,
    uiux: `• 데이터 로딩 중 스켈레톤 UI 표시.
• 통계 카드 클릭 시 해당 목록 페이지로 이동.
• 경고 배너는 해당 항목이 있을 때만 표시.
• Admin이 아닌 사용자에게는 조직 대시보드 탭 미노출.`
  },
  {
    no: 22, group: '감사/알림', name: '감사로그 조회',
    overview: '시스템 전체의 사용자 활동(노트 CRUD, 상태 변경, 서명, 로그인 등)을 시간순으로 기록하고, 필터링/검색하여 조회하는 기능을 제공한다.',
    scenario: `1. 사용자가 감사로그 페이지(/audit-logs)에 접근한다.
2. 감사로그 테이블(시각/액션/사용자/대상/상세/IP주소)이 표시된다.
3. 사용자 ID, 액션 유형 드롭다운, 날짜 범위(from~to)로 필터링한다.
4. 페이지네이션(20건/페이지)으로 탐색한다.
5. 액션별 색상 배지(signed=초록, revoked=빨강 등)로 시각적 구분.`,
    policy: `• audit:read 권한 필요.
• 모든 감사로그는 orgId로 격리.
• 감사로그는 삭제/수정 불가 (불변 기록).
• 내부 서비스에서 POST /api/audit/internal로 자동 기록.
• AuditLog 필드: entityType, entityId, action, actorId, details(JSON), ipAddress.`,
    uiux: `• 필터 적용 시 URL 쿼리 파라미터에 반영 (북마크/공유 가능).
• 결과 없을 시 "조건에 맞는 감사로그가 없습니다" 표시.
• 상세 컬럼의 JSON은 읽기 쉽게 포맷팅.
• 날짜 범위 선택 시 달력 피커 제공.`
  },
  {
    no: 23, group: '감사/알림', name: '실시간 알림',
    overview: 'SSE(Server-Sent Events)와 Redis pub/sub 기반으로 노트 잠금/서명/해제, 예약 승인 등의 이벤트를 사용자에게 실시간으로 전달하는 기능을 제공한다.',
    scenario: `1. 사용자가 시스템에 로그인하면 SSE 연결이 자동 수립된다.
2. 알림 벨 아이콘에 미읽음 수가 배지로 표시된다.
3. 새 알림(노트 잠금/서명/해제, 예약 승인) 발생 시 실시간으로 수신된다.
4. 알림 목록에서 읽음/안읽음 필터로 조회한다.
5. 개별 알림 클릭 시 읽음 처리되고, 관련 페이지로 이동한다.
6. "전체 읽음" 버튼으로 일괄 읽음 처리한다.`,
    policy: `• 알림 유형: NOTE_LOCKED, NOTE_SIGNED, NOTE_UNLOCKED, BOOKING_APPROVED.
• SSE 스트림: api-gateway가 Redis pub/sub(notifications:{userId} 채널) 구독.
• 미읽음 수는 Redis 캐시(5분) 적용.
• Notification 모델에 recipientId, type, entityType, entityId 기록.
• 알림은 삭제 불가, 읽음 처리만 가능.`,
    uiux: `• SSE 연결 실패 시 폴링 폴백 (30초 간격).
• 새 알림 수신 시 벨 아이콘에 빨간 점 + 배지 수 증가 애니메이션.
• 알림 목록 비어있을 시 "새로운 알림이 없습니다" 표시.
• 알림 클릭 시 해당 노트/예약 페이지로 자동 이동.`
  }
];

const wb = XLSX.utils.book_new();

// Sheet 1: 기능명세서 (가이드 양식)
const wsData = [['No', '기능 그룹', '기능명명', '개요', '사용자 시나리오', '비즈니스 규칙(Policy)', 'UI/UX 예외 처리']];
for (const f of features) {
  wsData.push([f.no, f.group, f.name, f.overview, f.scenario, f.policy, f.uiux]);
}
const ws = XLSX.utils.aoa_to_sheet(wsData);
ws['!cols'] = [
  { wch: 4 }, { wch: 14 }, { wch: 28 }, { wch: 60 }, { wch: 70 }, { wch: 70 }, { wch: 60 }
];
XLSX.utils.book_append_sheet(wb, ws, '기능명세서 (가이드 양식)');

// Sheet 2: 기능-API 매핑
const apiMap = [
  ['No', '기능명명', '관련 API 엔드포인트', '담당 서비스'],
  [1, '로그인 및 세션 관리', 'POST /api/auth/login\nPOST /api/auth/session\nPOST /api/auth/session/refresh\nDELETE /api/auth/session\nPOST /api/auth/logout', 'auth-service, api-gateway'],
  [2, '회원가입 및 초기 설정', 'POST /api/auth/register', 'auth-service'],
  [3, '사용자/팀/조직 관리', 'GET/POST/PUT/DELETE /api/auth/orgs\nGET/POST/PUT/DELETE /api/auth/teams\nGET/POST/PUT/DELETE /api/auth/users\nGET/POST/PUT/DELETE /api/auth/roles', 'auth-service'],
  [4, '연구노트 작성 및 편집', 'POST /api/notes\nGET/PUT /api/notes/:id\nGET /api/notes/:id/revisions\nPOST/DELETE /api/notes/:id/attachments\nPOST/DELETE /api/notes/:id/links\nPOST /api/files', 'eln-service, file-service, collab-service'],
  [5, '실시간 협업 편집', 'ws://collab-service:8009/collab/notes/:id', 'collab-service'],
  [6, '연구노트 상태 전환', 'PATCH /api/notes/:id/status', 'eln-service'],
  [7, '연구노트 최종 전자서명 및 잠금', 'POST /api/signatures/sign/:noteId\nGET /api/signatures/verify/:noteId\nPOST /api/signatures/revoke/:signatureId', 'signature-audit-service, eln-service'],
  [8, '관리자 잠금 해제', 'POST /api/notes/:id/admin-unlock\nPOST /api/auth/internal/verify-password', 'eln-service, auth-service'],
  [9, '프로토콜 템플릿 관리', 'GET/POST/PUT/DELETE /api/templates\nPOST /api/templates/:id/copy', 'eln-service'],
  [10, '프로토콜 기반 노트 생성', 'POST /api/notes (with templateId)', 'eln-service'],
  [11, '파일 업로드 및 다운로드', 'POST /api/files\nGET /api/files/:id/url\nGET /api/files/:id/stream\nDELETE /api/files/:id', 'file-service'],
  [12, 'PDF/ZIP 내보내기', 'POST /api/export/pdf/:noteId\nPOST /api/export/zip\nPOST /api/export/report\nGET /api/export/status/:jobId\nGET /api/events/exports (SSE)', 'signature-audit-service, file-service, api-gateway'],
  [13, '노트-인벤토리 연결 관리', 'GET/POST/DELETE /api/notes/:id/links', 'eln-service'],
  [14, '인벤토리 항목 관리', 'GET/POST/PUT/DELETE /api/inventory/items\nGET /api/inventory/items/barcode/:barcode', 'inventory-service'],
  [15, '수량 입출고 및 이력', 'POST /api/inventory/items/:id/quantity\nGET /api/inventory/items/:id/history', 'inventory-service'],
  [16, '재고 경고 (부족/만료)', 'GET /api/inventory/alerts/expiring\nGET /api/inventory/alerts/low-stock', 'inventory-service'],
  [17, '장비/회의실 예약', 'GET/POST /api/scheduler/bookings\nGET /api/scheduler/calendar\nPOST /api/scheduler/bookings/:id/cancel', 'scheduler-service'],
  [18, '예약 승인/반려/완료', 'POST /api/scheduler/bookings/:id/approve\nPOST /api/scheduler/bookings/:id/reject\nPOST /api/scheduler/bookings/:id/complete', 'scheduler-service'],
  [19, '통합 검색', 'GET /api/search?q=...\nGET /api/search/suggest', 'search-service'],
  [20, '검색 이력 및 즐겨찾기', 'GET/POST/DELETE /api/search/history\nGET/POST/DELETE /api/search/keyword-favorites\nGET/POST/DELETE /api/search/favorites', 'search-service'],
  [21, '대시보드 통계', 'GET /api/dashboard/personal\nGET /api/dashboard/team/:teamId\nGET /api/dashboard/org', 'api-gateway (내부 집계)'],
  [22, '감사로그 조회', 'GET /api/audit\nGET /api/audit/actions\nGET /api/audit/:id', 'signature-audit-service'],
  [23, '실시간 알림', 'GET /api/notifications\nGET /api/notifications/unread-count\nPATCH /api/notifications/read-all\nPATCH /api/notifications/:id/read\nGET /api/events/notifications (SSE)', 'signature-audit-service, api-gateway'],
];
const ws2 = XLSX.utils.aoa_to_sheet(apiMap);
ws2['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 60 }, { wch: 40 }];
XLSX.utils.book_append_sheet(wb, ws2, '기능-API 매핑');

// Sheet 3: 기능-권한 매핑
const permMap = [
  ['No', '기능명명', '필요 권한', 'Admin', 'Reviewer', 'Researcher', 'Viewer', '비고'],
  [1, '로그인 및 세션 관리', '-', 'O', 'O', 'O', 'O', '비인증 접근 가능'],
  [2, '회원가입 및 초기 설정', '-', 'O', 'O', 'O', 'O', '비인증 접근 가능'],
  [3, '사용자/팀/조직 관리', 'Admin role', 'O', 'X', 'X', 'X', 'Admin 전용'],
  [4, '연구노트 작성 및 편집', 'note:write, file:upload', 'O', 'O', 'O', 'X', 'viewer는 읽기만'],
  [5, '실시간 협업 편집', 'note:write', 'O', 'O', 'O', 'X', 'JWT 인증 필수'],
  [6, '연구노트 상태 전환', 'note:status', 'O', 'O', 'O', 'X', 'locked는 Reviewer+'],
  [7, '전자서명 및 잠금', 'note:sign', 'O', 'O', 'X', 'X', 'Researcher 서명 불가'],
  [8, '관리자 잠금 해제', 'Admin + note:unlock', 'O', 'X', 'X', 'X', 'Admin + 비밀번호'],
  [9, '프로토콜 템플릿 관리', 'template:read/write', 'O', 'O', 'O', 'X(읽기만)', ''],
  [10, '프로토콜 기반 노트 생성', 'note:write', 'O', 'O', 'O', 'X', ''],
  [11, '파일 업로드 및 다운로드', 'file:upload/read', 'O', 'O', 'O', 'X(다운만)', ''],
  [12, 'PDF/ZIP 내보내기', 'export:pdf', 'O', 'O', 'O', 'X', ''],
  [13, '노트-인벤토리 연결', 'note:write', 'O', 'O', 'O', 'X', ''],
  [14, '인벤토리 항목 관리', 'inventory:read/write', 'O', 'O', 'O', 'X(읽기만)', ''],
  [15, '수량 입출고 및 이력', 'inventory:write', 'O', 'O', 'O', 'X', ''],
  [16, '재고 경고', 'inventory:read', 'O', 'O', 'O', 'O', '대시보드에서 모두 조회'],
  [17, '장비/회의실 예약', 'scheduler:read/write', 'O', 'O', 'O', 'X(조회만)', ''],
  [18, '예약 승인/반려/완료', 'Admin or 자원 소유자', 'O', 'O', 'X', 'X', ''],
  [19, '통합 검색', '-', 'O', 'O', 'O', 'O', '로그인 필수'],
  [20, '검색 이력 및 즐겨찾기', '-', 'O', 'O', 'O', 'O', '로그인 필수'],
  [21, '대시보드 통계', '-', 'O', 'O', 'O', 'O', '조직/팀은 Admin/Leader만'],
  [22, '감사로그 조회', 'audit:read', 'O', 'O', 'O', 'X', ''],
  [23, '실시간 알림', '-', 'O', 'O', 'O', 'O', '로그인 필수'],
];
const ws3 = XLSX.utils.aoa_to_sheet(permMap);
ws3['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 24 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 6 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wb, ws3, '기능-권한 매핑');

XLSX.writeFile(wb, 'docs/LabNote_ELN_기능명세서_가이드양식.xlsx');
console.log('Created: docs/LabNote_ELN_기능명세서_가이드양식.xlsx');
console.log('Total features:', features.length);
console.log('Sheets: 기능명세서 (가이드 양식), 기능-API 매핑, 기능-권한 매핑');
