import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./tests/server-only.mjs', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.{mjs,jsx}'], testTimeout: 15000, hookTimeout: 30000 },
});
