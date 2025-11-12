import { defineConfig } from 'vitest/config';
import path from 'path';

if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  // Vitest loads this config before jsdom, so define a noop polyfill here as well.
  // @ts-ignore
  globalThis.SharedArrayBuffer = ArrayBuffer;
}

export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'tests/**/*.{test,spec}.{ts,tsx}',
    ],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    globals: true,
    exclude: ['node_modules/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
