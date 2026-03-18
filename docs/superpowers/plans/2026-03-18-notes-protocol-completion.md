# Notes & Protocol Menu Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연구노트 메뉴(삭제 기능 + templateId URL 필터)와 프로토콜/템플릿 메뉴(수정/삭제/크로스 네비게이션)를 완성하고, 백엔드 라우팅 충돌을 해소한다.

**Architecture:** 백엔드 note.routes.ts의 중복 template 라우트 제거 → template.controller.ts 단독 담당. 프론트엔드는 Note 타입에 templateId 추가 후 전체 메뉴 연계. 삭제 규칙: draft/in_progress만 삭제 가능, locked/signed는 버튼 숨김.

**Tech Stack:** Express/TypeScript (eln-service), React/TypeScript (Vite), react-router-dom useSearchParams, sonner toast, shadcn/ui AlertDialog

---

## File Map

| 파일 | 작업 |
|------|------|
| `services/eln-service/src/routes/note.routes.ts` | 중복 template 라우트 3개 제거 |
| `services/eln-service/src/controllers/note.controller.ts` | getNotes에 templateId 필터 추가 |
| `src/lib/mockData.ts` | Note 인터페이스에 templateId 추가 |
| `src/api/notes.ts` | listNotes templateId 파라미터, updateTemplate/deleteTemplate 추가 |
| `src/pages/NotesPage.tsx` | 삭제 버튼 + AlertDialog + URL templateId 필터 |
| `src/pages/ProtocolsPage.tsx` | 수정/삭제 버튼 + 크로스 네비게이션 |
| `src/components/EditProtocolDialog.tsx` | 신규 생성 — 템플릿 수정 다이얼로그 |
| `src/pages/NoteEditor.tsx` | templateId 있으면 원본 프로토콜 뱃지 표시 |

---

### Task 1: 백엔드 — note.routes.ts 중복 template 라우트 제거

**Files:**
- Modify: `services/eln-service/src/routes/note.routes.ts`

- [ ] **Step 1: note.routes.ts 하단 template 관련 라우트 3개 제거**

현재 파일 끝 부분(54~57줄):
```typescript
// ─── 템플릿 (note.routes 내 /api/templates) ──────────────────
router.get('/templates',         requirePermission('template:read'),   ctrl.getTemplates);
router.post('/templates',        requirePermission('template:write'),  ctrl.createTemplate);
router.get('/templates/:id',     requirePermission('template:read'),   ctrl.getTemplateById);
```
이 3줄과 위 주석을 삭제. template.routes.ts(`app.use('/api/templates', templateRoutes)`)가 전담.

- [ ] **Step 2: 빌드 확인**

```bash
cd services/eln-service && npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 3: commit**

```bash
git add services/eln-service/src/routes/note.routes.ts
git commit -m "fix(eln): remove duplicate template routes — template.controller now handles all /api/templates/*"
```

---

### Task 2: 백엔드 — getNotes에 templateId 필터 추가

**Files:**
- Modify: `services/eln-service/src/controllers/note.controller.ts`

- [ ] **Step 1: getNotes 쿼리 파라미터에 templateId 추가**

`getNotes` 함수 상단 구조분해 부분 수정:
```typescript
// 변경 전
const { status, tag, search, page = '1', limit = '20', type } = req.query;

