import { describe, expect, it } from 'vitest';

import { APP_VERSION, SUPPORT_EMAIL, supportMailto } from './settings';

describe('settings facts', () => {
  it('quotes the version the package.json ships, not a marketing string', () => {
    expect(APP_VERSION).toBe('0.0.0');
  });

  it('mails the .invalid placeholder rather than a working inbox', () => {
    expect(SUPPORT_EMAIL.endsWith('.invalid')).toBe(true);
    expect(supportMailto()).toBe(`mailto:${SUPPORT_EMAIL}`);
  });
});
