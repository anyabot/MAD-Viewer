import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['contract/**/*.test.{ts,mjs}'],
    testTimeout: 300_000,
  },
});
