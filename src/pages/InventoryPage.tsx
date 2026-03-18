import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listItems, createItem, updateItem, deleteItem,
  adjustQuantity, getItemHistory, getCategories,
  getExpiringItems, getLowStockItems,
  type InventoryItem, type InventoryHistory,
} from "@/api/inventory";

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  reagent: "시약", sample: "샘플", equipment: "장비",
  consumable: "소모품", antibody: "항체", plasmid: "플라스미드",
  cell_line: "세포주", output: "산출물", license: "라이선스",
  infrastructure: "인프라", other: "기타",
};

const STATUS_LABELS: Record<string, string> = {
  available: "사용가능", in_use: "사용중", depleted: "소진",
  expired: "만료", disposed: "폐기", maintenance: "유지보수",
};

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  in_use: "bg-blue-100 text-blue-800",
  depleted: "bg-orange-100 text-orange-800",
  expired: "bg-red-100 text-red-800",
  disposed: "bg-gray-100 text-gray-600",
  maintenance: "bg-yellow-100 text-yellow-800",
};

const OTHER_TYPES = ["output", "license", "infrastructure", "other"];

const TAB_DEFS = [
  { key: "all", label: "전체" },
  { key: "reagent", label: "시약" },
  { key: "sample", label: "샘플" },
  { key: "equipment", label: "장비" },
  { key: "consumable", label: "소모품" },
  { key: "antibody", label: "항체" },
  { key: "plasmid", label: "플라스미드" },
  { key: "cell_line", label: "세포주" },
  { key: "other_group", label: "기타" },
] as const;

const SENTINEL_ALL = "__ALL__";

// ─────────────────────────────────────────────
// AlertBanner
// ─────────────────────────────────────────────

