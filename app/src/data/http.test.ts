import { describe, expect, it, vi } from 'vitest';

import { buildUrl, createHttpClient } from './http';
import type { FetchLike, HttpResponseLike } from './http';

function jsonResponse(status: number, body: unknown): HttpResponseLike {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

function unreadableResponse(status: number): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error('Unexpected token < in JSON')),
  };
}

function client(
  fetchImpl: FetchLike,
  overrides: {
    readonly timeoutMs?: number;
    readonly authToken?: () => string | null;
    readonly onCredentialRefused?: () => void;
    readonly onCredentialAccepted?: () => void;
  } = {},
) {
  return createHttpClient({
    baseUrl: 'https://api.example.invalid',
    fetch: fetchImpl,
    retryDelayMs: 0,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

describe('buildUrl', () => {
  it('joins the base and the path', () => {
    expect(buildUrl('https://api.example.invalid', '/v1/dramas')).toBe(
      'https://api.example.invalid/v1/dramas',
    );
  });

  it('tolerates a base url with a trailing slash rather than emitting a double slash', () => {
    expect(buildUrl('https://api.example.invalid/', '/v1/dramas')).toBe(
      'https://api.example.invalid/v1/dramas',
    );
  });

  it('omits an undefined parameter instead of sending the string "undefined"', () => {
    expect(buildUrl('https://x.invalid', '/v1/feed', { scene: 'HOME', cursor: undefined })).toBe(
      'https://x.invalid/v1/feed?scene=HOME',
    );
  });

  // Cursors are opaque base64-ish blobs and routinely contain characters that change a URL's
  // meaning if they are pasted in raw.
  it('encodes parameter values', () => {
    expect(buildUrl('https://x.invalid', '/v1/feed', { cursor: 'a+b/c=&d' })).toBe(
      'https://x.invalid/v1/feed?cursor=a%2Bb%2Fc%3D%26d',
    );
  });

  it('renders a numeric parameter', () => {
    expect(buildUrl('https://x.invalid', '/v1/feed', { limit: 10 })).toBe(
      'https://x.invalid/v1/feed?limit=10',
    );
  });
});

describe('the http client', () => {
  it('returns a parsed body on success', async () => {
    const result = await client(() => Promise.resolve(jsonResponse(200, { items: [] }))).getJson(
      '/v1/feed',
    );
    expect(result).toEqual({ ok: true, value: { items: [] } });
  });

  it('sends the request as a GET that asks for json', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200, {})));
    await client(fetchImpl).getJson('/v1/feed', { scene: 'HOME' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.invalid/v1/feed?scene=HOME');
    expect(init.method).toBe('GET');
    expect(init.headers['Accept']).toBe('application/json');
  });

  it('reports a dead network as OFFLINE, not as a timeout', async () => {
    const result = await client(() => Promise.reject(new TypeError('Failed to fetch'))).getJson(
      '/v1/feed',
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('OFFLINE');
  });

  // A request that hangs inside a WebView is a loading state with no end. The signal is the only
  // thing that distinguishes "we gave up" from "there is no network", and they are different bugs.
  it('aborts a request that outlives the timeout and reports it as TIMEOUT', async () => {
    const result = await client(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
      { timeoutMs: 5 },
    ).getJson('/v1/feed');

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('TIMEOUT');
  });

  it('classifies a valid response body that is not json as MALFORMED', async () => {
    const result = await client(() => Promise.resolve(unreadableResponse(200))).getJson('/v1/feed');
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  // Losing the status here is what would turn a 404 into a retry button.
  it('keeps the status when an error response has an unreadable body', async () => {
    const result = await client(() => Promise.resolve(unreadableResponse(404))).getJson('/v1/x');
    expect(result.ok ? null : result.error).toMatchObject({ kind: 'HTTP', status: 404 });
  });

  it('turns an error response into a failure carrying the envelope', async () => {
    const result = await client(() =>
      Promise.resolve(
        jsonResponse(410, {
          error: { code: 'CONTENT_OFFLINE', message: 'gone', traceId: 'trace_9' },
        }),
      ),
    ).getJson('/v1/dramas/drm_1');

    expect(result.ok ? null : result.error).toMatchObject({
      kind: 'HTTP',
      status: 410,
      code: 'CONTENT_OFFLINE',
      traceId: 'trace_9',
    });
  });

  it('retries an idempotent read once after a transport failure', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { items: [1] }));

    const result = await client(fetchImpl).getJson('/v1/feed');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, value: { items: [1] } });
  });

  it('retries a server fault once', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }));

    const result = await client(fetchImpl).getJson('/v1/feed');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  // Exactly once. "Retry until it works" against a failing dependency is an outage amplifier, and
  // the second failure is the one the user is told about.
  it('gives up after the single retry', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await client(fetchImpl).getJson('/v1/feed');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('does not retry a 404, a 400 or a 429', async () => {
    for (const status of [400, 404, 410, 429]) {
      const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(status, {})));
      await client(fetchImpl).getJson('/v1/x');
      expect(fetchImpl, `status ${String(status)}`).toHaveBeenCalledTimes(1);
    }
  });

  it('waits between the two attempts', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, {}));

    await createHttpClient({
      baseUrl: 'https://api.example.invalid',
      fetch: fetchImpl,
      retryDelayMs: 1_000,
      sleep,
    }).getJson('/v1/feed');

    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  // Nothing in the client rejects. An unhandled rejection inside a WebView is a blank screen with
  // no console to read it in.
  it('never rejects, whatever fetch throws', async () => {
    for (const thrown of [new Error('boom'), 'a string', null, undefined]) {
      await expect(client(() => Promise.reject(thrown)).getJson('/v1/x')).resolves.toMatchObject({
        ok: false,
      });
    }
  });
});

