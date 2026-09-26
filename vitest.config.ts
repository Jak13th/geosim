import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.{ts,tsx}',
      'apps/*/server/**/*.test.ts',
      'scripts/*/src/**/*.test.ts',
    ],
    environment: 'node',
  },
});
