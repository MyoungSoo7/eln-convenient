import { embed } from './embedding.service';
import { searchSimilar } from './qdrant.service';
import { chatClient, CHAT_MODEL } from '../providers/llm';

// 기존 API 호환: rag.service 내부에서만 openai 참조
const openai = chatClient;

export interface RagResult {
  answer: string;
  sources: { documentId: string; title: string; relevance: number }[];
  generatedAt: string;
}

/** RAG 질의: 벡터 검색 → 컨텍스트 구성 → LLM 생성 */
export async function ragQuery(
  question: string,
  opts: { context?: string; limit?: number } = {}
): Promise<RagResult> {
  const topK = opts.limit ?? 5;

  // 1) 질문 임베딩
  const queryVec = await embed(question);

  // 2) Qdrant 유사도 검색
  const hits = await searchSimilar(queryVec, topK);

  // 3) 컨텍스트 구성 (사용자 제공 컨텍스트 + 검색 결과)
  const retrievedContext = hits
    .map((h, i) => `[${i + 1}] ${h.title}\n${h.contentChunk}`)
    .join('\n\n---\n\n');

  const fullContext = opts.context
    ? `[현재 노트 컨텍스트]\n${opts.context}\n\n[관련 문서]\n${retrievedContext}`
    : retrievedContext;

  const sources = hits.map((h) => ({
    documentId: h.documentId,
    title: h.title,
    relevance: Math.round(h.score * 100) / 100,
  }));

  // 4) LLM 생성
  let answer: string;
  if (openai && hits.length > 0) {
    answer = await generateWithLLM(question, fullContext);
  } else if (openai && opts.context) {
    // 인덱싱된 문서 없어도 사용자 컨텍스트로 답변
    answer = await generateWithLLM(question, opts.context);
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
  topic: string,
  limit = 3
): Promise<{ templateId: string; title: string; score: number }[]> {
  const vec = await embed(topic);
  const hits = await searchSimilar(vec, limit);
  return hits.map((h) => ({ templateId: h.documentId, title: h.title, score: h.score }));
}

/** LLM 기반 초안 생성 */
export async function generateDraftWithLLM(
  topic: string,
  templateId: string,
  context?: string,
  keywords?: string[]
): Promise<string> {
  if (!openai) {
    return buildStaticDraft(topic, keywords);
  }

  const keywordStr = keywords?.length ? `\n주요 키워드: ${keywords.join(', ')}` : '';
  const contextStr = context ? `\n추가 컨텍스트: ${context}` : '';

  const systemPrompt = `당신은 실험실 연구 노트(ELN)의 AI 초안 작성 도우미입니다.
제공된 실험 주제와 정보를 바탕으로 전문적인 실험 노트 초안을 마크다운 형식으로 작성하세요.
구성: 목적 / 재료 및 시약 / 실험 방법 / 예상 결과 / 고찰 섹션을 포함하세요.
한국어로 작성하고, 과학적 표현을 사용하세요.`;

  const userMessage = `실험 주제: ${topic}
템플릿 ID: ${templateId}${keywordStr}${contextStr}

위 주제에 대한 실험 노트 초안을 작성해주세요.`;

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });

  return completion.choices[0]?.message?.content ?? buildStaticDraft(topic, keywords);
}

function buildStaticDraft(topic: string, keywords?: string[]): string {
  const keywordSection = keywords?.length
    ? `\n> 키워드: ${keywords.join(', ')}\n`
    : '';
  return `# ${topic}
${keywordSection}
## 목적
${topic}에 대한 실험을 수행하여 최적 조건을 확인한다.

## 재료 및 시약
- 시약 A
- 시약 B
- 장비: (해당 장비 입력)

## 실험 방법
1. 시료 준비
2. 반응 조건 설정
3. 결과 분석

## 예상 결과
(AI 생성 초안 — 실제 결과로 교체해주세요)

## 고찰
(실험 후 작성)

---
*이 초안은 AI가 생성한 기본 템플릿입니다. OPENAI_API_KEY 설정 시 더 정확한 초안을 생성합니다.*`;
}