describe('the http client posting', () => {
  it('sends a serialised body and asks for json back', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(201, { orderId: 'o1' })));
    const result = await client(fetchImpl).postJson('/v1/unlock/coin-orders', { episodeId: 'e1' });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.invalid/v1/unlock/coin-orders');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"episodeId":"e1"}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(result).toEqual({ ok: true, value: { orderId: 'o1' } });
  });

  it('carries the caller\u2019s headers, which is how the idempotency key travels', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(201, {})));
    await client(fetchImpl).postJson(
      '/v1/unlock/coin-orders',
      {},
      {
        headers: { 'Idempotency-Key': 'unl_abc' },
      },
    );

    expect(fetchImpl.mock.calls[0]![1].headers['Idempotency-Key']).toBe('unl_abc');
  });

  /**
   * The rule that separates a write from a read here. A `GET` retries once because repeating it
   * changes nothing; a `POST` that opens a payment must not, because a transport failure does not
   * say whether the request arrived, and a second attempt is a second thing the viewer can be
   * charged for. Repeating it is the caller's decision, made with the same idempotency key.
   */
  it('never retries a post, whatever failed', async () => {
    const transportFailure = vi.fn<FetchLike>(() => Promise.reject(new TypeError('Failed')));
    await client(transportFailure).postJson('/v1/unlock/coin-orders', {});
    expect(transportFailure).toHaveBeenCalledTimes(1);

    const serverFault = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(503, {})));
    await client(serverFault).postJson('/v1/unlock/coin-orders', {});
    expect(serverFault).toHaveBeenCalledTimes(1);
  });

  it('reads the error envelope off a refused post', async () => {
    const result = await client(() =>
      Promise.resolve(
        jsonResponse(409, {
          error: { code: 'UNLOCK_ALREADY_UNLOCKED', message: 'owned', traceId: 'trace_3' },
        }),
      ),
    ).postJson('/v1/unlock/coin-orders', {});

    expect(result.ok ? null : result.error).toMatchObject({
      status: 409,
      code: 'UNLOCK_ALREADY_UNLOCKED',
      traceId: 'trace_3',
    });
  });

  it('bounds a post with the same timeout as a read', async () => {
    const result = await client(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
      { timeoutMs: 5 },
    ).postJson('/v1/unlock/coin-orders', {});

    expect(result.ok ? null : result.error.kind).toBe('TIMEOUT');
  });

  it('never rejects', async () => {
    await expect(
      client(() => Promise.reject(new Error('boom'))).postJson('/v1/x', {}),
    ).resolves.toMatchObject({ ok: false });
  });
});

