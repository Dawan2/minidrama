import { describe, expect, it } from 'vitest';

import {
  API_FAILURE_KINDS,
  TERMINAL_REASONS,
  apiFailure,
  classifyFailure,
  isAutoRetryable,
  readErrorEnvelope,
} from './failure';

describe('failure classification', () => {
  it('publishes the kinds and terminal reasons as data', () => {
    expect([...API_FAILURE_KINDS]).toEqual(['OFFLINE', 'TIMEOUT', 'HTTP', 'MALFORMED']);
    expect([...TERMINAL_REASONS]).toEqual(['NOT_FOUND', 'OFFLINE', 'REJECTED']);
  });

  it('defaults every optional field to null rather than leaving it absent', () => {
    const failure = apiFailure({ kind: 'OFFLINE', message: 'no network' });
    expect(failure).toEqual({
      kind: 'OFFLINE',
      status: null,
      code: null,
      message: 'no network',
      traceId: null,
      retryAfterSec: null,
    });
  });

  // The whole point of the module: a terminal failure must never reach a retry button.
  it('treats a withdrawn resource as terminal and distinguishes it from a missing one', () => {
    const gone = classifyFailure(apiFailure({ kind: 'HTTP', status: 410, message: 'gone' }));
    const missing = classifyFailure(apiFailure({ kind: 'HTTP', status: 404, message: 'missing' }));

    expect(gone).toMatchObject({ kind: 'TERMINAL', reason: 'OFFLINE' });
    expect(missing).toMatchObject({ kind: 'TERMINAL', reason: 'NOT_FOUND' });
  });

  it('treats the transport failures as retryable', () => {
    for (const kind of ['OFFLINE', 'TIMEOUT', 'MALFORMED'] as const) {
      expect(classifyFailure(apiFailure({ kind, message: kind })).kind).toBe('RETRYABLE');
    }
  });

  it('treats a server fault and a rate limit as retryable', () => {
    for (const status of [429, 500, 502, 503]) {
      const error = classifyFailure(apiFailure({ kind: 'HTTP', status, message: 'later' }));
      expect(error.kind, `status ${String(status)}`).toBe('RETRYABLE');
    }
  });

  // A request the server has already refused cannot succeed by being repeated. A stale cursor is
  // the realistic case: the 400 belongs to the request, not to the network.
  it('treats a refused request as terminal, not retryable', () => {
    for (const status of [400, 401, 403, 422]) {
      const error = classifyFailure(apiFailure({ kind: 'HTTP', status, message: 'no' }));
      expect(error, `status ${String(status)}`).toMatchObject({
        kind: 'TERMINAL',
        reason: 'REJECTED',
      });
    }
  });

  it('carries the retry delay through to the retryable state', () => {
    const error = classifyFailure(
      apiFailure({ kind: 'HTTP', status: 429, message: 'slow down', retryAfterSec: 30 }),
    );
    expect(error).toMatchObject({ kind: 'RETRYABLE', retryAfterSec: 30 });
  });

  it('keeps the original failure attached to the classification', () => {
    const failure = apiFailure({ kind: 'HTTP', status: 404, message: 'missing', traceId: 'tr_1' });
    expect(classifyFailure(failure).failure).toBe(failure);
  });
});

describe('automatic retry eligibility', () => {
  it('retries the failures where the request may never have arrived', () => {
    expect(isAutoRetryable(apiFailure({ kind: 'OFFLINE', message: 'x' }))).toBe(true);
    expect(isAutoRetryable(apiFailure({ kind: 'TIMEOUT', message: 'x' }))).toBe(true);
    expect(isAutoRetryable(apiFailure({ kind: 'HTTP', status: 503, message: 'x' }))).toBe(true);
  });

  // Retrying a rate limit immediately is how a throttle becomes an outage. It is retryable by the
  // user, after `retryAfterSec` — which is a different thing from retryable by the transport.
  it('does not retry a rate limit automatically', () => {
    expect(isAutoRetryable(apiFailure({ kind: 'HTTP', status: 429, message: 'x' }))).toBe(false);
  });

  it('does not retry a client error or a malformed body', () => {
    expect(isAutoRetryable(apiFailure({ kind: 'HTTP', status: 404, message: 'x' }))).toBe(false);
    expect(isAutoRetryable(apiFailure({ kind: 'MALFORMED', message: 'x' }))).toBe(false);
  });
});

describe('error envelope reading', () => {
  it('reads the documented envelope', () => {
    const failure = readErrorEnvelope(404, {
      error: {
        code: 'CONTENT_NOT_FOUND',
        message: 'No such content',
        traceId: 'trace_abc',
        details: { resourceType: 'DRAMA', resourceId: 'drm_1' },
      },
    });

    expect(failure).toMatchObject({
      kind: 'HTTP',
      status: 404,
      code: 'CONTENT_NOT_FOUND',
      message: 'No such content',
      traceId: 'trace_abc',
      retryAfterSec: null,
    });
  });

  it('reads retryAfterSec out of details', () => {
    const failure = readErrorEnvelope(503, {
      error: {
        code: 'COMMON_SERVICE_UNAVAILABLE',
        message: 'later',
        details: { retryAfterSec: 5 },
      },
    });
    expect(failure.retryAfterSec).toBe(5);
  });

  // A gateway, a WAF or the platform can answer with a body of its own design. The status is still
  // the whole basis of the UI decision, so it must survive a body nobody recognises.
  it('keeps the status when the body is not an envelope at all', () => {
    for (const body of [null, 'gateway timeout', {}, { error: 'nope' }, []]) {
      const failure = readErrorEnvelope(502, body);
      expect(failure.status, JSON.stringify(body)).toBe(502);
      expect(failure.kind).toBe('HTTP');
      expect(failure.code).toBeNull();
    }
  });

  // A code that only exists on the server must not be cast into our union, or it reaches a switch
  // here as a value no branch handles.
  it('drops an error code it does not recognise', () => {
    const failure = readErrorEnvelope(403, {
      error: { code: 'WALLET_FROZEN_TOMORROW', message: 'no' },
    });
    expect(failure.code).toBeNull();
    expect(failure.message).toBe('no');
  });

  it('falls back to the status when there is no message to show', () => {
    expect(readErrorEnvelope(500, {}).message).toBe('HTTP 500');
  });
});
