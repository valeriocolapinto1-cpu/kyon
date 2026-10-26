import { describe, expect, it } from 'vitest';
import { plainText } from './InlineText';

describe('plainText', () => {
  it('drops inline Markdown markers', () => {
    expect(plainText('**Validare** il `modello` di [crescita](https://x.y)')).toBe(
      'Validare il modello di crescita',
    );
    expect(plainText('Leggere _con calma_ i dati')).toBe('Leggere con calma i dati');
    expect(plainText('snake_case_name resta')).toBe('snake_case_name resta');
  });
});
