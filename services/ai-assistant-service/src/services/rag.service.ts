import OpenAI from 'openai';
import { embed, OPENAI_ENABLED } from './embedding.service';
import { searchSimilar } from './qdrant.service';

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

let openai: OpenAI | null = null;
if (OPENAI_ENABLED) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface RagResult {
  answer: string;
  sources: { documentId: string; title: string; relevance: number }[];
  generatedAt: string;
}

/** RAG 질의: 벡터 검색 → 컨텍스트 구성 → LLM 생성 */
export async function ragQuery(question: string): Promise<RagResult> {
  // 1) 질문 임베딩
  const queryVec = await embed(question);

  // 2) Qdrant 유사도 검색
  const hits = await searchSimilar(queryVec, 5);

  // 3) 컨텍스트 구성
  const context = hits
    .map((h, i) => `[${i + 1}] ${h.title}\n${h.contentChunk}`)
    .join('\n\n---\n\n');

  const sources = hits.map((h) => ({
    documentId: h.documentId,
    title: h.title,
    relevance: Math.round(h.score * 100) / 100,
  }));

  // 4) LLM 생성
  let answer: string;
  if (openai && hits.length > 0) {
    answer = await generateWithLLM(question, context);
  } else if (!openai) {
    answer = buildFallbackAnswer(question, hits);
  } else {
    answer = '관련 문서를 찾지 못했습니다. 먼저 연구 노트를 벡터 인덱싱해주세요 (POST /api/ai/index).';
  }

  return { answer, sources, generatedAt: new Date().toISOString() };
}

async function generateWithLLM(question: string, context: string): Promise<string> {
  const systemPrompt = `당신은 실험실 연구 노트 ELN 시스템의 AI 어시스턴트입니다.
아래에 제공된 연구 노트 컨텍스트를 기반으로 질문에 정확하고 도움이 되는 답변을 제공하세요.
컨텍스트에 없는 정보는 추측하지 마세요. 한국어로 답변하세요.

[컨텍스트]
${context}`;

  const completion = await openai!.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  return completion.choices[0]?.message?.content ?? '답변을 생성할 수 없습니다.';
}

function buildFallbackAnswer(
  question: string,
  hits: { documentId: string; title: string; contentChunk: string; score: number }[]
): string {
  if (hits.length === 0) {
    return `"${question}"에 대한 관련 문서를 찾지 못했습니다. POST /api/ai/index 로 문서를 먼저 인덱싱하세요.`;
  }
  const preview = hits[0].contentChunk.slice(0, 300);
  return `"${question}"에 대해 가장 관련성 높은 문서(유사도: ${hits[0].score.toFixed(2)}): "${hits[0].title}"\n\n${preview}...\n\n(OPENAI_API_KEY를 설정하면 LLM 기반 정확한 답변을 제공합니다.)`;
}

/** 주제 기반 템플릿 추천 (벡터 검색) */
export async function recommendByVector(
  topic: string
): Promise<{ templateId: string; title: string; score: number }[]> {
  const vec = await embed(topic);
  const hits = await searchSimilar(vec, 3);
  return hits.map((h) => ({ templateId: h.documentId, title: h.title, score: h.score }));
}
