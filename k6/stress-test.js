import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { BASE_URL, TEST_USERS } from './config.js';

// 스트레스 테스트: 한계점을 찾을 때까지 점진적으로 부하 증가
// 어느 지점에서 응답시간이 급격히 늘어나거나 에러가 발생하는지 확인

const failRate = new Rate('failed_requests');
const errorCount = new Counter('errors');

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 300 },
    { duration: '2m', target: 500 },
    { duration: '2m', target: 800 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 1500 },
    { duration: '2m', target: 2000 },   // 여기서부터 한계 탐색
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],   // 스트레스 시 3초까지 허용
    failed_requests: ['rate<0.20'],       // 20% 넘으면 한계 도달로 판단
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
  errorCount.add(1);
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

function makeRequest(name, method, url, body) {
  let res;
  if (method === 'GET') {
    res = http.get(url, authHeaders());
  } else {
    res = http.post(url, JSON.stringify(body), authHeaders());
  }

  const ok = check(res, {
    [`${name}: not 5xx`]: (r) => r.status < 500,
  });

  if (!ok) {
    failRate.add(1);
    errorCount.add(1);
  }

  return res;
}

export default function () {
  if (!token) {
    if (!login()) return;
    sleep(0.5);
  }

  // 혼합 트래픽: 읽기 80%, 쓰기 20%
  const rand = Math.random();

  if (rand < 0.30) {
    makeRequest('notes', 'GET', `${BASE_URL}/api/notes?page=1&limit=20`);
  } else if (rand < 0.50) {
    makeRequest('dashboard', 'GET', `${BASE_URL}/api/dashboard/personal`);
  } else if (rand < 0.65) {
    const keywords = ['실험', '프로토콜', '분석', '결과', '시료'];
    const q = keywords[Math.floor(Math.random() * keywords.length)];
    makeRequest('search', 'GET', `${BASE_URL}/api/search?q=${encodeURIComponent(q)}&page=1&limit=10`);
  } else if (rand < 0.80) {
    makeRequest('profile', 'GET', `${BASE_URL}/api/auth/me`);
  } else {
    // 쓰기 부하: 노트 생성 시도
    makeRequest('create_note', 'POST', `${BASE_URL}/api/notes`, {
      title: `스트레스 테스트 노트 ${Date.now()}`,
      content: '부하 테스트에서 생성된 노트입니다.',
      type: 'note',
    });
  }

  sleep(Math.random() * 1.5 + 0.5);
}
