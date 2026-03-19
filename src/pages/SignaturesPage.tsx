import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Lock, Clock, FileText, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listNotes } from "@/api/notes";
import { type Note } from "@/lib/mockData";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-warning/10 text-warning",
  signed: "bg-success/10 text-success",
  locked: "bg-destructive/10 text-destructive",
};

export default function SignaturesPage() {
  const { t } = useTranslation('signatures');
  const { t: tc } = useTranslation('common');

  const statusLabels: Record<string, string> = {
    draft: t('status.draft'),
    in_progress: t('status.in_progress'),
    signed: t('status.signed'),
    locked: t('status.locked'),
  };
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    setLoading(true);
    const res = await listNotes();
    if (res.ok) setNotes(res.data);
    setLoading(false);
  }

  const signedCount = notes.filter((n) => n.status === "signed").length;
  const pendingCount = notes.filter((n) => n.status === "draft" || n.status === "in_progress").length;
  const lockedCount = notes.filter((n) => n.status === "locked").length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {t('title')}
            <HelpTooltip text={t('titleTooltip')} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadNotes} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> {tc('refresh')}
        </Button>
      </div>

      {/* 요약 카드 — API 데이터 기반 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-success/10">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : signedCount}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {t('signed')}
                <HelpTooltip text={t('signedTooltip')} />
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : pendingCount}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {t('pending')}
                <HelpTooltip text={t('pendingTooltip')} />
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/10">
              <Lock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{loading ? "—" : lockedCount}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {t('lockedLabel')}
                <HelpTooltip text={t('lockedTooltip')} />
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 노트 서명 현황 테이블 */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {t('tableTitle')}
            <HelpTooltip text={t('tableTooltip')} />
            {notes.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal ml-1">({t('count', { count: notes.length })})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">{tc('loading')}</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t('emptyNotes')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('col.noteTitle')}</TableHead>
                  <TableHead>{t('col.author')}</TableHead>
                  <TableHead>{t('col.signStatus')}</TableHead>
                  <TableHead>{t('col.lastModified')}</TableHead>
                  <TableHead>{t('col.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell className="text-muted-foreground">{n.author || n.authorId || '-'}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${statusColors[n.status]}`}>
                        {statusLabels[n.status] || n.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{n.updatedAt}</TableCell>
                    <TableCell>
                      <Link to={`/notes/${n.id}`}>
                        {n.status === "signed" || n.status === "locked" ? (
                          <Button variant="ghost" size="sm" className="text-xs gap-1">
                            <FileText className="h-3 w-3" /> {t('viewReadOnly')}
                          </Button>
                        ) : n.status === "in_progress" ? (
                          <Button variant="ghost" size="sm" className="text-xs gap-1 text-primary">
                            <ShieldCheck className="h-3 w-3" /> {t('signAction')}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-xs gap-1">
                            <FileText className="h-3 w-3" /> {t('editAction')}
                          </Button>
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
