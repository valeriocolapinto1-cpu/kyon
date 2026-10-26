import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildThemeCss } from '@kyon/core';

describe('themes.generated.css', () => {
  it('is up to date with packages/core/src/theme.ts (run `pnpm theme:gen`)', () => {
    const file = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'themes.generated.css'),
      'utf8',
    );
    expect(file).toBe(buildThemeCss());
  });
});
