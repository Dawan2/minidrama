import { describe, expect, it, vi } from 'vitest';
import { ok } from '@minidrama/shared';

import {
  PLAYBACK_SESSIONS_PATH,
  createPlaybackApi,
  isPlaybackLock,
  narrowPlaybackDescriptor,
} from './playback-api';
import { apiFailure } from './failure';
import { playbackDescriptor } from '../testing/playback-fixtures';
import type { HttpPoster } from './http';

function httpStub(body: unknown): HttpPoster {
  return { postJson: () => Promise.resolve(ok(body)) };
}

function postSpy(body: unknown = playbackDescriptor()) {
  return vi.fn<HttpPoster['postJson']>(() => Promise.resolve(ok(body)));
}

describe('the playback session endpoint', () => {
  it('publishes the path X-19 bound, under the live /v1 prefix', () => {
    expect(PLAYBACK_SESSIONS_PATH).toBe('/v1/playback/sessions');
  });

  it('posts the route episode id and nothing else', async () => {
    const postJson = postSpy();
    await createPlaybackApi({ postJson }).createSession('ep_test_0003');

    expect(postJson).toHaveBeenCalledWith(PLAYBACK_SESSIONS_PATH, { episodeId: 'ep_test_0003' });
    const body = postJson.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['episodeId']);
  });

  it('passes a commercial lock through untouched, with its code', async () => {
    const failure = apiFailure({
      kind: 'HTTP',
      status: 403,
      code: 'EPISODE_LOCKED',
      message: 'This episode is not unlocked',
    });

    const result = await createPlaybackApi({
      postJson: () => Promise.resolve({ ok: false, error: failure }),
    }).createSession('ep_test_0004');

    expect(result).toEqual({ ok: false, error: failure });
  });

  it('returns the descriptor the player is built from', async () => {
    const descriptor = playbackDescriptor({
      albumId: 'drm_real_1',
      episodeId: 'ep_real_1',
      vid: 'v02xxxx',
      resumePositionSec: 12,
    });
    const result = await createPlaybackApi(httpStub(descriptor)).createSession('ep_real_1');

    expect(result).toEqual(ok(descriptor));
  });
});

describe('isPlaybackLock', () => {
  it('treats EPISODE_LOCKED and EPISODE_VIP_REQUIRED as overlay, not as a broken player', () => {
    expect(
      isPlaybackLock(apiFailure({ kind: 'HTTP', status: 403, code: 'EPISODE_LOCKED', message: 'x' })),
    ).toBe(true);
    expect(
      isPlaybackLock(
        apiFailure({ kind: 'HTTP', status: 403, code: 'EPISODE_VIP_REQUIRED', message: 'x' }),
      ),
    ).toBe(true);
  });

  it('treats an anonymous paid attempt as a lock, so the overlay can ask for sign-in', () => {
    expect(
      isPlaybackLock(
        apiFailure({ kind: 'HTTP', status: 401, code: 'AUTH_REQUIRED', message: 'x' }),
      ),
    ).toBe(true);
  });

  it('does not treat an unavailable asset or a missing episode as a lock', () => {
    expect(
      isPlaybackLock(
        apiFailure({ kind: 'HTTP', status: 503, code: 'EPISODE_ASSET_UNAVAILABLE', message: 'x' }),
      ),
    ).toBe(false);
    expect(
      isPlaybackLock(
        apiFailure({ kind: 'HTTP', status: 404, code: 'CONTENT_NOT_FOUND', message: 'x' }),
      ),
    ).toBe(false);
    expect(isPlaybackLock(apiFailure({ kind: 'OFFLINE', message: 'x' }))).toBe(false);
  });
});

/**
 * X-19 / A4. A 201 whose body is a media URL is not a descriptor. Caught here it is MALFORMED
 * and the player never starts; caught at VePlayer it is a native fetch of bytes we are not
 * allowed to host.
 */
describe('a response that is not a playback descriptor', () => {
  async function narrows(body: unknown) {
    return createPlaybackApi(httpStub(body)).createSession('ep_1');
  }

  it('rejects a body with no vid rather than inventing one', async () => {
    const { vid: _dropped, ...rest } = playbackDescriptor();
    const result = await narrows(rest);

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe('MALFORMED');
  });

  it('rejects a missing album, episode, or resume position', async () => {
    const { albumId: _album, ...withoutAlbum } = playbackDescriptor();
    const { episodeId: _episode, ...withoutEpisode } = playbackDescriptor();
    const { resumePositionSec: _resume, ...withoutResume } = playbackDescriptor();

    for (const body of [withoutAlbum, withoutEpisode, withoutResume, null, [], 'ok']) {
      expect((await narrows(body)).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('rejects a playUrl, a quality ladder, or any URL-shaped key', async () => {
    for (const body of [
      { ...playbackDescriptor(), playUrl: 'https://cdn.example/a.m3u8' },
      { ...playbackDescriptor(), url: 'https://cdn.example/a.mp4' },
      { ...playbackDescriptor(), definitions: ['720p'] },
      { ...playbackDescriptor(), quality: '1080p' },
    ]) {
      expect((await narrows(body)).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('rejects a vid or token that is itself a locator', async () => {
    expect((await narrows(playbackDescriptor({ vid: 'https://cdn.example/v.mp4' }))).ok).toBe(
      false,
    );
    expect((await narrows({ ...playbackDescriptor(), playAuthToken: 'https://x/t' })).ok).toBe(
      false,
    );
  });

  it('drops unknown non-media fields rather than forwarding them', () => {
    const narrowed = narrowPlaybackDescriptor({
      ...playbackDescriptor(),
      extra: 'drop me',
    });
    expect(narrowed).toEqual(playbackDescriptor());
    expect(narrowed === null ? [] : Object.keys(narrowed).sort()).toEqual([
      'albumId',
      'episodeId',
      'resumePositionSec',
      'vid',
    ]);
  });

  it('keeps a present playAuthToken and omits an absent one', () => {
    expect(narrowPlaybackDescriptor(playbackDescriptor({ playAuthToken: 'tok_1' }))).toEqual(
      playbackDescriptor({ playAuthToken: 'tok_1' }),
    );
    expect(narrowPlaybackDescriptor(playbackDescriptor())).not.toHaveProperty('playAuthToken');
  });

  it('rejects a negative resume position', async () => {
    expect((await narrows(playbackDescriptor({ resumePositionSec: -1 }))).ok).toBe(false);
  });
});
