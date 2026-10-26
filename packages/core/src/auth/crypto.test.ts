import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hmacSha256Hex, verifyGitHubSignature } from './crypto';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

describe('secret encryption', () => {
  it('round-trips and uses a fresh IV each time', async () => {
    const a = await encryptSecret(KEY, 'ghu_token', 'user-1');
    const b = await encryptSecret(KEY, 'ghu_token', 'user-1');
    expect(a).not.toBe(b);
    expect(a).not.toContain('ghu_token');
    expect(await decryptSecret(KEY, a, 'user-1')).toBe('ghu_token');
  });

  it('refuses a ciphertext moved to another row', async () => {
    const a = await encryptSecret(KEY, 'ghu_token', 'user-1');
    await expect(decryptSecret(KEY, a, 'user-2')).rejects.toThrow();
  });

  it('requires a 32-byte key', async () => {
    await expect(encryptSecret(btoa('short'), 'x', 'c')).rejects.toThrow();
  });
});

describe('GitHub webhook signature', () => {
  it('matches GitHub’s documented example', async () => {
    // From docs.github.com "Validating webhook deliveries".
    expect(await hmacSha256Hex("It's a Secret to Everybody", 'Hello, World!')).toBe(
      '757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
    );
    expect(
      await verifyGitHubSignature(
        "It's a Secret to Everybody",
        'Hello, World!',
        'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
      ),
    ).toBe(true);
  });

  it('rejects missing, malformed and wrong signatures', async () => {
    expect(await verifyGitHubSignature('s', 'body', null)).toBe(false);
    expect(await verifyGitHubSignature('s', 'body', 'sha1=abc')).toBe(false);
    expect(await verifyGitHubSignature('s', 'body', `sha256=${'0'.repeat(64)}`)).toBe(false);
  });
});
