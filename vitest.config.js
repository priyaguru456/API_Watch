import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/**/*.{test,spec}.{js,mjs,cjs,ts}',
      'apps/**/*.{test,spec}.{js,mjs,cjs,ts}',
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