/**
 * The favourite writes (`docs/12-api-contracts.md` §4.3). The property that shapes this half of the
 * client is that a `204` has no body: calling `json()` on one rejects, so a client that parsed
 * every success would report every successful write as `MALFORMED`.
 */
describe('an idempotent write', () => {
  /** A `204`: no body, and `json()` rejects the way a real `Response` does on an empty one. */
  function noContent(): HttpResponseLike {
    return {
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('Unexpected end of JSON input')),
    };
  }

  it('sends the verb and the path it was given', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(noContent()));
    await client(fetchImpl).send('PUT', '/v1/dramas/drm_1/favorite');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.invalid/v1/dramas/drm_1/favorite');
    expect(init.method).toBe('PUT');
  });

  it('deletes as well as puts, since un-following is the same shape of request', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(noContent()));
    await client(fetchImpl).send('DELETE', '/v1/dramas/drm_1/favorite');

    expect(fetchImpl.mock.calls[0]![1].method).toBe('DELETE');
  });

  // The whole reason `send` exists rather than `getJson` being reused with a verb.
  it('succeeds on a 204 without reading a body that is not there', async () => {
    const json = vi.fn(() => Promise.reject(new Error('Unexpected end of JSON input')));
    const result = await client(() => Promise.resolve({ ok: true, status: 204, json })).send(
      'DELETE',
      '/v1/dramas/drm_1/favorite',
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(json).not.toHaveBeenCalled();
  });

  it('puts a JSON body on watch-progress writes and still does not parse a 204', async () => {
    const json = vi.fn(() => Promise.reject(new Error('Unexpected end of JSON input')));
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve({ ok: true, status: 204, json }),
    );
    const body = { positionSec: 12, durationSec: 90, clientUpdatedAt: '2026-08-27T22:00:00.000Z' };

    const result = await client(fetchImpl).send('PUT', '/v1/progress/episodes/ep_1', { body });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(json).not.toHaveBeenCalled();
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify(body));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  // A failed write is the half a surface has to render, and its envelope is JSON like any other.
  it('reads the error envelope when the write is refused', async () => {
    const result = await client(() =>
      Promise.resolve(
        jsonResponse(410, {
          error: { code: 'CONTENT_OFFLINE', message: 'gone', traceId: 'trace_f' },
        }),
      ),
    ).send('PUT', '/v1/dramas/drm_1/favorite');

    expect(result.ok ? null : result.error).toMatchObject({
      kind: 'HTTP',
      status: 410,
      code: 'CONTENT_OFFLINE',
      traceId: 'trace_f',
    });
  });

  it('keeps the status when a refused write has an unreadable body', async () => {
    const result = await client(() => Promise.resolve(unreadableResponse(401))).send(
      'PUT',
      '/v1/dramas/drm_1/favorite',
    );

    expect(result.ok ? null : result.error).toMatchObject({ kind: 'HTTP', status: 401 });
  });

  /**
   * Retried exactly once, like a read. It is safe only because the server publishes both verbs as
   * idempotent — a repeated `PUT` does not move `favoritedAt` and a `DELETE` always answers `204`
   * (`docs/handoff/w2-work-j.md` S45, S47) — which is also why there is no `POST` here.
   */
  it('retries once after a transport failure', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(noContent());

    const result = await client(fetchImpl).send('DELETE', '/v1/dramas/drm_1/favorite');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('does not retry a write the server refused', async () => {
    for (const status of [401, 404, 410]) {
      const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(status, {})));
      await client(fetchImpl).send('PUT', '/v1/dramas/drm_1/favorite');
      expect(fetchImpl, `status ${String(status)}`).toHaveBeenCalledTimes(1);
    }
  });

  it('reports a dead network as OFFLINE rather than rejecting', async () => {
    const result = await client(() => Promise.reject(new TypeError('Failed to fetch'))).send(
      'DELETE',
      '/v1/dramas/drm_1/favorite',
    );

    expect(result.ok ? null : result.error.kind).toBe('OFFLINE');
  });
});

