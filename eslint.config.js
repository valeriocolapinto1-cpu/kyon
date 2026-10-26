// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.wrangler/**',
      '**/dist/**',
      '**/.size/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'apps/web/src/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    settings: { ...config.settings, next: { rootDir: 'apps/web' } },
  })),
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      // Pure domain logic: no framework or platform imports.
      'no-restricted-imports': [
        'error',
        { patterns: ['next', 'next/*', 'react', 'react-dom', 'cloudflare:*', '@opennextjs/*'] },
      ],
    },
  },
  prettier,
);
