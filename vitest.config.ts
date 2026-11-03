import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: the React Router plugin must not run under Vitest.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tooling/**/*.test.ts'],
    restoreMocks: true,
  },
});
