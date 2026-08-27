import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import { ME_PATH, createMeApi, narrowMeView } from './me-api';
import { apiFailure } from './failure';
import type { HttpReader } from './http';

describe('the me endpoint', () => {
  it('publishes the path the contract defines, under the live /v1 prefix', () => {
    expect(ME_PATH).toBe('/v1/users/me');
  });

  it('asks GET /v1/users/me with no invented query', async () => {
    const getJson = vi.fn<HttpReader['getJson']>(() => Promise.resolve(ok({ id: 'open_1' })));
    await createMeApi({ getJson }).fetchMe();

    expect(getJson).toHaveBeenCalledWith(ME_PATH);
  });

  it('passes a transport failure through untouched, so the surface classifies it', async () => {
    const failure = apiFailure({ kind: 'HTTP', status: 401, message: 'no session' });
    const api = createMeApi({ getJson: () => Promise.resolve({ ok: false, error: failure }) });

    const result = await api.fetchMe();
    expect(result).toEqual({ ok: false, error: failure });
  });
});

describe('a me body', () => {
  it('quotes the session id and omits nickname and avatar when the server sent only id', () => {
    expect(narrowMeView({ id: 'open_abc' })).toEqual({ id: 'open_abc' });
  });

  it('forwards a platform-named nickname without inventing an avatar', () => {
    expect(narrowMeView({ id: 'open_abc', nickname: 'Ada' })).toEqual({
      id: 'open_abc',
      nickname: 'Ada',
    });
  });

  it('drops an empty nickname rather than echoing the id as a display name', () => {
    expect(narrowMeView({ id: 'open_abc', nickname: '' })).toEqual({ id: 'open_abc' });
  });

  it('rejects a missing or unreadable id, so a truncated body stays retryable', () => {
    expect(narrowMeView({})).toBeNull();
    expect(narrowMeView({ id: '' })).toBeNull();
    expect(narrowMeView({ id: 1 })).toBeNull();
    expect(narrowMeView({ openId: 'open_abc' })).toBeNull();
    expect(narrowMeView(null)).toBeNull();
    expect(narrowMeView([])).toBeNull();
  });

  /**
   * C4-07 / C3-09: a VIP object or a Beans field on a body is not identity. The narrower copies
   * the three MeView keys and nothing else.
   */
  it('ignores VIP, expiry, Beans, phone and extra keys rather than quoting them', () => {
    expect(
      narrowMeView({
        id: 'open_abc',
        vip: { active: true, expiresAt: '2099-01-01T00:00:00.000Z' },
        vipActive: false,
        expiresAt: '2099-01-01T00:00:00.000Z',
        beansAmount: 60,
        beansPerCoin: 0.7,
        phoneMasked: '138****0000',
        extra: 'drop me',
        nickname: 'Ada',
      }),
    ).toEqual({ id: 'open_abc', nickname: 'Ada' });
  });

  it('does not treat a session grant as a me body', () => {
    expect(
      narrowMeView({
        accessToken: 'tok_1',
        expiresInSec: 7200,
        openId: 'open_1',
      }),
    ).toBeNull();
  });
});
