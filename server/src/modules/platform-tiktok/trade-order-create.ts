import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import type {
  PlatformTradeOrderPort,
  TradeOrder,
  TradeOrderFailure,
  TradeOrderRequest,
} from '../unlock/trade-order-port.js';

/**
 * `POST https://open.tiktokapis.com/v2/minis/trade_order/create/` as documented for Beans
 * (`docs/research/tiktok-minis-official.md` §6.1). Trailing slash is part of the documented path.
 *
 * `token_amount` is the platform integer. It is taken from `TradeOrderRequest.tokenAmount`, which
 * exists only after Q-G-7 produces an observation. This adapter does not copy `priceCoins`, does
 * not multiply it, and does not read a rate from the environment. Missing, zero, or non-integer
 * amounts are a refuse, and the transport is not called.
 *
 * The documented Authorization is a user `access_token`. Identity currently drops those tokens
 * after reading `open_id` (`C4-05`), so production has no resolver and this adapter refuses. Tests
 * inject `accessTokenForUser`.
 */

export const TIKTOK_TRADE_ORDER_CREATE_URL =
  'https://open.tiktokapis.com/v2/minis/trade_order/create/';

/** Bound the live call so a hung OpenAPI cannot stall order creation indefinitely. */
export const TRADE_ORDER_CREATE_TIMEOUT_MS = 5_000;

/**
 * The HTTP seam tests inject. Production uses `postTiktokTradeOrderCreate` (`fetch`). A stub that
 * returned a `trade_order_id` derived from our `orderId` would mint a payable identifier the
 * webhook can never match; the stub must speak the platform's response shape.
 */
export interface TradeOrderHttpRequest {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
}

export interface TradeOrderHttpResponse {
  readonly status: number;
  readonly bodyText: string;
}

export type TradeOrderHttpClient = (
  request: TradeOrderHttpRequest,
) => Promise<TradeOrderHttpResponse>;

export interface TiktokTradeOrderPortOptions {
  readonly http?: TradeOrderHttpClient;
  readonly timeoutMs?: number;
  /**
   * User access token for `Authorization: Bearer`. Absent or empty for a user is a refuse: this
   * adapter does not fall back to the client secret, and it does not call the OpenAPI anonymously.
   */
  readonly accessTokenForUser?: (
    userId: string,
  ) => string | undefined | Promise<string | undefined>;
}

export function createTiktokTradeOrderPort(
  options: TiktokTradeOrderPortOptions = {},
): PlatformTradeOrderPort {
  const send = options.http ?? postTiktokTradeOrderCreate;
  const timeoutMs = options.timeoutMs ?? TRADE_ORDER_CREATE_TIMEOUT_MS;
  const accessTokenForUser = options.accessTokenForUser;

  return {
    createTradeOrder: async (request) => {
      const tokenAmount = readTokenAmount(request);
      if (tokenAmount === undefined) {
        return err('TRADE_ORDER_UNAVAILABLE');
      }

      const accessToken =
        accessTokenForUser === undefined ? undefined : await accessTokenForUser(request.userId);
      if (accessToken === undefined || accessToken.length === 0) {
        return err('TRADE_ORDER_UNAVAILABLE');
      }

      const body = JSON.stringify({
        token_type: 'BEANS',
        token_amount: tokenAmount,
        order_info: {
          order_id: request.orderId,
          product_id: request.episodeId,
          quantity: 1,
          quantity_unit: 'episode',
        },
      });

      let response: TradeOrderHttpResponse;
      try {
        response = await send({
          url: TIKTOK_TRADE_ORDER_CREATE_URL,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body,
          timeoutMs,
        });
      } catch {
        // Swallow the cause: Node's fetch error message can include the URL, and a mis-wired
        // transport might interpolate the access token. The mapped failure is the only thing that
        // leaves this adapter.
        return err('TRADE_ORDER_UNAVAILABLE');
      }

      return mapCreateResponse(response);
    },
  };
}

/**
 * The production transport. `redirect: 'error'` so a 30x cannot replay the bearer token onto
 * another origin. Tests never need this; they inject `http`.
 */
export async function postTiktokTradeOrderCreate(
  request: TradeOrderHttpRequest,
): Promise<TradeOrderHttpResponse> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: { ...request.headers },
    body: request.body,
    signal: AbortSignal.timeout(request.timeoutMs),
    redirect: 'error',
  });

  return { status: response.status, bodyText: await response.text() };
}

function readTokenAmount(request: TradeOrderRequest): number | undefined {
  const value = request.tokenAmount;
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function mapCreateResponse(
  response: TradeOrderHttpResponse,
): Result<TradeOrder, TradeOrderFailure> {
  const parsed = parseJsonObject(response.bodyText);
  if (parsed === undefined) {
    return err('TRADE_ORDER_UNAVAILABLE');
  }

  if (readPlatformError(parsed) !== undefined) {
    return err('TRADE_ORDER_UNAVAILABLE');
  }

  const tradeOrderId = readTradeOrderId(parsed);
  if (tradeOrderId === undefined) {
    // 200 with no identifier is not a payable order. Mapping it to success with our orderId
    // would hand the client something no webhook will ever mention.
    return err('TRADE_ORDER_UNAVAILABLE');
  }

  return ok({ tradeOrderId });
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readTradeOrderId(body: Record<string, unknown>): string | undefined {
  const fromData = readStringField(nestedObject(body['data']), 'trade_order_id');
  if (fromData !== undefined) return fromData;
  return readStringField(body, 'trade_order_id');
}

function nestedObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readStringField(
  body: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (body === undefined) return undefined;
  const value = body[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPlatformError(body: Record<string, unknown>): string | undefined {
  const error = body['error'];
  if (typeof error === 'string') {
    return error === '' || error === 'ok' ? undefined : error;
  }

  if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
    const code = (error as Record<string, unknown>)['code'];
    if (typeof code === 'string' && code !== '' && code !== 'ok') return code;
  }

  return undefined;
}
