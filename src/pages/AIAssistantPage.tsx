import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Sparkles, FileText, ArrowRight, CheckCircle2, Loader2, Database } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const templateSuggestions = [
  { id: 1, title: "CRISPR 유전자 편집 프로토콜", match: "95%", desc: "Cas9 기반 유전자 녹아웃 실험을 위한 표준 프로토콜" },
  { id: 2, title: "세포배양 기본 프로토콜", match: "87%", desc: "부착성 세포주의 일반적인 배양 및 계대 절차" },
  { id: 3, title: "웨스턴 블롯 분석", match: "72%", desc: "단백질 발현 분석을 위한 WB 프로토콜" },
];

export default function AIAssistantPage() {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState("");

  const handleRecommend = () => {
    if (!topic.trim()) return;
    setStep(2);
  };

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setDraft(`## ${topic} 실험 초안\n\n### 목적\n${topic}에 대한 실험을 수행하여 결과를 분석한다.\n\n### 재료\n- 시약 A (제조사: XXX)\n- 시약 B (제조사: YYY)\n- 세포주: HEK293\n\n### 방법\n1. 세포 준비 (배양 조건: 37°C, 5% CO2)\n2. 처리 및 배양\n3. 분석 수행\n\n### 예상 결과\n- 처리군과 대조군의 차이를 비교\n- 통계적 유의성 확인 (p < 0.05)\n\n### 참고문헌\n- [AI 추천] 관련 논문 검색 중...`);
      setGenerating(false);
      setStep(3);
    }, 2000);
  };

  const resetWizard = () => {
    setStep(1);
    setTopic("");
    setDraft("");
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-secondary" /> AI 어시스턴트
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
            <CardTitle className="text-base">실험 주제를 입력하세요</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="예: CRISPR-Cas9 유전자 편집, Western Blot 분석..." value={topic} onChange={(e) => setTopic(e.target.value)} className="h-12" />
            <Button onClick={handleRecommend} disabled={!topic.trim()} className="gradient-primary text-primary-foreground gap-2">
              <Sparkles className="h-4 w-4" /> 템플릿 추천받기
            </Button>
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

          <h3 className="font-medium">추천 템플릿 (Top 3)</h3>
          {templateSuggestions.map((t) => (
            <Card key={t.id} className="shadow-card hover:shadow-elevated transition-all cursor-pointer group" onClick={handleGenerate}>
              <CardContent className="p-4 flex items-start justify-between">
                <div>
                  <h4 className="font-medium group-hover:text-primary transition-colors">{t.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                </div>
                <Badge className="gradient-primary text-primary-foreground text-[10px]">일치 {t.match}</Badge>
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
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-secondary" /> 생성된 초안</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[400px] font-mono text-sm border-0 focus-visible:ring-0" />
                </CardContent>
              </Card>
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
          <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" /> 벡터 인덱싱 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">연구노트 인덱싱</span>
              <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">완료 (24/24)</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">프로토콜 인덱싱</span>
              <Badge variant="secondary" className="bg-success/10 text-success text-[10px]">완료 (15/15)</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">외부 논문 색인</span>
              <Badge variant="secondary" className="bg-warning/10 text-warning text-[10px]">진행 중 (1,204/5,000)</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
