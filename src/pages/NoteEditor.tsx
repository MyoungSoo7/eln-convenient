import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Save, ShieldCheck, Paperclip, Link2, Clock, FileText,
  Upload, Users, Trash2, X, Search as SearchIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { getToken } from "@/lib/authToken";
import {
  createNote, updateNote, getNote, changeNoteStatus,
  listAttachments, addAttachment, deleteAttachmentRecord,
  getLinks, createNoteLink, deleteNoteLink, listRevisions, getTemplate,
  type AttachmentRecord, type NoteLink, type RevisionRecord,
} from "@/api/notes";
import { signNote } from "@/api/signatures";
import { uploadFile, getFileDownloadUrl } from "@/api/files";
import { listItems } from "@/api/inventory";
import { type InventoryItem } from "@/lib/mockData";

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

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const INVENTORY_TYPE_LABELS: Record<string, string> = {
  dev_equipment: "장비", deliverable: "샘플", license: "라이선스", infra: "인프라",
  reagent: "시약", sample: "샘플", equipment: "장비",
};

export default function NoteEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const protocolState = location.state as {
    fromProtocol?: boolean;
    protocolId?: string;
    title?: string;
    tags?: string[];
    category?: string;
    author?: string;
  } | null;

  const isNew = id === "new";

  const buildProtocolContent = () => {
    if (!protocolState?.fromProtocol) return sectionTemplate;
    const cat = protocolState.category || "";
    return `## 목적\n[${cat}] 실험 목적을 기재하세요.\n\n## 재료\n- 시약/샘플 목록\n\n## 방법\n1. 실험 절차\n\n## 결과\n실험 결과 기재\n\n## 고찰\n결과에 대한 분석 및 해석\n\n---\n> 📋 프로토콜 "${protocolState.title}" 기반으로 생성됨`;
  };

  const [content, setContent] = useState(buildProtocolContent());
  const [title, setTitle] = useState(protocolState?.title || "");
  const [noteStatus, setNoteStatus] = useState("draft");
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signPassword, setSignPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);

  // 첨부파일
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 시약/장비 연결
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // 원본 프로토콜 제목
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);

  // 버전 이력
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [revisionsLoaded, setRevisionsLoaded] = useState(false);

  // 실시간 협업 WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const lastLocalEditRef = useRef<number>(0);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const COLLAB_COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500',
    'bg-violet-500', 'bg-pink-500', 'bg-teal-500', 'bg-orange-500',
  ] as const;
  const [connectedUsers, setConnectedUsers] = useState<Array<{ id: string; name: string; colorIdx: number }>>([]);

  const isLocked = noteStatus === "signed" || noteStatus === "locked";

  // 기존 노트 데이터 로드 (제목·내용·상태·첨부파일·링크 병렬)
  useEffect(() => {
    if (isNew) return;
    Promise.all([
      getNote(id!).then((res) => {
        if (res.ok) {
          setTitle(res.data.title || "");
          setContent(res.data.content || "");
          setNoteStatus(res.data.status || "draft");
          if (res.data.templateId) {
            getTemplate(res.data.templateId).then((tRes) => {
              if (tRes.ok) setTemplateTitle(tRes.data.title);
            });
          }
        }
      }),
      listAttachments(id!).then((res) => { if (res.ok) setAttachments(res.data); }),
      getLinks(id!).then((res) => { if (res.ok) setLinks(res.data); }),
    ]);
  }, [id, isNew]);

  // WebSocket 협업
  useEffect(() => {
    if (isNew) return;
    const token = getToken() ?? '';
    if (!token) return;

    const base = (import.meta.env.VITE_COLLAB_URL as string | undefined) ?? 'ws://localhost:8009';
    const ws = new WebSocket(`${base}/collab/notes/${id}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'joined') {
          setConnectedUsers(
            (msg.users ?? []).map((u: { id: string; name: string; colorIdx?: number }) => ({
              id: u.id, name: u.name, colorIdx: u.colorIdx ?? 0,
            }))
          );
        } else if (msg.type === 'user-joined') {
          setConnectedUsers((prev) => [
            ...prev.filter((u) => u.id !== msg.userId),
            { id: msg.userId, name: msg.userName, colorIdx: msg.colorIdx ?? 0 },
          ]);
        } else if (msg.type === 'user-left') {
          setConnectedUsers((prev) => prev.filter((u) => u.id !== msg.userId));
        } else if (msg.type === 'content-update') {
          if (Date.now() - lastLocalEditRef.current > 1000) {
            setContent(msg.content as string);
          }
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => { wsRef.current = null; setConnectedUsers([]); };

    return () => { ws.close(); };
  }, [id, isNew]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    lastLocalEditRef.current = Date.now();
    clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'content-update', content: newContent }));
      }
    }, 400);
  }, []);

  // ── 저장 ──────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "제목을 입력해주세요.", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (isNew) {
      const res = await createNote({
        title,
        content,
        tags: protocolState?.tags || [],
        templateId: protocolState?.protocolId,
      });
      setSaving(false);
      if (res.ok && res.data?.id) {
        toast({ title: "노트 생성 완료", description: "노트가 저장되었습니다." });
        navigate(`/notes/${res.data.id}`, { replace: true });
      } else {
        toast({ title: "저장 실패", description: res.error || "노트 생성에 실패했습니다.", variant: "destructive" });
      }
    } else {
      const res = await updateNote(id!, { title, content, changeSummary: "직접 편집" });
      setSaving(false);
      if (res.ok) {
        toast({ title: "저장 완료", description: "노트가 저장되었습니다." });
      } else {
        toast({ title: "저장 실패", description: res.error || "저장에 실패했습니다.", variant: "destructive" });
      }
    }
  };

  const handleSign = async () => {
    if (!signPassword.trim()) {
      toast({ title: "비밀번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    setSigning(true);
    const signRes = await signNote(id!, signPassword);
    setSigning(false);
    if (!signRes.ok) {
      toast({ title: "서명 실패", description: signRes.error || "전자서명에 실패했습니다.", variant: "destructive" });
      return;
    }
    // signature-audit-service가 내부적으로 ELN 노트 상태를 "signed"로 전환하므로
    // 프론트엔드에서 별도로 changeNoteStatus를 호출하지 않음
    setNoteStatus("signed");
    setSignDialogOpen(false);
    setSignPassword("");
    toast({ title: "전자서명 완료", description: "노트가 서명되어 잠금 처리되었습니다." });
  };

  const handleStartProgress = async () => {
    const res = await changeNoteStatus(id!, "in_progress");
    if (res.ok) {
      setNoteStatus("in_progress");
      toast({ title: "상태 변경", description: "노트가 '진행 중' 상태로 변경되었습니다." });
    } else {
      toast({ title: "상태 변경 실패", description: res.error || "상태 변경에 실패했습니다.", variant: "destructive" });
    }
  };

  // ── 첨부파일 ──────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (isNew) {
      toast({ title: "먼저 노트를 저장하세요.", variant: "destructive" });
      return;
    }
    if (isLocked) {
      toast({ title: "서명/잠금된 노트에는 파일을 추가할 수 없습니다.", variant: "destructive" });
      return;
    }
    setUploading(true);

    // 1. file-service에 업로드
    const uploadRes = await uploadFile(file, { type: 'note', id: id! });
    if (!uploadRes.ok) {
      toast({ title: "업로드 실패", description: uploadRes.error || "파일 업로드에 실패했습니다.", variant: "destructive" });
      setUploading(false);
      return;
    }

    // 2. 노트에 첨부파일 등록
    const attRes = await addAttachment(id!, {
      fileId: uploadRes.data.id,
      fileName: uploadRes.data.originalName || file.name,
      mimeType: uploadRes.data.mimeType,
      sizeBytes: uploadRes.data.sizeBytes,
    });

    if (attRes.ok) {
      setAttachments((prev) => [...prev, attRes.data]);
      toast({ title: "업로드 완료", description: `${file.name} 이(가) 첨부되었습니다.` });
    } else {
      toast({ title: "첨부 등록 실패", description: attRes.error, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) await handleFileUpload(file);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) await handleFileUpload(file);
  };

  const handleDeleteAttachment = async (att: AttachmentRecord) => {
    const res = await deleteAttachmentRecord(id!, att.id);
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      toast({ title: "첨부파일 삭제 완료" });
    }
  };

  // ── 인벤토리 연결 ──────────────────────────────
  const openInventoryDialog = async () => {
    if (isNew) { toast({ title: "먼저 노트를 저장하세요.", variant: "destructive" }); return; }
    setInventoryDialogOpen(true);
    setInventoryLoading(true);
    const res = await listItems();
    setInventoryItems(res.ok ? res.data : []);
    setInventoryLoading(false);
  };

  const handleAddLink = async (item: InventoryItem) => {
    const res = await createNoteLink(id!, {
      targetType: 'inventory',
      targetId: item.id,
      label: item.name,
    });
    if (res.ok) {
      setLinks((prev) => [...prev, res.data]);
      toast({ title: "연결 완료", description: `${item.name} 이(가) 연결되었습니다.` });
    }
    setInventoryDialogOpen(false);
    setInventorySearch("");
  };

  const handleDeleteLink = async (link: NoteLink) => {
    const res = await deleteNoteLink(id!, link.id);
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      toast({ title: "연결 해제 완료" });
    }
  };

  // ── 버전 이력 (탭 클릭 시 로드) ──────────────
  const handleRevisionsTabActivate = () => {
    if (isNew || revisionsLoaded) return;
    setRevisionsLoaded(true);
    listRevisions(id!).then((res) => {
      if (res.ok) setRevisions([...res.data].reverse()); // 최신 순
    });
  };

  const filteredInventory = inventoryItems.filter((item) =>
    item.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
    item.type.toLowerCase().includes(inventorySearch.toLowerCase())
  );

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
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "저장 중..." : "저장"}
            </Button>
            {!isNew && noteStatus === "draft" && (
              <Button variant="outline" size="sm" onClick={handleStartProgress} className="gap-1.5">
                진행 시작
              </Button>
            )}
            {!isNew && noteStatus === "in_progress" && (
              <Dialog open={signDialogOpen} onOpenChange={(open) => { setSignDialogOpen(open); if (!open) setSignPassword(""); }}>
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
                      <Label>비밀번호 확인 <span className="text-destructive">*</span></Label>
                      <Input
                        type="password"
                        placeholder="비밀번호를 입력하세요"
                        value={signPassword}
                        onChange={(e) => setSignPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSign()}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setSignDialogOpen(false); setSignPassword(""); }}>취소</Button>
                    <Button onClick={handleSign} disabled={signing} className="gradient-primary text-primary-foreground">
                      {signing ? "처리 중..." : "서명 확인"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
        <Badge className={`${statusColors[noteStatus]}`}>{statusLabels[noteStatus]}</Badge>
      </div>

      {/* 실시간 협업 참여자 */}
      {!isNew && connectedUsers.length > 0 && (
        <div className="flex items-center gap-2 px-1 py-1 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 w-fit text-xs">
          <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <Users className="h-3 w-3" />
            실시간 편집 중
          </span>
          <div className="flex items-center gap-1">
            {connectedUsers.slice(0, 6).map((u) => (
              <div
                key={u.id}
                title={u.name}
                className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-white dark:ring-gray-900 ${COLLAB_COLORS[u.colorIdx % COLLAB_COLORS.length]}`}
              >
                {u.name[0]?.toUpperCase() ?? '?'}
              </div>
            ))}
            {connectedUsers.length > 6 && (
              <span className="text-green-600 dark:text-green-400">+{connectedUsers.length - 6}</span>
            )}
          </div>
        </div>
      )}

      {/* 제목 */}
      {isNew ? (
        <div className="space-y-2">
          <Input
            placeholder="노트 제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl font-bold border-0 bg-transparent px-0 focus-visible:ring-0 h-auto py-2"
          />
          {protocolState?.fromProtocol && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <FileText className="h-3 w-3" /> 프로토콜 기반
              </Badge>
              {protocolState.tags?.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLocked}
            className="text-xl font-bold border-0 bg-transparent px-0 focus-visible:ring-0 h-auto py-2"
          />
          {templateTitle && (
            <div className="flex items-center gap-1.5">
              <Link to="/protocols">
                <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer hover:bg-secondary/80">
                  <FileText className="h-3 w-3" />
                  프로토콜: {templateTitle}
                </Badge>
              </Link>
            </div>
          )}
        </>
      )}

      <Tabs defaultValue="editor" className="mt-4">
        <TabsList>
          <TabsTrigger value="editor" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> 편집기</TabsTrigger>
          <TabsTrigger value="attachments" className="gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> 첨부파일
            {attachments.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{attachments.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> 연결 항목
            {links.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{links.length}</span>
          )}
          </TabsTrigger>
          <TabsTrigger value="revisions" className="gap-1.5" onClick={handleRevisionsTabActivate}>
            <Clock className="h-3.5 w-3.5" /> 버전 이력
          </TabsTrigger>
        </TabsList>

        {/* ── 편집기 탭 ── */}
        <TabsContent value="editor" className="mt-4">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                disabled={isLocked}
                className="min-h-[500px] border-0 rounded-lg font-mono text-sm resize-none focus-visible:ring-0 p-6"
                placeholder="Markdown 형식으로 작성하세요..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 첨부파일 탭 ── */}
        <TabsContent value="attachments" className="mt-4">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              {isNew ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  노트를 먼저 저장하면 파일을 첨부할 수 있습니다.
                </p>
              ) : (
                <>
                  {/* 업로드 드롭존 */}
                  {!isLocked && (
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                        isDragging ? "border-primary bg-primary/5" : "hover:border-primary/30"
                      } ${uploading ? "pointer-events-none opacity-50" : ""}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                    >
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm font-medium mt-3">
                        {uploading ? "업로드 중..." : "파일을 드래그하거나 클릭하여 업로드"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, 이미지, 데이터 파일 등 여러 파일 동시 첨부 가능 (최대 50MB)</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                        accept="*/*"
                      />
                    </div>
                  )}

                  {/* 첨부파일 목록 */}
                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group">
                          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <a
                              href={getFileDownloadUrl(att.fileId)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium hover:text-primary truncate block"
                            >
                              {att.fileName}
                            </a>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              {att.mimeType && <span>{att.mimeType.split('/')[1]?.toUpperCase()}</span>}
                              {att.sizeBytes && <span>{formatBytes(att.sizeBytes)}</span>}
                              {att.createdAt && <span>{new Date(att.createdAt).toLocaleDateString('ko-KR')}</span>}
                            </div>
                          </div>
                          {!isLocked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteAttachment(att)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {attachments.length === 0 && !uploading && (
                    <p className="text-sm text-muted-foreground text-center py-2">첨부된 파일이 없습니다.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 연결 항목 탭 ── */}
        <TabsContent value="links" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                연결된 항목
                <HelpTooltip text="이 노트에서 사용된 시약, 샘플, 장비를 연결하여 추적성을 확보합니다. 인벤토리 항목과 양방향으로 연결됩니다." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isNew ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  노트를 먼저 저장하면 시약/장비를 연결할 수 있습니다.
                </p>
              ) : (
                <>
                  {links.length > 0 ? (
                    links.map((link) => (
                      <div key={link.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group">
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {INVENTORY_TYPE_LABELS[link.targetType] || link.targetType}
                        </Badge>
                        <span className="text-sm flex-1">{link.label || link.targetId}</span>
                        {!isLocked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteLink(link)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">연결된 항목이 없습니다</p>
                  )}
                  {!isLocked && (
                    <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5" onClick={openInventoryDialog}>
                      <Link2 className="h-3.5 w-3.5" /> 시약/샘플/장비 연결
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 버전 이력 탭 ── */}
        <TabsContent value="revisions" className="mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                버전 이력
                <HelpTooltip text="노트의 모든 수정 이력을 시간순으로 표시합니다." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isNew ? (
                <p className="text-sm text-muted-foreground text-center py-6">저장 후 버전 이력을 확인할 수 있습니다.</p>
              ) : revisions.length > 0 ? (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {revisions.map((rev, i) => (
                      <div key={rev.id} className="relative flex items-start gap-4 pl-10">
                        <div className={`absolute left-3 top-1.5 h-3 w-3 rounded-full border-2 ${i === 0 ? 'bg-primary border-primary' : 'bg-card border-border'}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">v{rev.revision}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(rev.createdAt).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{rev.changeSummary || "수정"}</p>
                          <p className="text-xs text-muted-foreground">{rev.changedBy}</p>
                        </div>
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

      {/* 인벤토리 연결 다이얼로그 */}
      <Dialog open={inventoryDialogOpen} onOpenChange={(open) => { setInventoryDialogOpen(open); if (!open) setInventorySearch(""); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> 시약/샘플/장비 연결
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름 또는 타입으로 검색..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {inventoryLoading ? (
                <p className="text-sm text-muted-foreground text-center py-6">로딩 중...</p>
              ) : filteredInventory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">항목이 없습니다.</p>
              ) : (
                filteredInventory.map((item) => (
                  <button
                    key={item.id}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-muted transition-colors"
                    onClick={() => handleAddLink(item)}
                  >
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {INVENTORY_TYPE_LABELS[item.type] || item.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.location}</p>
                    </div>
                    <Badge
                      variant={item.status === "available" ? "default" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {item.status === "available" ? "이용 가능" : item.status}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInventoryDialogOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
