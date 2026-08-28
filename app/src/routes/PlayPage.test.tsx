import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { MockBridge } from '../platform/mock-bridge';
import { MockVePlayer } from '../player/mock-veplayer';
import { PlayPage, nextCatalogEpisode, previousCatalogEpisode } from './PlayPage';
import type { StallPacing } from '../player/player-stall';
import { ROUTES } from './routes';
import { apiFailure } from '../data/failure';
import {
  episodeItem,
  httpFailure,
  lockedEpisodeItem,
  page,
  stubCatalogApi,
  viewerAccess,
} from '../testing/catalog-fixtures';
import {
  lockedPlaybackFailure,
  playbackDescriptor,
  playbackHttpFailure,
  stubPlaybackApi,
  vipPlaybackFailure,
} from '../testing/playback-fixtures';
import { stubProgressApi } from '../testing/progress-fixtures';
import { favoritesHttpFailure, stubFavoritesApi } from '../testing/favorites-fixtures';
import { renderSurface } from '../testing/render';
import type { EpisodeItem } from '@minidrama/shared';
import type { CatalogApi } from '../data/catalog-api';
import type { FavoritesApi } from '../data/favorites-api';
import type { PlaybackApi } from '../data/playback-api';
import type { ProgressApi } from '../data/progress-api';

beforeEach(() => {
  MockVePlayer.reset();
});

async function readyBridge(): Promise<MockBridge> {
  const bridge = new MockBridge();
  await bridge.init();
  return bridge;
}

function playCatalog(episodes: readonly EpisodeItem[]): CatalogApi {
  return stubCatalogApi({
    episode: (episodeId) => {
      const found = episodes.find((item) => item.id === episodeId);
      return found === undefined ? err(httpFailure(404)) : ok(found);
    },
    episodes: () => ok(page([...episodes])),
  });
}

function renderPlayer(options: {
  readonly bridge: MockBridge;
  readonly episodeId?: string;
  readonly api?: CatalogApi;
  readonly playbackApi?: PlaybackApi;
  readonly progressApi?: ProgressApi;
  readonly favoritesApi?: FavoritesApi;
  readonly stallPacing?: StallPacing;
}) {
  const episodeId = options.episodeId ?? 'ep_test_0001';
  return renderSurface(
    <Routes>
      <Route
        path={ROUTES.play}
        element={
          <PlayPage
            bridge={options.bridge}
            {...(options.stallPacing === undefined ? {} : { stallPacing: options.stallPacing })}
          />
        }
      />
    </Routes>,
    {
      api: options.api ?? playCatalog([episodeItem()]),
      playbackApi: options.playbackApi ?? stubPlaybackApi(),
      ...(options.progressApi === undefined ? {} : { progressApi: options.progressApi }),
      ...(options.favoritesApi === undefined ? {} : { favoritesApi: options.favoritesApi }),
      path: `/play/${episodeId}`,
    },
  );
}

async function player(): Promise<MockVePlayer> {
  await waitFor(() => {
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
  });
  return MockVePlayer.instances.find((instance) => !instance.destroyed)!;
}

