import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listOrgs } from "@/api/admin";
import apiClient from "@/api/client";

export default function AdminSettingsPage() {
  const { t, i18n } = useTranslation('admin');

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

      {/* 시스템 설정 */}
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
    </div>
  );
}
