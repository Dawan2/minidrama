import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure } from './failure';
import type { ApiFailure } from './failure';
import type { HttpPoster } from './http';
import type { SessionGrant } from '../session/session-store';

/**
 * Silent login, as the client sees it: one `POST`, one narrowing, no interpretation.
 *
 * `TTMinis.login()` yields a short-lived code; the exchange happens server-side because a WebView
 * cannot call the platform's OpenAPI directly and because the client secret may never reach a
 * client (U-03). So the client's whole part in authentication is: get a code from the bridge, hand
 * it here, and hold what comes back.
 *
 * Two rules about the `authCode`, both from `contracts/openapi.yaml`: it is single-use, and it is a
 * credential. It is therefore never logged, never retried against a second request, and never kept
 * after the exchange — the caller drops it whatever the outcome.
 *
 * The endpoint is unauthenticated by definition, which is why this takes a transport built without
 * a token source. A session cannot be created by presenting a session, and a stale bearer on this
 * request is a dead credential travelling for no reason.
 *
 * It asks for `HttpPoster` and nothing more, like every other client here: the exchange is one
 * `POST`, so a login module that could also read or write anything else is a capability nobody
 * needs and a test double that has to pretend.
 */

export const LOGIN_PATH = '/v1/auth/login';

/** Minis launches with TikTok only; the server rejects every other value with a `400`. */
export const LOGIN_PROVIDER = 'TIKTOK';

export interface SessionApi {
  exchangeAuthCode(authCode: string): Promise<Result<SessionGrant, ApiFailure>>;
}

export function createSessionApi(http: HttpPoster): SessionApi {
  return {
    exchangeAuthCode: async (authCode) => {
      const body = await http.postJson(LOGIN_PATH, { provider: LOGIN_PROVIDER, authCode });
      return body.ok ? narrowSessionGrant(body.value) : body;
    },
  };
}

/**
 * A `200` whose body is not a login response is a failure, not a value.
 *
 * Every field is checked for its exact type and none is defaulted. The temptation worth naming is
 * `expiresInSec`: reading an absent one as some sensible number invents a lifetime for a credential
 * the server described differently, and a token believed to live longer than it does is a `401` in
 * the middle of a purchase.
 */
function narrowSessionGrant(value: unknown): Result<SessionGrant, ApiFailure> {
  const record = asRecord(value);

  if (
    record === null ||
    typeof record['accessToken'] !== 'string' ||
    typeof record['openId'] !== 'string' ||
    typeof record['expiresInSec'] !== 'number'
  ) {
    return err(apiFailure({ kind: 'MALFORMED', message: 'the response was not a session' }));
  }

  // Rebuilt field by field rather than cast, so nothing else the server (or a gateway) attached
  // travels on into the store. A login response is the one body where an extra field is most
  // likely to be a secret: the platform token behind the exchange is not ours to hold.
  return ok({
    accessToken: record['accessToken'],
    expiresInSec: record['expiresInSec'],
    openId: record['openId'],
  });
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}
