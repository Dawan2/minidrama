import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * Who is asking.
 *
 * An entitlement answer is only as good as the identity it was computed for, and the failure mode
 * to design against is silence: a request that carries a session we cannot resolve must not be
 * answered as if it were anonymous. That answer looks successful, tells a paying VIP that they own
 * nothing, and is indistinguishable in the logs from a genuinely anonymous browse.
 *
 * So resolution has three outcomes, not two: anonymous (no credential offered), a viewer, or a
 * refusal. The default implementation can only produce the first and the last, because sessions are
 * opaque random tokens with no store behind them yet (`modules/identity/session.ts`). It is
 * replaced, not bypassed, when session storage lands.
 */

/** `SESSION_REJECTED` is the caller's problem; `SESSION_UNRESOLVABLE` is ours. */
export type ViewerResolutionFailure = 'SESSION_REJECTED' | 'SESSION_UNRESOLVABLE';

export interface ViewerResolver {
  /**
   * @param authorization The raw `Authorization` header, or `undefined` when absent.
   * @returns The viewer id, or `null` for a request that offered no credential.
   */
  resolve(authorization: string | undefined): Result<string | null, ViewerResolutionFailure>;
}

const BEARER_PREFIX = 'bearer ';

/**
 * Extracts the token from an `Authorization` header.
 *
 * A header that is present but not a bearer token is a rejection rather than an absence: treating
 * `Authorization: Basic ...` as "anonymous" is the silent downgrade this module exists to avoid.
 */
export function readBearerToken(
  authorization: string | undefined,
): Result<string | null, ViewerResolutionFailure> {
  if (authorization === undefined || authorization.trim().length === 0) return ok(null);
  if (!authorization.toLowerCase().startsWith(BEARER_PREFIX)) return err('SESSION_REJECTED');

  const token = authorization.slice(BEARER_PREFIX.length).trim();

  return token.length === 0 ? err('SESSION_REJECTED') : ok(token);
}

/**
 * The fail-closed default: anonymous requests are answered as anonymous, and any presented token is
 * refused because there is no session store to resolve it against.
 */
export function createUnresolvedViewerResolver(): ViewerResolver {
  return {
    resolve: (authorization) => {
      const token = readBearerToken(authorization);
      if (!token.ok) return token;

      return token.value === null ? ok(null) : err('SESSION_UNRESOLVABLE');
    },
  };
}
