import { describe, expect, it, vi } from 'vitest';

import { createSessionApi, LOGIN_PATH, LOGIN_PROVIDER } from './session-api';
import { err, ok } from '@minidrama/shared';
import { apiFailure } from './failure';
import type { HttpPoster } from './http';

const GRANT_BODY = { accessToken: 'tok_abc', expiresInSec: 3_600, openId: 'open_abc' };

// One method, because `createSessionApi` asks for one. A double that also had to supply a reader
// and a writer would be inventing capabilities the login exchange is deliberately not given.
function httpAnswering(body: unknown): HttpPoster & { postJson: ReturnType<typeof vi.fn> } {
  return { postJson: vi.fn(() => Promise.resolve(ok(body))) };
}

describe('the login exchange', () => {
  it('posts the code to the login endpoint as the TikTok provider', async () => {
    const http = httpAnswering(GRANT_BODY);
    await createSessionApi(http).exchangeAuthCode('code_123');

    expect(http.postJson).toHaveBeenCalledWith(LOGIN_PATH, {
      provider: LOGIN_PROVIDER,
      authCode: 'code_123',
    });
    expect(LOGIN_PATH).toBe('/v1/auth/login');
  });

  it('returns the grant the server issued', async () => {
    const result = await createSessionApi(httpAnswering(GRANT_BODY)).exchangeAuthCode('code_123');

    expect(result).toEqual({ ok: true, value: GRANT_BODY });
  });

  /**
   * A login response is the body where an extra field is most likely to be a secret — the platform
   * token behind the exchange is not ours to hold — so the grant is rebuilt field by field rather
   * than cast, and anything else the server or a gateway attached stops here.
   */
  it('keeps only the three documented fields', async () => {
    const result = await createSessionApi(
      httpAnswering({ ...GRANT_BODY, platformAccessToken: 'act.tiktok', refreshToken: 'rt_1' }),
    ).exchangeAuthCode('code_123');

    expect(result.ok ? Object.keys(result.value).sort() : []).toEqual([
      'accessToken',
      'expiresInSec',
      'openId',
    ]);
  });

  it('rejects a 200 that is not a login response', async () => {
    for (const body of [
      null,
      'a string',
      [],
      {},
      { ...GRANT_BODY, accessToken: 1 },
      { ...GRANT_BODY, openId: null },
      { ...GRANT_BODY, expiresInSec: '3600' },
    ]) {
      const result = await createSessionApi(httpAnswering(body)).exchangeAuthCode('code_123');
      expect(result.ok ? null : result.error.kind, JSON.stringify(body)).toBe('MALFORMED');
    }
  });

  /**
   * Never defaulted. Reading an absent `expiresInSec` as some sensible number invents a lifetime
   * for a credential the server described differently, and a token believed to outlive itself is a
   * `401` in the middle of a purchase.
   */
  it('rejects a grant with no stated lifetime rather than assuming one', async () => {
    const result = await createSessionApi(
      httpAnswering({ accessToken: 'tok_abc', openId: 'open_abc' }),
    ).exchangeAuthCode('code_123');

    expect(result.ok).toBe(false);
  });

  it('passes a refusal through untouched, trace id and all', async () => {
    const failure = apiFailure({
      kind: 'HTTP',
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'The authorization code was rejected',
      traceId: 'trace_7',
    });
    const http: HttpPoster = {
      postJson: () => Promise.resolve(err(failure)),
    };

    const result = await createSessionApi(http).exchangeAuthCode('code_123');

    expect(result).toEqual({ ok: false, error: failure });
  });
});
