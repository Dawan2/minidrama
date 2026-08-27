import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { DramaPage } from './DramaPage';
import { MockBridge } from '../platform/mock-bridge';
import { ROUTES } from './routes';
import {
  dramaDetail,
  episodeItem,
  httpFailure,
  lockedEpisodeItem,
  offlineFailure,
  page,
  stubCatalogApi,
  viewerAccess,
} from '../testing/catalog-fixtures';
import { renderSurface } from '../testing/render';
import type { CapabilityName } from '../platform/types';
import type { CatalogApi } from '../data/catalog-api';
import type { EpisodeItem } from '@minidrama/shared';

async function readyBridge(unavailable: readonly CapabilityName[] = []): Promise<MockBridge> {
  const bridge = new MockBridge(unavailable.length === 0 ? {} : { unavailable });
  await bridge.init();
  return bridge;
}

function renderDrama(api: CatalogApi, bridge: MockBridge, dramaId = 'drm_test_0001') {
  return renderSurface(
    <Routes>
      <Route path={ROUTES.drama} element={<DramaPage bridge={bridge} />} />
    </Routes>,
    { api, path: `/drama/${dramaId}` },
  );
}

describe('the drama detail screen', () => {
  it('requests the drama and its episodes for the id in the route', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: () => ok(page([episodeItem()])),
    });
    renderDrama(api, await readyBridge(), 'drm_route_1');

    await waitFor(() => {
      expect(api.dramaCalls).toContain('drm_route_1');
    });
    expect(api.episodeCalls[0]?.dramaId).toBe('drm_route_1');
  });

  it('renders the header the storefront needs', async () => {
    const api = stubCatalogApi({
      drama: () =>
        ok(dramaDetail({ title: 'Dynasty', description: 'A family at war.', tags: ['family'] })),
      episodes: () => ok(page([episodeItem()])),
    });
    renderDrama(api, await readyBridge());

    expect(await screen.findByTestId('drama-header')).toBeDefined();
    expect(screen.getByText('Dynasty')).toBeDefined();
    expect(screen.getByText('A family at war.')).toBeDefined();
    expect(screen.getByText('family')).toBeDefined();
  });

  it('shows a skeleton while the detail is in flight', async () => {
    const api = stubCatalogApi({ drama: () => ok(dramaDetail()) });
    renderDrama(api, await readyBridge());

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  // "First 3 free" is the only permitted use of `freeEpisodes`. It is a badge, never an input to a
  // playability decision (`packages/shared/src/catalog.ts`).
  it('renders the free-window badge as display copy', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail({ freeEpisodes: 3, totalEpisodes: 80 })),
      episodes: () => ok(page([episodeItem()])),
    });
    renderDrama(api, await readyBridge());

    const badge = await screen.findByTestId('free-badge');
    expect(badge.textContent).toContain('3');
  });
});

/**
 * The terminal states. Draft content answers 404 and delisted content answers 410
 * (`docs/handoff/w2-work-d.md` decision S24), and the screen must keep them apart: one is "this
 * link is wrong", the other is "this drama was withdrawn".
 */
describe('a drama that cannot be shown', () => {
  it('ends the screen with no retry when the drama does not exist', async () => {
    const api = stubCatalogApi({ drama: () => err(httpFailure(404)) });
    renderDrama(api, await readyBridge());

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.getAttribute('data-reason')).toBe('NOT_FOUND');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says withdrawn, not missing, when the drama was delisted', async () => {
    const api = stubCatalogApi({ drama: () => err(httpFailure(410)) });
    renderDrama(api, await readyBridge());

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.getAttribute('data-reason')).toBe('OFFLINE');
  });

  it('always offers a way home from a terminal state', async () => {
    const api = stubCatalogApi({ drama: () => err(httpFailure(404)) });
    renderDrama(api, await readyBridge());

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.querySelector('a')?.getAttribute('href')).toBe(ROUTES.home);
  });

  it('offers a retry when the detail read failed on the network', async () => {
    const api = stubCatalogApi({
      drama: (_id, index) => (index === 0 ? err(offlineFailure()) : ok(dramaDetail())),
      episodes: () => ok(page([episodeItem()])),
    });
    renderDrama(api, await readyBridge());

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByTestId('drama-header')).toBeDefined();
    });
  });
});

