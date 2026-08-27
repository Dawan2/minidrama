import { inspect } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { createPlatformCredentials } from './credentials.js';
import {
  OAUTH_TIMEOUT_MS,
  TIKTOK_OAUTH_TOKEN_URL,
  createTiktokIdentityPort,
  postTiktokOauthToken,
  type IdentityHttpClient,
  type IdentityHttpRequest,
  type IdentityHttpResponse,
} from './identity-port.js';

const SECRET = 'sk&do=not+log this/value';
const CLIENT_KEY = 'awtest';
const AUTH_CODE = 'code_abc';
const PLATFORM_OPEN_ID = 'openid_from_tiktok';
const PLATFORM_ACCESS_TOKEN = 'act.platform_secret_token';
const PLATFORM_REFRESH_TOKEN = 'rft.platform_refresh';

function jsonResponse(status: number, body: unknown): IdentityHttpResponse {
  return { status, bodyText: JSON.stringify(body) };
}

function recordingHttp(
  respond: (request: IdentityHttpRequest) => IdentityHttpResponse | Promise<IdentityHttpResponse>,
): { readonly http: IdentityHttpClient; readonly requests: IdentityHttpRequest[] } {
  const requests: IdentityHttpRequest[] = [];
  return {
    requests,
    http: async (request) => {
      requests.push(request);
      return respond(request);
    },
  };
}

function portWith(
  http: IdentityHttpClient,
  secret: string = SECRET,
): ReturnType<typeof createTiktokIdentityPort> {
  return createTiktokIdentityPort(createPlatformCredentials(CLIENT_KEY, secret), { http });
}

describe('createTiktokIdentityPort — unconfigured', () => {
  it('refuses without calling the transport when there is no client secret', async () => {
    let calls = 0;
    const port = createTiktokIdentityPort(createPlatformCredentials(CLIENT_KEY, ''), {
      http: async () => {
        calls += 1;
        return jsonResponse(200, { open_id: PLATFORM_OPEN_ID });
      },
    });

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNCONFIGURED',
    });
    expect(calls).toBe(0);
  });

  it('does not invent an open_id from the authorization code when unconfigured', async () => {
    const port = createTiktokIdentityPort(createPlatformCredentials(CLIENT_KEY, ''));
    const result = await port.exchangeAuthCode(AUTH_CODE);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(AUTH_CODE);
  });
});

describe('createTiktokIdentityPort — request shaping', () => {
  it('POSTs application/x-www-form-urlencoded to the documented token URL', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { open_id: PLATFORM_OPEN_ID }),
    );

    await portWith(http).exchangeAuthCode(AUTH_CODE);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(TIKTOK_OAUTH_TOKEN_URL);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(requests[0]?.timeoutMs).toBe(OAUTH_TIMEOUT_MS);
  });

  it('puts grant_type=authorization_code, the client key, the secret and the code in the body', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { open_id: PLATFORM_OPEN_ID }),
    );

    await portWith(http).exchangeAuthCode(AUTH_CODE);

    const params = new URLSearchParams(requests[0]?.body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('client_key')).toBe(CLIENT_KEY);
    expect(params.get('client_secret')).toBe(SECRET);
    expect(params.get('code')).toBe(AUTH_CODE);
  });

  it('keeps the secret out of the URL, so a fetch error cannot echo it from the href', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { open_id: PLATFORM_OPEN_ID }),
    );

    await portWith(http).exchangeAuthCode(AUTH_CODE);

    expect(requests[0]?.url).not.toContain(SECRET);
    expect(requests[0]?.url).not.toContain(encodeURIComponent(SECRET));
  });

  it('forwards the injected timeout to the transport', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { open_id: PLATFORM_OPEN_ID }),
    );

    await createTiktokIdentityPort(createPlatformCredentials(CLIENT_KEY, SECRET), {
      http,
      timeoutMs: 1_500,
    }).exchangeAuthCode(AUTH_CODE);

    expect(requests[0]?.timeoutMs).toBe(1_500);
  });
});

describe('createTiktokIdentityPort — a successful exchange', () => {
  it('returns only the platform open_id, never the authorization code', async () => {
    const port = portWith(async () =>
      jsonResponse(200, {
        open_id: PLATFORM_OPEN_ID,
        access_token: PLATFORM_ACCESS_TOKEN,
        refresh_token: PLATFORM_REFRESH_TOKEN,
        expires_in: 86400,
      }),
    );

    const result = await port.exchangeAuthCode(AUTH_CODE);

    expect(result).toEqual({ ok: true, value: { openId: PLATFORM_OPEN_ID } });
    expect(result.ok && result.value.openId).not.toBe(AUTH_CODE);
  });

  it('drops access and refresh tokens so they cannot appear on the Result', async () => {
    const port = portWith(async () =>
      jsonResponse(200, {
        open_id: PLATFORM_OPEN_ID,
        access_token: PLATFORM_ACCESS_TOKEN,
        refresh_token: PLATFORM_REFRESH_TOKEN,
      }),
    );

    const result = await port.exchangeAuthCode(AUTH_CODE);
    const serialized = `${JSON.stringify(result)}\n${inspect(result, { depth: 8 })}`;

    expect(serialized).not.toContain(PLATFORM_ACCESS_TOKEN);
    expect(serialized).not.toContain(PLATFORM_REFRESH_TOKEN);
    expect(serialized).not.toContain(SECRET);
    expect(result.ok && Object.keys(result.value)).toEqual(['openId']);
  });

  it('treats a nested error.code of ok as success when open_id is present', async () => {
    const port = portWith(async () =>
      jsonResponse(200, { error: { code: 'ok', message: '' }, open_id: PLATFORM_OPEN_ID }),
    );

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: true,
      value: { openId: PLATFORM_OPEN_ID },
    });
  });
});