describe('the player screen', () => {
  it('asks the server for a session of the route episode, not a demo album', async () => {
    const playbackApi = stubPlaybackApi();
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: 'ep_test_0003',
      api: playCatalog([episodeItem({ globalEpisodeNumber: 3 })]),
      playbackApi,
    });

    expect((await player()).config.episodeId).toBe('ep_test_0003');
    expect((await player()).config.vid).toBe('vid_ep_test_0003');
    expect(playbackApi.createCalls).toEqual(['ep_test_0003']);
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe('ep_test_0003');
    expect(screen.getByTestId('player-episode-label').textContent).toBe('Episode 3');
  });

  it('plays the session descriptor with VePlayer, never a client-invented vid', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId) =>
        ok(playbackDescriptor({ episodeId, vid: 'v02realasset', albumId: 'drm_real' })),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });

    const instance = await player();
    expect(instance.config.vid).toBe('v02realasset');
    expect(instance.config.albumId).toBe('drm_real');
    expect(instance.config.vid).not.toMatch(/vid_demo_/);
    expect(instance.config.episodeId).not.toMatch(/ep_demo_/);
  });

  it('starts VePlayer at the session resume, not at catalog duration', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId) => ok(playbackDescriptor({ episodeId, resumePositionSec: 45 })),
    });
    renderPlayer({
      bridge: await readyBridge(),
      api: playCatalog([episodeItem({ durationSec: 90 })]),
      playbackApi,
    });

    expect((await player()).config.startTime).toBe(45);
    expect((await player()).config.startTime).not.toBe(90);
  });

  it('starts at 0 when the session sent 0, rather than inventing a midpoint', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId) => ok(playbackDescriptor({ episodeId, resumePositionSec: 0 })),
    });
    renderPlayer({
      bridge: await readyBridge(),
      api: playCatalog([episodeItem({ durationSec: 90 })]),
      playbackApi,
    });

    expect((await player()).config.startTime).toBe(0);
  });

  it('carries no native media element, on a screen whose whole job is media', async () => {
    renderPlayer({ bridge: await readyBridge() });
    await player();

    expect(screen.getByTestId('play-page').querySelectorAll('video, audio, iframe')).toHaveLength(
      0,
    );
    expect(screen.getByTestId('player-container').querySelector('[data-mock-veplayer]')).not.toBe(
      null,
    );
  });

  it('destroys the player on the way out of the screen', async () => {
    const { unmount } = renderPlayer({ bridge: await readyBridge() });
    const first = await player();

    unmount();
    await waitFor(() => {
      expect(first.destroyed).toBe(true);
    });
  });
});