// 변경 후
const { status, tag, search, page = '1', limit = '20', type, templateId } = req.query;
```

where 객체에 templateId 조건 추가 (tag 필터 바로 아래):
```typescript
if (tag)        where.tags = { has: tag as string };
if (templateId) where.templateId = templateId as string;  // 추가
if (search) {
```

- [ ] **Step 2: 빌드 확인**

```bash
cd services/eln-service && npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 3: commit**

```bash
git add services/eln-service/src/controllers/note.controller.ts
git commit -m "feat(eln): add templateId filter to GET /api/notes"
```

---

### Task 3: 프론트엔드 — Note 타입 + notes.ts API 업데이트

**Files:**
- Modify: `src/lib/mockData.ts`
- Modify: `src/api/notes.ts`

- [ ] **Step 1: Note 인터페이스에 templateId 추가**

`src/lib/mockData.ts`:
```typescript
export interface Note {
  id: string;
  title: string;
  status: 'draft' | 'in_progress' | 'signed' | 'locked';
  author?: string;
  authorId?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  project?: string;
  content?: string;
  templateId?: string;      // 추가
  revisions?: Revision[];
  linkedItems?: LinkedItem[];
}
```

- [ ] **Step 2: listNotes에 templateId 파라미터 추가**

`src/api/notes.ts`의 `listNotes` 시그니처 수정:
```typescript
export async function listNotes(params?: {
  status?: string;
  tag?: string;
  templateId?: string;   // 추가
}): Promise<ApiResponse<Note[]>> {
  try {
    const res = await apiClient.get<{ data?: Note[] } | Note[]>(
      '/notes',
      params as Record<string, string>,
    );
```

- [ ] **Step 3: updateTemplate / deleteTemplate 함수 추가**

`src/api/notes.ts` 파일 끝에 추가:
```typescript
export async function updateTemplate(
  id: string,
  data: {
    title?: string;
    description?: string;
    content?: string;
    category?: string;
    sections?: unknown[];
    tags?: string[];
    isPublic?: boolean;
  },
): Promise<ApiResponse<TemplateRecord>> {
  try {
    return await apiClient.put<TemplateRecord>(`/templates/${id}`, data);
  } catch (err) {
    return { ok: false, data: null as unknown as TemplateRecord, error: (err as Error).message || ERR_CONN };
  }
}

export async function deleteTemplate(id: string): Promise<ApiResponse<{ message: string }>> {
  try {
    return await apiClient.delete<{ message: string }>(`/templates/${id}`);
  } catch (err) {
    return { ok: false, data: { message: '' }, error: (err as Error).message || ERR_CONN };
  }
}
```

- [ ] **Step 4: 타입 체크**

```bash
npx tsc --noEmit
```
Expected: 오류 없음

- [ ] **Step 5: commit**

```bash
git add src/lib/mockData.ts src/api/notes.ts
git commit -m "feat(api): add templateId filter to listNotes, add updateTemplate/deleteTemplate"
```

---

### Task 4: NotesPage — 삭제 버튼 + URL templateId 필터

**Files:**
- Modify: `src/pages/NotesPage.tsx`

삭제 규칙:
- `draft`, `in_progress` → 삭제 버튼 표시
- `locked`, `signed` → 삭제 버튼 없음 (서명 완료/잠금 상태)

- [ ] **Step 1: import 업데이트**

파일 상단 import 수정:
```typescript
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
// ... 기존 import 유지 ...
import { Trash2 } from "lucide-react";
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
import { listNotes, changeNoteStatus, adminUnlockNote, deleteNote } from "@/api/notes";
```

- [ ] **Step 2: useSearchParams로 templateId 읽기 + 필터 로직 반영**

컴포넌트 최상단에 추가:
```typescript
const [searchParams] = useSearchParams();
const templateIdFilter = searchParams.get("templateId") ?? undefined;
```

`useEffect` 의존성과 API 호출 수정:
```typescript
useEffect(() => {
  setLoading(true);
  setLoadError(null);
  listNotes({
    ...(filter !== "all" && { status: filter }),
    ...(templateIdFilter && { templateId: templateIdFilter }),
  })
    .then((res) => {
      if (res.ok) {
        setNotes(res.data);
      } else {
        setLoadError(res.error || "노트 목록을 불러오지 못했습니다.");
        setNotes([]);
      }
    })
    .finally(() => setLoading(false));
}, [filter, templateIdFilter]);
```

- [ ] **Step 3: 삭제 상태 추가**

기존 state 아래에 추가:
```typescript
const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
const [deleting, setDeleting] = useState(false);
```

삭제 핸들러 추가:
```typescript
const handleDeleteNote = async () => {
  if (!deleteTarget) return;
  setDeleting(true);
  const res = await deleteNote(deleteTarget.id);
  setDeleting(false);
  if (res.ok) {
    setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
    toast.success(`"${deleteTarget.title}" 노트가 삭제되었습니다.`);
    setDeleteTarget(null);
  } else {
    toast.error(res.error || "노트 삭제에 실패했습니다.");
  }
};
```

- [ ] **Step 4: 카드에 삭제 버튼 추가 (draft/in_progress만)**

`<Card>` 내부 우측 영역 (`<div className="text-right shrink-0 ...">`)에 삭제 버튼 추가:
```typescript
{(note.status === "draft" || note.status === "in_progress") && (
  <Button
    variant="ghost"
    size="sm"
    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
    onClick={(e) => { e.preventDefault(); setDeleteTarget(note); }}
  >
    <Trash2 className="h-3.5 w-3.5" />
  </Button>
)}
```

- [ ] **Step 5: 삭제 확인 AlertDialog 추가 (JSX 맨 끝, 관리자 잠금 해제 Dialog 다음)**

```tsx
<AlertDialog
  open={!!deleteTarget}
  onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>노트를 삭제하시겠습니까?</AlertDialogTitle>
      <AlertDialogDescription>
        <strong>"{deleteTarget?.title}"</strong> 노트를 삭제합니다.
        삭제된 노트는 복구할 수 없습니다.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDeleteNote}
        disabled={deleting}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {deleting ? "삭제 중..." : "삭제"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: templateId 필터 중일 때 안내 배너 추가 (선택적)**

필터 버튼 영역 위에:
```tsx
{templateIdFilter && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
    <FileText className="h-4 w-4 shrink-0" />
    특정 프로토콜로 생성된 노트만 표시 중
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs ml-auto"
      onClick={() => { const p = new URLSearchParams(searchParams); p.delete("templateId"); window.history.replaceState({}, '', `?${p}`); }}
    >
      필터 해제
    </Button>
  </div>
)}
```
단, 이 방식은 React Router의 navigate를 쓰는 게 더 깔끔하므로 `useNavigate` 추가:
```typescript
import { Link, useSearchParams, useNavigate } from "react-router-dom";
// ...
const navigate = useNavigate();
// ...
onClick={() => navigate("/notes")}
```

- [ ] **Step 7: 타입 체크 + commit**

```bash
npx tsc --noEmit
git add src/pages/NotesPage.tsx
git commit -m "feat(notes): add delete button (draft/in_progress only), templateId URL filter"
```

---

### Task 5: EditProtocolDialog 컴포넌트 생성

**Files:**
- Create: `src/components/EditProtocolDialog.tsx`

NewProtocolDialog와 동일 구조이나 초기 데이터를 받고 updateTemplate을 호출.

- [ ] **Step 1: EditProtocolDialog.tsx 생성**

```tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { updateTemplate, type TemplateRecord } from "@/api/notes";

