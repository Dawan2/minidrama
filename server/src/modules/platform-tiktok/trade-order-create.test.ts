import { inspect } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TIKTOK_TRADE_ORDER_CREATE_URL,
  TRADE_ORDER_CREATE_TIMEOUT_MS,
  createTiktokTradeOrderPort,
  postTiktokTradeOrderCreate,
  type TradeOrderHttpClient,
  type TradeOrderHttpRequest,
  type TradeOrderHttpResponse,
} from './trade-order-create.js';
import type { TradeOrderRequest } from '../unlock/trade-order-port.js';

const ACCESS_TOKEN = 'act.platform_user_token';
const PLATFORM_TRADE_ORDER_ID = 'tto_platform_9f3a';
const OUR_ORDER_ID = 'uord_abc123';
const BUYER = 'usr_fx_newcomer';
const EPISODE_ID = 'ep_fx_s2e01';
const PRICE_COINS = 300;
const OBSERVED_TOKEN_AMOUNT = 7;

function jsonResponse(status: number, body: unknown): TradeOrderHttpResponse {
  return { status, bodyText: JSON.stringify(body) };
}

function recordingHttp(
  respond: (
    request: TradeOrderHttpRequest,
  ) => TradeOrderHttpResponse | Promise<TradeOrderHttpResponse>,
): { readonly http: TradeOrderHttpClient; readonly requests: TradeOrderHttpRequest[] } {
  const requests: TradeOrderHttpRequest[] = [];
  return {
    requests,
    http: async (request) => {
      requests.push(request);
      return respond(request);
    },
  };
}

function orderRequest(overrides: Partial<TradeOrderRequest> = {}): TradeOrderRequest {
  return {
    orderId: OUR_ORDER_ID,
    userId: BUYER,
    episodeId: EPISODE_ID,
    priceCoins: PRICE_COINS,
    ...overrides,
  };
}

function observedOrderRequest(overrides: Partial<TradeOrderRequest> = {}): TradeOrderRequest {
  return orderRequest({ tokenAmount: OBSERVED_TOKEN_AMOUNT, ...overrides });
}

function portWith(
  http: TradeOrderHttpClient,
  accessToken: string | undefined = ACCESS_TOKEN,
): ReturnType<typeof createTiktokTradeOrderPort> {
  return createTiktokTradeOrderPort({
    http,
    accessTokenForUser: () => accessToken,
  });
}

describe('createTiktokTradeOrderPort — unconfigured', () => {
  it('refuses without calling the transport when tokenAmount is absent', async () => {
    let calls = 0;
    const port = portWith(async () => {
      calls += 1;
      return jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID });
    });

    expect(await port.createTradeOrder(orderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
    expect(calls).toBe(0);
  });

  it('does not copy priceCoins onto token_amount when the observation is missing', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    const result = await portWith(http).createTradeOrder(orderRequest({ priceCoins: 500 }));

    expect(result).toEqual({ ok: false, error: 'TRADE_ORDER_UNAVAILABLE' });
    expect(requests).toHaveLength(0);
  });

  it.each([0, -7, 1.5, Number.NaN])(
    'refuses tokenAmount %s rather than sending it as token_amount',
    async (tokenAmount) => {
      let calls = 0;
      const port = portWith(async () => {
        calls += 1;
        return jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID });
      });

      expect(await port.createTradeOrder(orderRequest({ tokenAmount }))).toEqual({
        ok: false,
        error: 'TRADE_ORDER_UNAVAILABLE',
      });
      expect(calls).toBe(0);
    },
  );

  it('refuses without calling the transport when there is no user access token', async () => {
    let calls = 0;
    const port = createTiktokTradeOrderPort({
      http: async () => {
        calls += 1;
        return jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID });
      },
    });

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
    expect(calls).toBe(0);
  });

  it('refuses an empty access token the same way', async () => {
    let calls = 0;
    const port = portWith(async () => {
      calls += 1;
      return jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID });
    }, '');

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
    expect(calls).toBe(0);
  });

  it('does not invent a tradeOrderId from our orderId when unconfigured', async () => {
    const port = createTiktokTradeOrderPort();
    const result = await port.createTradeOrder(orderRequest());

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(OUR_ORDER_ID);
  });
});

