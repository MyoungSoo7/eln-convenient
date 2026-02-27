import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, FileText, Archive } from "lucide-react";
import { mockNotes } from "@/lib/mockData";
import { toast } from "@/hooks/use-toast";

export default function ExportsPage() {
  const signedNotes = mockNotes.filter((n) => n.status === "signed" || n.status === "locked");

  const handleExport = (format: string, noteTitle: string) => {
    toast({ title: `${format} 내보내기`, description: `"${noteTitle}" ${format} 파일이 생성되었습니다. (더미)` });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">내보내기</h1>
        <p className="text-sm text-muted-foreground mt-1">연구노트 PDF 및 ZIP 내보내기</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
        <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer" onClick={() => toast({ title: "전체 내보내기", description: "모든 서명 노트를 ZIP으로 내보냅니다. (더미)" })}>
          <CardContent className="p-6 text-center">
            <Archive className="h-8 w-8 mx-auto text-primary" />
            <p className="font-medium mt-3">전체 ZIP 내보내기</p>
            <p className="text-xs text-muted-foreground mt-1">서명된 모든 노트</p>
          </CardContent>
        </Card>
        <Card className="shadow-card hover:shadow-elevated transition-all cursor-pointer" onClick={() => toast({ title: "보고서 생성", description: "프로젝트별 보고서를 생성합니다. (더미)" })}>
          <CardContent className="p-6 text-center">
            <FileText className="h-8 w-8 mx-auto text-secondary" />
            <p className="font-medium mt-3">프로젝트 보고서</p>
            <p className="text-xs text-muted-foreground mt-1">프로젝트별 종합 PDF</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">개별 노트 내보내기</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {signedNotes.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">서명 완료된 노트가 없습니다</p>}
          {signedNotes.map((n) => (
            <div key={n.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div>
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.author} · {n.updatedAt}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => handleExport("PDF", n.title)}>
                  <FileDown className="h-3 w-3" /> PDF
                </Button>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => handleExport("ZIP", n.title)}>
                  <Archive className="h-3 w-3" /> ZIP
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
