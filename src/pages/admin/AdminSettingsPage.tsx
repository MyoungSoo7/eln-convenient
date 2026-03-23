import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listOrgs, getSsoConfig, updateSsoConfig, testSsoConnection, activateSso, deactivateSso } from "@/api/admin";
import apiClient from "@/api/client";
import { CheckCircle2, XCircle, Loader2, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const { t, i18n } = useTranslation('admin');
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const res = await listOrgs();
      if (!res.ok) throw new Error(res.error ?? t('settings.loadError'));
      return res.data;
    },
  });

  const storageQuery = useQuery({
    queryKey: ['admin', 'storage-info'],
    queryFn: async () => {
      const res = await apiClient.get<{ type: string; bucket: string; exportsBucket: string }>('/files/storage/info');
      if (!res.ok) return { type: 'minio', bucket: 'labnote-files', exportsBucket: 'labnote-exports' };
      return res.data;
    },
  });

  const STORAGE_LABELS: Record<string, string> = {
    minio: 'MinIO (내부)',
    s3: 'AWS S3 (클라우드)',
    local: '로컬 디스크',
  };

  const ssoQuery = useQuery({
    queryKey: ['admin', 'sso-config'],
    queryFn: async () => {
      const res = await getSsoConfig();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // SSO form state
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [selectedMode, setSelectedMode] = useState('disabled');
  const [deactivatePassword, setDeactivatePassword] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  // Sync form state when data loads
  const sso = ssoQuery.data;
  useState(() => {
    if (sso) {
      setIssuerUrl(sso.issuerUrl ?? '');
      setClientId(sso.clientId ?? '');
      setSelectedMode(sso.mode);
    }
  });

  const saveMutation = useMutation({
    mutationFn: () => updateSsoConfig({
      issuerUrl: issuerUrl || undefined,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
    }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success('SSO 설정이 저장되었습니다.');
        queryClient.invalidateQueries({ queryKey: ['admin', 'sso-config'] });
      } else {
        toast.error(res.error || '저장 실패');
      }
    },
  });

  const testMutation = useMutation({
    mutationFn: testSsoConnection,
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`연결 성공 (JWKS 키: ${res.data.jwksKeys}개)`);
        queryClient.invalidateQueries({ queryKey: ['admin', 'sso-config'] });
      } else {
        toast.error(res.error || '연결 실패');
      }
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => activateSso(selectedMode),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`SSO가 ${selectedMode} 모드로 활성화되었습니다.`);
        queryClient.invalidateQueries({ queryKey: ['admin', 'sso-config'] });
      } else {
        toast.error(res.error || '활성화 실패');
      }
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateSso(deactivatePassword),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success('SSO가 비활성화되었습니다.');
        setShowDeactivate(false);
        setDeactivatePassword('');
        queryClient.invalidateQueries({ queryKey: ['admin', 'sso-config'] });
      } else {
        toast.error(res.error || '비활성화 실패');
      }
    },
  });

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('settings.title')}
          <HelpTooltip text={t('settings.titleTooltip')} />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* 기존 시스템 설정 */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">{t('settings.systemSettings')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.orgName')}</label>
              <Input value={orgsQuery.data?.[0]?.name ?? '—'} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.defaultLang')}</label>
              <Select value={i18n.language} onValueChange={handleLanguageChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ko">한국어</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.fileStorage')}</label>
              <Input value={storageQuery.data ? STORAGE_LABELS[storageQuery.data.type] ?? storageQuery.data.type : '—'} readOnly />
              {storageQuery.data && (
                <p className="text-xs text-muted-foreground">
                  버킷: {storageQuery.data.bucket} / {storageQuery.data.exportsBucket}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SSO 설정 */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            SSO 설정 (Single Sign-On)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 상태 표시 */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            {sso?.mode === 'disabled' ? (
              <><XCircle className="h-5 w-5 text-muted-foreground" /><span className="text-sm">SSO 비활성화 — 로컬 로그인만 사용 중</span></>
            ) : (
              <><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-sm">SSO 활성화 (<Badge variant="secondary">{sso?.mode}</Badge>)</span></>
            )}
          </div>

          {/* IdP 연결 설정 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">IdP 연결 설정</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Issuer URL</label>
                <Input
                  placeholder="https://keycloak.example.com/realms/labnote"
                  value={issuerUrl || sso?.issuerUrl || ''}
                  onChange={(e) => setIssuerUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Keycloak Realm의 전체 URL</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Client ID</label>
                <Input
                  placeholder="labnote-frontend"
                  value={clientId || sso?.clientId || ''}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Client Secret (선택)</label>
                <Input
                  type="password"
                  placeholder={sso?.hasClientSecret ? '(설정됨)' : '(없음)'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Confidential Client인 경우에만</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                저장
              </Button>
              <Button variant="outline" size="sm" onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !sso?.issuerUrl}>
                {testMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                연결 테스트
              </Button>
            </div>

            {/* 테스트 결과 */}
            {sso?.isVerified && (
              <div className="flex items-center gap-2 p-2 rounded bg-green-50 text-green-700 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                연결 확인됨 (마지막 테스트: {sso.lastVerifiedAt ? new Date(sso.lastVerifiedAt).toLocaleString() : '-'})
              </div>
            )}
            {sso?.lastError && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-50 text-red-700 text-sm">
                <XCircle className="h-4 w-4" />
                {sso.lastError}
              </div>
            )}
          </div>

          {/* SSO 모드 선택 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">SSO 모드</h3>
            {(['disabled', 'optional', 'preferred', 'enforced'] as const).map((mode) => (
              <label key={mode} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
                <input
                  type="radio"
                  name="ssoMode"
                  value={mode}
                  checked={selectedMode === mode}
                  onChange={() => setSelectedMode(mode)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {mode === 'disabled' && '비활성화'}
                    {mode === 'optional' && '선택적 (권장)'}
                    {mode === 'preferred' && 'SSO 우선'}
                    {mode === 'enforced' && (<><span>SSO 강제</span><AlertTriangle className="h-3 w-3 text-warning" /></>)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mode === 'disabled' && '로컬 로그인만 사용합니다.'}
                    {mode === 'optional' && 'SSO와 로컬 로그인을 모두 허용합니다.'}
                    {mode === 'preferred' && 'SSO가 기본이며, 로컬 로그인은 숨겨집니다.'}
                    {mode === 'enforced' && 'SSO만 허용합니다. 비상 복구 계정이 필요합니다.'}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* 활성화/비활성화 버튼 */}
          <div className="flex gap-2 pt-2 border-t">
            {sso?.mode === 'disabled' ? (
              <Button
                onClick={() => activateMutation.mutate()}
                disabled={!sso?.isVerified || selectedMode === 'disabled' || activateMutation.isPending}
              >
                {activateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                SSO 활성화
              </Button>
            ) : (
              <>
                {selectedMode !== sso?.mode && (
                  <Button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                    모드 변경
                  </Button>
                )}
                <Button variant="destructive" onClick={() => setShowDeactivate(true)}>
                  SSO 비활성화
                </Button>
              </>
            )}
          </div>

          {/* 비활성화 확인 */}
          {showDeactivate && (
            <div className="p-4 rounded-lg border border-destructive/50 space-y-3">
              <p className="text-sm font-medium text-destructive">SSO 비활성화 확인</p>
              <p className="text-xs text-muted-foreground">
                비활성화하면 SSO 전용 사용자는 로그인할 수 없습니다. 관리자 비밀번호를 입력해주세요.
              </p>
              <Input
                type="password"
                placeholder="관리자 비밀번호"
                value={deactivatePassword}
                onChange={(e) => setDeactivatePassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setShowDeactivate(false); setDeactivatePassword(''); }}>
                  취소
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deactivateMutation.mutate()}
                  disabled={!deactivatePassword || deactivateMutation.isPending}
                >
                  {deactivateMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  비활성화 확인
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
