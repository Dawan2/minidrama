import { classifyFailure } from '../data/failure';
import type { ApiFailure, SurfaceError } from '../data/failure';

/**
 * What a failed history read means, which is the one decision this slot exists to get right.
 *
 * "You have no history" is three different products, and the whole value of the screen depends on
 * telling them apart:
 *
 * | Server says | Screen shows | Why it must be its own state |
 * | --- | --- | --- |
 * | `200` with `items: []` | "nothing to continue yet" + go to the feed | The viewer is known and has watched nothing. The action is to go and watch something |
 * | `401` | "sign in to see this" + retry silent login | The viewer is **not known**. There may well be a history; we are not allowed to see it. Rendering this as empty tells the viewer their progress was lost |
 * | `404` / `405` / `501` | the empty state, unchanged | The endpoint is not deployed. This is our gap, and it is not the viewer's data |
 *
 * The middle row is the one that matters and the one that is easy to get wrong, because both of the
 * others are legitimately "an empty screen". A viewer who has watched twenty episodes and is shown
 * "nothing to continue yet" because a token was missing has been told their progress is gone. They
 * do not know what a 401 is; they know what a lost place in a drama is. And the recovery is the
 * opposite in each case: one sends them to the feed, the other retries silent login.
 *
 * Existing surfaces do not need this because every catalogue read is anonymous-capable
 * (`docs/12-api-contracts.md` §2.2) and the server grants an `Authorization` header nothing yet
 * (`docs/handoff/w2-work-d.md` decision S28). History is the first read that is session-scoped, so
 * this is the first surface with a `401` to interpret. `classifyFailure` is untouched: it maps
 * `401` to a terminal `REJECTED` for everyone else, which is right for a read that can never
 * legitimately be unauthorised, and wrong only here.
 */

export type HistoryPresentation =
  /** No session. The recovery is silent login, in place, not a login screen — IA §9. */
  | { readonly kind: 'AUTH_REQUIRED'; readonly failure: ApiFailure }
  /** The endpoint is not there. Renders exactly like an empty list, deliberately. */
  | { readonly kind: 'UNAVAILABLE'; readonly failure: ApiFailure }
  /** Everything else, classified the way every other surface classifies it. */
  | { readonly kind: 'ERROR'; readonly error: SurfaceError };

/**
 * Statuses that mean "this endpoint is not deployed" rather than "your history is missing".
 *
 * A collection endpoint cannot answer `404` about the caller's data: either the route exists and
 * the collection is empty, or the route does not exist. Today it is the second — there is no
 * progress module under `server/` and Fastify's not-found handler answers
 * `404 COMMON_RESOURCE_NOT_FOUND`. `405` is the same fact reported by a proxy that knows the path
 * but not the method, and `501` is a gateway saying it outright.
 *
 * They degrade to the empty state rather than to an error because an error state asks the viewer to
 * do something about our missing feature. "Nothing to continue yet" is, as it happens, exactly
 * true: there is no history, because nothing can record one.
 */
const UNAVAILABLE_STATUSES: readonly number[] = [404, 405, 501];

export function presentHistoryFailure(failure: ApiFailure): HistoryPresentation {
  if (failure.kind !== 'HTTP' || failure.status === null) {
    return { kind: 'ERROR', error: classifyFailure(failure) };
  }

  /*
   * Keyed on the status, not on the error code. A `401` can arrive from a platform gateway or a
   * proxy with a body we do not recognise, in which case `code` is null (`readErrorEnvelope`), and
   * "we could not read the envelope" is not a reason to show the viewer the wrong screen. Every
   * `401` in the error catalogue — `AUTH_REQUIRED`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED`,
   * `AUTH_REFRESH_TOKEN_INVALID` (`docs/12-error-catalog.md` §3) — asks the client for the same
   * thing anyway: get a session and come back.
   */
  if (failure.status === 401) {
    return { kind: 'AUTH_REQUIRED', failure };
  }

  if (UNAVAILABLE_STATUSES.includes(failure.status)) {
    return { kind: 'UNAVAILABLE', failure };
  }

  return { kind: 'ERROR', error: classifyFailure(failure) };
}
