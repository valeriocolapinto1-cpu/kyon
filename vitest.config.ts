import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scripts',
          root: './scripts',
          include: ['**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'core',
          root: './packages/core',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'workers',
          root: './workers',
          include: ['*/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
