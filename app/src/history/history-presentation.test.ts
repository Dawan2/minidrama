import { describe, expect, it } from 'vitest';

import { apiFailure } from '../data/failure';
import { presentHistoryFailure } from './history-presentation';

function http(status: number, extra: Partial<Parameters<typeof apiFailure>[0]> = {}) {
  return apiFailure({ kind: 'HTTP', status, message: `HTTP ${String(status)}`, ...extra });
}

/**
 * The distinction this slot exists to draw. "You have no history" is three different answers with
 * three different recoveries, and only one of them is about the viewer's data.
 */
describe('a failed history read', () => {
  it('reads a 401 as no session, not as an error and not as an empty list', () => {
    const presented = presentHistoryFailure(http(401, { code: 'AUTH_REQUIRED' }));
    expect(presented.kind).toBe('AUTH_REQUIRED');
  });

  /**
   * A `401` can come from a platform gateway with a body we do not recognise, in which case the
   * envelope — and the code — is unreadable. Keying on the code would then show the viewer the
   * wrong screen because we could not parse an error body, and every 401 in the catalogue asks the
   * client for the same thing anyway.
   */
  it('reads a 401 as no session even when the error envelope was unreadable', () => {
    const presented = presentHistoryFailure(http(401));
    expect(presented.kind).toBe('AUTH_REQUIRED');
    expect(presented.kind === 'AUTH_REQUIRED' ? presented.failure.code : 'x').toBeNull();
  });

  it('reads every 401 code the catalogue publishes the same way', () => {
    for (const code of ['AUTH_REQUIRED', 'AUTH_TOKEN_EXPIRED'] as const) {
      expect(presentHistoryFailure(http(401, { code })).kind, code).toBe('AUTH_REQUIRED');
    }
  });

  /**
   * There is no progress module under `server/`, so a request today hits Fastify's not-found
   * handler. A collection endpoint cannot answer 404 about the caller's data — either the route
   * exists and the list is empty, or the route does not exist — so this is our gap, and an error
   * screen would ask the viewer to do something about it.
   */
  it('degrades a missing endpoint to the empty state rather than to an error', () => {
    for (const status of [404, 405, 501]) {
      const presented = presentHistoryFailure(http(status));
      expect(presented.kind, String(status)).toBe('UNAVAILABLE');
    }
  });

  it('keeps a missing endpoint apart from no session', () => {
    expect(presentHistoryFailure(http(404)).kind).not.toBe(presentHistoryFailure(http(401)).kind);
  });

  it('leaves every other failure to the shared classification', () => {
    const server = presentHistoryFailure(http(500));
    expect(server.kind).toBe('ERROR');
    expect(server.kind === 'ERROR' ? server.error.kind : null).toBe('RETRYABLE');

    const refused = presentHistoryFailure(http(400));
    expect(refused.kind).toBe('ERROR');
    expect(refused.kind === 'ERROR' ? refused.error.kind : null).toBe('TERMINAL');
  });

  it('leaves a transport failure to the shared classification', () => {
    for (const kind of ['OFFLINE', 'TIMEOUT', 'MALFORMED'] as const) {
      const presented = presentHistoryFailure(apiFailure({ kind, message: kind }));
      expect(presented.kind, kind).toBe('ERROR');
      expect(presented.kind === 'ERROR' ? presented.error.kind : null, kind).toBe('RETRYABLE');
    }
  });

  // A `403` is a banned account or a frozen wallet (J14), not a missing session. Treating it as
  // one would put a sign-in button in front of a viewer who is already signed in and refused.
  it('does not read a 403 as a missing session', () => {
    expect(presentHistoryFailure(http(403)).kind).toBe('ERROR');
  });

  it('carries the failure through so a trace id still reaches the DOM', () => {
    const presented = presentHistoryFailure(http(401, { traceId: 'trace_9' }));
    expect(presented.kind === 'AUTH_REQUIRED' ? presented.failure.traceId : null).toBe('trace_9');
  });
});