const CATEGORIES = ["기본", "분자생물학", "세포생물학", "생화학", "미생물학", "분석화학", "일반", "기타"];

interface EditProtocolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateRecord;
  onUpdated: (template: TemplateRecord) => void;
}

export default function EditProtocolDialog({ open, onOpenChange, template, onUpdated }: EditProtocolDialogProps) {
  const [title, setTitle] = useState(template.title);
  const [category, setCategory] = useState(template.category ?? "기본");
  const [description, setDescription] = useState(template.description ?? "");
  const [sections, setSections] = useState<string[]>(
    Array.isArray(template.sections) && template.sections.length > 0
      ? (template.sections as string[])
      : ["목적", "재료", "방법", "결과", "고찰"]
  );
  const [newSection, setNewSection] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(template.tags ?? []);
  const [submitting, setSubmitting] = useState(false);

  // 다이얼로그가 열릴 때 폼 재초기화
  useEffect(() => {
    if (open) {
      setTitle(template.title);
      setCategory(template.category ?? "기본");
      setDescription(template.description ?? "");
      setSections(
        Array.isArray(template.sections) && template.sections.length > 0
          ? (template.sections as string[])
          : ["목적", "재료", "방법", "결과", "고찰"]
      );
      setTags(template.tags ?? []);
      setTagInput("");
      setNewSection("");
    }
  }, [open, template]);

  const addSection = () => {
    const trimmed = newSection.trim();
    if (!trimmed || sections.includes(trimmed)) return;
    setSections([...sections, trimmed]);
    setNewSection("");
  };

  const removeSection = (index: number) => setSections(sections.filter((_, i) => i !== index));

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("프로토콜 제목을 입력해주세요."); return; }
    if (!category)     { toast.error("카테고리를 선택해주세요."); return; }
    if (sections.length === 0) { toast.error("최소 하나의 섹션을 추가해주세요."); return; }

    setSubmitting(true);
    const res = await updateTemplate(template.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      sections,
      tags: tags.length > 0 ? tags : [],
    });
    setSubmitting(false);

    if (res.ok && res.data) {
      onUpdated(res.data);
      toast.success("프로토콜이 수정되었습니다.", { description: `"${res.data.title}" 업데이트됨` });
      onOpenChange(false);
    } else {
      toast.error(res.error ?? "프로토콜 수정에 실패했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>프로토콜 수정</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-proto-title">프로토콜 제목 <span className="text-destructive">*</span></Label>
            <Input id="edit-proto-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>카테고리 <span className="text-destructive">*</span></Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-proto-desc">설명</Label>
            <Textarea id="edit-proto-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-2">
            <Label>섹션 구성 <span className="text-destructive">*</span></Label>
            <div className="space-y-1.5">
              {sections.map((s, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5 text-sm">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground text-xs w-5">{i + 1}.</span>
                  <span className="flex-1">{s}</span>
                  <button onClick={() => removeSection(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input placeholder="새 섹션 이름" value={newSection} onChange={(e) => setNewSection(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSection())} className="text-sm" />
              <Button type="button" variant="outline" size="sm" onClick={addSection} className="shrink-0">
                <Plus className="h-3.5 w-3.5 mr-1" /> 추가
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>태그</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs gap-1 pr-1">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input placeholder="태그 입력 후 Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} className="text-sm" />
              <Button type="button" variant="outline" size="sm" onClick={addTag} className="shrink-0">추가</Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: commit**

```bash
git add src/components/EditProtocolDialog.tsx
git commit -m "feat(protocols): add EditProtocolDialog component"
```

---

### Task 6: ProtocolsPage — 수정/삭제 + 크로스 네비게이션

**Files:**
- Modify: `src/pages/ProtocolsPage.tsx`

- [ ] **Step 1: import 업데이트**

```typescript
import { Search, BookOpen, Copy, Plus, FileText, Loader2, Pencil, Trash2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { listTemplates, copyTemplate, deleteTemplate, type TemplateRecord } from "@/api/notes";
```

- [ ] **Step 2: state 추가**

```typescript
const navigate = useNavigate();
const [editTarget, setEditTarget] = useState<TemplateRecord | null>(null);
const [deleteTarget, setDeleteTarget] = useState<TemplateRecord | null>(null);
const [deleting, setDeleting] = useState(false);
```

- [ ] **Step 3: 핸들러 추가**

`handleCopy` 아래에:
```typescript
const handleUpdated = (updated: TemplateRecord) => {
  setProtocols((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  setEditTarget(null);
};

const handleDelete = async () => {
  if (!deleteTarget) return;
  setDeleting(true);
  const res = await deleteTemplate(deleteTarget.id);
  setDeleting(false);
  if (res.ok) {
    setProtocols((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    toast.success(`"${deleteTarget.title}" 프로토콜이 삭제되었습니다.`);
    setDeleteTarget(null);
  } else {
    toast.error(res.error ?? "프로토콜 삭제에 실패했습니다.");
  }
};
```

- [ ] **Step 4: 카드 버튼 영역 수정**

기존 카드 하단의 `<div className="flex items-center justify-between ...">` 내부 수정:

```tsx
<div className="flex items-center justify-between mt-4 pt-3 border-t gap-2 flex-wrap">
  {/* 왼쪽: 사용 횟수 + 관련 노트 보기 */}
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      {p.useCount ?? 0}회 사용
      <HelpTooltip text="이 프로토콜로 연구노트를 생성한 횟수입니다." />
    </span>
    {(p.useCount ?? 0) > 0 && (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs gap-1 h-6 px-2 text-primary"
        onClick={(e) => { e.stopPropagation(); navigate(`/notes?templateId=${p.id}`); }}
      >
        노트 보기 <ArrowRight className="h-3 w-3" />
      </Button>
    )}
  </div>
  {/* 오른쪽: 노트 생성, 복사, 수정, 삭제 */}
  <div className="flex gap-1">
    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCreateNote(p); }}>
      <FileText className="h-3 w-3" /> 노트 생성
    </Button>
    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleCopy(p); }} disabled={copyingId === p.id}>
      {copyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} 복사
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="text-xs gap-1 text-muted-foreground hover:text-foreground"
      onClick={(e) => { e.stopPropagation(); setEditTarget(p); }}
    >
      <Pencil className="h-3 w-3" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className="text-xs gap-1 text-muted-foreground hover:text-destructive"
      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  </div>
</div>
```

- [ ] **Step 5: EditProtocolDialog + 삭제 AlertDialog 추가 (JSX 끝)**

```tsx
{/* 수정 다이얼로그 */}
{editTarget && (
  <EditProtocolDialog
    open={!!editTarget}
    onOpenChange={(v) => { if (!v) setEditTarget(null); }}
    template={editTarget}
    onUpdated={handleUpdated}
  />
)}

{/* 삭제 확인 다이얼로그 */}
<AlertDialog
  open={!!deleteTarget}
  onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>프로토콜을 삭제하시겠습니까?</AlertDialogTitle>
      <AlertDialogDescription>
        <strong>"{deleteTarget?.title}"</strong> 프로토콜을 삭제합니다.
        삭제 후 복구할 수 없으며, 이 프로토콜로 만든 노트는 유지됩니다.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDelete}
        disabled={deleting}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {deleting ? "삭제 중..." : "삭제"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: 타입 체크 + commit**

```bash
npx tsc --noEmit
git add src/pages/ProtocolsPage.tsx
git commit -m "feat(protocols): add edit/delete, cross-navigation to notes"
```

---

### Task 7: NoteEditor — 원본 프로토콜 뱃지

**Files:**
- Modify: `src/pages/NoteEditor.tsx`

- [ ] **Step 1: templateId 상태 + import 추가**

NoteEditor 상단 import에 추가:
```typescript
import { getTemplate } from "@/api/notes";
import { Link as RouterLink } from "react-router-dom";
```
(기존 `Link`가 react-router-dom에서 이미 import 중이므로 별칭 불필요 — `Link`를 그대로 사용)

기존 state들 아래에:
```typescript
const [templateTitle, setTemplateTitle] = useState<string | null>(null);
```

- [ ] **Step 2: 기존 노트 로드 시 templateId 있으면 템플릿 제목 로드**

기존 `useEffect` (노트 로드) 내 `getNote` 응답 처리에서 templateId 있을 때 추가 로드:
```typescript
getNote(id!).then((res) => {
  if (res.ok) {
    setTitle(res.data.title || "");
    setContent(res.data.content || "");
    setNoteStatus(res.data.status || "draft");
    // 원본 템플릿 제목 로드
    if (res.data.templateId) {
      getTemplate(res.data.templateId).then((tRes) => {
        if (tRes.ok) setTemplateTitle(tRes.data.title);
      });
    }
  }
}),
```

- [ ] **Step 3: 제목 영역 아래에 템플릿 뱃지 표시**

기존 노트(`!isNew`) 제목 Input 아래에:
```tsx
{!isNew && templateTitle && (
  <div className="flex items-center gap-1.5">
    <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer hover:bg-secondary/80" asChild>
      <Link to="/protocols">
        <FileText className="h-3 w-3" />
        프로토콜: {templateTitle}
      </Link>
    </Badge>
  </div>
)}
```

기존 신규 노트의 프로토콜 기반 뱃지 영역(isNew + fromProtocol)과 별개로 표시.

- [ ] **Step 4: 타입 체크 + commit**

```bash
npx tsc --noEmit
git add src/pages/NoteEditor.tsx
git commit -m "feat(editor): show source protocol badge when note was created from a template"
```

---

### Task 8: Docker 재빌드 및 검증

- [ ] **Step 1: eln-service 도커 재빌드**

```bash
docker compose up --build eln-service -d
```

- [ ] **Step 2: 서비스 헬스 확인**

```bash
curl http://localhost:8002/health
```
Expected: `{"status":"ok","service":"eln-service",...}`

- [ ] **Step 3: 전체 스택 재시작 (프론트 포함)**

```bash
docker compose up --build web -d
```

- [ ] **Step 4: 수동 테스트 체크리스트**

**연구노트 메뉴:**
- [ ] draft/in_progress 노트에 hover 시 휴지통 버튼 보임
- [ ] 휴지통 클릭 → AlertDialog → 삭제 확인 → 목록에서 사라짐
- [ ] signed 노트에 휴지통 버튼 없음
- [ ] locked 노트에 휴지통 버튼 없음

**프로토콜/템플릿 메뉴:**
- [ ] 연필 버튼 → EditProtocolDialog → 수정 → 목록 인라인 업데이트
- [ ] 휴지통 버튼 → AlertDialog → 삭제 확인 → 목록에서 사라짐
- [ ] useCount > 0인 카드에 "노트 보기 →" 버튼 표시
- [ ] "노트 보기" 클릭 → `/notes?templateId=xxx` → 해당 템플릿 기반 노트만 표시
- [ ] 새 프로토콜 생성 (template.controller.ts 통해 올바르게 처리되는지)

**연구노트 에디터:**
- [ ] 템플릿으로 만든 노트 열면 "프로토콜: [템플릿 제목]" 뱃지 표시
- [ ] 뱃지 클릭 → `/protocols` 이동
- [ ] 직접 만든 노트(templateId 없음)에는 뱃지 미표시
