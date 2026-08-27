import { ok } from '@minidrama/shared';
import type { MeView, Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { MeApi } from '../data/me-api';

/**
 * Test doubles for the current-user identity read.
 *
 * Test-only: `import-hygiene.test.ts` fails the build if a screen imports from here.
 *
 * The stub implements `MeApi`, the seam the screens depend on, rather than stubbing `fetch`.
 * The unscripted me is `{ id: 'open_1' }` with no nickname — today's production answer, and
 * the state the identity card must render without inventing a display name or a VIP badge.
 */

export function meView(overrides: Partial<MeView> = {}): MeView {
  return { id: 'open_1', ...overrides };
}

export interface StubMeApiScript {
  readonly me?: (callIndex: number) => Result<MeView, ApiFailure>;
}

export interface StubMeApi extends MeApi {
  readonly meCalls: number;
}

export function stubMeApi(script: StubMeApiScript = {}): StubMeApi {
  let meCalls = 0;

  return {
    get meCalls() {
      return meCalls;
    },

    fetchMe: () => {
      const index = meCalls;
      meCalls += 1;
      return Promise.resolve(script.me?.(index) ?? ok(meView()));
    },
  };
}

export function meHttpFailure(status: number, traceId = 'trace_me'): ApiFailure {
  return apiFailure({ kind: 'HTTP', status, message: `HTTP ${String(status)}`, traceId });
}
