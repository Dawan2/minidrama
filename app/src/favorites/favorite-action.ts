import { classifyFailure } from '../data/failure';
import { UNAVAILABLE_STATUSES } from '../data/session-read';
import type { ApiFailure, SurfaceError } from '../data/failure';

/**
 * What a failed favourite *write* means, which is not what a failed read means.
 *
 * A read of a favourite row has one possible reason to answer `404`: the route is not there
 * (`data/session-read.ts` — a collection endpoint cannot 404 about the caller's own data). A `PUT`
 * has two, and they are opposite answers to the viewer. Slot J's decision S46 is that a drama which
 * was never published answers `404 CONTENT_NOT_FOUND` and a delisted one answers `410
 * CONTENT_OFFLINE`; Fastify's not-found handler answers `404 COMMON_RESOURCE_NOT_FOUND` when the
 * module is not deployed at all, which is the situation on this branch.
 *
 * So this is the one place in the client that keys on the error *code* rather than the status, and
 * the reason is that here the code is the only thing that can tell "your drama is gone" from "we
 * have not shipped this yet". An unreadable envelope degrades to `UNAVAILABLE` rather than to
 * `GONE`: both leave the row where it is, and only one of them tells a viewer their content has
 * been withdrawn on the strength of a body we could not parse.
 *
 * `DELETE` is documented never to fail on the catalogue's account — `204` whether or not there was
 * a row and whatever the drama's status (S45) — so `GONE` is reachable in practice only from the
 * undo. That asymmetry is the whole reason un-following is safe to offer optimistically and
 * re-following is not.
 */

export type FavoriteActionPresentation =
  /** No session. The recovery is silent login, in place, at the row. */
  | { readonly kind: 'AUTH_REQUIRED'; readonly failure: ApiFailure }
  /**
   * The drama is not in the catalogue any more, so re-following it cannot be made to work. The row
   * stays where it is and is offered no retry: a button that cannot succeed is worse than none.
   */
  | { readonly kind: 'GONE'; readonly failure: ApiFailure }
  /** The endpoint is not deployed. Also offered no retry, and it says so rather than blaming the viewer. */
  | { readonly kind: 'UNAVAILABLE'; readonly failure: ApiFailure }
  /** Everything else, classified the way every other surface classifies it. */
  | { readonly kind: 'ERROR'; readonly error: SurfaceError };

/** The codes that mean "this drama, specifically" rather than "this deployment". */
const CONTENT_CODES: readonly string[] = ['CONTENT_NOT_FOUND', 'CONTENT_OFFLINE'];

export function presentFavoriteActionFailure(failure: ApiFailure): FavoriteActionPresentation {
  if (failure.kind !== 'HTTP' || failure.status === null) {
    return { kind: 'ERROR', error: classifyFailure(failure) };
  }

  if (failure.status === 401) {
    return { kind: 'AUTH_REQUIRED', failure };
  }

  // A `410` is unambiguous: nothing in this product answers it except content that was withdrawn,
  // and it is the reason the catalogue distinguishes draft from delisted at all.
  if (failure.status === 410) {
    return { kind: 'GONE', failure };
  }

  if (failure.status === 404) {
    return failure.code !== null && CONTENT_CODES.includes(failure.code)
      ? { kind: 'GONE', failure }
      : { kind: 'UNAVAILABLE', failure };
  }

  if (UNAVAILABLE_STATUSES.includes(failure.status)) {
    return { kind: 'UNAVAILABLE', failure };
  }

  return { kind: 'ERROR', error: classifyFailure(failure) };
}

/**
 * Whether the viewer is offered the action again.
 *
 * Only where repeating the request could plausibly produce a different answer. A refused write, a
 * withdrawn drama and an undeployed endpoint all answer the same way for ever, and a retry button on
 * any of them is the mistake `data/failure.ts` exists to prevent, one screen further in.
 */
export function isRetryableAction(presented: FavoriteActionPresentation): boolean {
  return presented.kind === 'ERROR' && presented.error.kind === 'RETRYABLE';
}
