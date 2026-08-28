import type { PlaybackDescriptor, Result } from '@minidrama/shared';

import { apiFailure, classifyFailure } from '../data/failure';
import { isPlaybackLock } from '../data/playback-api';
import type { ApiFailure, SurfaceError } from '../data/failure';

/**
 * PLAYER_FATAL recovery (`docs/design/player-state-machine.md` §4.4, `PLY-012`).
 *
 * VePlayer's ERROR payload is undocumented, so it does not classify the failure. The client
 * re-requests `POST /v1/playback/sessions` **once** and lets that answer decide:
 *
 *   - 201, first attempt → keep the instance, apply the fresh descriptor, user sees nothing
 *   - 201 after that attempt was already used → retryable overlay, last frame stays
 *   - commercial 403 / 401 → unlock overlay on the current episode
 *   - 409 → blocked (terminal, no retry, no price)
 *   - transport / 5xx → retryable overlay, last frame stays
 *
 * This is CN-7's retry-once discipline with a different reason: we are not ticking `expiresAt`
 * (CN-8 is superseded). A timer that re-signs is not this module.
 */

export type FatalReissuePlan = 'REQUEST' | 'EXHAUSTED';

/**
 * One silent re-issue per episode visit. A second fatal after that POST already ran is the
 * give-up: another automatic mint would be a retry loop wearing a token-refresh costume.
 */
export function planFatalReissue(completedAttempts: number): FatalReissuePlan {
  return completedAttempts < 1 ? 'REQUEST' : 'EXHAUSTED';
}

export type FatalReissueResult =
  | { readonly kind: 'CONTINUE'; readonly descriptor: PlaybackDescriptor }
  | { readonly kind: 'LOCKED' }
  | { readonly kind: 'BLOCKED' }
  | {
      readonly kind: 'RETRYABLE';
      readonly error: Extract<SurfaceError, { kind: 'RETRYABLE' }>;
    }
  | {
      readonly kind: 'TERMINAL';
      readonly error: Extract<SurfaceError, { kind: 'TERMINAL' }>;
    };

export function classifyReissue(
  result: Result<PlaybackDescriptor, ApiFailure>,
): FatalReissueResult {
  if (result.ok) {
    return { kind: 'CONTINUE', descriptor: result.value };
  }
  if (isPlaybackLock(result.error)) {
    return { kind: 'LOCKED' };
  }
  // Issuance answers 409 when the *platform* refuses the album version
  // (`docs/design/playback-contract.md` §5.2). The named code is not in this tree; the status is
  // the discriminant. Inventing `EPISODE_PLATFORM_BLOCKED` here would be a contract change.
  if (result.error.status === 409) {
    return { kind: 'BLOCKED' };
  }
  const surface = classifyFailure(result.error);
  return surface.kind === 'RETRYABLE'
    ? { kind: 'RETRYABLE', error: surface }
    : { kind: 'TERMINAL', error: surface };
}

/**
 * The overlay when a second fatal arrives after the silent mint, or when the user is looking at
 * a failure that has no HTTP body. Diagnostic only — never display copy, never a token.
 */
export function exhaustedReissueError(): Extract<SurfaceError, { kind: 'RETRYABLE' }> {
  return {
    kind: 'RETRYABLE',
    retryAfterSec: null,
    failure: apiFailure({
      kind: 'TIMEOUT',
      message: 'player fatal after the silent reissue was already used',
    }),
  };
}
