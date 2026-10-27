import { defineConfig } from 'vitest/config';

// 기본 테스트는 빠른 것만. 골든 전체 재현은 npm run test:golden
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['test/**/*.slow.test.ts'] },
});
