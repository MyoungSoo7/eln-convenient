import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { createTemplate, type TemplateRecord } from "@/api/notes";

const CATEGORIES = ["기본", "분자생물학", "세포생물학", "생화학", "미생물학", "분석화학", "일반", "기타"];

interface NewProtocolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (template: TemplateRecord) => void;
}

export default function NewProtocolDialog({ open, onOpenChange, onCreated }: NewProtocolDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("기본");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<string[]>(["목적", "재료", "방법", "결과", "고찰"]);
  const [newSection, setNewSection] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setDescription("");
    setSections(["목적", "재료", "방법", "결과", "고찰"]);
    setNewSection("");
    setTagInput("");
    setTags([]);
  };

  const addSection = () => {
    const trimmed = newSection.trim();
    if (!trimmed || sections.includes(trimmed)) return;
    setSections([...sections, trimmed]);
    setNewSection("");
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("프로토콜 제목을 입력해주세요.");
      return;
    }
    if (!category) {
      toast.error("카테고리를 선택해주세요.");
      return;
    }
    if (sections.length === 0) {
      toast.error("최소 하나의 섹션을 추가해주세요.");
      return;
    }

    setSubmitting(true);
    const res = await createTemplate({
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      sections: sections.map((s, i) => ({ type: 'text', title: s, content: '', order: i })),
      tags: tags.length > 0 ? tags : undefined,
      isPublic: true,
    });
    setSubmitting(false);

    if (res.ok && res.data) {
      onCreated(res.data);
      toast.success("프로토콜이 생성되었습니다.", {
        description: `"${res.data.title}" 템플릿이 등록되었습니다.`,
      });
      resetForm();
      onOpenChange(false);
    } else {
      toast.error(res.error ?? "프로토콜 생성에 실패했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 프로토콜 생성</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 제목 */}
          <div className="space-y-2">
            <Label htmlFor="proto-title">프로토콜 제목 <span className="text-destructive">*</span></Label>
            <Input id="proto-title" placeholder="예: Western Blot 표준 프로토콜" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* 카테고리 */}
          <div className="space-y-2">
            <Label>카테고리 <span className="text-destructive">*</span></Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <Label htmlFor="proto-desc">설명</Label>
            <Textarea id="proto-desc" placeholder="프로토콜에 대한 간단한 설명을 입력하세요." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {/* 섹션 구성 */}
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

          {/* 태그 */}
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
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>취소</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? "저장 중..." : "생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
