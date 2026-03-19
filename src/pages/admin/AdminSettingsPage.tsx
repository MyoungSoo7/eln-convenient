import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { HelpTooltip } from "@/components/HelpTooltip";
import { listOrgs } from "@/api/admin";

export default function AdminSettingsPage() {
  const { t } = useTranslation('admin');

  const orgsQuery = useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => {
      const res = await listOrgs();
      if (!res.ok) throw new Error(res.error ?? t('settings.loadError'));
      return res.data;
    },
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {t('settings.title')}
          <HelpTooltip text={t('settings.titleTooltip')} />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

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
              <label className="text-sm font-medium">{t('settings.ssoSettings')}</label>
              <Input value={t('settings.ssoValue')} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.defaultLang')}</label>
              <Input value={t('settings.langValue')} readOnly />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('settings.fileStorage')}</label>
              <Input value={t('settings.fileStorageValue')} readOnly />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.settingsNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
