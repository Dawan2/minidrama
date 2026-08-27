import { err, ok } from '@minidrama/shared';
import type { ApiErrorCode, Result } from '@minidrama/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { errorBody } from '../../core/errors.js';
import type { ViewerResolutionFailure, ViewerResolver } from '../entitlement/viewer-resolver.js';

/**
 * Who is asking, for the endpoints where "nobody" is not an acceptable answer.
 *
 * Every other read in this server is anonymous-capable: an unauthenticated browse is a real use
 * case, so `ViewerResolver` reports an absent credential as `ok(null)` and the caller decides what
 * that means. Progress and watch history are the exceptions. They have no anonymous reading at all —
 * the row is the identity — so this is the one place that turns "anonymous" back into a refusal.
 *
 * It deliberately does **not** grow a second resolver. Two things in this server would then be
 * answering "who is this request?", and the failure mode of that arrangement is not a crash: it is
 * one of them accepting a credential the other rejects, which reads as a viewer seeing another
 * viewer's list. There is one seam (`entitlement/viewer-resolver.ts`), it is implemented once from
 * the session store the login route writes to (`identity/session-viewer-resolver.ts`), and this
 * function only narrows its result.
 */

/**
 * `NO_CREDENTIAL` is added to the resolver's own two. All three are answered the same way by these
 * routes, and the split exists for the operator: a flood of `SESSION_REJECTED` is someone guessing
 * tokens, a flood of `NO_CREDENTIAL` is a client that is not attaching the header it was issued.
 */
export type RequiredViewerFailure = 'NO_CREDENTIAL' | ViewerResolutionFailure;

export function requireViewer(
  resolver: ViewerResolver,
  authorization: string | undefined,
): Result<string, RequiredViewerFailure> {
  const resolved = resolver.resolve(authorization);
  if (!resolved.ok) return resolved;

  // The narrowing this function exists for. Reading an absent credential as a user id — an empty
  // string, a shared "anonymous" account — would put every anonymous caller on the same progress
  // rows and the same history list.
  return resolved.value === null ? err('NO_CREDENTIAL') : ok(resolved.value);
}

export interface ViewerRefusal {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  /** Ours to fix rather than the caller's, so it is logged at error level. */
  readonly ours: boolean;
}

/**
 * One table for every per-viewer endpoint in this module, and the same split the three sibling
 * modules use: a credential problem is the caller's `401`, and "we cannot check credentials" is our
 * `503`.
 *
 * Collapsing the third case into a `401` was the alternative, on the grounds that the client's next
 * move is the same — run silent login, retry once. It is rejected here because the client is not the
 * only reader of a status code: `401` on a broken session store tells every dashboard that users are
 * signing in wrong, and tells the viewer to re-login, which cannot work. The message the client sees
 * carries no more detail either way; the reason is logged, never returned, because which of the
 * three applies is useful to somebody probing the endpoint.
 */
export const VIEWER_REFUSALS: Record<RequiredViewerFailure, ViewerRefusal> = {
  NO_CREDENTIAL: {
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'Sign-in required',
    ours: false,
  },
  SESSION_REJECTED: {
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'Sign-in required',
    ours: false,
  },
  SESSION_UNRESOLVABLE: {
    status: 503,
    code: 'COMMON_SERVICE_UNAVAILABLE',
    message: 'Sessions cannot be resolved',
    ours: true,
  },
};

/** Answers a refusal and logs the reason it is never allowed to put in the response. */
export function sendViewerRefusal(
  request: FastifyRequest,
  reply: FastifyReply,
  failure: RequiredViewerFailure,
  what: string,
): FastifyReply {
  const refusal = VIEWER_REFUSALS[failure];

  if (refusal.ours) {
    request.log.error({ reason: failure }, `${what}: sessions cannot be resolved`);
  } else {
    request.log.warn({ reason: failure }, `${what} without a resolvable viewer`);
  }

  return reply.status(refusal.status).send(errorBody(refusal.code, refusal.message, request.id));
}
