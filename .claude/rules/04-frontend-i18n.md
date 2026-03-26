---
description: 프론트엔드에서 다국어(i18n) 텍스트 추가/수정 시 규칙
globs: src/**/*.tsx, src/**/*.ts, src/i18n/**/*.json
---

# 프론트엔드 다국어(i18n) 규칙

## 파일 위치
- 한국어: `src/i18n/locales/ko/<namespace>.json`
- 영어: `src/i18n/locales/en/<namespace>.json`

## 규칙

1. **양쪽 모두 반영**: 텍스트 추가/수정 시 `ko/`와 `en/` 두 곳 모두 동일 키로 반영
2. **하드코딩 금지**: JSX에 한글/영어 문자열 직접 작성하지 않는다
3. **사용법**: `const { t } = useTranslation('namespace')` → `t('key')`
4. **네임스페이스**: 파일명이 곧 네임스페이스 (notes, auth, common, dashboard 등)
5. **키 네이밍**: camelCase 사용, 중첩 가능 (`dialog.title`, `dialog.confirm`)