describe('locked episodes are intercepted at every entry', () => {
  it('opens the unlock overlay on a locked deep link and does not start the player', async () => {
    const playbackApi = stubPlaybackApi({
      create: () => err(lockedPlaybackFailure()),
    });
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: 'ep_test_0004',
      api: playCatalog([lockedEpisodeItem()]),
      playbackApi,
    });

    expect(await screen.findByTestId('unlock-panel')).toBeDefined();
    expect(screen.getByTestId('play-page').dataset['state']).toBe('locked');
    expect(screen.queryByTestId('player-container')).toBeNull();
    expect(MockVePlayer.instances).toHaveLength(0);
    expect(MockVePlayer.instances.map((instance) => instance.config.startTime)).toEqual([]);
    expect(playbackApi.createCalls).toEqual(['ep_test_0004']);
  });

  it('opens the VIP overlay, not the coin one, when the session answers EPISODE_VIP_REQUIRED', async () => {
    const playbackApi = stubPlaybackApi({
      create: () => err(vipPlaybackFailure()),
    });
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: 'ep_test_0005',
      api: playCatalog([
        episodeItem({
          globalEpisodeNumber: 5,
          viewerAccess: viewerAccess('NEED_VIP'),
          unlockPolicy: 'VIP_ONLY',
        }),
      ]),
      playbackApi,
    });

    expect((await screen.findByRole('dialog')).getAttribute('data-offer')).toBe('VIP');
    expect(screen.queryByTestId('unlock-confirm')).toBeNull();
    expect(MockVePlayer.instances).toHaveLength(0);
  });

  it('sessions the next catalogue episode on 连播, and a lock there does not play demo content', async () => {
    const free = episodeItem({ globalEpisodeNumber: 1 });
    const locked = lockedEpisodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi({
      create: (episodeId) =>
        episodeId === locked.id
          ? err(lockedPlaybackFailure())
          : ok(playbackDescriptor({ episodeId })),
    });

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: free.id,
      api: playCatalog([free, locked]),
      playbackApi,
    });
    const current = await player();

    fireEvent.click(await screen.findByTestId('player-next'));

    expect(await screen.findByTestId('unlock-panel')).toBeDefined();
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(free.id);
    expect(screen.getByTestId('play-page').dataset['state']).toBe('playing');
    expect(playbackApi.createCalls).toEqual([free.id, locked.id]);
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
    expect(current.destroyed).toBe(false);
    expect(current.config.episodeId).toBe(free.id);
    expect(current.config.vid).not.toMatch(/vid_demo_/);
    expect(current.config.episodeId).not.toMatch(/ep_demo_/);
  });

  it('advances an entitled 连播 onto the next session, not a demo album', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi();

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, second]),
      playbackApi,
    });
    await player();

    const current = await player();
    fireEvent.click(await screen.findByTestId('player-next'));

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(second.id);
    });
    expect(current.destroyed).toBe(false);
    expect(current.playNextCount).toBe(1);
    expect(current.currentEpisodeId).toBe(second.id);
    expect(current.config.vid).not.toMatch(/vid_demo_/);
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
    expect(playbackApi.createCalls[0]).toBe(first.id);
    expect(playbackApi.createCalls).toContain(second.id);
    expect(playbackApi.createCalls.join(',')).not.toMatch(/ep_demo_|vid_demo_/);
  });

  it('sessions a picker destination rather than playing the previous episode', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2 });
    const playbackApi = stubPlaybackApi();

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, second]),
      playbackApi,
    });
    await player();

    fireEvent.click(screen.getByTestId('episode-picker-open'));
    await screen.findByTestId('episode-picker-grid');
    const destination = screen
      .getAllByTestId('episode-picker-cell')
      .find((cell) => cell.getAttribute('data-episode-id') === second.id);
    expect(destination).toBeDefined();
    fireEvent.click(destination!);

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(second.id);
    });
    await waitFor(() => {
      expect(playbackApi.createCalls).toEqual([first.id, second.id]);
    });
    expect((await player()).config.episodeId).toBe(second.id);
    expect((await player()).config.vid).toBe(`vid_${second.id}`);
  });

  it('sessions a locked 切集 target without advancing VePlayer onto a demo album', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const locked = lockedEpisodeItem({ globalEpisodeNumber: 4, id: 'ep_test_0004' });
    const playbackApi = stubPlaybackApi({
      create: (episodeId) =>
        episodeId === locked.id
          ? err(lockedPlaybackFailure())
          : ok(playbackDescriptor({ episodeId })),
    });

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, locked]),
      playbackApi,
    });
    const current = await player();

    fireEvent.click(screen.getByTestId('episode-picker-open'));
    await screen.findByTestId('episode-picker-grid');
    const destination = screen
      .getAllByTestId('episode-picker-cell')
      .find((cell) => cell.getAttribute('data-episode-id') === locked.id);
    expect(destination).toBeDefined();
    expect(destination!.tagName).not.toBe('A');
    fireEvent.click(destination!);

    expect(await screen.findByTestId('unlock-panel')).toBeDefined();
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(first.id);
    expect(screen.getByTestId('play-page').dataset['state']).toBe('playing');
    expect(playbackApi.createCalls).toEqual([first.id, locked.id]);
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
    expect(current.destroyed).toBe(false);
    expect(current.config.episodeId).toBe(first.id);
    expect(current.config.vid).not.toMatch(/vid_demo_/);
    expect(screen.queryByTestId('episode-picker')).toBeNull();
  });

  it('still intercepts a stale playable picker cell at the session, not with a demo album', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const stale = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi({
      create: (episodeId) =>
        episodeId === stale.id
          ? err(lockedPlaybackFailure())
          : ok(playbackDescriptor({ episodeId })),
    });

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, stale]),
      playbackApi,
    });
    await player();

    fireEvent.click(screen.getByTestId('episode-picker-open'));
    await screen.findByTestId('episode-picker-grid');
    const destination = screen
      .getAllByTestId('episode-picker-cell')
      .find((cell) => cell.getAttribute('data-episode-id') === stale.id);
    expect(destination).toBeDefined();
    fireEvent.click(destination!);

    expect(await screen.findByTestId('unlock-panel')).toBeDefined();
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(stale.id);
    expect(screen.getByTestId('play-page').dataset['state']).toBe('locked');
    expect(playbackApi.createCalls).toEqual([first.id, stale.id]);
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(0);
    expect(screen.queryByTestId('player-container')).toBeNull();
  });
});

