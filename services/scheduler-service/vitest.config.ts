import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 인라인 postcss 설정을 주지 않으면 Vite 가 상위로 올라가며 설정 파일을 찾다가
  // 리포 루트의 postcss.config.js 를 집는다. 그 설정은 tailwindcss 를 요구하는데
  // 이 서비스에는 없어서 vitest 가 기동조차 못 한다. 백엔드라 CSS 처리가 필요 없다.
  css: { postcss: {} },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/routes/**', 'src/plugins/**'],
    },
  },
});
