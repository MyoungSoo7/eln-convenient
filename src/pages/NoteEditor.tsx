import { useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, ShieldCheck, Paperclip, Link2, Clock, FileText, Upload } from "lucide-react";
import { mockNotes } from "@/lib/mockData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/HelpTooltip";

const statusLabels: Record<string, string> = {
  draft: "초안", in_progress: "진행 중", signed: "서명 완료", locked: "잠김",
};
const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};

const sectionTemplate = `## 목적
연구 목적을 기재하세요.

## 재료
- 시약/샘플 목록

## 방법
1. 실험 절차

## 결과
실험 결과 기재

## 고찰
결과에 대한 분석 및 해석`;

export default function NoteEditor() {
  const { id } = useParams();
  const location = useLocation();
  const protocolState = location.state as {
    fromProtocol?: boolean;
    protocolId?: string;
    title?: string;
    tags?: string[];
    category?: string;
    author?: string;
  } | null;

  const isNew = id === "new";
  const note = isNew ? null : mockNotes.find((n) => n.id === id);

  const buildProtocolContent = () => {
    if (!protocolState?.fromProtocol) return sectionTemplate;
    const cat = protocolState.category || "";
    return `## 목적\n[${cat}] 실험 목적을 기재하세요.\n\n## 재료\n- 시약/샘플 목록\n\n## 방법\n1. 실험 절차\n\n## 결과\n실험 결과 기재\n\n## 고찰\n결과에 대한 분석 및 해석\n\n---\n> 📋 프로토콜 "${protocolState.title}" 기반으로 생성됨`;
  };

  const [content, setContent] = useState(note?.content || buildProtocolContent());
  const [title, setTitle] = useState(note?.title || protocolState?.title || "");
  const [noteStatus, setNoteStatus] = useState(note?.status || "draft");
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const isLocked = noteStatus === "signed" || noteStatus === "locked";

  const handleSign = () => {
    setNoteStatus("signed");
    setSignDialogOpen(false);
    toast({ title: "전자서명 완료", description: "노트가 서명되어 잠금 처리되었습니다." });
  };

  const handleSave = () => {
    toast({ title: "저장 완료", description: "노트가 저장되었습니다." });
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/notes">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> 목록</Button>
        </Link>
        <HelpTooltip text="연구노트 편집기입니다. Markdown 형식으로 작성하며, 첨부파일 추가, 시약/장비 연결, 버전 이력 확인이 가능합니다. 서명 시 노트가 잠금 처리됩니다." />
        <div className="flex-1" />
        {!isLocked && (
          <>
            <Button variant="outline" size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="h-4 w-4" /> 저장
            </Button>
            <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground">
                  <ShieldCheck className="h-4 w-4" /> 서명하기
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    전자서명 확인
                    <HelpTooltip text="서명을 진행하면 노트 내용이 해시화되어 시점인증이 완료됩니다. 서명 후에는 내용 수정이 불가능합니다." />
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    서명 후 노트는 잠금 처리되며 수정이 불가합니다. 서명을 진행하시겠습니까?
                  </p>
                  <div className="space-y-2">
                    <Label>서명자</Label>
                    <Input value="김연구" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>비밀번호 확인</Label>
                    <Input type="password" placeholder="비밀번호를 입력하세요" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSignDialogOpen(false)}>취소</Button>
                  <Button onClick={handleSign} className="gradient-primary text-primary-foreground">서명 확인</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        <Badge className={`${statusColors[noteStatus]}`}>{statusLabels[noteStatus]}</Badge>
      </div>

      {isNew ? (
        <Input placeholder="노트 제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} className="text-xl font-bold border-0 bg-transparent px-0 focus-visible:ring-0 h-auto py-2" />
      ) : (
        <h1 className="text-xl font-bold">{note?.title}</h1>
      )}

      {note && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{note.author}</span>
          <span>생성: {note.createdAt}</span>
          <span>수정: {note.updatedAt}</span>
          <span>{note.project}</span>
        </div>
      )}

      <Tabs defaultValue="editor" className="mt-4">
        <TabsList>
          <TabsTrigger value="editor" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> 편집기</TabsTrigger>
          <TabsTrigger value="attachments" className="gap-1.5"><Paperclip className="h-3.5 w-3.5" /> 첨부파일</TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> 연결 항목</TabsTrigger>
          <TabsTrigger value="revisions" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> 버전 이력</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-4">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isLocked}
                className="min-h-[500px] border-0 rounded-lg font-mono text-sm resize-none focus-visible:ring-0 p-6"
                placeholder="Markdown 형식으로 작성하세요..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <Card className="shadow-card">
            <CardContent className="p-8">
              <div className="border-2 border-dashed rounded-xl p-12 text-center hover:border-primary/30 transition-colors">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium mt-3">파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, 이미지, 데이터 파일 등 (최대 50MB)</p>
                {isLocked && <p className="text-xs text-destructive mt-2">서명된 노트에는 파일을 추가할 수 없습니다</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                연결된 항목
                <HelpTooltip text="이 노트에서 사용된 시약, 샘플, 장비를 연결하여 추적성을 확보합니다. 인벤토리 항목과 양방향으로 연결됩니다." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {note?.linkedItems?.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Badge variant="secondary" className="text-[10px]">
                    {item.type === 'reagent' ? '시약' : item.type === 'sample' ? '샘플' : '장비'}
                  </Badge>
                  <span className="text-sm">{item.name}</span>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground text-center py-6">연결된 항목이 없습니다</p>
              )}
              {!isLocked && (
                <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5">
                  <Link2 className="h-3.5 w-3.5" /> 시약/샘플/장비 연결
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revisions" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                버전 이력
                <HelpTooltip text="노트의 모든 수정 이력을 시간순으로 표시합니다. 이전 버전과 비교(diff)하여 변경 내용을 확인할 수 있습니다." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {note?.revisions?.length ? (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {note.revisions.map((rev, i) => (
                      <div key={rev.id} className="relative flex items-start gap-4 pl-10">
                        <div className={`absolute left-3 top-1.5 h-3 w-3 rounded-full border-2 ${i === 0 ? 'bg-primary border-primary' : 'bg-card border-border'}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">v{rev.version}</span>
                            <span className="text-xs text-muted-foreground">{rev.timestamp}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{rev.summary}</p>
                          <p className="text-xs text-muted-foreground">{rev.author}</p>
                        </div>
                        {i > 0 && (
                          <Button variant="ghost" size="sm" className="text-xs text-primary">비교</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">버전 이력이 없습니다</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
