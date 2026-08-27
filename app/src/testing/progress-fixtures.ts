import { ok } from '@minidrama/shared';
import type {
  DramaProgressItem,
  DramaProgressView,
  Result,
  WatchProgressReport,
} from '@minidrama/shared';

import type { ApiFailure } from '../data/failure';
import type { ProgressApi } from '../data/progress-api';

/**
 * Test doubles for the per-drama progress read.
 *
 * Test-only: `import-hygiene.test.ts` fails the build if a screen imports from here.
 *
 * The unscripted client is an empty view, not a guessed range of completed episode numbers.
 * Empty is "signed in, watched nothing of this drama", which is what a picker test that does
 * not mention progress should see: lock marks from `viewerAccess`, no watched marks.
 */

export function dramaProgressItem(overrides: Partial<DramaProgressItem> = {}): DramaProgressItem {
  return {
    episodeId: 'ep_test_0001',
    episodeNumber: 1,
    positionSec: 90,
    completed: true,
    ...overrides,
  };
}

export function dramaProgressView(overrides: Partial<DramaProgressView> = {}): DramaProgressView {
  return {
    items: [],
    lastWatched: null,
    ...overrides,
  };
}

export interface StubProgressApiScript {
  readonly dramaProgress?: (
    dramaId: string,
    callIndex: number,
  ) => Result<DramaProgressView, ApiFailure>;
  readonly report?: (episodeId: string, report: WatchProgressReport) => Result<void, ApiFailure>;
}

export interface StubProgressApi extends ProgressApi {
  readonly dramaProgressCalls: readonly string[];
  readonly progressReports: readonly {
    readonly episodeId: string;
    readonly report: WatchProgressReport;
  }[];
}

export function stubProgressApi(script: StubProgressApiScript = {}): StubProgressApi {
  const dramaProgressCalls: string[] = [];
  const progressReports: { episodeId: string; report: WatchProgressReport }[] = [];
  const dramaProgress = script.dramaProgress ?? ((_dramaId: string) => ok(dramaProgressView()));

  return {
    dramaProgressCalls,
    progressReports,
    fetchDramaProgress: async (dramaId) => {
      const index = dramaProgressCalls.length;
      dramaProgressCalls.push(dramaId);
      return dramaProgress(dramaId, index);
    },
    reportEpisodeProgress: async (episodeId, report) => {
      progressReports.push({ episodeId, report });
      return script.report?.(episodeId, report) ?? ok(undefined);
    },
  };
}