describe('createTiktokIdentityPort — 200 with no open_id', () => {
  it('is PROVIDER_UNAVAILABLE, not a synthesised user', async () => {
    const port = portWith(async () =>
      jsonResponse(200, {
        access_token: PLATFORM_ACCESS_TOKEN,
        expires_in: 86400,
      }),
    );

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('refuses an empty or whitespace open_id rather than issuing a session for nobody', async () => {
    for (const open_id of ['', '   ']) {
      const port = portWith(async () => jsonResponse(200, { open_id }));
      expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
        ok: false,
        error: 'PROVIDER_UNAVAILABLE',
      });
    }
  });

  it('refuses a non-string open_id', async () => {
    const port = portWith(async () => jsonResponse(200, { open_id: 12 }));

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('createTiktokIdentityPort — platform errors', () => {
  it.each(['invalid_grant', 'access_denied'])(
    'maps %s to AUTH_CODE_REJECTED',
    async (error) => {
      const port = portWith(async () => jsonResponse(400, { error, error_description: 'nope' }));

      expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
        ok: false,
        error: 'AUTH_CODE_REJECTED',
      });
    },
  );

  it('maps a nested error.code of invalid_grant the same way', async () => {
    const port = portWith(async () =>
      jsonResponse(400, { error: { code: 'invalid_grant', message: 'expired' } }),
    );

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'AUTH_CODE_REJECTED',
    });
  });

  it('maps invalid_client to PROVIDER_UNAVAILABLE — that is our secret, not the viewer code', async () => {
    const port = portWith(async () => jsonResponse(400, { error: 'invalid_client' }));

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('maps HTTP 401 without a parseable body to AUTH_CODE_REJECTED', async () => {
    const port = portWith(async () => ({ status: 401, bodyText: 'unauthorized' }));

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'AUTH_CODE_REJECTED',
    });
  });

  it('maps HTTP 400 without a parseable body to AUTH_CODE_REJECTED', async () => {
    const port = portWith(async () => ({ status: 400, bodyText: '' }));

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'AUTH_CODE_REJECTED',
    });
  });

  it('maps HTTP 503 to PROVIDER_UNAVAILABLE', async () => {
    const port = portWith(async () => ({ status: 503, bodyText: 'unavailable' }));

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('maps a JSON array body to PROVIDER_UNAVAILABLE', async () => {
    const port = portWith(async () => ({ status: 200, bodyText: '[]' }));

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('createTiktokIdentityPort — transport failures', () => {
  it('maps a thrown transport to PROVIDER_UNAVAILABLE and does not rethrow the secret', async () => {
    const port = portWith(async () => {
      throw new Error(SECRET);
    });

    const result = await port.exchangeAuthCode(AUTH_CODE);

    expect(result).toEqual({ ok: false, error: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(inspect(result, { depth: 8 })).not.toContain(SECRET);
  });

  it('maps an abort to PROVIDER_UNAVAILABLE', async () => {
    const port = portWith(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    expect(await port.exchangeAuthCode(AUTH_CODE)).toEqual({
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('createTiktokIdentityPort — fail-closed across codes', () => {
  it('refuses every code when the platform does not name a user, rather than inventing one', async () => {
    const port = portWith(async () => jsonResponse(200, { access_token: PLATFORM_ACCESS_TOKEN }));

    for (const code of ['', AUTH_CODE, 'x'.repeat(500)]) {
      const result = await port.exchangeAuthCode(code);
      expect(result.ok).toBe(false);
      if (code.length > 0) {
        expect(JSON.stringify(result)).not.toContain(code);
      }
    }
  });
});

describe('postTiktokOauthToken — the production transport', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('is what createTiktokIdentityPort uses when no http is injected', async () => {
    const calls: { readonly input: unknown; readonly init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ open_id: PLATFORM_OPEN_ID }), { status: 200 });
    }) as typeof fetch;

    const result = await createTiktokIdentityPort(
      createPlatformCredentials(CLIENT_KEY, SECRET),
    ).exchangeAuthCode(AUTH_CODE);

    expect(result).toEqual({ ok: true, value: { openId: PLATFORM_OPEN_ID } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(TIKTOK_OAUTH_TOKEN_URL);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.redirect).toBe('error');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(String(calls[0]?.init?.body)).toContain(`code=${AUTH_CODE}`);
  });

  it('returns the status and body text, and does not follow redirects', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      return new Response('nope', { status: 503 });
    }) as typeof fetch;

    const response = await postTiktokOauthToken({
      url: TIKTOK_OAUTH_TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code',
      timeoutMs: 50,
    });

    expect(response).toEqual({ status: 503, bodyText: 'nope' });
  });
});
