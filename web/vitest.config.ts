import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit-Tests für Core, Module und Design-Tokens – laufen ohne Browser (Node)
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/modules/**/*.ts', 'src/ui/theme.ts', 'src/ui/cx.ts', 'src/lib/format.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts'],
      reporter: ['text-summary', 'text', 'json-summary'],
    },
  },
});
