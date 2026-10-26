import { describe, expect, it } from 'vitest';
import { passwordError, safeNext } from './passwordRules';

describe('password rules (client)', () => {
  it('checks length and confirmation', () => {
    expect(passwordError('corta')).toMatch(/almeno 10/);
    expect(passwordError('abbastanza lunga', 'diversa davvero')).toMatch(/non coincidono/);
    expect(passwordError('abbastanza lunga', 'abbastanza lunga')).toBeNull();
  });
});

describe('safeNext', () => {
  it('allows only local paths', () => {
    expect(safeNext('/progetti')).toBe('/progetti');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
