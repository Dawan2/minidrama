import { err } from '@minidrama/shared';
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
 * a region (U-04). Nothing else from the exchange is surfaced here yet — access and refresh tokens
 * stay inside this adapter when the real exchange lands, because the client must never receive them.
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
 * The port as it exists today: it refuses every exchange.
 *
 * The HTTP code exchange against `open.tiktokapis.com` is a later slot's work, and this slot will
 * not fake it. A stub that returned a synthesised `open_id` would issue real sessions to arbitrary
 * strings — a working authentication bypass sitting behind a passing test suite. Refusing is the
 * only correct behaviour for an unimplemented credential exchange, and it is what the `identity`
 * route's fail-closed test asserts.
 */
export function createUnavailableIdentityPort(
  reason: IdentityExchangeFailure,
): PlatformIdentityPort {
  return { exchangeAuthCode: async () => err(reason) };
}

/**
 * Picks the reason the exchange is unavailable, so the operator sees the difference between "this
 * deployment has no credentials" and "the exchange is not built yet".
 */
export function createTiktokIdentityPort(credentials: PlatformCredentials): PlatformIdentityPort {
  return createUnavailableIdentityPort(
    credentials.hasClientSecret ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_UNCONFIGURED',
  );
}
