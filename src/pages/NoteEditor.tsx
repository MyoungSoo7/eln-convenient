import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import { Progress } from "@/components/ui/progress";
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
import { type InventoryItem } from "@/lib/types";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NoteEditor() {
  const { t } = useTranslation('notes');
  const { t: tc } = useTranslation('common');
  const { t: ti } = useTranslation('inventory');

  const statusLabels: Record<string, string> = {
    draft: tc('status.draft'), in_progress: tc('status.in_progress'), signed: tc('status.signed'), locked: tc('status.locked'),
  };

  const INVENTORY_TYPE_LABELS: Record<string, string> = {
    reagent: ti('type.reagent'), sample: ti('type.sample'), equipment: ti('type.equipment'), consumable: ti('type.consumable'),
    antibody: ti('type.antibody'), plasmid: ti('type.plasmid'), cell_line: ti('type.cell_line'),
    output: ti('type.output'), license: ti('type.license'), infrastructure: ti('type.infrastructure'), other: ti('type.other'),
  };

  const sectionTemplate = t('sectionTemplate');

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
    const category = protocolState.category || "";
    const title = protocolState.title || "";
    return t('sectionTemplateFromProtocol', { category, title });
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 업로드 검증 상수
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const BLOCKED_EXTENSIONS = ['exe', 'sh', 'bat'];

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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectCountRef = useRef(0);
  const isUnmountingRef = useRef(false);
  const COLLAB_COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500',
    'bg-violet-500', 'bg-pink-500', 'bg-teal-500', 'bg-orange-500',
  ] as const;
  const [connectedUsers, setConnectedUsers] = useState<Array<{ id: string; name: string; colorIdx: number }>>([]);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'reconnecting' | 'failed'>('disconnected');

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

  // WebSocket 협업 (with exponential backoff reconnection)
  useEffect(() => {
    if (isNew) return;
    const token = getToken() ?? '';
    if (!token) return;

    isUnmountingRef.current = false;
    reconnectCountRef.current = 0;

    const MAX_RETRIES = 5;

    function connectWs() {
      const base = (import.meta.env.VITE_COLLAB_URL as string | undefined) ?? 'ws://localhost:8009';
      const ws = new WebSocket(`${base}/collab/notes/${id}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectCountRef.current = 0;
        setWsStatus('connected');
      };

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

      ws.onclose = () => {
        wsRef.current = null;
        setConnectedUsers([]);

        if (isUnmountingRef.current) return;

        if (reconnectCountRef.current < MAX_RETRIES) {
          setWsStatus('reconnecting');
          const delay = Math.pow(2, reconnectCountRef.current) * 1000; // 1s, 2s, 4s, 8s, 16s
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(connectWs, delay);
        } else {
          setWsStatus('failed');
        }
      };
    }

    connectWs();

    return () => {
      isUnmountingRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
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
      toast({ title: t('editor.titleRequired'), variant: "destructive" });
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
        toast({ title: t('editor.createSuccess'), description: t('editor.saved') });
        navigate(`/notes/${res.data.id}`, { replace: true });
      } else {
        toast({ title: t('editor.saveFailed'), description: res.error || t('editor.createFailed'), variant: "destructive" });
      }
    } else {
      const res = await updateNote(id!, { title, content, changeSummary: t('editor.directEdit') });
      setSaving(false);
      if (res.ok) {
        toast({ title: t('editor.saveSuccess'), description: t('editor.saved') });
      } else {
        toast({ title: t('editor.saveFailed'), description: res.error || t('editor.saveFailed'), variant: "destructive" });
      }
    }
  };

  const handleSign = async () => {
    if (!signPassword.trim()) {
      toast({ title: t('editor.passwordRequired'), variant: "destructive" });
      return;
    }
    setSigning(true);
    const signRes = await signNote(id!, signPassword);
    setSigning(false);
    if (!signRes.ok) {
      toast({ title: t('editor.signFailed'), description: signRes.error || t('editor.signFailed'), variant: "destructive" });
      return;
    }
    // signature-audit-service가 내부적으로 ELN 노트 상태를 "signed"로 전환하므로
    // 프론트엔드에서 별도로 changeNoteStatus를 호출하지 않음
    setNoteStatus("signed");
    setSignDialogOpen(false);
    setSignPassword("");
    toast({ title: t('editor.signSuccess'), description: t('editor.signSuccessDesc') });
  };

  const handleStartProgress = async () => {
    const res = await changeNoteStatus(id!, "in_progress");
    if (res.ok) {
      setNoteStatus("in_progress");
      toast({ title: t('editor.statusChanged'), description: t('editor.statusChangedToProgress') });
    } else {
      toast({ title: t('editor.statusChangeFailed'), description: res.error || t('editor.statusChangeFailed'), variant: "destructive" });
    }
  };

  // ── 첨부파일 ──────────────────────────────────
  const validateFile = (file: File): boolean => {
    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: t('editor.attachment.fileTooLarge', { name: file.name }), variant: "destructive" });
      return false;
    }
    // 차단 확장자 검증
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      toast({ title: t('editor.attachment.blockedExtension', { ext: `.${ext}` }), variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleFileUpload = async (file: File) => {
    if (isNew) {
      toast({ title: t('editor.attachment.saveFirst'), variant: "destructive" });
      return;
    }
    if (isLocked) {
      toast({ title: t('editor.attachment.lockedNote'), variant: "destructive" });
      return;
    }
    if (!validateFile(file)) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadingFileName(file.name);

    // 1. file-service에 업로드 (with progress)
    const uploadRes = await uploadFile(file, { type: 'note', id: id! }, (percent) => {
      setUploadProgress(percent);
    });
    if (!uploadRes.ok) {
      toast({ title: t('editor.attachment.uploadFailed'), description: uploadRes.error || t('editor.attachment.uploadFailed'), variant: "destructive" });
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName("");
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
      toast({ title: t('editor.attachment.uploadSuccess'), description: t('editor.attachment.attached', { name: file.name }) });
    } else {
      toast({ title: t('editor.attachment.registerFailed'), description: attRes.error, variant: "destructive" });
    }
    setUploading(false);
    setUploadProgress(0);
    setUploadingFileName("");
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
      toast({ title: t('editor.attachment.deleteSuccess') });
    }
  };

  // ── 인벤토리 연결 ──────────────────────────────
  const openInventoryDialog = async () => {
    if (isNew) { toast({ title: t('editor.attachment.saveFirst'), variant: "destructive" }); return; }
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
      toast({ title: t('editor.link.linkSuccess'), description: t('editor.link.linked', { name: item.name }) });
    }
    setInventoryDialogOpen(false);
    setInventorySearch("");
  };

  const handleDeleteLink = async (link: NoteLink) => {
    const res = await deleteNoteLink(id!, link.id);
    if (res.ok) {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      toast({ title: t('editor.link.unlinkSuccess') });
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
      {/* WebSocket 재연결 배너 */}
      {wsStatus === 'reconnecting' && (
        <div className="flex items-center gap-2 rounded-md px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent" />
          {t('collab.disconnected')} {t('collab.reconnecting')}
        </div>
      )}
      {wsStatus === 'failed' && (
        <div className="flex items-center justify-between rounded-md px-4 py-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <span>{t('collab.reconnectFailed')}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.location.reload()}>
            {t('collab.refreshPage')}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Link to="/notes">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> {tc('back')}</Button>
        </Link>
        <HelpTooltip text={t('editor.tooltip')} />
        <div className="flex-1" />
        {!isLocked && (
          <>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? tc('saving') : tc('save')}
            </Button>
            {!isNew && noteStatus === "draft" && (
              <Button variant="outline" size="sm" onClick={handleStartProgress} className="gap-1.5">
                {t('editor.startProgress')}
              </Button>
            )}
            {!isNew && noteStatus === "in_progress" && (
              <Dialog open={signDialogOpen} onOpenChange={(open) => { setSignDialogOpen(open); if (!open) setSignPassword(""); }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground">
                    <ShieldCheck className="h-4 w-4" /> {t('editor.sign')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {t('editor.signTitle')}
                      <HelpTooltip text={t('editor.signTooltip')} />
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                      {t('editor.signWarning')}
                    </p>
                    <div className="space-y-2">
                      <Label>{t('editor.passwordConfirm')} <span className="text-destructive">*</span></Label>
                      <Input
                        type="password"
                        placeholder={t('editor.passwordPlaceholder')}
                        value={signPassword}
                        onChange={(e) => setSignPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSign()}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setSignDialogOpen(false); setSignPassword(""); }}>{tc('cancel')}</Button>
                    <Button onClick={handleSign} disabled={signing} className="gradient-primary text-primary-foreground">
                      {signing ? tc('processing') : t('editor.signConfirm')}
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
            {t('editor.liveEditing')}
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
            placeholder={t('editor.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl font-bold border-0 bg-transparent px-0 focus-visible:ring-0 h-auto py-2"
          />
          {protocolState?.fromProtocol && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <FileText className="h-3 w-3" /> {t('editor.protocolBased')}
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
                  {t('editor.protocolLabel', { title: templateTitle })}
                </Badge>
              </Link>
            </div>
          )}
        </>
      )}

      <Tabs defaultValue="editor" className="mt-4">
        <TabsList>
          <TabsTrigger value="editor" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> {t('editor.tab.editor')}</TabsTrigger>
          <TabsTrigger value="attachments" className="gap-1.5">
            <Paperclip className="h-3.5 w-3.5" /> {t('editor.tab.attachments')}
            {attachments.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{attachments.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> {t('editor.tab.links')}
            {links.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{links.length}</span>
          )}
          </TabsTrigger>
          <TabsTrigger value="revisions" className="gap-1.5" onClick={handleRevisionsTabActivate}>
            <Clock className="h-3.5 w-3.5" /> {t('editor.tab.revisions')}
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
                placeholder={t('editor.contentPlaceholder')}
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
                  {t('editor.attachment.saveFirstHint')}
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
                        {uploading ? t('editor.attachment.uploadingProgress', { progress: uploadProgress }) : t('editor.attachment.dropOrClick')}
                      </p>
                      {uploading && uploadingFileName && (
                        <div className="mt-3 max-w-xs mx-auto space-y-1.5">
                          <p className="text-xs text-muted-foreground truncate">{uploadingFileName}</p>
                          <Progress value={uploadProgress} className="h-2" />
                        </div>
                      )}
                      {!uploading && (
                        <p className="text-xs text-muted-foreground mt-1">{t('editor.attachment.hint')}</p>
                      )}
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
                    <p className="text-sm text-muted-foreground text-center py-2">{t('editor.attachment.empty')}</p>
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
                {t('editor.link.title')}
                <HelpTooltip text={t('editor.link.tooltip')} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isNew ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {t('editor.link.saveFirstHint')}
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
                    <p className="text-sm text-muted-foreground text-center py-6">{t('editor.link.empty')}</p>
                  )}
                  {!isLocked && (
                    <Button variant="outline" size="sm" className="w-full mt-2 gap-1.5" onClick={openInventoryDialog}>
                      <Link2 className="h-3.5 w-3.5" /> {t('editor.link.addLink')}
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
                {t('editor.revision.title')}
                <HelpTooltip text={t('editor.revision.tooltip')} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isNew ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t('editor.revision.saveFirstHint')}</p>
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
                          <p className="text-sm text-muted-foreground mt-0.5">{rev.changeSummary || t('editor.revision.edited')}</p>
                          <p className="text-xs text-muted-foreground">{rev.changedBy}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">{t('editor.revision.empty')}</p>
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
              <Link2 className="h-4 w-4" /> {t('editor.link.addLink')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('editor.link.searchPlaceholder')}
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {inventoryLoading ? (
                <p className="text-sm text-muted-foreground text-center py-6">{tc('loading')}</p>
              ) : filteredInventory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t('editor.link.noItems')}</p>
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
                      {item.status === "available" ? t('editor.link.available') : item.status}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInventoryDialogOpen(false)}>{tc('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
