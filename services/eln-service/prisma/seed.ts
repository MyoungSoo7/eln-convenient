/**
 * eln-service 시드 데이터
 * IT연구소 R&D팀 — 공통 코드 + 템플릿 + 샘플 노트
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const orgId = 'org-default-001';

const TEMPLATE_CATEGORIES = [
  { value: 'ELN', sortOrder: 0 },
  { value: 'CODE-GUARD', sortOrder: 1 },
  { value: 'RAG', sortOrder: 2 },
  { value: 'Crawler', sortOrder: 3 },
  { value: 'ChatBot', sortOrder: 4 },
];

const INVENTORY_ITEM_TYPES = [
  { value: 'server', label: '서버', sortOrder: 0 },
  { value: 'equipment', label: '장비', sortOrder: 1 },
  { value: 'license', label: '라이선스', sortOrder: 2 },
  { value: 'infrastructure', label: '인프라', sortOrder: 3 },
  { value: 'other', label: '기타', sortOrder: 99 },
];

// IT R&D 템플릿
const TEMPLATES = [
  {
    title: 'API 설계서 템플릿',
    description: 'RESTful API 엔드포인트 설계 시 사용하는 표준 템플릿',
    category: 'ELN',
    content: `## 개요\n\n## 엔드포인트 목록\n\n| Method | Path | 설명 |\n|--------|------|------|\n| GET | /api/... | ... |\n\n## 요청/응답 스키마\n\n## 인증/권한\n\n## 에러 코드`,
    tags: ['API', '설계', 'REST'],
    isPublic: true,
  },
  {
    title: '장애 보고서 템플릿',
    description: '서비스 장애 발생 시 원인 분석 및 재발 방지 보고서',
    category: 'ELN',
    content: `## 장애 개요\n- 발생 일시:\n- 영향 범위:\n- 심각도: P1/P2/P3\n\n## 타임라인\n\n## 원인 분석\n\n### 근본 원인\n\n### 기여 요인\n\n## 조치 사항\n\n## 재발 방지 대책`,
    tags: ['장애', '보고서', 'postmortem'],
    isPublic: true,
  },
  {
    title: '코드 리뷰 체크리스트',
    description: 'PR 코드 리뷰 시 확인할 항목 체크리스트',
    category: 'CODE-GUARD',
    content: `## 기능 확인\n- [ ] 요구사항 충족 여부\n- [ ] 엣지 케이스 처리\n\n## 코드 품질\n- [ ] 네이밍 컨벤션\n- [ ] 중복 코드\n- [ ] 에러 처리\n\n## 보안\n- [ ] 입력 검증\n- [ ] 인증/권한 확인\n- [ ] SQL 인젝션/XSS\n\n## 성능\n- [ ] N+1 쿼리\n- [ ] 불필요한 연산\n\n## 테스트\n- [ ] 단위 테스트\n- [ ] 통합 테스트`,
    tags: ['코드리뷰', '체크리스트', '품질'],
    isPublic: true,
  },
  {
    title: 'RAG 파이프라인 실험 기록',
    description: 'RAG 시스템 구성 변경 시 실험 결과 기록 템플릿',
    category: 'RAG',
    content: `## 실험 목표\n\n## 변경 사항\n- 임베딩 모델:\n- 청크 크기:\n- 검색 전략:\n- Top-K:\n\n## 평가 데이터셋\n\n## 결과\n| 지표 | 이전 | 이후 |\n|------|------|------|\n| Recall@5 | | |\n| MRR | | |\n| 응답 정확도 | | |\n\n## 결론`,
    tags: ['RAG', '실험', 'LLM'],
    isPublic: true,
  },
  {
    title: '크롤러 설정 문서',
    description: '웹 크롤러 대상 사이트 설정 및 파싱 규칙 문서',
    category: 'Crawler',
    content: `## 대상 사이트\n- URL:\n- 주기:\n\n## 크롤링 규칙\n- robots.txt 준수 여부:\n- Rate limit:\n- User-Agent:\n\n## 파싱 규칙\n\n## 저장 형식\n\n## 모니터링`,
    tags: ['크롤러', '설정', '데이터수집'],
    isPublic: true,
  },
  {
    title: '챗봇 프롬프트 버전 관리',
    description: '챗봇 시스템/유저 프롬프트 변경 이력 기록',
    category: 'ChatBot',
    content: `## 프롬프트 버전\n- 버전:\n- 변경일:\n\n## 시스템 프롬프트\n\n## 유저 프롬프트 템플릿\n\n## 변경 사유\n\n## A/B 테스트 결과\n| 지표 | 이전 | 이후 |\n|------|------|------|\n| 응답 만족도 | | |\n| 할루시네이션률 | | |`,
    tags: ['챗봇', '프롬프트', 'LLM'],
    isPublic: true,
  },
];

// IT R&D 샘플 노트
const NOTES = [
  {
    title: 'ELN 시스템 아키텍처 설계',
    content: `## 개요\n전자연구노트(ELN) 시스템의 MSA 아키텍처를 설계한다.\n\n## 서비스 분리 기준\n- auth-service: 인증/권한\n- eln-service: 노트 CRUD\n- signature-audit-service: 전자서명/감사\n\n## 기술 스택\n- Fastify + Prisma + PostgreSQL\n- Redis (캐시/이벤트)\n- MinIO (파일 저장)\n\n## 결정 사항\n게이트웨이 패턴으로 JWT 검증을 중앙 처리한다.`,
    tags: ['아키텍처', 'MSA', '설계'],
    status: 'signed',
    authorId: 'user-researcher-001',
  },
  {
    title: 'RAG 임베딩 모델 성능 비교 실험',
    content: `## 실험 목표\n한국어 문서 검색을 위한 임베딩 모델 비교\n\n## 비교 대상\n1. multilingual-e5-large\n2. ko-sroberta-multitask\n3. bge-m3\n\n## 평가 데이터셋\n사내 기술 문서 500건, 질문 100건\n\n## 결과\n| 모델 | Recall@5 | MRR | 속도(ms) |\n|------|----------|-----|----------|\n| e5-large | 0.87 | 0.72 | 45 |\n| ko-sroberta | 0.82 | 0.68 | 32 |\n| bge-m3 | 0.91 | 0.78 | 52 |\n\n## 결론\nbge-m3이 정확도 최고, 속도 허용 범위 내. 채택.`,
    tags: ['RAG', '임베딩', '실험', 'LLM'],
    status: 'in_progress',
    authorId: 'user-researcher-001',
  },
  {
    title: 'Redis Stream 이벤트 처리 장애 보고서',
    content: `## 장애 개요\n- 발생 일시: 2026-03-15 14:30\n- 영향 범위: 전자서명 후 노트 상태 전환 지연\n- 심각도: P2\n\n## 타임라인\n- 14:30 — 서명 완료 후 노트 상태 미전환 감지\n- 14:35 — eventConsumer 로그 확인, Redis 연결 끊김\n- 14:40 — Redis 컨테이너 OOM 확인\n- 14:45 — Redis 메모리 상한 조정 후 재시작\n- 14:50 — pending 메시지 자동 복구 확인\n\n## 근본 원인\nRedis maxmemory 미설정으로 호스트 메모리 한도 도달\n\n## 조치 사항\nmaxmemory 2gb + eviction policy 설정\n\n## 재발 방지\n메모리 사용량 모니터링 알림 추가`,
    tags: ['장애', 'Redis', 'postmortem'],
    status: 'signed',
    authorId: 'user-researcher-002',
  },
  {
    title: 'Puppeteer PDF 변환 성능 최적화',
    content: `## 문제\n대용량 노트(이미지 10+장) PDF 변환 시 타임아웃 발생\n\n## 분석\n- Chromium 페이지 렌더링에 평균 8초\n- 이미지 Base64 인코딩 오버헤드\n\n## 개선 방안\n1. 이미지 lazy loading 제거 (print 모드)\n2. Puppeteer pool 도입 (브라우저 재사용)\n3. 동시 변환 제한 (BullMQ concurrency: 2)\n\n## 결과\n변환 시간 8s → 2.5s (68% 개선)`,
    tags: ['성능', 'PDF', 'Puppeteer'],
    status: 'in_progress',
    authorId: 'user-researcher-002',
  },
  {
    title: 'OpenSearch 한국어 분석기 설정',
    content: `## 목표\n통합 검색의 한국어 검색 품질 개선\n\n## 현재 문제\n"실험" 검색 시 "실험하다", "실험적" 미검색\n\n## 적용 분석기\n- nori_tokenizer + nori_part_of_speech 필터\n- decompound_mode: mixed\n\n## 인덱스 매핑\ntitle: nori 분석기 + ngram\ncontent: nori 분석기\ntags: keyword\n\n## 테스트 결과\n검색 재현율 65% → 89%`,
    tags: ['검색', 'OpenSearch', '한국어', 'nori'],
    status: 'draft',
    authorId: 'user-researcher-001',
  },
  {
    title: 'JWT 토큰 갱신 플로우 설계',
    content: `## 요구사항\n- Access Token 15분, Refresh Token 8시간\n- 자동 갱신 (사용자 무인지)\n- 토큰 탈취 대응\n\n## 설계\n1. AT 만료 → RT로 갱신 (HttpOnly 쿠키)\n2. RT 갱신 시 Redis 블랙리스트 확인\n3. 권한 변경 시 기존 토큰 즉시 무효화\n\n## 보안 고려\n- RT는 HttpOnly + Secure + SameSite=Strict\n- 블랙리스트 TTL = 토큰 잔여 만료시간`,
    tags: ['인증', 'JWT', '보안', '설계'],
    status: 'signed',
    authorId: 'user-admin-001',
  },
];

async function main() {
  // ── 공통 코드 시드 ──
  await prisma.code.deleteMany({ where: { orgId, group: 'TEMPLATE_CATEGORY' } });
  await prisma.code.deleteMany({ where: { orgId, group: 'INVENTORY_ITEM_TYPE' } });

  for (const cat of TEMPLATE_CATEGORIES) {
    await prisma.code.upsert({
      where: { orgId_group_value: { orgId, group: 'TEMPLATE_CATEGORY', value: cat.value } },
      update: { sortOrder: cat.sortOrder },
      create: { id: uuidv4(), group: 'TEMPLATE_CATEGORY', value: cat.value, sortOrder: cat.sortOrder, orgId },
    });
  }
  console.log(`[seed] TEMPLATE_CATEGORY ${TEMPLATE_CATEGORIES.length}건 완료`);

  for (const item of INVENTORY_ITEM_TYPES) {
    await prisma.code.upsert({
      where: { orgId_group_value: { orgId, group: 'INVENTORY_ITEM_TYPE', value: item.value } },
      update: { label: item.label, sortOrder: item.sortOrder },
      create: { id: uuidv4(), group: 'INVENTORY_ITEM_TYPE', value: item.value, label: item.label, sortOrder: item.sortOrder, orgId },
    });
  }
  console.log(`[seed] INVENTORY_ITEM_TYPE ${INVENTORY_ITEM_TYPES.length}건 완료`);

  // ── 템플릿 시드 ──
  await prisma.template.deleteMany({});
  for (const tmpl of TEMPLATES) {
    await prisma.template.create({
      data: {
        id: uuidv4(),
        orgId,
        title: tmpl.title,
        description: tmpl.description,
        content: tmpl.content,
        category: tmpl.category,
        tags: tmpl.tags,
        createdBy: 'user-admin-001',
        isPublic: tmpl.isPublic,
      },
    });
  }
  console.log(`[seed] 템플릿 ${TEMPLATES.length}건 생성 완료`);

  // ── 노트 시드 ──
  await prisma.noteStatusHistory.deleteMany({});
  await prisma.noteRevision.deleteMany({});
  await prisma.noteLink.deleteMany({});
  await prisma.attachment.deleteMany({});
  await prisma.note.deleteMany({});

  for (const note of NOTES) {
    const noteId = uuidv4();
    await prisma.note.create({
      data: {
        id: noteId,
        title: note.title,
        content: note.content,
        type: 'note',
        status: note.status as any,
        tags: note.tags,
        authorId: note.authorId,
        orgId,
        teamId: 'team-default-001',
      },
    });
    await prisma.noteRevision.create({
      data: {
        id: uuidv4(),
        noteId,
        revision: 1,
        content: note.content,
        changedBy: note.authorId,
        changeSummary: '노트 생성',
      },
    });
    await prisma.noteStatusHistory.create({
      data: {
        id: uuidv4(),
        noteId,
        fromStatus: 'draft',
        toStatus: note.status as any,
        changedBy: note.authorId,
      },
    });
  }
  console.log(`[seed] 노트 ${NOTES.length}건 + 리비전 + 상태이력 생성 완료`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