/**
 * Rule 5. The header is attached in one place, and the tests below are mostly about the cases where
 * it must *not* be: an absent session has to reach the server as an absent session, because the
 * server is the only thing that can decide what an anonymous caller may have.
 */
describe('the http client attaching a session', () => {
  function headersOf(fetchImpl: ReturnType<typeof vi.fn<FetchLike>>, call = 0) {
    return fetchImpl.mock.calls[call]![1].headers;
  }

  it('sends the token as a bearer credential on a read', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200, {})));
    await client(fetchImpl, { authToken: () => 'tok_abc' }).getJson('/v1/dramas/drm_1');

    expect(headersOf(fetchImpl)['Authorization']).toBe('Bearer tok_abc');
  });

  // The coin order is the request that needs it: an order belongs to an account, and slot K answers
  // an anonymous creation with `401 AUTH_REQUIRED`.
  it('sends it on a write, alongside the idempotency key', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(201, {})));
    await client(fetchImpl, { authToken: () => 'tok_abc' }).postJson(
      '/v1/unlock/coin-orders',
      { episodeId: 'e1' },
      { headers: { 'Idempotency-Key': 'unl_abc' } },
    );

    expect(headersOf(fetchImpl)).toMatchObject({
      Authorization: 'Bearer tok_abc',
      'Idempotency-Key': 'unl_abc',
    });
  });

  it('omits the header entirely when there is no session', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200, {})));
    await client(fetchImpl, { authToken: () => null }).getJson('/v1/dramas/drm_1');

    expect(headersOf(fetchImpl)).not.toHaveProperty('Authorization');
  });

  it('omits it when no token source was supplied at all', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200, {})));
    await client(fetchImpl).getJson('/v1/dramas/drm_1');

    expect(headersOf(fetchImpl)).not.toHaveProperty('Authorization');
  });

  /**
   * `Bearer ` with nothing after it is a credential the server can only refuse, and it refuses it
   * with the same `401` an anonymous request gets — after a great deal more confusion. An empty
   * token is a missing token.
   */
  it('treats an empty or blank token as no session', async () => {
    for (const token of ['', '   ']) {
      const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(200, {})));
      await client(fetchImpl, { authToken: () => token }).getJson('/v1/dramas/drm_1');
      expect(headersOf(fetchImpl)).not.toHaveProperty('Authorization');
    }
  });

  it('asks for the token once per attempt, so a retry carries the current one', async () => {
    const tokens = ['tok_first', 'tok_second'];
    const authToken = vi.fn<() => string | null>(() => tokens.shift() ?? null);
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, {}));

    await client(fetchImpl, { authToken }).getJson('/v1/dramas/drm_1');

    expect(authToken).toHaveBeenCalledTimes(2);
    expect(headersOf(fetchImpl, 0)['Authorization']).toBe('Bearer tok_first');
    expect(headersOf(fetchImpl, 1)['Authorization']).toBe('Bearer tok_second');
  });

  /**
   * A second way to authenticate, reachable from any call site, is a second thing to audit. The
   * realistic offender is not a malicious caller but a header hard-coded during debugging that
   * ships — so a caller's `Authorization` is dropped, in any casing, whether or not a session
   * exists to replace it.
   */
  it('refuses a caller-supplied Authorization header', async () => {
    for (const name of ['Authorization', 'authorization']) {
      const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(201, {})));
      await client(fetchImpl).postJson(
        '/v1/unlock/coin-orders',
        {},
        { headers: { [name]: 'Bearer smuggled' } },
      );

      expect(JSON.stringify(headersOf(fetchImpl))).not.toContain('smuggled');
    }
  });

  it('lets the transport token win over a caller that tried to set one', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse(201, {})));
    await client(fetchImpl, { authToken: () => 'tok_real' }).postJson(
      '/v1/unlock/coin-orders',
      {},
      { headers: { authorization: 'Bearer smuggled' } },
    );

    expect(headersOf(fetchImpl)['Authorization']).toBe('Bearer tok_real');
    expect(JSON.stringify(headersOf(fetchImpl))).not.toContain('smuggled');
  });
});

