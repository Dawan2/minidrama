import { ok } from '@minidrama/shared';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { MockBridge } from './platform/mock-bridge';
import { MockVePlayer } from './player/mock-veplayer';
import { dramaDetail, episodeItem, page, stubCatalogApi } from './testing/catalog-fixtures';
import { renderSurface } from './testing/render';

beforeEach(() => {
  MockVePlayer.reset();
});

function renderAt(path: string) {
  const bridge = new MockBridge();
  const api = stubCatalogApi({
    drama: () => ok(dramaDetail()),
    episodes: () => ok(page([episodeItem()])),
  });

  return renderSurface(<App bridge={bridge} />, { api, path });
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

  it('renders the search route, and its term is a route parameter', async () => {
    renderAt('/search?q=heiress');
    expect(await screen.findByTestId('search-page')).toBeDefined();
    expect(screen.getByTestId('search-input').getAttribute('value')).toBe('heiress');
  });

  // A static ZIP cannot 404 gracefully, so an unknown path must land somewhere with a way out —
  // and with the reason the fallback screen needs to explain itself (IA §5).
  it('sends an unknown route to the fallback screen as a missing page', async () => {
    renderAt('/not-a-real-route');
    const fallback = await screen.findByTestId('fallback-page');
    expect(fallback.getAttribute('data-reason')).toBe('NOT_FOUND');
  });
});
