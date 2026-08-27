import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';

import { gateAdvance } from './advance-gate';
import {
  lockedPlaybackFailure,
  playbackDescriptor,
  playbackHttpFailure,
  stubPlaybackApi,
  vipPlaybackFailure,
} from '../testing/playback-fixtures';
import { apiFailure } from '../data/failure';

describe('gateAdvance', () => {
  it('lets an entitled next episode through without calling it a lock', async () => {
    const api = stubPlaybackApi({
      create: (episodeId) => ok(playbackDescriptor({ episodeId })),
    });

    expect(await gateAdvance(api, 'ep_test_0002')).toEqual({
      kind: 'ENTITLED',
      descriptor: playbackDescriptor({ episodeId: 'ep_test_0002' }),
    });
    expect(api.createCalls).toEqual(['ep_test_0002']);
  });

  it('names EPISODE_LOCKED as a lock, not as a playable descriptor', async () => {
    const api = stubPlaybackApi({
      create: () => err(lockedPlaybackFailure()),
    });

    expect(await gateAdvance(api, 'ep_test_0004')).toEqual({ kind: 'LOCKED' });
  });

  it('names EPISODE_VIP_REQUIRED as a lock too', async () => {
    const api = stubPlaybackApi({
      create: () => err(vipPlaybackFailure()),
    });

    expect(await gateAdvance(api, 'ep_test_0005')).toEqual({ kind: 'LOCKED' });
  });

  it('refuses a transport failure rather than treating it as a lock or a demo album', async () => {
    const failure = playbackHttpFailure(503, 'EPISODE_ASSET_UNAVAILABLE');
    const api = stubPlaybackApi({
      create: () => err(failure),
    });

    expect(await gateAdvance(api, 'ep_test_0002')).toEqual({ kind: 'REFUSED', failure });
  });

  it('refuses a malformed body the same way — a URL-shaped 201 is not entitlement', async () => {
    const failure = apiFailure({
      kind: 'MALFORMED',
      message: 'the response did not match the contract',
    });
    const api = stubPlaybackApi({
      create: () => err(failure),
    });

    expect(await gateAdvance(api, 'ep_test_0002')).toEqual({ kind: 'REFUSED', failure });
  });
});
