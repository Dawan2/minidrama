import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

/**
 * Who is asking.
 *
 * Watch progress is the first endpoint in this server whose *answer* is per-user, so it is the first
 * one that needs the session token turned back into a user. That resolution does not exist yet:
 * `createSessionIssuer` mints opaque random bytes and keeps no mapping, deliberately — the token is
 * not derived from `open_id` precisely so that it cannot be forged — and the platform code exchange
 * that would produce a session at all still refuses every request
 * (`createUnavailableIdentityPort`). So there is no verifiable session in this deployment, and this
 * module's default resolver says so by refusing.
 *
 * That refusal is the point. The alternative — reading a user id from a header, or falling back to
 * an anonymous shared identity — would make every viewer's resume position readable and writable by
 * every caller, and it would pass every test written against it. Progress is not a valuable target
 * on its own; it is a per-user record keyed by a user identifier a caller would get to choose.
 *
 * **This seam belongs to `identity` and lives here only until `identity` can verify a session.**
 * When that lands, `resolveViewer` moves there as a shared preHandler and this file becomes an
 * import. Anything else that needs the viewer — entitlement above all — should take the same port
 * rather than growing a second one.
 */

export interface Viewer {
  /** Our user primary key, which is TikTok's `open_id` (`identity-port.ts`). */
  readonly userId: string;
}

export type ViewerResolutionFailure =
  /** No `Authorization` header, or one that is not a bearer credential. */
  | 'NO_CREDENTIAL'
  /** A bearer token was presented and did not resolve to a user: expired, forged, or unknown. */
  | 'SESSION_REJECTED'
  /** This deployment cannot verify sessions at all. Ours to fix, and not the caller's business. */
  | 'SESSION_UNVERIFIABLE';

export interface ViewerResolver {
  resolve(authorization: string | undefined): Result<Viewer, ViewerResolutionFailure>;
}

/**
 * `Authorization: Bearer <token>`, per RFC 6750.
 *
 * The scheme is compared case-insensitively because RFC 7235 says it is case-insensitive, and a
 * client sending `bearer` is not an attack. The token itself is taken verbatim: trimming or
 * lowercasing a credential is how a comparison stops being an exact comparison.
 */
export function parseBearerToken(
  authorization: string | undefined,
): Result<string, ViewerResolutionFailure> {
  if (authorization === undefined) return err('NO_CREDENTIAL');

  const match = /^Bearer +(\S+)$/i.exec(authorization);
  const token = match?.[1];
  if (token === undefined) return err('NO_CREDENTIAL');

  return ok(token);
}

/**
 * Turns a session token into a user id, or returns `undefined`. The one function that has to become
 * real when sessions become verifiable; everything above it is already correct.
 */
export type SessionLookup = (token: string) => string | undefined;

export function createSessionViewerResolver(lookup: SessionLookup): ViewerResolver {
  return {
    resolve(authorization) {
      const token = parseBearerToken(authorization);
      if (!token.ok) return token;

      const userId = lookup(token.value);
      if (userId === undefined || userId.length === 0) return err('SESSION_REJECTED');

      return ok({ userId });
    },
  };
}

/**
 * The resolver as this deployment stands: it accepts nothing.
 *
 * `SESSION_UNVERIFIABLE` rather than `SESSION_REJECTED` so the operator can tell "we cannot check
 * tokens yet" from "someone is presenting bad ones". The client sees the same 401 either way.
 */
export function createUnverifiableSessionResolver(): ViewerResolver {
  return {
    resolve(authorization) {
      const token = parseBearerToken(authorization);
      return token.ok ? err('SESSION_UNVERIFIABLE') : token;
    },
  };
}
