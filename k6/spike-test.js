import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';
import { BASE_URL, TEST_USERS, DEFAULT_THRESHOLDS } from './config.js';

// 스파이크 테스트: 갑자기 트래픽이 폭증했을 때 서버가 버티는지 확인
// 예) 전체 공지 후 동시 접속 폭증, 마감 직전 몰림

const failRate = new Rate('failed_requests');

export const options = {
  stages: [
    { duration: '30s', target: 10 },     // 정상 상태
    { duration: '10s', target: 1000 },    // 급격한 폭증
    { duration: '1m', target: 1000 },     // 폭증 유지
    { duration: '10s', target: 10 },      // 급격한 감소
    { duration: '30s', target: 10 },      // 회복 확인
    { duration: '10s', target: 0 },       // 종료
  ],
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    http_req_duration: ['p(95)<2000'],    // 스파이크 시 2초까지 허용
    http_req_failed: ['rate<0.10'],       // 실패율 10% 미만
  },
};

let token = null;

function login() {
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      if (body.ok && body.data && body.data.token) {
        token = body.data.token;
        return true;
      }
    } catch {}
  }
  failRate.add(1);
  return false;
}

function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

export default function () {
  if (!token) {
    if (!login()) return;
    sleep(0.5);
  }

  // 스파이크 시 가장 빈번한 패턴: 대시보드 + 노트 조회
  group('dashboard', () => {
    const res = http.get(`${BASE_URL}/api/dashboard/personal`, authHeaders());
    const ok = check(res, { 'dashboard 200': (r) => r.status === 200 });
    if (!ok) failRate.add(1);
  });

  sleep(0.5);

  group('notes', () => {
    const res = http.get(`${BASE_URL}/api/notes?page=1&limit=20`, authHeaders());
    const ok = check(res, { 'notes 200': (r) => r.status === 200 });
    if (!ok) failRate.add(1);
  });

  sleep(Math.random() * 1 + 0.5);
}
