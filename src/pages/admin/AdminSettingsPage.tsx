import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listOrgs } from "@/api/admin";

export default function AdminSettingsPage() {
  const orgsQuery = useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const res = await listOrgs();
      if (!res.ok) throw new Error(res.error ?? '조직 목록 조회 실패');
      return res.data;
    },
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          설정
          <HelpTooltip text="조직명, SSO 연동, 언어, 저장소 등 시스템 전반의 설정을 관리합니다." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">시스템 전반 설정 관리</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">시스템 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">조직 이름</label>
              <Input value={orgsQuery.data?.[0]?.name ?? '—'} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">SSO 설정</label>
              <Input value="Keycloak (미연결)" readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">기본 언어</label>
              <Input value="한국어" readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">파일 저장소</label>
              <Input value="MinIO (내부)" readOnly />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">※ 설정 변경은 백엔드 연동 후 활성화됩니다</p>
        </CardContent>
      </Card>
    </div>
  );
}
