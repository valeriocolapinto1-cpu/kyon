import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  WORKER_GZIP_ALARM_BYTES,
  WORKER_GZIP_LIMIT_BYTES,
  DEFAULT_QUIET_HOURS,
} from './index';

describe('limits', () => {
  it('rejects attachments above 10 MB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(10_485_760);
  });

  it('keeps the bundle alarm below the Free plan limit', () => {
    expect(WORKER_GZIP_ALARM_BYTES).toBeLessThan(WORKER_GZIP_LIMIT_BYTES);
  });

  it('uses 23:00–08:00 as default quiet hours', () => {
    expect(DEFAULT_QUIET_HOURS).toEqual({ start: '23:00', end: '08:00' });
  });
});
