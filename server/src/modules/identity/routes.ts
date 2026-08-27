import type { FastifyInstance } from 'fastify';
import type { ApiErrorCode } from '@minidrama/shared';

import { errorBody } from '../../core/errors.js';
import type {
  IdentityExchangeFailure,
  PlatformIdentityPort,
} from '../platform-tiktok/identity-port.js';
import type { SessionStore } from './session-store.js';

/**
 * Silent login.
 *
 * `TTMinis.login()` yields a short-lived code on the client; the exchange happens here because a
 * browser cannot call the OpenAPI directly (CORS) and because the client secret may never leave the
 * server (U-03). The code is single-use and is treated as a credential: it is not logged, not echoed
 * and not stored.
 *
 * The route ships the contract, the validation and the deny path. The exchange itself is refused by
 * `platform-tiktok`'s identity port until the real HTTP call lands, so no session can be issued
 * without a genuine platform response — see `createUnavailableIdentityPort`.
 *
 * What changed in W3 slot L: the issued token is now **bound** to the user it was issued for, in
 * the same store the viewer resolver reads. Before, a session was a token nobody could resolve, so
 * every endpoint that needs a viewer answered `401` even to a caller holding a session this route
 * had just minted.
 */

/** Minis launches with TikTok only. The other providers in the contract are reserved for later. */
const SUPPORTED_PROVIDERS = ['TIKTOK'] as const;

interface LoginBody {
  readonly provider?: unknown;
  readonly authCode?: unknown;
}

export interface IdentityRouteOptions {
  readonly identityPort: PlatformIdentityPort;
  readonly sessionStore: SessionStore;
}

/**
 * A configuration fault and a rejected code are both "no session", but only one of them is ours.
 * `AUTH_PROVIDER_ERROR` is a 502 so it is paged; `AUTH_REQUIRED` is a 401 the client answers by
 * running silent login again.
 */
const FAILURE_RESPONSES: Record<
  IdentityExchangeFailure,
  { readonly status: number; readonly code: ApiErrorCode; readonly message: string }
> = {
  PROVIDER_UNCONFIGURED: {
    status: 502,
    code: 'AUTH_PROVIDER_ERROR',
    message: 'Identity provider is not available',
  },
  PROVIDER_UNAVAILABLE: {
    status: 502,
    code: 'AUTH_PROVIDER_ERROR',
    message: 'Identity provider is not available',
  },
  AUTH_CODE_REJECTED: {
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'The authorization code was rejected',
  },
};

export async function identityRoutes(
  app: FastifyInstance,
  options: IdentityRouteOptions,
): Promise<void> {
  app.post('/v1/auth/login', async (request, reply) => {
    const body = request.body as LoginBody | undefined;
    const provider = body?.provider;
    const authCode = body?.authCode;

    if (
      typeof provider !== 'string' ||
      !(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)
    ) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'provider must be TIKTOK', request.id, {
          fields: [{ field: 'provider', reason: 'unsupported' }],
        }),
      );
    }

    if (typeof authCode !== 'string' || authCode.length === 0) {
      return reply.status(400).send(
        errorBody('COMMON_VALIDATION_FAILED', 'authCode is required', request.id, {
          fields: [{ field: 'authCode', reason: 'required' }],
        }),
      );
    }

    const exchanged = await options.identityPort.exchangeAuthCode(authCode);

    if (!exchanged.ok) {
      const response = FAILURE_RESPONSES[exchanged.error];
      // The reason is logged, never returned: which of "no credentials" and "bad code" applies is
      // operator information, and the difference is useful to an attacker probing the endpoint.
      request.log.warn({ reason: exchanged.error }, 'identity exchange failed');
      return reply
        .status(response.status)
        .send(errorBody(response.code, response.message, request.id));
    }

    const openId = exchanged.value.openId;

    // An exchange that succeeded without naming a user is not a login. Issuing here would either
    // throw inside the store or, if the store were laxer, bind a session to nobody — and every
    // unlock and progress row written under that session would belong to a shared phantom account.
    if (openId.length === 0) {
      request.log.error('identity exchange returned no open_id');
      return reply
        .status(502)
        .send(errorBody('AUTH_PROVIDER_ERROR', 'Identity provider is not available', request.id));
    }

    // The account id the session is bound to. Until the users table lands (W7) the platform's
    // `open_id` *is* the account id: there is no row to link it to, and minting a local `usr_` id
    // here would create a second identifier space that the real link would then have to migrate.
    // When that link arrives it goes on this line, between the exchange and the issuance, and
    // nothing else in this route changes.
    const session = options.sessionStore.issue(openId);

    return reply.status(200).send({
      accessToken: session.accessToken,
      expiresInSec: session.expiresInSec,
      openId,
    });
  });
}
