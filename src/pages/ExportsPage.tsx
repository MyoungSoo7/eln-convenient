import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, FileText, Archive, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listNotes } from "@/api/notes";
import {
  requestPdfExport,
  requestZipExport,
  getExportStatus,
  type ExportJob,
} from "@/api/signatures";
import { getToken } from "@/lib/authToken";
import { useTranslation } from "react-i18next";

// ── 진행 중인 단일 내보내기 작업 폴링 컴포넌트 ──
function ExportJobPoller({ job, onDone }: { job: ExportJob; onDone: (finished: ExportJob) => void }) {
  const errorCountRef = useRef(0);
  const { data } = useQuery({
    queryKey: ["export-status", job.id],
    queryFn: async () => {
      const res = await getExportStatus(job.id);
      if (!res.ok) {
        errorCountRef.current += 1;
        // 5회 연속 실패 시 failed 처리
        if (errorCountRef.current >= 5) {
          return { ...res, data: { ...job, status: 'failed' as const } };
        }
      } else {
        errorCountRef.current = 0;
      }
      return res;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
    select: (res) => res.data,
  });

  const current = data ?? job;

  if (current.status === "completed" || current.status === "failed") {
    // 완료 시 부모에게 알림 (한 번만)
    onDone(current);
    return null;
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
      <span className="flex-1 truncate">
        {current.format.toUpperCase()} {current.status}…
      </span>
      <Badge variant="outline" className="text-xs">
        {current.noteId !== "bulk" ? current.noteId.slice(0, 8) : "ZIP"}
      </Badge>
    </div>
  );
}

// ── 완료된 작업 행 ──
function FinishedJobRow({ job }: { job: ExportJob }) {
  const { t, i18n } = useTranslation('exports');
  const { t: tc } = useTranslation('common');
  const ok = job.status === "completed";
  return (
    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        {ok
          ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
        <div>
          <p className="text-sm font-medium">
            {job.format.toUpperCase()} — {job.noteId !== "bulk" ? job.noteId.slice(0, 8) : t('allZip')}
          </p>
          <p className="text-xs text-muted-foreground">
            {ok ? t('convertCompleted') : t('convertFailed')}
            {job.completedAt && ` · ${new Date(job.completedAt).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')}`}
          </p>
        </div>
      </div>
      {ok && job.fileUrl && (
        <a href={job.fileUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="text-xs gap-1">
            <ExternalLink className="h-3 w-3" /> {tc('download')}
          </Button>
        </a>
      )}
    </div>
  );
}

// ── 메인 페이지 ──
export default function ExportsPage() {
  const { t } = useTranslation('exports');
  const { t: tc } = useTranslation('common');
  const [pendingJobs, setPendingJobs] = useState<ExportJob[]>([]);
  const [finishedJobs, setFinishedJobs] = useState<ExportJob[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // 노트 목록 조회 (signed + locked)
  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ["notes-for-export"],
    queryFn: () => listNotes(),
    select: (res) =>
      (res.data ?? []).filter((n) => n.status === "signed" || n.status === "locked"),
  });

  const signedNotes = notesData ?? [];

  const addPending = (job: ExportJob) => setPendingJobs((prev) => [...prev, job]);

  const handleJobDone = (finished: ExportJob) => {
    setPendingJobs((prev) => prev.filter((j) => j.id !== finished.id));
    setFinishedJobs((prev) => [finished, ...prev]);
    if (finished.status === "completed") {
      toast({ title: t('toast.completed'), description: t('toast.completedDesc') });
    } else {
      toast({ title: t('toast.failed'), description: t('toast.failedDesc'), variant: "destructive" });
    }
  };

  // SSE: 내보내기 상태 실시간 수신 (폴링 폴백은 ExportJobPoller가 담당)
  const handleJobDoneRef = useRef(handleJobDone);
  handleJobDoneRef.current = handleJobDone;

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const url = `${apiBase}/events/exports`;

    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
      es.addEventListener('export-status', (event) => {
        try {
          const data = JSON.parse(event.data);
          const finished: ExportJob = {
            id: data.jobId,
            noteId: data.noteId ?? '',
            format: data.format ?? 'pdf',
            status: data.status,
            fileUrl: data.fileUrl,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
          handleJobDoneRef.current(finished);
        } catch { /* 무시 */ }
      });
      es.onerror = () => {
        // SSE 실패 시 조용히 닫기 — 폴링이 폴백
        es?.close();
      };
    } catch { /* SSE 미지원 환경 */ }

    return () => { es?.close(); };
  }, []);

  const handlePdfExport = async (noteId: string, noteTitle: string) => {
    const res = await requestPdfExport(noteId);
    if (!res.ok || !res.data) {
      toast({ title: t('toast.requestFailed'), description: res.error ?? "PDF error", variant: "destructive" });
      return;
    }
    toast({ title: t('toast.pdfRequested'), description: t('toast.pdfRequestedDesc', { title: noteTitle }) });
    addPending(res.data);
  };

  const handleZipExport = async (noteId: string, noteTitle: string) => {
    const res = await requestZipExport([noteId]);
    if (!res.ok || !res.data) {
      toast({ title: t('toast.requestFailed'), description: res.error ?? "ZIP error", variant: "destructive" });
      return;
    }
    toast({ title: t('toast.zipRequested'), description: t('toast.zipRequestedDesc', { title: noteTitle }) });
    addPending(res.data);
  };

  const handleAllZipExport = async () => {
    if (signedNotes.length === 0) return;
    setLoadingAll(true);
    const res = await requestZipExport(signedNotes.map((n) => n.id));
    setLoadingAll(false);
    if (!res.ok || !res.data) {
      toast({ title: t('toast.requestFailed'), description: res.error ?? "ZIP error", variant: "destructive" });
      return;
    }
    toast({ title: t('toast.allZipRequested'), description: t('toast.allZipRequestedDesc', { count: signedNotes.length }) });
    addPending(res.data);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('title')}
          <HelpTooltip text={t('titleTooltip')} />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* 빠른 액션 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
        <Card
          className="shadow-card hover:shadow-elevated transition-all cursor-pointer"
          onClick={handleAllZipExport}
        >
          <CardContent className="p-6 text-center">
            {loadingAll
              ? <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
              : <Archive className="h-8 w-8 mx-auto text-primary" />}
            <p className="font-medium mt-3 flex items-center justify-center gap-1">
              {t('allZip')}
              <HelpTooltip text={t('allZipTooltip')} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('allZipDesc', { count: signedNotes.length })}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card opacity-60 cursor-not-allowed">
          <CardContent className="p-6 text-center">
            <FileText className="h-8 w-8 mx-auto text-secondary" />
            <p className="font-medium mt-3 flex items-center justify-center gap-1">
              {t('projectReport')}
              <HelpTooltip text={t('projectReportTooltip')} />
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t('projectReportComingSoon')}</p>
          </CardContent>
        </Card>
      </div>

      {/* 진행 중인 작업 */}
      {pendingJobs.length > 0 && (
        <Card className="shadow-card border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t('inProgress', { count: pendingJobs.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingJobs.map((job) => (
              <ExportJobPoller key={job.id} job={job} onDone={handleJobDone} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 개별 노트 내보내기 */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {t('individual')}
            <HelpTooltip text={t('individualTooltip')} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notesLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!notesLoading && signedNotes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{t('noSignedNotes')}</p>
          )}
          {signedNotes.map((n) => (
            <div key={n.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">
                  {n.author} · {n.updatedAt}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  disabled={pendingJobs.some((j) => j.noteId === n.id && j.format === "pdf")}
                  onClick={() => handlePdfExport(n.id, n.title)}
                >
                  <FileDown className="h-3 w-3" /> PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  disabled={pendingJobs.some((j) => j.noteId === n.id && j.format === "zip")}
                  onClick={() => handleZipExport(n.id, n.title)}
                >
                  <Archive className="h-3 w-3" /> ZIP
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 완료된 작업 이력 */}
      {finishedJobs.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{t('completed')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {finishedJobs.map((job) => (
              <FinishedJobRow key={job.id} job={job} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
