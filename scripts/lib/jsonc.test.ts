import { describe, expect, it } from 'vitest';
import { parseJsonc } from './jsonc';

describe('parseJsonc', () => {
  it('strips comments and trailing commas but keeps strings intact', () => {
    const source = `{
      // line comment
      "url": "https://example.com/a//b", /* block */
      "list": [1, 2,],
    }`;
    expect(parseJsonc(source)).toEqual({ url: 'https://example.com/a//b', list: [1, 2] });
  });

  it('handles escaped quotes inside strings', () => {
    expect(parseJsonc('{"a": "say \\"hi\\" // not a comment"}')).toEqual({
      a: 'say "hi" // not a comment',
    });
  });
});