function AlertBanner({
  expiringCount,
  lowStockCount,
  onExpiringClick,
  onLowStockClick,
}: {
  expiringCount: number;
  lowStockCount: number;
  onExpiringClick: () => void;
  onLowStockClick: () => void;
}) {
  if (expiringCount === 0 && lowStockCount === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {expiringCount > 0 && (
        <button
          onClick={onExpiringClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-sm hover:bg-orange-100 transition-colors"
        >
          <span className="font-semibold">{expiringCount}건</span> 만료 임박
        </button>
      )}
      {lowStockCount > 0 && (
        <button
          onClick={onLowStockClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm hover:bg-red-100 transition-colors"
        >
          <span className="font-semibold">{lowStockCount}건</span> 재고 부족
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// AddEditDialog
// ─────────────────────────────────────────────

function AddEditDialog({
  open,
  onOpenChange,
  editItem,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem: InventoryItem | null;
  categories: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const isEdit = !!editItem;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "reagent" as InventoryItem["type"],
    status: "available" as InventoryItem["status"],
    category: "", location: "", quantity: "",
    unit: "", minQuantity: "", barcode: "",
    expiryDate: "", expiryWarningDays: "30", tags: "",
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        type: editItem.type,
        status: editItem.status,
        category: editItem.category ?? "",
        location: editItem.location ?? "",
        quantity: editItem.quantity !== undefined ? String(editItem.quantity) : "",
        unit: editItem.unit ?? "",
        minQuantity: editItem.minQuantity !== undefined ? String(editItem.minQuantity) : "",
        barcode: editItem.barcode ?? "",
        expiryDate: editItem.expiryDate ? editItem.expiryDate.slice(0, 10) : "",
        expiryWarningDays: String(editItem.expiryWarningDays ?? 30),
        tags: (editItem.tags ?? []).join(", "),
      });
    } else {
      setForm({
        name: "", type: "reagent", status: "available", category: "", location: "",
        quantity: "", unit: "", minQuantity: "", barcode: "", expiryDate: "", expiryWarningDays: "30", tags: "",
      });
    }
  }, [editItem, open]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("이름을 입력해주세요."); return; }
    setSubmitting(true);
    const basePayload = {
      name: form.name.trim(),
      type: form.type,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      ...(form.category && { category: form.category }),
      ...(form.location && { location: form.location }),
      ...(form.quantity && { quantity: Number(form.quantity) }),
      ...(form.unit && { unit: form.unit }),
      ...(form.minQuantity && { minQuantity: Number(form.minQuantity) }),
      ...(form.barcode && { barcode: form.barcode }),
      ...(form.expiryDate && { expiryDate: form.expiryDate }),
      expiryWarningDays: form.expiryWarningDays ? Number(form.expiryWarningDays) : 30,
    };

    try {
      const res = isEdit
        ? await updateItem(editItem!.id, { ...basePayload, status: form.status })
        : await createItem(basePayload);

      if (res.ok) {
        toast.success(isEdit ? "아이템이 수정되었습니다." : "아이템이 추가되었습니다.");
        onOpenChange(false);
        onSaved();
      } else {
        toast.error((res as { ok: false; error: string }).error || "저장에 실패했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "아이템 수정" : "아이템 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>이름 <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: Cas9 단백질" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>유형 <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as InventoryItem["type"] }))} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-1">
                <Label>상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as InventoryItem["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>카테고리</Label>
              <Select
                value={form.category || SENTINEL_ALL}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v === SENTINEL_ALL ? "" : v }))}
                disabled={categories.length === 0}
              >
                <SelectTrigger><SelectValue placeholder="선택..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SENTINEL_ALL}>없음</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>위치</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="예: A동 냉장고 #2" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>수량</Label>
              <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>단위</Label>
              <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="μg, 개..." />
            </div>
            <div className="space-y-1">
              <Label>최소재고</Label>
              <Input type="number" min="0" value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>바코드</Label>
              <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="REA-2026-001" />
            </div>
            <div className="space-y-1">
              <Label>만료일</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>만료경고일수</Label>
              <Input type="number" min="1" value={form.expiryWarningDays} onChange={(e) => setForm((f) => ({ ...f, expiryWarningDays: e.target.value }))} placeholder="30" />
            </div>
            <div className="space-y-1">
              <Label>태그</Label>
              <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="태그1, 태그2" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? "저장 중..." : isEdit ? "수정" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// AdjustQuantityDialog
// ─────────────────────────────────────────────

function AdjustQuantityDialog({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [changeType, setChangeType] = useState<"in" | "out" | "adjust">("in");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) { setChangeType("in"); setQty(""); setReason(""); }
  }, [item]);

  const current = item?.quantity ?? 0;
  const qtyNum = Number(qty) || 0;
  const preview = changeType === "in" ? current + qtyNum
    : changeType === "out" ? current - qtyNum
    : qtyNum;

  const handleSave = async () => {
    if (!item) return;
    if (!qty || qtyNum <= 0) { toast.error("수량은 0보다 커야 합니다."); return; }
    setSubmitting(true);
    try {
      const res = await adjustQuantity(item.id, { changeType, quantity: qtyNum, reason: reason || undefined });
      if (res.ok) {
        toast.success("수량이 조정되었습니다.");
        onClose();
        onSaved();
      } else {
        toast.error((res as { ok: false; error: string }).error || "수량 조정에 실패했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>수량 조정 — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>변경 유형</Label>
            <div className="flex gap-4">
              {(["in", "out", "adjust"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="changeType" value={t} checked={changeType === t}
                    onChange={() => setChangeType(t)} className="accent-primary" />
                  <span className="text-sm">{t === "in" ? "입고" : t === "out" ? "출고" : "절대값 설정"}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>수량</Label>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="수량 입력" />
          </div>
          <div className="space-y-1">
            <Label>사유 (선택)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 입력..." />
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            현재 <strong>{current}{item?.unit ?? ""}</strong> → 조정 후{" "}
            <strong className={preview < 0 ? "text-destructive" : ""}>{preview}{item?.unit ?? ""}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? "처리 중..." : "적용"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// DetailDialog
// ─────────────────────────────────────────────

const CHANGE_TYPE_LABELS: Record<string, string> = {
  in: "입고", out: "출고", adjust: "조정", status_change: "상태변경",
};

function DetailDialog({
  item,
  onClose,
}: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<InventoryHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    if (!item) return;
    setHistoryLoading(true);
    setHistoryError(false);
    getItemHistory(item.id).then((res) => {
      if (res.ok) setHistory(res.data);
      else setHistoryError(true);
    }).finally(() => setHistoryLoading(false));
  }, [item]);

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.name}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {([
                ["유형", TYPE_LABELS[item.type] ?? item.type],
                ["상태", STATUS_LABELS[item.status] ?? item.status],
                ["카테고리", item.category ?? "-"],
                ["위치", item.location ?? "-"],
                ["수량", item.quantity !== undefined ? `${item.quantity} ${item.unit ?? ""}` : "-"],
                ["최소재고", item.minQuantity !== undefined ? `${item.minQuantity} ${item.unit ?? ""}` : "-"],
                ["바코드", item.barcode ?? "-"],
                ["만료일", item.expiryDate ? item.expiryDate.slice(0, 10) : "-"],
                ["만료경고일수", item.expiryWarningDays !== undefined ? `${item.expiryWarningDays}일` : "-"],
                ["태그", (item.tags ?? []).join(", ") || "-"],
                ["등록자", item.createdBy ?? "-"],
                ["등록일", item.createdAt ? item.createdAt.slice(0, 10) : "-"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}><span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value}</span></div>
              ))}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">메타데이터:</span>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded-md overflow-x-auto">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">변경 이력</p>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">이력 로딩 중...</p>
              ) : historyError ? (
                <p className="text-sm text-destructive">이력을 불러오지 못했습니다.</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">변경 이력이 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>날짜</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>전</TableHead>
                      <TableHead>후</TableHead>
                      <TableHead>사유</TableHead>
                      <TableHead>처리자</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">{h.createdAt?.slice(0, 16).replace("T", " ")}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{CHANGE_TYPE_LABELS[h.changeType] ?? h.changeType}</Badge></TableCell>
                        <TableCell className="text-xs">{h.quantityBefore ?? h.statusBefore ?? "-"}</TableCell>
                        <TableCell className="text-xs">{h.quantityAfter ?? h.statusAfter ?? "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{h.reason ?? "-"}</TableCell>
                        <TableCell className="text-xs">{h.performedBy}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// InventoryPage
// ─────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [typeTab, setTypeTab] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    Promise.all([getExpiringItems(90), getLowStockItems()]).then(([exp, low]) => {
      if (exp.ok) setExpiringCount(exp.data.length);
      if (low.ok) setLowStockCount(low.data.length);
    });
    getCategories().then((res) => { if (res.ok) setCategories(res.data); });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    const apiType = (typeTab === "all" || typeTab === "other_group") ? undefined : typeTab;
    const res = await listItems({
      type: apiType,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      q: debouncedQ || undefined,
    });
    if (res.ok) {
      let data = res.data;
      if (typeTab === "other_group") {
        data = data.filter((i) => OTHER_TYPES.includes(i.type));
      }
      setItems(data);
    } else {
      setError(true);
      toast.error((res as { ok: false; error: string }).error || "목록을 불러오지 못했습니다.");
    }
    setLoading(false);
  }, [typeTab, statusFilter, categoryFilter, debouncedQ]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`'${item.name}'을(를) 삭제하시겠습니까?`)) return;
    const res = await deleteItem(item.id);
    if (res.ok) {
      toast.success("삭제되었습니다.");
      loadItems();
    } else {
      toast.error((res as { ok: false; error: string }).error || "삭제에 실패했습니다.");
    }
  };

  const getExpiryInfo = (item: InventoryItem) => {
    if (!item.expiryDate) return null;
    const daysLeft = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
    const warnDays = item.expiryWarningDays ?? 30;
    return { daysLeft, isExpired: daysLeft < 0, isWarning: daysLeft >= 0 && daysLeft <= warnDays };
  };

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">인벤토리</h1>
          <p className="text-sm text-muted-foreground mt-1">시약 / 샘플 / 장비 / 자산 관리</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> 아이템 추가
        </Button>
      </div>

      <AlertBanner
        expiringCount={expiringCount}
        lowStockCount={lowStockCount}
        onExpiringClick={() => setStatusFilter("expired")}
        onLowStockClick={() => setStatusFilter("depleted")}
      />

      <div className="flex gap-1.5 flex-wrap">
        {TAB_DEFS.map((t) => (
          <Button key={t.key} variant={typeTab === t.key ? "default" : "outline"} size="sm"
            className="text-xs" onClick={() => setTypeTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="이름, 바코드, 위치 검색..."
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter || SENTINEL_ALL} onValueChange={(v) => setStatusFilter(v === SENTINEL_ALL ? "" : v)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="상태 전체" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_ALL}>전체</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || SENTINEL_ALL} onValueChange={(v) => setCategoryFilter(v === SENTINEL_ALL ? "" : v)} disabled={categories.length === 0}>
          <SelectTrigger className="w-32"><SelectValue placeholder="카테고리" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_ALL}>전체</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>수량</TableHead>
                <TableHead>위치</TableHead>
                <TableHead>만료일</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell></TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground mb-2">데이터를 불러오지 못했습니다.</p>
                    <Button variant="outline" size="sm" onClick={loadItems}>다시 시도</Button>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground mb-2">등록된 항목이 없습니다.</p>
                    <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>아이템 추가</Button>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const expiry = getExpiryInfo(item);
                  const isLowStock = item.minQuantity !== undefined && item.quantity !== undefined && item.quantity <= item.minQuantity;
                  return (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailItem(item)}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[item.type] ?? item.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${STATUS_COLORS[item.status] ?? ""}`}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className={isLowStock ? "text-orange-600 font-medium" : ""}>
                          {item.quantity !== undefined ? `${item.quantity} ${item.unit ?? ""}` : "-"}
                          {isLowStock && " ⚠"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.location ?? "-"}</TableCell>
                      <TableCell className="text-sm">
                        {expiry ? (
                          <span className={expiry.isExpired ? "text-red-600 font-medium" : expiry.isWarning ? "text-orange-500" : ""}>
                            {expiry.isExpired ? "만료" : `${expiry.daysLeft}일`}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" title="수량 조정" onClick={() => setAdjustItem(item)}>↕</Button>
                          <Button variant="ghost" size="sm" title="수정" onClick={() => setEditItem(item)}>✏</Button>
                          <Button variant="ghost" size="sm" title="삭제" className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item)}>🗑</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AddEditDialog
        open={addOpen || !!editItem}
        onOpenChange={(v) => { if (!v) { setAddOpen(false); setEditItem(null); } }}
        editItem={editItem}
        categories={categories}
        onSaved={loadItems}
      />
      <AdjustQuantityDialog
        item={adjustItem}
        onClose={() => setAdjustItem(null)}
        onSaved={loadItems}
      />
      <DetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
}
