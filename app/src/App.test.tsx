import { err, ok } from '@minidrama/shared';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { MockBridge } from './platform/mock-bridge';
import { MockVePlayer } from './player/mock-veplayer';
import {
  dramaDetail,
  episodeItem,
  feedCard,
  page,
  stubCatalogApi,
} from './testing/catalog-fixtures';
import { favoritesHttpFailure, stubFavoritesApi } from './testing/favorites-fixtures';
import { historyHttpFailure, stubHistoryApi, watchHistoryEntry } from './testing/history-fixtures';
import { renderSurface } from './testing/render';
import type { StubHistoryApi } from './testing/history-fixtures';

beforeEach(() => {
  MockVePlayer.reset();
});

function renderAt(path: string, historyApi: StubHistoryApi = stubHistoryApi()) {
  const bridge = new MockBridge();
  const api = stubCatalogApi({
    drama: () => ok(dramaDetail()),
    episodes: () => ok(page([episodeItem()])),
  });

  return renderSurface(<App bridge={bridge} />, { api, historyApi, path });
}

describe('App routing', () => {
  it('redirects the root to home', async () => {
    renderAt('/');
    expect(await screen.findByTestId('home-page')).toBeDefined();
  });

  it('renders the drama detail route', async () => {
    renderAt('/drama/drm_test_0001');
    expect(await screen.findByTestId('drama-page')).toBeDefined();
    expect(await screen.findByTestId('drama-header')).toBeDefined();
  });

  it('renders the player route', async () => {
    renderAt('/play/ep_demo_0001');
    expect(await screen.findByTestId('play-page')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId('player-surface')).toBeDefined();
    });
  });

  it('renders the profile route', async () => {
    renderAt('/me');
    expect(await screen.findByTestId('profile-page')).toBeDefined();
  });

  it('renders the history route', async () => {
    renderAt('/history', stubHistoryApi({ history: () => ok(page([watchHistoryEntry()])) }));
    expect(await screen.findByTestId('history-page')).toBeDefined();
    expect(await screen.findByTestId('history-list')).toBeDefined();
  });

  // The personal screens are reachable from the feed, because a screen nobody can navigate to is
  // not a delivered screen. There is no tab bar yet (IA §2).
  it('offers a way from the feed to the profile', async () => {
    renderAt('/home');
    expect((await screen.findByTestId('profile-link')).getAttribute('href')).toBe('/me');
  });

  // A 401 must never be resolved by leaving the screen: there is no login screen to leave to, and
  // the fallback page would lose the read the viewer asked for (IA §9).
  it('keeps an unauthorised history on its own screen instead of sending it to the fallback', async () => {
    renderAt('/history', stubHistoryApi({ history: () => err(historyHttpFailure(401)) }));

    expect(await screen.findByTestId('history-sign-in')).toBeDefined();
    expect(screen.queryByTestId('fallback-page')).toBeNull();
  });

  // A static ZIP cannot 404 gracefully, so an unknown path must land somewhere with a way out —
  // and with the reason the fallback screen needs to explain itself (IA §5).
  it('sends an unknown route to the fallback screen as a missing page', async () => {
    renderAt('/not-a-real-route');
    const fallback = await screen.findByTestId('fallback-page');
    expect(fallback.getAttribute('data-reason')).toBe('NOT_FOUND');
  });

  it('renders the favourites route', async () => {
    renderAt('/favorites');
    expect(await screen.findByTestId('favorites-page')).toBeDefined();
    expect(screen.queryByTestId('fallback-page')).toBeNull();
  });

  // The same rule as the history screen: there is no login screen to leave to, so a 401 is resolved
  // where the viewer already is.
  it('keeps an unauthorised favourites read on its own screen', async () => {
    const favoritesApi = stubFavoritesApi({ read: () => err(favoritesHttpFailure(401)) });
    const bridge = new MockBridge();
    renderSurface(<App bridge={bridge} />, {
      api: stubCatalogApi({ feed: () => ok(page([feedCard()])) }),
      favoritesApi,
      path: '/favorites',
    });

    expect(await screen.findByTestId('favorites-sign-in')).toBeDefined();
    expect(screen.queryByTestId('fallback-page')).toBeNull();
  });
});