describe('createTiktokTradeOrderPort — request shaping', () => {
  it('POSTs application/json to the documented create URL', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    await portWith(http).createTradeOrder(observedOrderRequest());

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(TIKTOK_TRADE_ORDER_CREATE_URL);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.headers['Content-Type']).toBe('application/json');
    expect(requests[0]?.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(requests[0]?.timeoutMs).toBe(TRADE_ORDER_CREATE_TIMEOUT_MS);
  });

  it('sends the observed token_amount, not priceCoins and not a multiplied rate', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    await portWith(http).createTradeOrder(
      orderRequest({ priceCoins: 500, tokenAmount: OBSERVED_TOKEN_AMOUNT }),
    );

    const body = JSON.parse(requests[0]?.body ?? '{}') as {
      readonly token_type: string;
      readonly token_amount: number;
      readonly order_info: Record<string, unknown>;
    };
    expect(body.token_type).toBe('BEANS');
    expect(body.token_amount).toBe(OBSERVED_TOKEN_AMOUNT);
    expect(body.token_amount).not.toBe(500);
    expect(body.token_amount).not.toBe(500 * OBSERVED_TOKEN_AMOUNT);
    expect(JSON.stringify(body)).not.toContain('priceCoins');
    expect(JSON.stringify(body)).not.toContain('500');
    expect(body.order_info).toEqual({
      order_id: OUR_ORDER_ID,
      product_id: EPISODE_ID,
      quantity: 1,
      quantity_unit: 'episode',
    });
  });

  it('does not invent order_url, product_name or image_url', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    await portWith(http).createTradeOrder(observedOrderRequest());

    const body = JSON.parse(requests[0]?.body ?? '{}') as {
      readonly order_info: Record<string, unknown>;
    };
    expect(body.order_info).not.toHaveProperty('order_url');
    expect(body.order_info).not.toHaveProperty('product_name');
    expect(body.order_info).not.toHaveProperty('image_url');
  });

  it('keeps the access token out of the URL, so a fetch error cannot echo it from the href', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    await portWith(http).createTradeOrder(observedOrderRequest());

    expect(requests[0]?.url).not.toContain(ACCESS_TOKEN);
    expect(requests[0]?.url).not.toContain(encodeURIComponent(ACCESS_TOKEN));
  });

  it('forwards the injected timeout to the transport', async () => {
    const { http, requests } = recordingHttp(() =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    await createTiktokTradeOrderPort({
      http,
      timeoutMs: 1_500,
      accessTokenForUser: () => ACCESS_TOKEN,
    }).createTradeOrder(observedOrderRequest());

    expect(requests[0]?.timeoutMs).toBe(1_500);
  });
});

describe('createTiktokTradeOrderPort — a successful create', () => {
  it('returns only the platform trade_order_id, never our orderId', async () => {
    const port = portWith(async () =>
      jsonResponse(200, {
        trade_order_id: PLATFORM_TRADE_ORDER_ID,
        extra: 'ignored',
      }),
    );

    const result = await port.createTradeOrder(observedOrderRequest());

    expect(result).toEqual({ ok: true, value: { tradeOrderId: PLATFORM_TRADE_ORDER_ID } });
    expect(result.ok && result.value.tradeOrderId).not.toBe(OUR_ORDER_ID);
  });

  it('reads trade_order_id from a nested data object', async () => {
    const port = portWith(async () =>
      jsonResponse(200, {
        error: { code: 'ok', message: '' },
        data: { trade_order_id: PLATFORM_TRADE_ORDER_ID },
      }),
    );

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: true,
      value: { tradeOrderId: PLATFORM_TRADE_ORDER_ID },
    });
  });

  it('drops the access token so it cannot appear on the Result', async () => {
    const port = portWith(async () =>
      jsonResponse(200, { trade_order_id: PLATFORM_TRADE_ORDER_ID }),
    );

    const result = await port.createTradeOrder(observedOrderRequest());
    const serialized = `${JSON.stringify(result)}\n${inspect(result, { depth: 8 })}`;

    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(result.ok && Object.keys(result.value)).toEqual(['tradeOrderId']);
  });
});

