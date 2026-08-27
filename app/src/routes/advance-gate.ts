import { isPlaybackLock } from '../data/playback-api';
import type { ApiFailure } from '../data/failure';
import type { PlaybackApi } from '../data/playback-api';
import type { PlaybackDescriptor } from '@minidrama/shared';

/**
 * Ask the server whether the *next* episode may play, before VePlayer is told about it.
 *
 * 连播 and 切集 used to change the route first. The new route minted a session, which is how a
 * lock became an overlay — and also how the current player was torn down to show a wall. The
 * gate is the session for the *target* id: a 403 opens PNL-02 on top of the episode that is
 * already on screen (`AC-PL-5`), and a descriptor is the only thing that may advance.
 *
 * An entitled result carries that descriptor so the retained instance can `playNext()`
 * (`AC-PL-3`) instead of discarding it and reminting after a teardown.
 */

export type AdvanceGate =
  | { readonly kind: 'ENTITLED'; readonly descriptor: PlaybackDescriptor }
  | { readonly kind: 'LOCKED' }
  | { readonly kind: 'REFUSED'; readonly failure: ApiFailure };

export async function gateAdvance(api: PlaybackApi, episodeId: string): Promise<AdvanceGate> {
  const result = await api.createSession(episodeId);
  if (result.ok) {
    return { kind: 'ENTITLED', descriptor: result.value };
  }
  if (isPlaybackLock(result.error)) {
    return { kind: 'LOCKED' };
  }
  return { kind: 'REFUSED', failure: result.error };
}
