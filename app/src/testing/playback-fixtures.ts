import { err, ok } from '@minidrama/shared';
import type { PlaybackDescriptor, Result } from '@minidrama/shared';

import { apiFailure } from '../data/failure';
import type { ApiFailure } from '../data/failure';
import type { PlaybackApi } from '../data/playback-api';

/**
 * Test doubles for playback session issuance.
 *
 * Test-only — `import-hygiene.test.ts` keeps this directory out of the bundle. The stub
 * implements `PlaybackApi` rather than `fetch` for the same reason the catalogue stub does: the
 * player's states are a property of the player screen, and asserting them through HTTP status
 * codes would test the transport once per state. `playback-api.test.ts` tests the transport once.
 *
 * The default script issues a descriptor for whatever episode id was asked. A lock, a 404 or a
 * URL-shaped body has to be opted into, so a test that forgets to mention playback still renders
 * a player of the *route* episode rather than a six-item demo album.
 */

export function playbackDescriptor(
  overrides: Partial<PlaybackDescriptor> = {},
): PlaybackDescriptor {
  const episodeId = overrides.episodeId ?? 'ep_test_0001';
  return {
    albumId: 'drm_test_0001',
    episodeId,
    vid: `vid_${episodeId}`,
    resumePositionSec: 0,
    ...overrides,
  };
}

export function playbackHttpFailure(
  status: number,
  code: ApiFailure['code'] = null,
  traceId = 'trace_play_0001',
): ApiFailure {
  return apiFailure({
    kind: 'HTTP',
    status,
    message: `HTTP ${String(status)}`,
    traceId,
    ...(code === null ? {} : { code }),
  });
}

export interface StubPlaybackApiScript {
  readonly create?: (
    episodeId: string,
    callIndex: number,
  ) => Result<PlaybackDescriptor, ApiFailure>;
}

export interface StubPlaybackApi extends PlaybackApi {
  readonly createCalls: readonly string[];
}

export function stubPlaybackApi(script: StubPlaybackApiScript = {}): StubPlaybackApi {
  const createCalls: string[] = [];

  return {
    createCalls,

    createSession: (episodeId) => {
      const index = createCalls.length;
      createCalls.push(episodeId);
      return Promise.resolve(
        script.create?.(episodeId, index) ?? ok(playbackDescriptor({ episodeId })),
      );
    },
  };
}

export function lockedPlaybackFailure(): ApiFailure {
  return playbackHttpFailure(403, 'EPISODE_LOCKED');
}

export function vipPlaybackFailure(): ApiFailure {
  return playbackHttpFailure(403, 'EPISODE_VIP_REQUIRED');
}

export function unscriptedPlaybackFailure(): Result<PlaybackDescriptor, ApiFailure> {
  return err(apiFailure({ kind: 'MALFORMED', message: 'the stub has no script for this call' }));
}
