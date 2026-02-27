import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Building2, Shield, Plus, Settings } from "lucide-react";

const mockUsers = [
  { id: "u1", name: "김연구", email: "kim@biolab.kr", role: "Researcher", team: "유전체연구팀", status: "active" },
  { id: "u2", name: "박분석", email: "park@biolab.kr", role: "Researcher", team: "단백질분석팀", status: "active" },
  { id: "u3", name: "이실험", email: "lee@biolab.kr", role: "Researcher", team: "유전체연구팀", status: "active" },
  { id: "u4", name: "최약리", email: "choi@biolab.kr", role: "PI", team: "약리팀", status: "active" },
  { id: "u5", name: "정관리", email: "jung@biolab.kr", role: "Admin", team: "관리팀", status: "active" },
];

const mockRoles = [
  { name: "Admin", permissions: ["전체 관리", "사용자 관리", "설정 변경"], userCount: 1 },
  { name: "PI", permissions: ["노트 서명", "팀 관리", "보고서 생성"], userCount: 1 },
  { name: "Researcher", permissions: ["노트 작성/편집", "인벤토리 조회", "장비 예약"], userCount: 3 },
  { name: "Viewer", permissions: ["읽기 전용"], userCount: 0 },
];

const mockTeams = [
  { name: "유전체연구팀", members: 2, lead: "김연구" },
  { name: "단백질분석팀", members: 1, lead: "박분석" },
  { name: "약리팀", members: 1, lead: "최약리" },
  { name: "관리팀", members: 1, lead: "정관리" },
];

export default function AdminPage() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">관리</h1>
        <p className="text-sm text-muted-foreground mt-1">조직, 팀, 사용자 및 권한 관리</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> 사용자</TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> 팀</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> 역할/권한</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> 설정</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">사용자 목록</CardTitle>
              <Button size="sm" className="gradient-primary text-primary-foreground gap-1"><Plus className="h-3.5 w-3.5" /> 사용자 추가</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>이메일</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>팀</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{u.role}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{u.team}</TableCell>
                      <TableCell><Badge className="text-[10px] bg-success/10 text-success">활성</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockTeams.map((t) => (
              <Card key={t.name} className="shadow-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-5 w-5 text-primary" /></div>
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="text-xs text-muted-foreground">팀장: {t.lead} · {t.members}명</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-4 space-y-4">
          {mockRoles.map((r) => (
            <Card key={r.name} className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{r.name}</h3>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {r.permissions.map((p) => <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>)}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">{r.userCount}명</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">시스템 설정</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">조직 이름</label>
                  <Input value="BioLab 연구소" readOnly />
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
              <p className="text-xs text-muted-foreground">※ 설정 변경은 백엔드 연동 후 활성화됩니다 (TODO)</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