/**
 * A token the server has refused is dead, and resending it turns one expiry into a purchase button
 * that never works again. This is the drop, not a refresh-and-replay interceptor: replaying the one
 * `POST` this client makes is a second thing the viewer can be charged for (rule 4).
 */
describe('the http client noticing a refused credential', () => {
  it('reports a 401 on a request that carried a token', async () => {
    const onCredentialRefused = vi.fn();
    await client(() => Promise.resolve(jsonResponse(401, {})), {
      authToken: () => 'tok_expired',
      onCredentialRefused,
    }).getJson('/v1/unlock/coin-orders/ord_1');

    expect(onCredentialRefused).toHaveBeenCalledTimes(1);
  });

  it('reports it on a refused write too', async () => {
    const onCredentialRefused = vi.fn();
    await client(() => Promise.resolve(jsonResponse(401, {})), {
      authToken: () => 'tok_expired',
      onCredentialRefused,
    }).postJson('/v1/unlock/coin-orders', {});

    expect(onCredentialRefused).toHaveBeenCalledTimes(1);
  });

  // Even a gateway's bodyless 401: a refused credential is refused whether or not anyone sent an
  // envelope, and the invalidation happens before the body is parsed for exactly that reason.
  it('reports it when the 401 body is unreadable', async () => {
    const onCredentialRefused = vi.fn();
    await client(() => Promise.resolve(unreadableResponse(401)), {
      authToken: () => 'tok_expired',
      onCredentialRefused,
    }).getJson('/v1/x');

    expect(onCredentialRefused).toHaveBeenCalledTimes(1);
  });

  /**
   * The catalogue reads are anonymous-capable, and a `401` on one of them is the server declining a
   * stranger. Signing the viewer out because a proxy said `401` to an anonymous read is a
   * self-inflicted logout.
   */
  it('stays quiet about a 401 on a request that carried no token', async () => {
    const onCredentialRefused = vi.fn();
    await client(() => Promise.resolve(jsonResponse(401, {})), {
      authToken: () => null,
      onCredentialRefused,
    }).getJson('/v1/dramas/drm_1');

    expect(onCredentialRefused).not.toHaveBeenCalled();
  });

  it('stays quiet about every other refusal', async () => {
    for (const status of [400, 403, 404, 410, 422, 429, 500]) {
      const onCredentialRefused = vi.fn();
      await client(() => Promise.resolve(jsonResponse(status, {})), {
        authToken: () => 'tok_live',
        onCredentialRefused,
      }).getJson('/v1/x');

      expect(onCredentialRefused, `status ${String(status)}`).not.toHaveBeenCalled();
    }
  });

  it('does not need a handler to survive a 401', async () => {
    const result = await client(() => Promise.resolve(jsonResponse(401, {})), {
      authToken: () => 'tok_expired',
    }).getJson('/v1/x');

    expect(result.ok ? null : result.error).toMatchObject({ kind: 'HTTP', status: 401 });
  });

  /**
   * The `204` shortcut that makes the favourite writes work returns before the body is read, so the
   * invalidation has to sit above it. Otherwise a session that expires between opening the app and
   * favouriting a drama survives in memory as a token every later request keeps presenting.
   */
  it('reports it on a refused idempotent write, which returns before any body is read', async () => {
    const onCredentialRefused = vi.fn();
    await client(() => Promise.resolve(jsonResponse(401, {})), {
      authToken: () => 'tok_expired',
      onCredentialRefused,
    }).send('PUT', '/v1/dramas/drm_1/favorite');

    expect(onCredentialRefused).toHaveBeenCalledTimes(1);
  });
});

