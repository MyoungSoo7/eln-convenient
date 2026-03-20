import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listCodes, createCode, updateCode, deleteCode, type CodeRecord } from "@/api/notes";

const CODE_GROUPS = [
  { value: "TEMPLATE_CATEGORY", label: "프로토콜 카테고리" },
];

export default function CodeManagePage() {
  const qc = useQueryClient();
  const [selectedGroup, setSelectedGroup] = useState("TEMPLATE_CATEGORY");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CodeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CodeRecord | null>(null);
  const [form, setForm] = useState({ value: "", label: "", sortOrder: 0 });

  const codesQuery = useQuery({
    queryKey: ["codes", selectedGroup],
    queryFn: async () => {
      const res = await listCodes(selectedGroup);
      if (!res.ok) throw new Error(res.error ?? "코드 목록 조회 실패");
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: { value: string; label: string; sortOrder: number }) => {
      const res = editTarget
        ? await updateCode(editTarget.id, { value: values.value, label: values.label, sortOrder: values.sortOrder })
        : await createCode({ group: selectedGroup, value: values.value, label: values.label, sortOrder: values.sortOrder });
      if (!res.ok) throw new Error(res.error ?? "저장 실패");
      return res.data;
    },
    onSuccess: () => {
      toast({ title: editTarget ? "코드 수정 완료" : "코드 추가 완료" });
      setDialogOpen(false);
      setEditTarget(null);
      setForm({ value: "", label: "", sortOrder: 0 });
      qc.invalidateQueries({ queryKey: ["codes", selectedGroup] });
    },
    onError: (err: Error) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteCode(id);
      if (!res.ok) throw new Error(res.error ?? "삭제 실패");
    },
    onSuccess: () => {
      toast({ title: "코드 삭제 완료" });
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["codes", selectedGroup] });
    },
    onError: (err: Error) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditTarget(null);
    const maxSort = (codesQuery.data ?? []).reduce((max, c) => Math.max(max, c.sortOrder), -1);
    setForm({ value: "", label: "", sortOrder: maxSort + 1 });
    setDialogOpen(true);
  };

  const openEdit = (code: CodeRecord) => {
    setEditTarget(code);
    setForm({ value: code.value, label: code.label, sortOrder: code.sortOrder });
    setDialogOpen(true);
  };

  const groupLabel = CODE_GROUPS.find((g) => g.value === selectedGroup)?.label ?? selectedGroup;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          코드 관리
          <HelpTooltip text="프로토콜 카테고리 등 시스템에서 사용하는 공통 코드를 관리합니다. 코드를 추가/수정/삭제하면 즉시 반영됩니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">공통 코드 등록 및 관리</p>
      </div>

      {/* 그룹 선택 */}
      <div className="flex items-center gap-3">
        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger className="w-60">
            <Tag className="h-3.5 w-3.5 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CODE_GROUPS.map((g) => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">{codesQuery.data?.length ?? 0}건</Badge>
      </div>

      {/* 코드 목록 */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{groupLabel}</CardTitle>
          <Button size="sm" className="gradient-primary text-primary-foreground gap-1" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> 코드 추가
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {codesQuery.isLoading && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {codesQuery.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">순서</TableHead>
                  <TableHead>값</TableHead>
                  <TableHead>표시명</TableHead>
                  <TableHead className="w-20">상태</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {codesQuery.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      등록된 코드가 없습니다. 코드를 추가해주세요.
                    </TableCell>
                  </TableRow>
                )}
                {codesQuery.data.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="text-muted-foreground">{code.sortOrder}</TableCell>
                    <TableCell className="font-medium">{code.value}</TableCell>
                    <TableCell className="text-muted-foreground">{code.label}</TableCell>
                    <TableCell>
                      <Badge variant={code.isActive ? "default" : "secondary"} className="text-[10px]">
                        {code.isActive ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(code)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(code)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 코드 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "코드 수정" : "코드 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">값 *</label>
              <Input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="예: 분자생물학" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">표시명</label>
              <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="비워두면 값과 동일" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">정렬 순서</label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={!form.value.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editTarget ? "저장" : "추가")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>코드 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.value}" 코드를 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
