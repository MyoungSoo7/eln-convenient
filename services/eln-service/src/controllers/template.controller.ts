import { FastifyRequest, FastifyReply } from 'fastify';

const DUMMY_TEMPLATES = [
  { id: 'tpl-001', name: '일반 실험 노트', category: '기본', sections: ['목적', '재료', '방법', '결과', '고찰'] },
  { id: 'tpl-002', name: 'PCR 실험', category: '분자생물학', sections: ['목적', '시약/프라이머', 'PCR 조건', '전기영동 결과', '고찰'] },
  { id: 'tpl-003', name: '세포배양', category: '세포생물학', sections: ['목적', '세포주', '배양조건', '계대기록', '결과'] },
];

export async function listTemplates(req: FastifyRequest, reply: FastifyReply) {
  return { ok: true, data: DUMMY_TEMPLATES };
}

export async function createTemplate(req: FastifyRequest, reply: FastifyReply) {
  reply.code(201);
  return { ok: true, data: { id: 'tpl-new', message: '템플릿 생성 완료' } };
}

export async function getTemplate(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const tpl = DUMMY_TEMPLATES.find((t) => t.id === req.params.id) || DUMMY_TEMPLATES[0];
  return { ok: true, data: tpl };
}

export async function recommendTemplates(req: FastifyRequest, reply: FastifyReply) {
  return { ok: true, data: DUMMY_TEMPLATES.slice(0, 3) };
}
