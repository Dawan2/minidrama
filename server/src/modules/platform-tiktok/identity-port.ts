import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import type { PlatformCredentials } from './credentials.js';

/**
 * The one seam through which `identity` reaches TikTok.
 *
 * `platform-tiktok` is the sole outbound adapter to `open.tiktokapis.com`
 * (`docs/architecture/system-overview.md` §7.1), so the `identity` module never holds a client
 * secret, never builds a TikTok request and cannot be made to talk to the platform by accident.
 *
 * `open_id` is the user primary key: it is stable, and it is scoped to the client key rather than to
 * a region (U-04). Access and refresh tokens stay inside this adapter — they are read from the
 * platform body and then dropped. Surfacing either on `PlatformIdentity` would put a 24-hour
 * credential on the session response, which the login route must never do.
 */

export interface PlatformIdentity {
  readonly openId: string;
}

export type IdentityExchangeFailure =
  /** No client secret is configured. Ours to fix; it means login cannot work at all. */
  | 'PROVIDER_UNCONFIGURED'
  /** The platform refused the code: expired, already spent, or issued to another client key. */
  | 'AUTH_CODE_REJECTED'
  /** The platform is reachable in principle but did not answer usefully. Retryable. */
  | 'PROVIDER_UNAVAILABLE';

export interface PlatformIdentityPort {
  exchangeAuthCode(authCode: string): Promise<Result<PlatformIdentity, IdentityExchangeFailure>>;
}

/**
 * `POST https://open.tiktokapis.com/v2/oauth/token/` as documented for silent login
 * (`docs/11-api-and-bridge.md` §4.1). Trailing slash is part of the documented path.
 */
export const TIKTOK_OAUTH_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

/** Bound the live call so a hung OpenAPI cannot stall login indefinitely. */
export const OAUTH_TIMEOUT_MS = 5_000;

/**
 * The HTTP seam tests inject. Production uses `postTiktokOauthToken` (`fetch`). A stub that
 * returned an `open_id` derived from the authorization code would be the authentication bypass
 * C3-08 forbids; the stub must speak the platform's response shape, not invent a user.
 */
export interface IdentityHttpRequest {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
}

export interface IdentityHttpResponse {
  readonly status: number;
  readonly bodyText: string;
}

export type IdentityHttpClient = (request: IdentityHttpRequest) => Promise<IdentityHttpResponse>;

export interface TiktokIdentityPortOptions {
  readonly http?: IdentityHttpClient;
  readonly timeoutMs?: number;
}

const CODE_REJECTED_ERRORS: ReadonlySet<string> = new Set(['invalid_grant', 'access_denied']);

/**
 * A hard refuse that never talks to the network. Used when there is no client secret, so a
 * deployment that cannot authenticate at all is not turned into a hanging `fetch`.
 *
 * A stub that returned a synthesised `open_id` would issue real sessions to arbitrary strings — a
 * working authentication bypass sitting behind a passing test suite. This helper still exists so
 * tests and the unconfigured path can refuse without going through HTTP.
 */
export function createUnavailableIdentityPort(
  reason: IdentityExchangeFailure,
): PlatformIdentityPort {
  return { exchangeAuthCode: async () => err(reason) };
}

/**
 * The live `POST /v2/oauth/token/` exchange, behind an injectable transport.
 *
 * No secret → `PROVIDER_UNCONFIGURED`, and the transport is not called. A missing secret is not
 * an HTTP failure; inventing an `open_id` for that case is the C4-05 regression.
 *
 * A 200 whose body has no `open_id` is `PROVIDER_UNAVAILABLE`, not a synthesised user. Access and
 * refresh tokens in that body are dropped here and never appear on the Result.
 */
export function createTiktokIdentityPort(
  credentials: PlatformCredentials,
  options: TiktokIdentityPortOptions = {},
): PlatformIdentityPort {
  if (!credentials.hasClientSecret) {
    return createUnavailableIdentityPort('PROVIDER_UNCONFIGURED');
  }

  const send = options.http ?? postTiktokOauthToken;
  const timeoutMs = options.timeoutMs ?? OAUTH_TIMEOUT_MS;

  return {
    exchangeAuthCode: async (authCode) => {
      const secret = credentials.signingKey();
      const body = new URLSearchParams({
        client_key: credentials.clientKey,
        client_secret: secret,
        code: authCode,
        grant_type: 'authorization_code',
      }).toString();

      let response: IdentityHttpResponse;
      try {
        response = await send({
          url: TIKTOK_OAUTH_TOKEN_URL,
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          timeoutMs,
        });
      } catch {
        // Swallow the cause: Node's fetch error message can include the URL, and a mis-wired
        // transport might interpolate the secret. The mapped failure is the only thing that
        // leaves this adapter.
        return err('PROVIDER_UNAVAILABLE');
      }

      return mapOauthResponse(response);
    },
  };
}

/**
 * The production transport. `redirect: 'error'` so a 30x cannot replay `client_secret` onto
 * another origin. Tests never need this; they inject `http`.
 */
export async function postTiktokOauthToken(
  request: IdentityHttpRequest,
): Promise<IdentityHttpResponse> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: { ...request.headers },
    body: request.body,
    signal: AbortSignal.timeout(request.timeoutMs),
    redirect: 'error',
  });

  return { status: response.status, bodyText: await response.text() };
}

function mapOauthResponse(
  response: IdentityHttpResponse,
): Result<PlatformIdentity, IdentityExchangeFailure> {
  const parsed = parseJsonObject(response.bodyText);
  if (parsed === undefined) {
    return err(failureForStatus(response.status));
  }

  const platformError = readPlatformError(parsed);
  if (platformError !== undefined) {
    return err(failureForPlatformError(platformError, response.status));
  }

  const openId = readOpenId(parsed);
  if (openId === undefined) {
    // 200 with tokens and no user is not a login. Mapping it to AUTH_CODE_REJECTED would tell
    // the client to retry silent login against a platform that already accepted the code.
    return err('PROVIDER_UNAVAILABLE');
  }

  return ok({ openId });
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

function readOpenId(body: Record<string, unknown>): string | undefined {
  const value = body['open_id'];
  if (typeof value !== 'string') return undefined;

  const openId = value.trim();
  return openId.length > 0 ? openId : undefined;
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

function failureForPlatformError(
  platformError: string,
  status: number,
): IdentityExchangeFailure {
  if (platformError === 'invalid_client') return 'PROVIDER_UNAVAILABLE';
  if (CODE_REJECTED_ERRORS.has(platformError)) return 'AUTH_CODE_REJECTED';
  return failureForStatus(status);
}

function failureForStatus(status: number): IdentityExchangeFailure {
  return status === 400 || status === 401 ? 'AUTH_CODE_REJECTED' : 'PROVIDER_UNAVAILABLE';
}