describe('createTiktokTradeOrderPort — 200 with no trade_order_id', () => {
  it('is TRADE_ORDER_UNAVAILABLE, not a synthesised identifier', async () => {
    const port = portWith(async () => jsonResponse(200, { order_id: OUR_ORDER_ID }));

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });

  it('refuses an empty or whitespace trade_order_id', async () => {
    for (const trade_order_id of ['', '   ']) {
      const port = portWith(async () => jsonResponse(200, { trade_order_id }));
      expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
        ok: false,
        error: 'TRADE_ORDER_UNAVAILABLE',
      });
    }
  });

  it('refuses a non-string trade_order_id', async () => {
    const port = portWith(async () => jsonResponse(200, { trade_order_id: 12 }));

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });
});

describe('createTiktokTradeOrderPort — platform errors', () => {
  it('maps a nested error.code other than ok to TRADE_ORDER_UNAVAILABLE', async () => {
    const port = portWith(async () =>
      jsonResponse(400, { error: { code: 'invalid_token', message: 'nope' } }),
    );

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });

  it('maps a top-level error string to TRADE_ORDER_UNAVAILABLE', async () => {
    const port = portWith(async () => jsonResponse(400, { error: 'invalid_client' }));

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });

  it('maps HTTP 503 to TRADE_ORDER_UNAVAILABLE', async () => {
    const port = portWith(async () => ({ status: 503, bodyText: 'unavailable' }));

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });

  it('maps a JSON array body to TRADE_ORDER_UNAVAILABLE', async () => {
    const port = portWith(async () => ({ status: 200, bodyText: '[]' }));

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });
});

describe('createTiktokTradeOrderPort — transport failures', () => {
  it('maps a thrown transport to TRADE_ORDER_UNAVAILABLE and does not rethrow the token', async () => {
    const port = portWith(async () => {
      throw new Error(ACCESS_TOKEN);
    });

    const result = await port.createTradeOrder(observedOrderRequest());

    expect(result).toEqual({ ok: false, error: 'TRADE_ORDER_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(inspect(result, { depth: 8 })).not.toContain(ACCESS_TOKEN);
  });

  it('maps an abort to TRADE_ORDER_UNAVAILABLE', async () => {
    const port = portWith(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    expect(await port.createTradeOrder(observedOrderRequest())).toEqual({
      ok: false,
      error: 'TRADE_ORDER_UNAVAILABLE',
    });
  });
});

describe('createTiktokTradeOrderPort — source', () => {
  it('names no coin-to-Beans rate outside comments', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./trade-order-create.ts', import.meta.url)),
      'utf8',
    );
    const rate = /\b(beansPerCoin|coinToBeans|BEANS_RATE|beansRate)\b/;
    const offenders: string[] = [];

    source.split('\n').forEach((line, index) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return;
      }
      if (rate.test(line)) {
        offenders.push(`${String(index + 1)} ${line.trim()}`);
      }
    });

    expect(offenders).toEqual([]);
  });
});

describe('postTiktokTradeOrderCreate — the production transport', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('is what createTiktokTradeOrderPort uses when no http is injected', async () => {
    const calls: { readonly input: unknown; readonly init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ trade_order_id: PLATFORM_TRADE_ORDER_ID }), {
        status: 200,
      });
    }) as typeof fetch;

    const result = await createTiktokTradeOrderPort({
      accessTokenForUser: () => ACCESS_TOKEN,
    }).createTradeOrder(observedOrderRequest());

    expect(result).toEqual({ ok: true, value: { tradeOrderId: PLATFORM_TRADE_ORDER_ID } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(TIKTOK_TRADE_ORDER_CREATE_URL);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.redirect).toBe('error');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(String(calls[0]?.init?.body)).toContain(`"token_amount":${OBSERVED_TOKEN_AMOUNT}`);
  });

  it('returns the status and body text, and does not follow redirects', async () => {
    globalThis.fetch = (async (_input, init) => {
      expect(init?.redirect).toBe('error');
      return new Response('nope', { status: 503 });
    }) as typeof fetch;

    const response = await postTiktokTradeOrderCreate({
      url: TIKTOK_TRADE_ORDER_CREATE_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      timeoutMs: 50,
    });

    expect(response).toEqual({ status: 503, bodyText: 'nope' });
  });
});
