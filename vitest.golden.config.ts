import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.slow.test.ts'], testTimeout: 60 * 60 * 1000 },
});