describe('fail-closed session refusals', () => {
  it('does not start the player when the session call fails', async () => {
    const playbackApi = stubPlaybackApi({
      create: () => err(playbackHttpFailure(503, 'EPISODE_ASSET_UNAVAILABLE')),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });

    expect(await screen.findByTestId('retryable-error')).toBeDefined();
    expect(screen.queryByTestId('player-container')).toBeNull();
    expect(screen.queryByTestId('unlock-panel')).toBeNull();
    expect(MockVePlayer.instances).toHaveLength(0);
  });

  it('does not start the player on a missing episode', async () => {
    const playbackApi = stubPlaybackApi({
      create: () => err(playbackHttpFailure(404, 'CONTENT_NOT_FOUND')),
    });
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: 'ep_not_in_catalogue',
      api: stubCatalogApi({ episode: () => err(httpFailure(404)) }),
      playbackApi,
    });

    expect(await screen.findByTestId('terminal-error')).toBeDefined();
    expect(screen.getByTestId('terminal-error').getAttribute('data-reason')).toBe('NOT_FOUND');
    expect(screen.queryByTestId('player-container')).toBeNull();
    expect(MockVePlayer.instances).toHaveLength(0);
  });

  it('refuses a 201 whose body is a media URL rather than handing it to VePlayer', async () => {
    const playbackApi = stubPlaybackApi({
      create: () =>
        err(
          apiFailure({
            kind: 'MALFORMED',
            message: 'the response did not match the contract',
          }),
        ),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });

    expect(await screen.findByTestId('retryable-error')).toBeDefined();
    expect(MockVePlayer.instances).toHaveLength(0);
  });
});

describe('the catalogue queue', () => {
  it('offers no next episode at the end of the catalogue, not at the end of a demo album', async () => {
    const last = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: last.id,
      api: playCatalog([episodeItem({ globalEpisodeNumber: 1 }), last]),
    });
    await player();

    expect(screen.queryByTestId('player-next')).toBeNull();
    expect(screen.getByTestId('player-queue-end')).toBeDefined();
  });

  it('names the next catalogue episode, including a locked one', () => {
    const current = episodeItem({ globalEpisodeNumber: 1 });
    const locked = lockedEpisodeItem({ globalEpisodeNumber: 4 });
    expect(nextCatalogEpisode(current, [current, locked])?.id).toBe(locked.id);
    expect(nextCatalogEpisode(locked, [current, locked])).toBeUndefined();
  });

  it('names the previous catalogue episode for swipe-down 切集', () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2 });
    expect(previousCatalogEpisode(second, [first, second])?.id).toBe(first.id);
    expect(previousCatalogEpisode(first, [first, second])).toBeUndefined();
  });
});

describe('autoplay on ended and swipe 切集', () => {
  it('advances an entitled next on ended via playNext, not a second instance or a demo album', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi();

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, second]),
      playbackApi,
    });
    const current = await player();

    current.emitForTest('ended');

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(second.id);
    });
    expect(current.destroyed).toBe(false);
    expect(current.playNextCount).toBe(1);
    expect(current.currentEpisodeId).toBe(second.id);
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
    expect(current.config.vid).not.toMatch(/vid_demo_/);
    expect(current.config.episodeId).not.toMatch(/ep_demo_/);
  });

  it('holds the final frame and opens the unlock overlay when ended hits a locked next', async () => {
    const free = episodeItem({ globalEpisodeNumber: 1 });
    const locked = lockedEpisodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi({
      create: (episodeId) =>
        episodeId === locked.id
          ? err(lockedPlaybackFailure())
          : ok(playbackDescriptor({ episodeId })),
    });

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: free.id,
      api: playCatalog([free, locked]),
      playbackApi,
    });
    const current = await player();

    current.emitForTest('ended');

    expect(await screen.findByTestId('unlock-panel')).toBeDefined();
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(free.id);
    expect(screen.getByTestId('play-page').dataset['state']).toBe('playing');
    expect(current.destroyed).toBe(false);
    expect(current.playNextCount).toBe(0);
    expect(current.currentEpisodeId).toBe(free.id);
    expect(MockVePlayer.instances.filter((instance) => !instance.destroyed)).toHaveLength(1);
    expect(current.config.vid).not.toMatch(/vid_demo_/);
  });

  it('does not invent a next session when the last episode ends', async () => {
    const last = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi();
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: last.id,
      api: playCatalog([episodeItem({ globalEpisodeNumber: 1 }), last]),
      playbackApi,
    });
    const current = await player();
    const callsBefore = [...playbackApi.createCalls];

    current.emitForTest('ended');

    await waitFor(() => {
      expect(current.playNextCount).toBe(0);
    });
    expect(playbackApi.createCalls).toEqual(callsBefore);
    expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(last.id);
    expect(current.destroyed).toBe(false);
  });

  it('treats swipe-up as 连播 through the same gate', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi();

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, second]),
      playbackApi,
    });
    const current = await player();
    const surface = screen.getByTestId('player-surface');

    fireEvent.touchStart(surface, {
      changedTouches: [{ clientY: 280 }],
      touches: [{ clientY: 280 }],
    });
    fireEvent.touchEnd(surface, {
      changedTouches: [{ clientY: 200 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(second.id);
    });
    expect(current.destroyed).toBe(false);
    expect(current.playNextCount).toBe(1);
    expect(current.currentEpisodeId).toBe(second.id);
  });

  it('rebuilds on swipe-down because playNext cannot go backwards', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const playbackApi = stubPlaybackApi();

    renderPlayer({
      bridge: await readyBridge(),
      episodeId: second.id,
      api: playCatalog([first, second]),
      playbackApi,
    });
    const current = await player();
    const surface = screen.getByTestId('player-surface');

    fireEvent.touchStart(surface, {
      changedTouches: [{ clientY: 200 }],
      touches: [{ clientY: 200 }],
    });
    fireEvent.touchEnd(surface, {
      changedTouches: [{ clientY: 280 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(first.id);
      expect(current.destroyed).toBe(true);
    });
    expect((await player()).config.episodeId).toBe(first.id);
    expect((await player()).playNextCount).toBe(0);
    expect((await player()).config.vid).not.toMatch(/vid_demo_/);
  });
});

