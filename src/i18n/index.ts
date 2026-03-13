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
      },
      en: {
        common: enCommon,
        auth: enAuth,
        dashboard: enDashboard,
        exports: enExports,
      },
    },
    fallbackLng: 'ko',
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React가 XSS 처리
    },
  });

export default i18n;
