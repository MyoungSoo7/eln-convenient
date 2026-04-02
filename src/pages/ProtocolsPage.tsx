import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, Copy, Plus, FileText, Loader2, Pencil, Trash2, ArrowRight, FileX, ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HelpTooltip } from "@/components/HelpTooltip";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import NewProtocolDialog from "@/components/NewProtocolDialog";
import EditProtocolDialog from "@/components/EditProtocolDialog";
import { listTemplates, copyTemplate, deleteTemplate, listCodes, type TemplateRecord } from "@/api/notes";

const PAGE_SIZE = 12;

export default function ProtocolsPage() {
  const { t } = useTranslation('protocols');
  const { t: tc } = useTranslation('common');

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<TemplateRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // 검색어 디바운스 (300ms)
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // 카테고리 목록 조회
  const categoriesQuery = useQuery({
    queryKey: ['template-categories'],
    queryFn: async () => {
      const res = await listCodes('TEMPLATE_CATEGORY');
      return res.ok ? res.data : [];
    },
  });
  const categories = categoriesQuery.data ?? [];

  // 템플릿 목록 조회 (서버사이드 페이지네이션)
  const templatesQuery = useQuery({
    queryKey: ['templates', { page, category, sortBy, search: debouncedSearch }],
    queryFn: async () => {
      return await listTemplates({
        page,
        limit: PAGE_SIZE,
        category: category || undefined,
        sortBy,
        search: debouncedSearch || undefined,
      });
    },
  });

  const protocols = templatesQuery.data?.data ?? [];
  const total = templatesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loading = templatesQuery.isLoading;

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  // 필터 변경 시 1페이지로 리셋
  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((sort: string) => {
    setSortBy(sort);
    setPage(1);
  }, []);

  const handleCreateNote = (p: TemplateRecord) => {
    navigate("/notes/new", {
      state: {
        fromProtocol: true,
        protocolId: p.id,
        title: `[${p.category ?? ""}] ${p.title}`,
        tags: p.tags ?? [],
        category: p.category,
        author: p.createdBy,
      },
    });
    toast.success(t('createNoteSuccess'), { description: t('createNoteSuccessDesc', { title: p.title }) });
  };

  const handleCreated = (_template?: TemplateRecord) => {
    templatesQuery.refetch();
  };

  const handleUpdated = (_template?: TemplateRecord) => {
    setEditTarget(null);
    templatesQuery.refetch();
  };

  const handleCopy = async (p: TemplateRecord) => {
    setCopyingId(p.id);
    const res = await copyTemplate(p.id);
    setCopyingId(null);
    if (res.ok && res.data) {
      templatesQuery.refetch();
      toast.success(t('copySuccess'), { description: t('copySuccessDesc', { title: res.data.title }) });
    } else {
      toast.error(res.error ?? t('copyFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteTemplate(deleteTarget.id);
    setDeleting(false);
    if (res.ok) {
      templatesQuery.refetch();
      toast.success(t('deleteSuccess', { title: deleteTarget.title }));
      setDeleteTarget(null);
    } else {
      toast.error(res.error ?? t('deleteFailed'));
    }
  };

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
        <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> {t('newProtocol')}
        </Button>
      </div>

      {/* 필터 바: 검색 + 카테고리 + 정렬 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* 카테고리 필터 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={category === "" ? "default" : "outline"}
            className="cursor-pointer text-xs px-3 py-1"
            onClick={() => handleCategoryChange("")}
          >
            {t('allCategories')}
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat.value}
              variant={category === cat.value ? "default" : "outline"}
              className="cursor-pointer text-xs px-3 py-1"
              onClick={() => handleCategoryChange(cat.value)}
            >
              {cat.label}
            </Badge>
          ))}
        </div>

        {/* 정렬 */}
        <div className="flex items-center gap-1.5 sm:ml-auto">
          {([
            { key: 'createdAt', label: t('sortLatest') },
            { key: 'useCount', label: t('sortPopular') },
            { key: 'title', label: t('sortName') },
          ] as const).map((s) => (
            <Badge
              key={s.key}
              variant={sortBy === s.key ? "default" : "outline"}
              className="cursor-pointer text-xs px-3 py-1"
              onClick={() => handleSortChange(s.key)}
            >
              {s.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* 템플릿 목록 */}
      {loading ? (
        <LoadingSkeleton variant="card-grid" />
      ) : protocols.length === 0 ? (
        <EmptyState
          icon={FileX}
          title={total === 0 && !debouncedSearch && !category ? t('empty') : t('noResults')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {protocols.map((p) => (
            <Card key={p.id} className="shadow-card hover:shadow-elevated transition-all cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{p.category ?? t('general')}</Badge>
                </div>
                <CardTitle className="text-sm mt-3 group-hover:text-primary transition-colors">{p.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{p.category ?? t('general')}</span>
                  <span>·</span>
                  <span>{p.createdBy ?? "-"}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {(p.tags ?? []).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}
                </div>
                <div className="mt-4 pt-3 border-t space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {t('usageCount', { count: p.useCount ?? 0 })}
                      <HelpTooltip text={t('usageTooltip')} />
                    </span>
                    {(p.useCount ?? 0) > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 h-6 px-2 text-primary"
                        onClick={(e) => { e.stopPropagation(); navigate(`/notes?templateId=${p.id}`); }}
                      >
                        {t('viewNotes')} <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCreateNote(p); }}>
                      <FileText className="h-3 w-3" /> {t('createNote')}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCopy(p); }} disabled={copyingId === p.id}>
                      {copyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} {t('copy')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs p-1.5 text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); setEditTarget(p); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs p-1.5 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            {t('pageInfo', { total, from, to })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> {t('prevPage')}
            </Button>
            {/* 페이지 번호 */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-1 text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={item}
                      variant={page === item ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  )
                )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('nextPage')} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 새 프로토콜 생성 다이얼로그 */}
      <NewProtocolDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />

      {/* 프로토콜 수정 다이얼로그 */}
      {editTarget && (
        <EditProtocolDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          template={editTarget}
          onUpdated={handleUpdated}
        />
      )}

      {/* 프로토콜 삭제 확인 다이얼로그 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDesc', { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? tc('deleting') : tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