describe('double-tap 点赞 follows the current drama', () => {
  it('PUTs the catalogue drama and does not invent a like API', async () => {
    const favoritesApi = stubFavoritesApi();
    renderPlayer({
      bridge: await readyBridge(),
      favoritesApi,
    });
    await player();
    const surface = screen.getByTestId('player-surface');

    fireEvent.doubleClick(surface);

    await waitFor(() => {
      expect(favoritesApi.addCalls).toEqual(['drm_test_0001']);
    });
    expect(screen.getByTestId('player-liked').textContent).toBe('Added to favourites');
    expect(favoritesApi.removeCalls).toEqual([]);
  });

  it('does not flash liked when the session is missing', async () => {
    const favoritesApi = stubFavoritesApi({
      add: () => err(favoritesHttpFailure(401)),
    });
    renderPlayer({
      bridge: await readyBridge(),
      favoritesApi,
    });
    await player();

    fireEvent.doubleClick(screen.getByTestId('player-surface'));

    await waitFor(() => {
      expect(favoritesApi.addCalls).toEqual(['drm_test_0001']);
    });
    expect(screen.queryByTestId('player-liked')).toBeNull();
  });

  it('does not follow on a 切集 swipe', async () => {
    const first = episodeItem({ globalEpisodeNumber: 1 });
    const second = episodeItem({ globalEpisodeNumber: 2, id: 'ep_test_0002' });
    const favoritesApi = stubFavoritesApi();
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: first.id,
      api: playCatalog([first, second]),
      favoritesApi,
    });
    await player();
    const surface = screen.getByTestId('player-surface');

    fireEvent.touchStart(surface, {
      changedTouches: [{ clientX: 40, clientY: 280 }],
      touches: [{ clientX: 40, clientY: 280 }],
    });
    fireEvent.touchEnd(surface, {
      changedTouches: [{ clientX: 40, clientY: 200 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('play-page').dataset['episodeId']).toBe(second.id);
    });
    expect(favoritesApi.addCalls).toEqual([]);
  });
});

