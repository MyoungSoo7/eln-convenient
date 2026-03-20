import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  adjustQuantity, getItemHistory,
  getExpiringItems, getLowStockItems,
  type InventoryItem, type InventoryHistory,
} from "@/api/inventory";
import { listCodes, type CodeRecord } from "@/api/notes";

// ─────────────────────────────────────────────
// 상수 (non-translatable)
// ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  in_use: "bg-blue-100 text-blue-800",
  depleted: "bg-orange-100 text-orange-800",
  expired: "bg-red-100 text-red-800",
  disposed: "bg-gray-100 text-gray-600",
  maintenance: "bg-yellow-100 text-yellow-800",
};

const OTHER_TYPES = ["output", "license", "infrastructure", "other"];

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
  const { t } = useTranslation('inventory');
  if (expiringCount === 0 && lowStockCount === 0) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {expiringCount > 0 && (
        <button
          onClick={onExpiringClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-sm hover:bg-orange-100 transition-colors"
        >
          {t('alert.expiring', { count: expiringCount })}
        </button>
      )}
      {lowStockCount > 0 && (
        <button
          onClick={onLowStockClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm hover:bg-red-100 transition-colors"
        >
          {t('alert.lowStock', { count: lowStockCount })}
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
  itemTypes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem: InventoryItem | null;
  itemTypes: CodeRecord[];
  onSaved: () => void;
}) {
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');

  const TYPE_LABELS: Record<string, string> = Object.fromEntries(
    itemTypes.map((c) => [c.value, c.label])
  );

  const STATUS_LABELS: Record<string, string> = {
    available: t('status.available'), in_use: t('status.in_use'), depleted: t('status.depleted'),
    expired: t('status.expired'), disposed: t('status.disposed'), maintenance: t('status.maintenance'),
  };

  const isEdit = !!editItem;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "reagent" as InventoryItem["type"],
    status: "available" as InventoryItem["status"],
    location: "", quantity: "",
    unit: "", minQuantity: "", barcode: "",
    expiryDate: "", expiryWarningDays: "30", tags: "",
  });

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        type: editItem.type,
        status: editItem.status,

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
        name: "", type: "reagent", status: "available", location: "",
        quantity: "", unit: "", minQuantity: "", barcode: "", expiryDate: "", expiryWarningDays: "30", tags: "",
      });
    }
  }, [editItem, open]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t('dialog.nameRequired')); return; }
    setSubmitting(true);
    const basePayload = {
      name: form.name.trim(),
      type: form.type,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],

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
        toast.success(isEdit ? t('dialog.editSuccess') : t('dialog.addSuccess'));
        onOpenChange(false);
        onSaved();
      } else {
        toast.error((res as { ok: false; error: string }).error || tc('saveFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('dialog.editTitle') : t('dialog.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>{t('dialog.name')} <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('dialog.namePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('dialog.type')} <span className="text-destructive">*</span></Label>
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
                <Label>{t('dialog.statusLabel')}</Label>
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
          <div className="space-y-1">
            <Label>{t('dialog.location')}</Label>
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder={t('dialog.locationPlaceholder')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{t('dialog.quantity')}</Label>
              <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>{t('dialog.unit')}</Label>
              <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder={t('dialog.unitPlaceholder')} />
            </div>
            <div className="space-y-1">
              <Label>{t('dialog.minQuantity')}</Label>
              <Input type="number" min="0" value={form.minQuantity} onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('dialog.barcode')}</Label>
              <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="REA-2026-001" />
            </div>
            <div className="space-y-1">
              <Label>{t('dialog.expiryDate')}</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('dialog.expiryWarningDays')}</Label>
              <Input type="number" min="1" value={form.expiryWarningDays} onChange={(e) => setForm((f) => ({ ...f, expiryWarningDays: e.target.value }))} placeholder="30" />
            </div>
            <div className="space-y-1">
              <Label>{t('dialog.tags')}</Label>
              <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder={t('dialog.tagsPlaceholder')} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={handleSave} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? tc('saving') : isEdit ? t('dialog.saveEdit') : tc('add')}
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
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');

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
    if (!qty || qtyNum <= 0) { toast.error(t('adjust.quantityRequired')); return; }
    setSubmitting(true);
    try {
      const res = await adjustQuantity(item.id, { changeType, quantity: qtyNum, reason: reason || undefined });
      if (res.ok) {
        toast.success(t('adjust.success'));
        onClose();
        onSaved();
      } else {
        toast.error((res as { ok: false; error: string }).error || t('adjust.failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('adjust.title', { name: item?.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('adjust.changeType')}</Label>
            <div className="flex gap-4">
              {(["in", "out", "adjust"] as const).map((ct) => (
                <label key={ct} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="changeType" value={ct} checked={changeType === ct}
                    onChange={() => setChangeType(ct)} className="accent-primary" />
                  <span className="text-sm">{ct === "in" ? t('adjust.in') : ct === "out" ? t('adjust.out') : t('adjust.absoluteSet')}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('adjust.quantity')}</Label>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={t('adjust.quantityPlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label>{t('adjust.reason')}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('adjust.reasonPlaceholder')} />
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            {t('adjust.preview', { current, unit: item?.unit ?? "", after: preview })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc('cancel')}</Button>
          <Button onClick={handleSave} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? tc('processing') : tc('apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// DetailDialog
// ─────────────────────────────────────────────

function DetailDialog({
  item,
  onClose,
}: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('inventory');

  const TYPE_LABELS: Record<string, string> = {
    reagent: t('type.reagent'), sample: t('type.sample'), equipment: t('type.equipment'),
    consumable: t('type.consumable'), antibody: t('type.antibody'), plasmid: t('type.plasmid'),
    cell_line: t('type.cell_line'), output: t('type.output'), license: t('type.license'),
    infrastructure: t('type.infrastructure'), other: t('type.other'),
  };

  const STATUS_LABELS: Record<string, string> = {
    available: t('status.available'), in_use: t('status.in_use'), depleted: t('status.depleted'),
    expired: t('status.expired'), disposed: t('status.disposed'), maintenance: t('status.maintenance'),
  };

  const CHANGE_TYPE_LABELS: Record<string, string> = {
    in: t('changeType.in'), out: t('changeType.out'), adjust: t('changeType.adjust'), status_change: t('changeType.status_change'),
  };

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
                [t('detail.type'), TYPE_LABELS[item.type] ?? item.type],
                [t('detail.status'), STATUS_LABELS[item.status] ?? item.status],

                [t('detail.location'), item.location ?? "-"],
                [t('detail.quantity'), item.quantity !== undefined ? `${item.quantity} ${item.unit ?? ""}` : "-"],
                [t('detail.minQuantity'), item.minQuantity !== undefined ? `${item.minQuantity} ${item.unit ?? ""}` : "-"],
                [t('detail.barcode'), item.barcode ?? "-"],
                [t('detail.expiryDate'), item.expiryDate ? item.expiryDate.slice(0, 10) : "-"],
                [t('detail.expiryWarningDays'), item.expiryWarningDays !== undefined ? `${item.expiryWarningDays}일` : "-"],
                [t('detail.tags'), (item.tags ?? []).join(", ") || "-"],
                [t('detail.createdBy'), item.createdBy ?? "-"],
                [t('detail.createdAt'), item.createdAt ? item.createdAt.slice(0, 10) : "-"],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}><span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value}</span></div>
              ))}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">{t('detail.metadata')}:</span>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded-md overflow-x-auto">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">{t('detail.history')}</p>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">{t('detail.historyLoading')}</p>
              ) : historyError ? (
                <p className="text-sm text-destructive">{t('detail.historyError')}</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.historyEmpty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('detail.historyDate')}</TableHead>
                      <TableHead>{t('detail.historyType')}</TableHead>
                      <TableHead>{t('detail.historyBefore')}</TableHead>
                      <TableHead>{t('detail.historyAfter')}</TableHead>
                      <TableHead>{t('detail.historyReason')}</TableHead>
                      <TableHead>{t('detail.historyPerformer')}</TableHead>
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
  const { t } = useTranslation('inventory');
  const { t: tc } = useTranslation('common');

  // 인벤토리 유형을 Code 테이블에서 로드
  const [itemTypes, setItemTypes] = useState<CodeRecord[]>([]);
  useEffect(() => {
    listCodes('INVENTORY_ITEM_TYPE').then((res) => {
      if (res.ok) setItemTypes(res.data);
    });
  }, []);

  const TYPE_LABELS: Record<string, string> = Object.fromEntries(
    itemTypes.map((c) => [c.value, c.label])
  );

  const STATUS_LABELS: Record<string, string> = {
    available: t('status.available'), in_use: t('status.in_use'), depleted: t('status.depleted'),
    expired: t('status.expired'), disposed: t('status.disposed'), maintenance: t('status.maintenance'),
  };

  const TAB_DEFS = [
    { key: "all", label: t('tab.all') },
    ...itemTypes.map((c) => ({ key: c.value, label: c.label })),
  ];

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [typeTab, setTypeTab] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [expiringCount, setExpiringCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    Promise.all([getExpiringItems(90), getLowStockItems()]).then(([exp, low]) => {
      if (exp.ok) setExpiringCount(exp.data.length);
      if (low.ok) setLowStockCount(low.data.length);
    });

  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    const apiType = (typeTab === "all" || typeTab === "other_group") ? undefined : typeTab;
    const res = await listItems({
      type: apiType,
      status: statusFilter || undefined,

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
      toast.error((res as { ok: false; error: string }).error || t('listLoadFailed'));
    }
    setLoading(false);
  }, [typeTab, statusFilter, debouncedQ, t]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(t('deleteConfirm', { name: item.name }))) return;
    const res = await deleteItem(item.id);
    if (res.ok) {
      toast.success(t('deleteSuccess'));
      loadItems();
    } else {
      toast.error((res as { ok: false; error: string }).error || tc('deleteFailed'));
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
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button className="gradient-primary text-primary-foreground gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> {t('addItem')}
        </Button>
      </div>

      <AlertBanner
        expiringCount={expiringCount}
        lowStockCount={lowStockCount}
        onExpiringClick={() => setStatusFilter("expired")}
        onLowStockClick={() => setStatusFilter("depleted")}
      />

      <div className="flex gap-1.5 flex-wrap">
        {TAB_DEFS.map((tab) => (
          <Button key={tab.key} variant={typeTab === tab.key ? "default" : "outline"} size="sm"
            className="text-xs" onClick={() => setTypeTab(tab.key)}>
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10" placeholder={t('searchPlaceholder')}
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter || SENTINEL_ALL} onValueChange={(v) => setStatusFilter(v === SENTINEL_ALL ? "" : v)}>
          <SelectTrigger className="w-32"><SelectValue placeholder={t('statusAll')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_ALL}>{tc('all')}</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.name')}</TableHead>
                <TableHead>{t('table.type')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead>{t('table.quantity')}</TableHead>
                <TableHead>{t('table.location')}</TableHead>
                <TableHead>{t('table.expiry')}</TableHead>
                <TableHead className="text-right">{t('table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{tc('loading')}</TableCell></TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground mb-2">{tc('loadFailed')}</p>
                    <Button variant="outline" size="sm" onClick={loadItems}>{tc('retry')}</Button>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground mb-2">{t('empty')}</p>
                    <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>{t('addItem')}</Button>
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
                            {expiry.isExpired ? t('expired') : t('daysLeft', { count: expiry.daysLeft })}
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
        itemTypes={itemTypes}
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