/**
 * The mirror of the hook above, and the only evidence this client ever gets that its token is
 * currently good. `session/session-recovery.ts` counts its automatic re-logins against it: a bound
 * refilled by successful *logins* would not bound anything, because a server that issues tokens and
 * then refuses them keeps every login successful.
 */
describe('the http client noticing a credential that worked', () => {
  it('reports a 2xx on a request that carried a token', async () => {
    const onCredentialAccepted = vi.fn();
    await client(() => Promise.resolve(jsonResponse(200, {})), {
      authToken: () => 'tok_live',
      onCredentialAccepted,
    }).getJson('/v1/users/me/favorites');

    expect(onCredentialAccepted).toHaveBeenCalledTimes(1);
  });

  /** A `204`: no body, and `json()` rejects the way a real `Response` does on an empty one. */
  const noContent = (): HttpResponseLike => ({
    ok: true,
    status: 204,
    json: () => Promise.reject(new Error('Unexpected end of JSON input')),
  });

  // Above the `204` shortcut, like the refusal: a favourite write is the request most likely to be
  // the only authenticated thing a viewer does for a while.
  it('reports an accepted idempotent write, which returns before any body is read', async () => {
    const onCredentialAccepted = vi.fn();
    await client(() => Promise.resolve(noContent()), {
      authToken: () => 'tok_live',
      onCredentialAccepted,
    }).send('PUT', '/v1/dramas/drm_1/favorite');

    expect(onCredentialAccepted).toHaveBeenCalledTimes(1);
  });

  it('stays quiet about a 2xx on an anonymous request', async () => {
    const onCredentialAccepted = vi.fn();
    await client(() => Promise.resolve(jsonResponse(200, {})), {
      authToken: () => null,
      onCredentialAccepted,
    }).getJson('/v1/dramas/drm_1');

    expect(onCredentialAccepted).not.toHaveBeenCalled();
  });

  /**
   * A `2xx` whose body is not what the caller expected is still a request the *credential* was
   * accepted for. The two questions are separate, and conflating them would let a schema change
   * quietly disable the re-login budget's only refill.
   */
  it('reports a 2xx even when the body turns out to be unreadable', async () => {
    const onCredentialAccepted = vi.fn();
    const result = await client(() => Promise.resolve(unreadableResponse(200)), {
      authToken: () => 'tok_live',
      onCredentialAccepted,
    }).getJson('/v1/users/me/favorites');

    expect(onCredentialAccepted).toHaveBeenCalledTimes(1);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  it('says nothing about a request the server refused, whatever the status', async () => {
    for (const status of [400, 401, 403, 404, 410, 422, 429, 500]) {
      const onCredentialAccepted = vi.fn();
      await client(() => Promise.resolve(jsonResponse(status, {})), {
        authToken: () => 'tok_live',
        onCredentialAccepted,
      }).getJson('/v1/x');

      expect(onCredentialAccepted, `status ${String(status)}`).not.toHaveBeenCalled();
    }
  });

  it('does not need a handler to survive a 2xx', async () => {
    const result = await client(() => Promise.resolve(jsonResponse(200, { id: 'drm_1' })), {
      authToken: () => 'tok_live',
    }).getJson('/v1/dramas/drm_1');

    expect(result.ok ? result.value : null).toEqual({ id: 'drm_1' });
  });
});
