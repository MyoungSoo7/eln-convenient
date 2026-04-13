// k6 부하 테스트 공통 설정
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// 테스트용 계정 (시드 데이터 기준)
export const TEST_USERS = [
  { email: 'admin@labnote.com', password: 'admin123!' },
  { email: 'researcher@labnote.com', password: 'test123!' },
  { email: 'reviewer@labnote.com', password: 'test123!' },
];

// 부하 단계 프리셋
export const LOAD_PROFILES = {
  // 소규모: 100명
  small: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  // 중규모: 1,000명
  medium: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '3m', target: 1000 },
    { duration: '2m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  // 대규모: 5,000명 (머신 성능에 따라 조절)
  large: [
    { duration: '1m', target: 500 },
    { duration: '3m', target: 2000 },
    { duration: '3m', target: 5000 },
    { duration: '3m', target: 5000 },
    { duration: '1m', target: 0 },
  ],
};

// 성능 기준 (thresholds)
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95%ile < 500ms, 99%ile < 1s
  http_req_failed: ['rate<0.05'],                    // 실패율 5% 미만
  http_reqs: ['rate>10'],                            // 초당 10건 이상
};
