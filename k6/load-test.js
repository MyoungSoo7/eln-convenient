import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, TEST_USERS, LOAD_PROFILES, DEFAULT_THRESHOLDS } from './config.js';

// 커스텀 메트릭
const loginDuration = new Trend('login_duration');
const notesListDuration = new Trend('notes_list_duration');
const dashboardDuration = new Trend('dashboard_duration');
const failRate = new Rate('failed_requests');

// 부하 프로필 선택: k6 run --env PROFILE=small|medium|large load-test.js
const profile = __ENV.PROFILE || 'small';

export const options = {
  stages: LOAD_PROFILES[profile],
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    login_duration: ['p(95)<800'],
    notes_list_duration: ['p(95)<600'],
    dashboard_duration: ['p(95)<700'],
  },
};

// VU별 토큰 저장
let token = null;

// 로그인하여 JWT 토큰 획득
function login() {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  loginDuration.add(res.timings.duration);

  const success = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.ok && body.data && body.data.token;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    const body = JSON.parse(res.body);
    token = body.data.token;
  } else {
    failRate.add(1);
  }

  return success;
}

// 인증 헤더
function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

// === 시나리오별 함수 ===

function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'health: status 200': (r) => r.status === 200 });
}

function getNotes() {
  const res = http.get(`${BASE_URL}/api/notes?page=1&limit=20`, authHeaders());
  notesListDuration.add(res.timings.duration);
  const ok = check(res, {
    'notes: status 200': (r) => r.status === 200,
    'notes: has data': (r) => {
      try { return JSON.parse(r.body).ok === true; } catch { return false; }
    },
  });
  if (!ok) failRate.add(1);
}

function getTemplates() {
  const res = http.get(`${BASE_URL}/api/templates?page=1&limit=10`, authHeaders());
  check(res, { 'templates: status 200': (r) => r.status === 200 || r.status === 404 });
}

function getDashboard() {
  const res = http.get(`${BASE_URL}/api/dashboard/personal`, authHeaders());
  dashboardDuration.add(res.timings.duration);
  const ok = check(res, {
    'dashboard: status 200': (r) => r.status === 200,
  });
  if (!ok) failRate.add(1);
}

function getMyProfile() {
  const res = http.get(`${BASE_URL}/api/auth/me`, authHeaders());
  check(res, { 'profile: status 200': (r) => r.status === 200 });
}

function searchNotes() {
  const keywords = ['실험', '프로토콜', '분석', '결과', '시료'];
  const q = keywords[Math.floor(Math.random() * keywords.length)];
  const res = http.get(`${BASE_URL}/api/search?q=${encodeURIComponent(q)}&page=1&limit=10`, authHeaders());
  check(res, { 'search: status 2xx': (r) => r.status >= 200 && r.status < 300 });
}

function getInventory() {
  const res = http.get(`${BASE_URL}/api/inventory?page=1&limit=20`, authHeaders());
  check(res, { 'inventory: status 2xx': (r) => r.status >= 200 && r.status < 300 });
}

function getScheduler() {
  const res = http.get(`${BASE_URL}/api/scheduler/resources?page=1&limit=10`, authHeaders());
  check(res, { 'scheduler: status 2xx': (r) => r.status >= 200 && r.status < 300 });
}

// === 메인 시나리오 ===
// 실제 사용 패턴을 시뮬레이션: 로그인 → 대시보드 → 노트 목록 → 검색 → 기타

export default function () {
  // 1. 토큰이 없으면 로그인
  if (!token) {
    group('01_login', () => {
      if (!login()) return;
    });
    sleep(1);
  }

  if (!token) return; // 로그인 실패 시 스킵

  // 2. 일반 사용 패턴 (가중치 기반 랜덤)
  const rand = Math.random();

  if (rand < 0.05) {
    // 5% — 헬스체크
    group('02_health', healthCheck);
  } else if (rand < 0.25) {
    // 20% — 대시보드 조회 (가장 빈번)
    group('03_dashboard', getDashboard);
  } else if (rand < 0.50) {
    // 25% — 노트 목록 조회
    group('04_notes', getNotes);
  } else if (rand < 0.65) {
    // 15% — 검색
    group('05_search', searchNotes);
  } else if (rand < 0.75) {
    // 10% — 프로필 조회
    group('06_profile', getMyProfile);
  } else if (rand < 0.85) {
    // 10% — 템플릿 조회
    group('07_templates', getTemplates);
  } else if (rand < 0.93) {
    // 8% — 인벤토리
    group('08_inventory', getInventory);
  } else {
    // 7% — 스케줄러
    group('09_scheduler', getScheduler);
  }

  // 사용자 생각 시간 (1~3초)
  sleep(Math.random() * 2 + 1);
}
