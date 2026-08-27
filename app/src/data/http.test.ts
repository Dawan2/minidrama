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

function client(fetchImpl: FetchLike, overrides: { readonly timeoutMs?: number } = {}) {
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