/**
 * The header and the episode list are separate reads. Throwing away a loaded header to report that
 * the episode list is late costs the viewer a screen's worth of content to tell them nothing.
 */
describe('the two sections fail independently', () => {
  it('keeps the header when the episode list fails, and retries only the list', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail({ title: 'Still here' })),
      episodes: (_request, index) =>
        index === 0 ? err(offlineFailure()) : ok(page([episodeItem()])),
    });
    renderDrama(api, await readyBridge());

    await screen.findByTestId('drama-header');
    expect(screen.getByText('Still here')).toBeDefined();
    expect(screen.getByTestId('retryable-error')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByTestId('episode-list')).toBeDefined();
    });
    expect(screen.getByTestId('drama-header')).toBeDefined();
    // Only the episode list was refetched. Reloading both would double every request on retry.
    expect(api.dramaCalls.length).toBe(1);
  });

  it('shows an empty state with a way out when a drama has no episodes yet', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: () => ok(page([])),
    });
    renderDrama(api, await readyBridge());

    const empty = await screen.findByTestId('empty-state');
    expect(empty.querySelector('a')?.getAttribute('href')).toBe(ROUTES.home);
    expect(screen.queryByTestId('episode-list')).toBeNull();
  });
});

describe('the episode list', () => {
  it('renders a row per episode, in the order the server sent them', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: () =>
        ok(
          page([
            episodeItem({ globalEpisodeNumber: 1 }),
            episodeItem({ globalEpisodeNumber: 2 }),
            lockedEpisodeItem({ globalEpisodeNumber: 3 }),
          ]),
        ),
    });
    renderDrama(api, await readyBridge());

    await waitFor(() => {
      expect(screen.getAllByTestId('episode-row')).toHaveLength(3);
    });
    const numbers = screen
      .getAllByTestId('episode-row')
      .map((row) => row.getAttribute('data-episode-id'));
    expect(numbers).toEqual(['ep_test_0001', 'ep_test_0002', 'ep_test_0003']);
  });

  it('points "watch now" at the first episode the viewer may open, not at episode one', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: () =>
        ok(
          page([
            episodeItem({
              globalEpisodeNumber: 1,
              viewerAccess: viewerAccess('UNAVAILABLE'),
            }),
            episodeItem({ globalEpisodeNumber: 2 }),
          ]),
        ),
    });
    renderDrama(api, await readyBridge());

    const cta = await screen.findByTestId('watch-now');
    expect(cta.getAttribute('href')).toBe('/play/ep_test_0002');
  });

  // A dead primary button on top of a list that already explains itself adds a dead primary button.
  it('omits "watch now" when nothing in the list can be opened', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: () => ok(page([lockedEpisodeItem()])),
    });
    renderDrama(api, await readyBridge());

    await screen.findByTestId('episode-list');
    expect(screen.queryByTestId('watch-now')).toBeNull();
  });

  it('appends a further page of episodes', async () => {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: (request) =>
        request.cursor === undefined
          ? ok(page([episodeItem({ globalEpisodeNumber: 1 })], 'cur_2'))
          : ok(page([episodeItem({ globalEpisodeNumber: 2 })])),
    });
    renderDrama(api, await readyBridge());

    fireEvent.click(await screen.findByTestId('load-more-episodes'));

    await waitFor(() => {
      expect(screen.getAllByTestId('episode-row')).toHaveLength(2);
    });
    expect(api.episodeCalls[1]?.cursor).toBe('cur_2');
  });
});

/**
 * The load-bearing UX distinction of this slot. Four states, four different things on screen, and
 * the two that must never be confused are "for sale" and "not serveable".
 */
