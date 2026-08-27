import type { PlaybackDescriptor, Result } from '@minidrama/shared';

import { asRecord, narrow } from './narrow';
import type { ApiFailure } from './failure';
import type { HttpPoster } from './http';

/**
 * Playback session issuance, as the client sees it.
 *
 * One operation: `POST /v1/playback/sessions` → `201` and a VePlayer descriptor, or a refusal.
 * This is the commercial gate C3's second exit asked for (`docs/verify/cycle-3-report.md` D-16).
 * Catalogue reads may *describe* a lock; only this call is an attempt, and a locked attempt is
 * `403 EPISODE_LOCKED` rather than a descriptor.
 *
 * X-19 / correction A4: the body is identifiers, never a media URL. A `201` that carries a URL,
 * a manifest extension or a quality ladder is `MALFORMED` — fail-closed — so it cannot reach
 * VePlayer. The transport does not retry a `POST` (`http.ts` rule 4); repeating issuance is the
 * caller's decision, which on this screen is a tap on retry.
 */

export const PLAYBACK_SESSIONS_PATH = '/v1/playback/sessions';

/** The two commercial denials that open PNL-02 rather than an error state. */
export const PLAYBACK_LOCK_CODES = ['EPISODE_LOCKED', 'EPISODE_VIP_REQUIRED'] as const;

export type PlaybackLockCode = (typeof PLAYBACK_LOCK_CODES)[number];

export interface PlaybackApi {
  createSession(episodeId: string): Promise<Result<PlaybackDescriptor, ApiFailure>>;
}

export function createPlaybackApi(http: HttpPoster): PlaybackApi {
  return {
    createSession: async (episodeId) => {
      const body = await http.postJson(PLAYBACK_SESSIONS_PATH, { episodeId });
      return body.ok ? narrow(body.value, narrowPlaybackDescriptor) : body;
    },
  };
}

/**
 * A commercial lock is a conversion opportunity, not a broken player.
 *
 * `EPISODE_LOCKED` and `EPISODE_VIP_REQUIRED` are the 403s that open the existing unlock overlay.
 * An anonymous attempt on a paid episode is `401 AUTH_REQUIRED` with the same unlock context
 * (`docs/12-api-contracts.md` §4.4) — signing in is the step that has to happen first, and the
 * overlay already says so. Any other failure is fail-closed: no descriptor, no demo album.
 */
export function isPlaybackLock(failure: ApiFailure): boolean {
  if (failure.kind !== 'HTTP' || failure.code === null) {
    return false;
  }
  if ((PLAYBACK_LOCK_CODES as readonly string[]).includes(failure.code)) {
    return true;
  }
  return failure.status === 401 && failure.code === 'AUTH_REQUIRED';
}

/**
 * Names that mean "here is where the bytes are". `playAuthToken` is a credential for a legacy
 * cohort, not a locator, and is checked as a *value* below rather than banned as a key.
 */
const MEDIA_HANDLE_KEY =
  /url|uri|src|href|m3u8|mp4|mpd|hls|dash|cdn|manifest|playlist|playUrl|definition|quality|bitrate|resolution/i;

const MEDIA_HANDLE_VALUE = /https?:\/\/|\.m3u8|\.mp4|\.mpd|\.ts\b/i;

/**
 * Identifiers only. Extra fields are dropped rather than forwarded, so a server that grew a URL
 * under a name we do not list still cannot reach the player unless the name or the value itself
 * trips the handle scan — in which case the whole body is refused.
 */
export function narrowPlaybackDescriptor(value: unknown): PlaybackDescriptor | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  for (const [key, field] of Object.entries(record)) {
    if (MEDIA_HANDLE_KEY.test(key)) {
      return null;
    }
    if (typeof field === 'string' && MEDIA_HANDLE_VALUE.test(field)) {
      return null;
    }
  }

  const albumId = record['albumId'];
  const episodeId = record['episodeId'];
  const vid = record['vid'];
  const resumePositionSec = record['resumePositionSec'];
  const playAuthToken = record['playAuthToken'];

  if (typeof albumId !== 'string' || albumId.length === 0) {
    return null;
  }
  if (typeof episodeId !== 'string' || episodeId.length === 0) {
    return null;
  }
  if (typeof vid !== 'string' || vid.length === 0) {
    return null;
  }
  if (typeof resumePositionSec !== 'number' || !Number.isFinite(resumePositionSec)) {
    return null;
  }
  if (resumePositionSec < 0) {
    return null;
  }
  if (playAuthToken !== undefined && typeof playAuthToken !== 'string') {
    return null;
  }
  if (typeof playAuthToken === 'string' && playAuthToken.length === 0) {
    return null;
  }

  return {
    albumId,
    episodeId,
    vid,
    resumePositionSec,
    ...(playAuthToken === undefined ? {} : { playAuthToken }),
  };
}
