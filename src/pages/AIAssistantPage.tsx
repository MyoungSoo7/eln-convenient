import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Sparkles, FileText, ArrowRight, CheckCircle2, Loader2, Database } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { recommendTemplate, generateDraft, getIndexStatus } from "@/api/ai";
import type { TemplateRecommendation } from "@/api/ai";

export default function AIAssistantPage() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<TemplateRecommendation[]>([]);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const { data: indexStatus, isError: indexError } = useQuery({
    queryKey: ['ai', 'indexStatus'],
    queryFn: async () => {
      const res = await getIndexStatus();
      if (!res.ok) throw new Error(res.error ?? '조회 실패');
      return res.data;
    },
    staleTime: 60_000,
  });

  const handleRecommend = async () => {
    if (!topic.trim()) return;
    setRecommending(true);
    setRecommendError(null);
    const res = await recommendTemplate(topic);
    setRecommending(false);
    if (!res.ok || !res.data) {
      setRecommendError(res.error ?? '템플릿 추천에 실패했습니다.');
      return;
    }
    setRecommendations(res.data);
    setStep(2);
  };

  const handleGenerate = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setGenerating(true);
    setGenerateError(null);
    setStep(3);
    const res = await generateDraft(templateId, topic);
    setGenerating(false);
    if (!res.ok || !res.data) {
      setGenerateError(res.error ?? '초안 생성에 실패했습니다.');
      return;
    }
    const text = res.data.sections
      .map((s) => `## ${s.title}\n${s.content}`)
      .join('\n\n');
    setDraft(text);
  };

  const resetWizard = () => {
    setStep(1);
    setTopic("");
    setDraft("");
    setRecommendations([]);
    setRecommendError(null);
    setSelectedTemplateId(null);
    setGenerateError(null);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-secondary" /> AI 어시스턴트
          <HelpTooltip text="AI가 실험 주제에 맞는 템플릿을 추천하고, 연구노트 초안을 자동 생성합니다. 3단계 위자드를 따라 진행하세요." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">AI 기반 템플릿 추천 및 초안 작성</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3 max-w-lg">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step >= s ? 'gradient-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            <span className={`text-xs ${step >= s ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {s === 1 ? '주제 입력' : s === 2 ? '템플릿 추천' : '초안 생성'}
            </span>
            {s < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card className="shadow-card max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              실험 주제를 입력하세요
              <HelpTooltip text="수행하려는 실험의 키워드나 주제를 입력하면, AI가 관련 템플릿을 검색하여 추천합니다." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="예: CRISPR-Cas9 유전자 편집, Western Blot 분석..." value={topic} onChange={(e) => setTopic(e.target.value)} className="h-12" />
            <Button onClick={handleRecommend} disabled={!topic.trim() || recommending} className="gradient-primary text-primary-foreground gap-2">
              <Sparkles className="h-4 w-4" /> 템플릿 추천받기
            </Button>
            {recommending && (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>템플릿을 추천받는 중...</span>
              </div>
            )}
            {recommendError && (
              <p className="text-sm text-destructive py-2">{recommendError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4 max-w-2xl">
          <Card className="shadow-card bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <p className="text-sm"><span className="font-medium">입력 주제:</span> {topic}</p>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-xs mt-1 text-primary">수정</Button>
            </CardContent>
          </Card>

          <h3 className="font-medium flex items-center gap-2">
            추천 템플릿 (Top 3)
            <HelpTooltip text="입력한 주제와 가장 유사한 프로토콜 템플릿을 AI가 선별했습니다. 클릭하면 해당 템플릿 기반으로 초안이 생성됩니다." />
          </h3>
          {recommending && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>템플릿을 추천받는 중...</span>
            </div>
          )}
          {recommendError && (
            <p className="text-sm text-destructive py-2">{recommendError}</p>
          )}
          {recommendations.map((t) => (
            <Card key={t.templateId} className="shadow-card hover:shadow-elevated transition-all cursor-pointer group"
              onClick={() => handleGenerate(t.templateId)}>
              <CardContent className="p-4 flex items-start justify-between">
                <div>
                  <h4 className="font-medium group-hover:text-primary transition-colors">{t.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{t.reason}</p>
                </div>
                <Badge className="gradient-primary text-primary-foreground text-[10px]">
                  일치 {Math.round(t.score * 100)}%
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4 max-w-3xl">
          {generating ? (
            <Card className="shadow-card">
              <CardContent className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm mt-4">초안을 생성하고 있습니다...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {generateError && !generating && (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">{generateError}</p>
                  <Button variant="outline" onClick={() => { setStep(2); setGenerateError(null); }}>
                    템플릿 다시 선택
                  </Button>
                </div>
              )}
              {!generateError && (
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-secondary" /> 생성된 초안
                      <HelpTooltip text="AI가 생성한 연구노트 초안입니다. 내용을 직접 수정한 뒤, 새 노트로 생성하거나 기존 노트에 삽입할 수 있습니다." />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[400px] font-mono text-sm border-0 focus-visible:ring-0" />
                  </CardContent>
                </Card>
              )}
              <div className="flex gap-3">
                <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => toast({ title: "새 노트 생성", description: "초안이 새 연구노트로 생성되었습니다." })}>
                  <FileText className="h-4 w-4" /> 새 노트로 생성
                </Button>
                <Button variant="outline" onClick={() => toast({ title: "삽입 완료", description: "현재 노트에 초안이 삽입되었습니다." })}>
                  기존 노트에 삽입
                </Button>
                <Button variant="ghost" onClick={resetWizard}>처음부터 다시</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Vector Indexing Status */}
      <Card className="shadow-card max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" /> 벡터 인덱싱 상태
            <HelpTooltip text="AI 추천의 정확도를 높이기 위해 연구노트, 프로토콜, 논문을 벡터 DB에 인덱싱합니다. 완료율이 높을수록 더 정확한 추천이 가능합니다." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">전체 인덱싱</span>
              {indexError ? (
                <Badge variant="secondary" className="text-[10px] text-destructive">조회 실패</Badge>
              ) : !indexStatus ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {indexStatus.indexedDocuments}/{indexStatus.totalDocuments}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
