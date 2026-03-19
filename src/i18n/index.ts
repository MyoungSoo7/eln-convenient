import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import koCommon from './locales/ko/common.json';
import enCommon from './locales/en/common.json';
import koAuth from './locales/ko/auth.json';
import enAuth from './locales/en/auth.json';
import koDashboard from './locales/ko/dashboard.json';
import enDashboard from './locales/en/dashboard.json';
import koExports from './locales/ko/exports.json';
import enExports from './locales/en/exports.json';
import koNotes from './locales/ko/notes.json';
import enNotes from './locales/en/notes.json';
import koScheduler from './locales/ko/scheduler.json';
import enScheduler from './locales/en/scheduler.json';
import koInventory from './locales/ko/inventory.json';
import enInventory from './locales/en/inventory.json';
import koAuditLogs from './locales/ko/auditLogs.json';
import enAuditLogs from './locales/en/auditLogs.json';
import koSignatures from './locales/ko/signatures.json';
import enSignatures from './locales/en/signatures.json';
import koProtocols from './locales/ko/protocols.json';
import enProtocols from './locales/en/protocols.json';
import koSearchPage from './locales/ko/searchPage.json';
import enSearchPage from './locales/en/searchPage.json';
import koAdmin from './locales/ko/admin.json';
import enAdmin from './locales/en/admin.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: {
        common: koCommon,
        auth: koAuth,
        dashboard: koDashboard,
        exports: koExports,
        notes: koNotes,
        scheduler: koScheduler,
        inventory: koInventory,
        auditLogs: koAuditLogs,
        signatures: koSignatures,
        protocols: koProtocols,
        searchPage: koSearchPage,
        admin: koAdmin,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        dashboard: enDashboard,
        exports: enExports,
        notes: enNotes,
        scheduler: enScheduler,
        inventory: enInventory,
        auditLogs: enAuditLogs,
        signatures: enSignatures,
        protocols: enProtocols,
        searchPage: enSearchPage,
        admin: enAdmin,
      },
    },
    fallbackLng: 'ko',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