describe('PLAYER_FATAL silent re-issue (PLY-012)', () => {
  it('re-mints the route episode and keeps the instance, without a like API or a demo album', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId, callIndex) =>
        ok(
          playbackDescriptor({
            episodeId,
            playAuthToken: callIndex === 0 ? 'token-old' : 'token-new',
            resumePositionSec: callIndex === 0 ? 40 : 8,
          }),
        ),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });
    const instance = await player();
    expect(instance.currentPlayAuthToken).toBe('token-old');
    expect(playbackApi.createCalls).toEqual(['ep_test_0001']);

    instance.emitForTest('error', { playAuthToken: 'token-must-not-leak' });

    await waitFor(() => {
      expect(playbackApi.createCalls).toEqual(['ep_test_0001', 'ep_test_0001']);
    });
    expect(MockVePlayer.instances.filter((item) => !item.destroyed)).toHaveLength(1);
    expect(instance.destroyed).toBe(false);
    expect(instance.playNextCount).toBe(0);
    expect(instance.currentPlayAuthToken).toBe('token-new');
    expect(instance.config.startTime).toBe(40);
    expect(screen.queryByTestId('player-fatal')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(document.body.textContent ?? '').not.toMatch(/token-must-not-leak|token-old|token-new/);
  });

  it('keeps the last frame and shows retry when the silent mint fails', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId, callIndex) =>
        callIndex === 0
          ? ok(playbackDescriptor({ episodeId, playAuthToken: 'token-old' }))
          : err(playbackHttpFailure(503, 'EPISODE_ASSET_UNAVAILABLE')),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });
    const instance = await player();
    instance.emitForTest('error');

    expect(await screen.findByTestId('player-fatal')).toBeDefined();
    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(instance.destroyed).toBe(false);
    expect(screen.queryByTestId('unlock-panel')).toBeNull();
  });

  it('does not mint a third session after the silent attempt was already used', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId) => ok(playbackDescriptor({ episodeId, playAuthToken: 'token-new' })),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });
    const instance = await player();
    instance.emitForTest('error');
    await waitFor(() => {
      expect(playbackApi.createCalls).toHaveLength(2);
    });
    instance.emitForTest('error');
    await waitFor(() => {
      expect(screen.getByTestId('player-fatal')).toBeDefined();
    });
    expect(playbackApi.createCalls).toHaveLength(2);
    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(instance.destroyed).toBe(false);
  });

  it('opens the unlock overlay on a commercial lock without tearing the frame down', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId, callIndex) =>
        callIndex === 0 ? ok(playbackDescriptor({ episodeId })) : err(lockedPlaybackFailure()),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });
    const instance = await player();
    instance.emitForTest('error');

    expect(await screen.findByTestId('unlock-panel')).toBeDefined();
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(instance.destroyed).toBe(false);
    expect(screen.queryByTestId('player-fatal')).toBeNull();
  });

  it('treats a 409 as blocked: last frame, no retry, no price', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId, callIndex) =>
        callIndex === 0 ? ok(playbackDescriptor({ episodeId })) : err(playbackHttpFailure(409)),
    });
    renderPlayer({ bridge: await readyBridge(), playbackApi });
    const instance = await player();
    instance.emitForTest('error');

    expect(await screen.findByTestId('player-fatal')).toBeDefined();
    expect(screen.getByTestId('terminal-error').getAttribute('data-reason')).toBe('OFFLINE');
    expect(screen.getByTestId('terminal-error').textContent).toMatch(/unavailable right now/i);
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(instance.destroyed).toBe(false);
    expect(screen.queryByTestId('unlock-panel')).toBeNull();
  });
});

describe('S7 stall retry remints the route episode (AC-PL-7)', () => {
  function stallClock() {
    let nowMs = 0;
    let tick: () => void = () => {};
    return {
      pacing: {
        now: () => nowMs,
        schedule: (fn: () => void) => {
          tick = fn;
          return () => {
            tick = () => {};
          };
        },
      },
      advance(ms: number) {
        nowMs += ms;
        act(() => {
          tick();
        });
      },
    };
  }

  it('keeps the last frame, remints once the user retries, and does not change definition', async () => {
    const playbackApi = stubPlaybackApi({
      create: (episodeId, callIndex) =>
        ok(
          playbackDescriptor({
            episodeId,
            playAuthToken: callIndex === 0 ? 'token-old' : 'token-new',
          }),
        ),
    });
    const pacing = stallClock();
    renderPlayer({
      bridge: await readyBridge(),
      playbackApi,
      stallPacing: pacing.pacing,
    });
    const instance = await player();
    act(() => {
      instance.emitForTest('play');
    });
    pacing.advance(2_000 + 8_000);

    expect(screen.getByTestId('player-stall-retry')).toBeDefined();
    expect(playbackApi.createCalls).toEqual(['ep_test_0001']);
    fireEvent.click(screen.getByTestId('player-stall-retry'));

    await waitFor(() => {
      expect(playbackApi.createCalls).toEqual(['ep_test_0001', 'ep_test_0001']);
    });
    expect(instance.destroyed).toBe(false);
    expect(instance.playNextCount).toBe(0);
    expect(instance.currentPlayAuthToken).toBe('token-new');
    expect(screen.getByTestId('player-container')).toBeDefined();
    expect(instance.config.startTime).toBe(0);
    expect('playbackRate' in instance.config).toBe(false);
  });

  it('does not invent 倍速, axe-core, a subscription path, or postgres', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/PlayPage.tsx'), 'utf8');
    expect(source).not.toMatch(/playbackRate|axe-core|#\/vip|postgres:/);
  });
});

