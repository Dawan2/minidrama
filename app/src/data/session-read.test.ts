import { describe, expect, it } from 'vitest';

import { apiFailure } from './failure';
import { UNAVAILABLE_STATUSES, presentSessionReadFailure } from './session-read';

function http(status: number, extra: Partial<Parameters<typeof apiFailure>[0]> = {}) {
  return apiFailure({ kind: 'HTTP', status, message: `HTTP ${String(status)}`, ...extra });
}

/**
 * The three answers a session-scoped read can give that all look like "nothing here", and the
 * reason they are not one state. Asserted here once, for both personal screens: the history screen
 * re-asserts it as its own product promise in `history/history-presentation.test.ts`.
 */
describe('a failed session-scoped read', () => {
  it('reads a 401 as no session, not as an error and not as an empty list', () => {
    expect(presentSessionReadFailure(http(401, { code: 'AUTH_REQUIRED' })).kind).toBe(
      'AUTH_REQUIRED',
    );
  });

  /**
   * A `401` can come from a platform gateway with a body we do not recognise, in which case the
   * envelope — and the code — is unreadable. Keying on the code would then show the viewer the
   * wrong screen because we could not parse an error body.
   */
  it('reads a 401 as no session even when the error envelope was unreadable', () => {
    const presented = presentSessionReadFailure(http(401));
    expect(presented.kind).toBe('AUTH_REQUIRED');
    expect(presented.kind === 'AUTH_REQUIRED' ? presented.failure.code : 'x').toBeNull();
  });

  it('degrades a missing endpoint to the empty state rather than to an error', () => {
    for (const status of UNAVAILABLE_STATUSES) {
      expect(presentSessionReadFailure(http(status)).kind, String(status)).toBe('UNAVAILABLE');
    }
  });

  it('keeps a missing endpoint apart from no session', () => {
    expect(presentSessionReadFailure(http(404)).kind).not.toBe(
      presentSessionReadFailure(http(401)).kind,
    );
  });

  it('leaves every other failure to the shared classification', () => {
    const server = presentSessionReadFailure(http(503));
    expect(server.kind === 'ERROR' ? server.error.kind : null).toBe('RETRYABLE');

    const refused = presentSessionReadFailure(http(400));
    expect(refused.kind === 'ERROR' ? refused.error.kind : null).toBe('TERMINAL');
  });

  it('leaves a transport failure to the shared classification', () => {
    for (const kind of ['OFFLINE', 'TIMEOUT', 'MALFORMED'] as const) {
      const presented = presentSessionReadFailure(apiFailure({ kind, message: kind }));
      expect(presented.kind, kind).toBe('ERROR');
    }
  });

  // A `403` is a banned account or a frozen wallet (J14), not a missing session. Treating it as one
  // would put a sign-in button in front of a viewer who is already signed in and refused.
  it('does not read a 403 as a missing session', () => {
    expect(presentSessionReadFailure(http(403)).kind).toBe('ERROR');
  });

  it('carries the failure through so a trace id still reaches the DOM', () => {
    const presented = presentSessionReadFailure(http(401, { traceId: 'trace_9' }));
    expect(presented.kind === 'AUTH_REQUIRED' ? presented.failure.traceId : null).toBe('trace_9');
  });
});
