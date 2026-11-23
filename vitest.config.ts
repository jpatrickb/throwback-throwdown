import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts (whose root is client/) so server tests run too.
export default defineConfig({
  test: { root: '.', include: ['server/**/*.test.ts', 'client/src/**/*.test.ts', 'shared/**/*.test.ts'] },
});