describe('PNL-01 on the player', () => {
  it('looks the route episode up for the queue, and does not open the picker by itself', async () => {
    const api = stubCatalogApi({
      episode: () => ok(episodeItem()),
      episodes: () => ok(page([episodeItem()])),
    });
    renderPlayer({
      bridge: await readyBridge(),
      api,
      playbackApi: stubPlaybackApi(),
    });
    await player();

    expect(api.episodeByIdCalls).toEqual(['ep_test_0001']);
    expect(screen.queryByTestId('episode-picker')).toBeNull();
  });

  it('opens the picker from the player and dismisses it', async () => {
    const api = playCatalog([episodeItem(), episodeItem({ globalEpisodeNumber: 2 })]);
    renderPlayer({
      bridge: await readyBridge(),
      episodeId: 'ep_test_0001',
      api,
    });
    await player();

    fireEvent.click(screen.getByTestId('episode-picker-open'));
    expect(await screen.findByTestId('episode-picker')).toBeDefined();
    await screen.findByTestId('episode-picker-grid');

    fireEvent.click(screen.getByTestId('episode-picker-close'));
    expect(screen.queryByTestId('episode-picker')).toBeNull();
  });
});

/**
 * The mutation D-16 exists to catch. Restoring `demoPlaylist()` in PlayPage.tsx — even as a
 * fallback when the session call fails — must fail this scan. Behavioural tests above already
 * fail if the player starts without a session; this one fails if the fixture is merely present.
 */
describe('the demo album does not ship', () => {
  it('is absent from PlayPage production source', () => {
    const source = readFileSync(join(process.cwd(), 'src/routes/PlayPage.tsx'), 'utf8');
    expect(source).not.toMatch(/demoPlaylist/);
    expect(source).not.toMatch(/ep_demo_/);
    expect(source).not.toMatch(/vid_demo_/);
    expect(source).not.toMatch(/album_demo_/);
    expect(source).not.toMatch(/DEMO_ALBUM_ID|DEMO_EPISODE_COUNT|demoEpisodeId/);
  });
});

describe('watch progress heartbeats', () => {
  it('reports the route episode on pause, never a demo id or a completed flag', async () => {
    const progressApi = stubProgressApi();
    renderPlayer({
      bridge: await readyBridge(),
      progressApi,
    });
    const instance = await player();
    instance.tick(11, 90);
    instance.pause();

    await waitFor(() => {
      expect(progressApi.progressReports).toHaveLength(1);
    });
    expect(progressApi.progressReports[0]?.episodeId).toBe('ep_test_0001');
    expect(progressApi.progressReports[0]?.report.positionSec).toBe(11);
    expect(progressApi.progressReports[0]?.report.durationSec).toBe(90);
    expect(JSON.stringify(progressApi.progressReports)).not.toMatch(
      /completed|ep_demo_|vid_demo_|beans/i,
    );
  });

  it('does not report a pre-seek 0 after a session resume, which would LWW-wipe the other device', async () => {
    const progressApi = stubProgressApi();
    const playbackApi = stubPlaybackApi({
      create: (episodeId) => ok(playbackDescriptor({ episodeId, resumePositionSec: 45 })),
    });
    renderPlayer({
      bridge: await readyBridge(),
      api: playCatalog([episodeItem({ durationSec: 90 })]),
      playbackApi,
      progressApi,
    });
    const instance = await player();
    expect(instance.config.startTime).toBe(45);
    instance.tick(0, 90);
    instance.pause();
    await waitFor(() => {
      expect(instance.playing).toBe(false);
    });
    expect(progressApi.progressReports).toEqual([]);
  });
});
