import { ok } from '@minidrama/shared';
import type { Page, Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import { dramaSummary, page } from './catalog-fixtures';
import type { ApiFailure } from '../data/failure';
import type { HistoryApi, WatchHistoryEntry, WatchHistoryRequest } from '../data/history-api';
import type { Session, SessionState } from '../auth/session';

/**
 * Test doubles for the watch history and for the session.
 *
 * Test-only, like everything in this directory: `import-hygiene.test.ts` fails the build if a
 * screen ever imports from here.
 *
 * The stub implements `HistoryApi`, the seam the screen depends on, for the same reason the
 * catalogue stub does: a screen's states are a property of the screen, and asserting them through a
 * stubbed `fetch` would put HTTP status codes in the middle of every one of them. The status codes
 * are tested where they are interpreted — `history-presentation.test.ts` — exactly once.
 */

export function watchHistoryEntry(overrides: Partial<WatchHistoryEntry> = {}): WatchHistoryEntry {
  return {
    drama: dramaSummary(),
    lastEpisodeNumber: 7,
    lastPositionSec: 42,
    watchedAt: '2026-08-27T10:00:00.000Z',
    lastEpisodeId: 'ep_test_0007',
    ...overrides,
  };
}

export interface StubHistoryApiScript {
  readonly history?: (
    request: WatchHistoryRequest,
    callIndex: number,
  ) => Result<Page<WatchHistoryEntry>, ApiFailure>;
}

export interface StubHistoryApi extends HistoryApi {
  readonly historyCalls: readonly WatchHistoryRequest[];
}

export function stubHistoryApi(script: StubHistoryApiScript = {}): StubHistoryApi {
  const historyCalls: WatchHistoryRequest[] = [];

  return {
    historyCalls,

    fetchWatchHistory: (request) => {
      const index = historyCalls.length;
      historyCalls.push(request);
      return Promise.resolve(script.history?.(request, index) ?? ok(page<WatchHistoryEntry>([])));
    },
  };
}

/** `{ kind: 'HTTP', status }`, the shape a failed history read arrives in. */
export function historyHttpFailure(status: number, traceId = 'trace_history'): ApiFailure {
  return apiFailure({ kind: 'HTTP', status, message: `HTTP ${String(status)}`, traceId });
}

export interface StubSession extends Session {
  /** How many times a surface asked for a session. A second attempt in flight is a bug. */
  readonly signInCalls: () => number;
}

/**
 * A session whose `signIn` outcome the test chooses.
 *
 * `state` is fixed for the lifetime of the stub, which mirrors today's real session exactly: the
 * app boots with one and nothing mutates it. A test that needs a successful sign-in to change the
 * screen re-renders with a different stub, which is what the identity slot's stateful provider will
 * do for real.
 */
export function stubSession(
  options: { readonly state?: SessionState; readonly signInSucceeds?: boolean } = {},
): StubSession {
  let calls = 0;
  return {
    state: options.state ?? { status: 'ANONYMOUS' },
    signIn: () => {
      calls += 1;
      return Promise.resolve(options.signInSucceeds ?? false);
    },
    signInCalls: () => calls,
  };
}
