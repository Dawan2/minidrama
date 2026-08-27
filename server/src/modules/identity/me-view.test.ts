import { describe, expect, it } from 'vitest';

import { ME_VIEW_KEYS, meViewKeys, toMeView } from './me-view.js';
import type { MeIdentity } from './me-view.js';

describe('toMeView', () => {
  it('returns the session id and omits nickname and avatar when the session named nothing else', () => {
    expect(toMeView({ id: 'open_abc' })).toEqual({ id: 'open_abc' });
  });

  it('forwards a platform-named nickname and avatar, without inventing the missing one', () => {
    expect(toMeView({ id: 'open_abc', nickname: 'Ada' })).toEqual({
      id: 'open_abc',
      nickname: 'Ada',
    });
    expect(toMeView({ id: 'open_abc', avatarUrl: 'https://cdn.example.invalid/a.png' })).toEqual({
      id: 'open_abc',
      avatarUrl: 'https://cdn.example.invalid/a.png',
    });
  });

  it('drops an empty nickname rather than echoing the id as a display name', () => {
    expect(toMeView({ id: 'open_abc', nickname: '' })).toEqual({ id: 'open_abc' });
  });

  /**
   * C4-07 / C3-09: a VIP object or a Beans field on the facts is not identity. The mapper copies
   * the three MeView keys and nothing else, so stuffing `vip` onto the object cannot leak onto
   * the wire even if a future port grows sloppy.
   */
  it('drops VIP, expiry, Beans and phone keys rather than quoting them as identity', () => {
    const stuffed = {
      id: 'open_abc',
      vip: { active: true, expiresAt: '2099-01-01T00:00:00.000Z' },
      vipActive: false,
      expiresAt: '2099-01-01T00:00:00.000Z',
      beansAmount: 60,
      beansPerCoin: 0.7,
      phoneMasked: '138****0000',
      nickname: 'Ada',
    };
    const view = toMeView(stuffed as MeIdentity);

    expect(view).toEqual({ id: 'open_abc', nickname: 'Ada' });
    expect(meViewKeys(view).every((key) => (ME_VIEW_KEYS as readonly string[]).includes(key))).toBe(
      true,
    );
    expect(JSON.stringify(view)).not.toMatch(/vip|expiresAt|beans|phoneMasked|phone/i);
  });
});

describe('ME_VIEW_KEYS', () => {
  it('is the closed set of keys a me body may carry', () => {
    expect(ME_VIEW_KEYS).toEqual(['id', 'nickname', 'avatarUrl']);
  });
});