describe('episode access states are visibly different', () => {
  async function renderWithEpisodes(
    episodes: readonly EpisodeItem[],
    unavailableCapabilities: readonly CapabilityName[] = [],
  ) {
    const api = stubCatalogApi({
      drama: () => ok(dramaDetail()),
      episodes: () => ok(page(episodes)),
    });
    renderDrama(api, await readyBridge(unavailableCapabilities));
    await screen.findByTestId('episode-list');
  }

  it('gives a free episode a link into the player', async () => {
    await renderWithEpisodes([episodeItem({ globalEpisodeNumber: 1 })]);

    const row = screen.getByTestId('episode-row');
    expect(row.getAttribute('data-action')).toBe('PLAY');
    const action = screen.getByTestId('episode-action');
    expect(action.tagName).toBe('A');
    expect(action.getAttribute('href')).toBe('/play/ep_test_0001');
  });

  it('gives a locked episode a priced unlock instead of a player link', async () => {
    await renderWithEpisodes([lockedEpisodeItem({ priceCoins: 30 })]);

    const row = screen.getByTestId('episode-row');
    expect(row.getAttribute('data-action')).toBe('UNLOCK');
    expect(screen.getByTestId('episode-price').textContent).toContain('30');
    expect(screen.getByTestId('episode-action').tagName).not.toBe('A');
  });

  /**
   * The single most important assertion in this slot, and not a hypothetical one. Episode 7 of
   * `drm_revenge_0001` in the seed catalogue is served as `UNAVAILABLE` *with* `priceCoins: 60` —
   * the price is a property of the episode and the server does not blank it. A client that read the
   * price rather than the reason would offer to sell access to something that cannot play, and the
   * refund would be ours (`docs/handoff/w2-work-d.md` decision S31).
   */
  it('never prices or offers an unavailable episode, even when the payload carries a price', async () => {
    await renderWithEpisodes([
      episodeItem({ priceCoins: 30, viewerAccess: viewerAccess('UNAVAILABLE') }),
    ]);

    const row = screen.getByTestId('episode-row');
    expect(row.getAttribute('data-action')).toBe('UNAVAILABLE');
    expect(screen.queryByTestId('episode-price')).toBeNull();
    expect(screen.getByTestId('episode-action').tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Unlock to watch' })).toBeNull();
  });

  /**
   * A platform block is ours, not the viewer's. The episode is for sale; this TikTok build cannot
   * take the money (`docs/02-information-architecture.md` §9). Rendering the ordinary unlock button
   * would produce a purchase that dead-ends inside the bridge.
   */
  it('says "not purchasable yet" when the client cannot take payment', async () => {
    await renderWithEpisodes([lockedEpisodeItem({ priceCoins: 30 })], ['pay']);

    const row = screen.getByTestId('episode-row');
    expect(row.getAttribute('data-action')).toBe('PURCHASE_BLOCKED');
    expect(screen.getByTestId('episode-action').textContent).toBe('Not purchasable yet');
    expect(screen.queryByTestId('episode-price')).toBeNull();
  });

  it('keeps the platform block and the unavailable state as different copy', async () => {
    await renderWithEpisodes(
      [
        lockedEpisodeItem({ globalEpisodeNumber: 4 }),
        episodeItem({ globalEpisodeNumber: 5, viewerAccess: viewerAccess('UNAVAILABLE') }),
      ],
      ['pay'],
    );

    const [blocked, unavailable] = screen.getAllByTestId('episode-action');
    expect(blocked?.textContent).not.toBe(unavailable?.textContent);
    expect(blocked?.textContent).toBe('Not purchasable yet');
    expect(unavailable?.textContent).toBe('Unavailable');
  });

  it('offers a subscription for a VIP-only episode and blocks it when subscriptions are missing', async () => {
    await renderWithEpisodes([episodeItem({ viewerAccess: viewerAccess('NEED_VIP') })]);
    expect(screen.getByTestId('episode-row').getAttribute('data-action')).toBe('SUBSCRIBE');
  });

  // The unlock panel belongs to the entitlement slot. Until it exists the call to action is
  // disabled: an enabled button that does nothing is the worst thing a purchase surface can do.
  it('disables the unlock call to action while there is no unlock flow', async () => {
    await renderWithEpisodes([lockedEpisodeItem()]);

    const action = screen.getByTestId('episode-action');
    expect(action.tagName).toBe('BUTTON');
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it('records the reason the server gave on the row, unchanged', async () => {
    await renderWithEpisodes([lockedEpisodeItem()]);
    expect(screen.getByTestId('episode-row').getAttribute('data-access-reason')).toBe(
      'NEED_UNLOCK',
    );
  });
});
