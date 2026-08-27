import { describe, expect, it } from 'vitest';

import { apiFailure } from '../data/failure';
import { isRetryableAction, presentFavoriteActionFailure } from './favorite-action';
import type { ApiErrorCode } from '@minidrama/shared';

function http(status: number, code?: ApiErrorCode) {
  return apiFailure({
    kind: 'HTTP',
    status,
    message: `HTTP ${String(status)}`,
    ...(code === undefined ? {} : { code }),
  });
}

/**
 * A failed favourite *write*, which does not mean what a failed read means. The `PUT` has two
 * reasons to answer `404` — the drama was never published, or the module is not deployed — and they
 * are opposite answers to the viewer.
 */
describe('a failed favourite write', () => {
  it('reads a 401 as no session', () => {
    expect(presentFavoriteActionFailure(http(401, 'AUTH_REQUIRED')).kind).toBe('AUTH_REQUIRED');
  });

  it('reads a 410 as a withdrawn drama', () => {
    expect(presentFavoriteActionFailure(http(410, 'CONTENT_OFFLINE')).kind).toBe('GONE');
  });

  it('reads a 404 about the drama as a withdrawn drama', () => {
    expect(presentFavoriteActionFailure(http(404, 'CONTENT_NOT_FOUND')).kind).toBe('GONE');
  });

  /**
   * The situation on this branch: there is no discovery module on the server, so Fastify's not-found
   * handler answers. The two 404s are told apart by the code, which is the only signal that can, and
   * this is the one place in the client that keys on it.
   */
  it('reads a 404 from the not-found handler as an undeployed endpoint', () => {
    expect(presentFavoriteActionFailure(http(404, 'COMMON_RESOURCE_NOT_FOUND')).kind).toBe(
      'UNAVAILABLE',
    );
  });

  // Both leave the row where it is, and only one of them tells a viewer their content was withdrawn
  // on the strength of a body we could not parse.
  it('degrades a 404 with an unreadable envelope to the undeployed answer, not to a withdrawn drama', () => {
    expect(presentFavoriteActionFailure(http(404)).kind).toBe('UNAVAILABLE');
  });

  it('reads the other undeployed statuses the same way', () => {
    for (const status of [405, 501]) {
      expect(presentFavoriteActionFailure(http(status)).kind, String(status)).toBe('UNAVAILABLE');
    }
  });

  it('leaves a server fault and a refused request to the shared classification', () => {
    const fault = presentFavoriteActionFailure(http(503));
    expect(fault.kind === 'ERROR' ? fault.error.kind : null).toBe('RETRYABLE');

    const refused = presentFavoriteActionFailure(http(400, 'COMMON_VALIDATION_FAILED'));
    expect(refused.kind === 'ERROR' ? refused.error.kind : null).toBe('TERMINAL');
  });

  it('leaves a transport failure to the shared classification', () => {
    for (const kind of ['OFFLINE', 'TIMEOUT', 'MALFORMED'] as const) {
      expect(presentFavoriteActionFailure(apiFailure({ kind, message: kind })).kind, kind).toBe(
        'ERROR',
      );
    }
  });

  it('does not read a 403 as a missing session', () => {
    expect(presentFavoriteActionFailure(http(403)).kind).toBe('ERROR');
  });
});

/**
 * The mistake `data/failure.ts` exists to prevent, one screen further in: a retry button on a
 * request that has already been refused for ever.
 */
describe('whether the viewer is offered the action again', () => {
  it('offers a retry only where repeating the request could answer differently', () => {
    expect(isRetryableAction(presentFavoriteActionFailure(http(503)))).toBe(true);
    expect(
      isRetryableAction(
        presentFavoriteActionFailure(apiFailure({ kind: 'TIMEOUT', message: 'x' })),
      ),
    ).toBe(true);
  });

  it('offers no retry for a withdrawn drama, an undeployed endpoint or a refused write', () => {
    for (const failure of [http(410), http(404), http(405), http(400)]) {
      expect(isRetryableAction(presentFavoriteActionFailure(failure)), String(failure.status)).toBe(
        false,
      );
    }
  });

  // A 401 is not an error and is not retried in place: the recovery is silent login, and the row
  // renders a sign-in prompt instead of a retry button.
  it('offers no retry for a missing session', () => {
    expect(isRetryableAction(presentFavoriteActionFailure(http(401)))).toBe(false);
  });
});
