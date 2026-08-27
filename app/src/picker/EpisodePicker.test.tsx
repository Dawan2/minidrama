import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import {
  episodeItem,
  httpFailure,
  lockedEpisodeItem,
  offlineFailure,
  page,
  stubCatalogApi,
  viewerAccess,
} from '../testing/catalog-fixtures';
import { dramaProgressItem, dramaProgressView, stubProgressApi } from '../testing/progress-fixtures';
import { EpisodePicker } from './EpisodePicker';
import { ROUTES } from '../routes/routes';
import { renderSurface } from '../testing/render';
import type { CatalogApi } from '../data/catalog-api';
import type { EpisodeItem } from '@minidrama/shared';
import type { ProgressApi } from '../data/progress-api';
import type { PurchaseCapabilities } from '../catalog/access-presentation';
import type { StubCatalogApi } from '../testing/catalog-fixtures';

const BOTH: PurchaseCapabilities = { coin: true, vip: true };

function catalogEpisodes(count: number): readonly EpisodeItem[] {
  return Array.from({ length: count }, (_unused, index) => {
    const n = index + 1;
    if (n <= 3) {
      return episodeItem({ globalEpisodeNumber: n });
    }
    return lockedEpisodeItem({
      globalEpisodeNumber: n,
      id: `ep_test_${String(n).padStart(4, '0')}`,
    });
  });
}

function scriptedApi(
  items: readonly EpisodeItem[],
  current: EpisodeItem = items[0] ?? episodeItem(),
): StubCatalogApi {
  return stubCatalogApi({
    episode: () => ok(current),
    episodes: () => ok(page(items)),
  });
}

function renderPicker(
  api: CatalogApi,
  options: {
    readonly episodeId?: string;
    readonly capabilities?: PurchaseCapabilities;
    readonly onClose?: () => void;
    readonly progressApi?: ProgressApi;
  } = {},
) {
  const onClose = options.onClose ?? vi.fn();
  const episodeId = options.episodeId ?? 'ep_test_0001';

  renderSurface(
    <Routes>
      <Route
        path={ROUTES.play}
        element={
          <EpisodePicker
            capabilities={options.capabilities ?? BOTH}
            episodeId={episodeId}
            onClose={onClose}
          />
        }
      />
    </Routes>,
    { api, path: `/play/${episodeId}`, progressApi: options.progressApi },
  );

  return { onClose };
}

function cellById(episodeId: string): HTMLElement | undefined {
  return screen
    .getAllByTestId('episode-picker-cell')
    .find((cell) => cell.getAttribute('data-episode-id') === episodeId);
}

function cellWatched(episodeId: string): string | null {
  return cellById(episodeId)?.getAttribute('data-watched') ?? null;
}

describe('PNL-01 loads the real episode list', () => {
  it('looks the route episode up, then asks for that drama’s episodes', async () => {
    const current = episodeItem({
      id: 'ep_route_0007',
      dramaId: 'drm_route_9',
      globalEpisodeNumber: 7,
    });
    const api = stubCatalogApi({
      episode: () => ok(current),
      episodes: () => ok(page(catalogEpisodes(8))),
    });
    renderPicker(api, { episodeId: 'ep_route_0007' });

    await waitFor(() => {
      expect(api.episodeByIdCalls).toEqual(['ep_route_0007']);
    });
    await waitFor(() => {
      expect(api.episodeCalls[0]?.dramaId).toBe('drm_route_9');
    });
    expect(api.episodeCalls[0]?.limit).toBe(100);
    expect(screen.queryByText(/ep_demo_/)).toBeNull();
  });

  it('renders a numbered cell for each episode the server sent, not a fixture album', async () => {
    renderPicker(scriptedApi(catalogEpisodes(8)));

    const cells = await screen.findAllByTestId('episode-picker-cell');
    expect(cells).toHaveLength(8);
    expect(cells[0]?.textContent).toContain('1');
    expect(cells[7]?.textContent).toContain('8');
  });
});

describe('the panel’s states', () => {
  it('shows a skeleton while the episode lookup is in flight', () => {
    const api = stubCatalogApi({
      episode: () => ok(episodeItem()),
    });
    renderPicker(api);

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('retries only the lookup when it failed on the network', async () => {
    const api = stubCatalogApi({
      episode: (_id, index) => (index === 0 ? err(offlineFailure()) : ok(episodeItem())),
      episodes: () => ok(page(catalogEpisodes(3))),
    });
    renderPicker(api);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByTestId('episode-picker-grid')).toBeDefined();
    });
    expect(api.episodeByIdCalls).toHaveLength(2);
  });

  it('keeps a missing episode in the panel rather than sending the player home', async () => {
    const api = stubCatalogApi({
      episode: () => err(httpFailure(404)),
    });
    renderPicker(api);

    const unavailable = await screen.findByTestId('episode-picker-unavailable');
    expect(unavailable.getAttribute('data-reason')).toBe('NOT_FOUND');
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull();
  });
});

describe('lock marks and navigation', () => {
  it('highlights the episode the player is on', async () => {
    const items = catalogEpisodes(6);
    renderPicker(scriptedApi(items, items[2]!), { episodeId: 'ep_test_0003' });

    const cells = await screen.findAllByTestId('episode-picker-cell');
    const highlighted = cells.find((cell) => cell.getAttribute('data-current') === 'true');
    expect(highlighted?.getAttribute('data-episode-id')).toBe('ep_test_0003');
  });

  it('lets a playable cell replace the player route and closes the panel', async () => {
    const items = catalogEpisodes(5);
    const { onClose } = renderPicker(scriptedApi(items), { episodeId: 'ep_test_0001' });

    const playable = await screen.findAllByTestId('episode-picker-cell');
    const second = playable.find((cell) => cell.getAttribute('data-episode-id') === 'ep_test_0002');
    expect(second?.tagName).toBe('A');
    expect(second?.getAttribute('href')).toBe('/play/ep_test_0002');

    fireEvent.click(second!);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not turn a locked cell into a destination', async () => {
    const items = [episodeItem(), lockedEpisodeItem({ globalEpisodeNumber: 4, priceCoins: 30 })];
    const { onClose } = renderPicker(scriptedApi(items));

    const cells = await screen.findAllByTestId('episode-picker-cell');
    const locked = cells.find((cell) => cell.getAttribute('data-episode-id') === 'ep_test_0004');
    expect(locked?.tagName).not.toBe('A');
    expect(locked?.getAttribute('data-locked')).toBe('true');
    expect(locked?.textContent).toMatch(/Locked/i);

    fireEvent.click(locked!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('treats UNAVAILABLE the same as locked, even when a stale price is present', async () => {
    const items = [
      episodeItem(),
      episodeItem({
        globalEpisodeNumber: 7,
        priceCoins: 60,
        viewerAccess: viewerAccess('UNAVAILABLE'),
      }),
    ];
    renderPicker(scriptedApi(items));

    const cells = await screen.findAllByTestId('episode-picker-cell');
    const blocked = cells.find((cell) => cell.getAttribute('data-episode-id') === 'ep_test_0007');
    expect(blocked?.tagName).not.toBe('A');
    expect(blocked?.getAttribute('data-action')).toBe('UNAVAILABLE');
  });
});

describe('groups of thirty', () => {
  it('does not offer group tabs for a short drama', async () => {
    renderPicker(scriptedApi(catalogEpisodes(8)));
    await screen.findByTestId('episode-picker-grid');
    expect(screen.queryByTestId('episode-picker-groups')).toBeNull();
  });

  it('splits an 80-episode list into three tabs and opens on the current group', async () => {
    const items = catalogEpisodes(80);
    renderPicker(scriptedApi(items, items[74]!), { episodeId: 'ep_test_0075' });

    const tabs = await screen.findAllByTestId('episode-picker-group');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.textContent).toBe('1–30');
    expect(tabs[2]?.textContent).toBe('61–80');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');

    const cells = screen.getAllByTestId('episode-picker-cell');
    expect(cells).toHaveLength(20);
    expect(cells[0]?.textContent).toContain('61');
  });

  it('switches groups without refetching', async () => {
    const items = catalogEpisodes(80);
    const api = scriptedApi(items);
    renderPicker(api);

    const tabs = await screen.findAllByTestId('episode-picker-group');
    fireEvent.click(tabs[1]!);

    const cells = screen.getAllByTestId('episode-picker-cell');
    expect(cells[0]?.textContent).toContain('31');
    expect(api.episodeCalls).toHaveLength(1);
  });
});

describe('paging past the first hundred', () => {
  it('walks the remaining cursor so the grid is the whole drama', async () => {
    const first = catalogEpisodes(50);
    const rest = catalogEpisodes(80).slice(50);
    const api = stubCatalogApi({
      episode: () => ok(episodeItem()),
      episodes: (_request, index) => (index === 0 ? ok(page(first, 'cur_next')) : ok(page(rest))),
    });
    renderPicker(api);

    await waitFor(() => {
      expect(api.episodeCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(api.episodeCalls[1]?.cursor).toBe('cur_next');

    await waitFor(() => {
      expect(screen.getAllByTestId('episode-picker-group')).toHaveLength(3);
    });
    fireEvent.click(screen.getAllByTestId('episode-picker-group')[2]!);
    await waitFor(() => {
      expect(screen.getAllByTestId('episode-picker-cell')[0]?.textContent).toContain('61');
    });
  });
});

describe('the panel is dismissable', () => {
  it('closes from the scrim, the close control, and Escape', async () => {
    const { onClose } = renderPicker(scriptedApi(catalogEpisodes(3)));
    await screen.findByTestId('episode-picker-grid');

    fireEvent.click(screen.getByTestId('episode-picker-scrim'));
    fireEvent.click(screen.getByTestId('episode-picker-close'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('what the picker refuses to invent', () => {
  it('asks the drama-level progress endpoint, not a per-episode loop and not a catalogue guess', async () => {
    const api = scriptedApi(catalogEpisodes(4));
    const progressApi = stubProgressApi();
    renderPicker(api, { progressApi });
    await screen.findByTestId('episode-picker-grid');

    await waitFor(() => {
      expect(progressApi.dramaProgressCalls).toEqual(['drm_test_0001']);
    });
    expect(api.dramaCalls).toEqual([]);
    expect(api.feedCalls).toEqual([]);
    expect(JSON.stringify(api)).not.toMatch(/progress\/episodes/);
  });

  it('does not quote a coin, Beans, or fiat amount on a cell', async () => {
    renderPicker(scriptedApi([lockedEpisodeItem({ priceCoins: 30 })]));
    const cell = await screen.findByTestId('episode-picker-cell');
    expect(cell.textContent).not.toMatch(/coin|Beans|\$|¢/i);
  });
});

describe('watched marks come only from the drama-progress read', () => {
  it('paints a mark on a completed item and not on an in-progress one', async () => {
    const progressApi = stubProgressApi({
      dramaProgress: () =>
        ok(
          dramaProgressView({
            items: [
              dramaProgressItem({
                episodeId: 'ep_test_0001',
                episodeNumber: 1,
                completed: true,
              }),
              dramaProgressItem({
                episodeId: 'ep_test_0002',
                episodeNumber: 2,
                positionSec: 12,
                completed: false,
              }),
            ],
            lastWatched: { episodeId: 'ep_test_0002', episodeNumber: 2, positionSec: 12 },
          }),
        ),
    });
    renderPicker(scriptedApi(catalogEpisodes(4)), { progressApi });

    await waitFor(() => {
      expect(cellWatched('ep_test_0001')).toBe('true');
    });
    expect(cellById('ep_test_0001')?.textContent).toMatch(/Watched/i);
    expect(cellWatched('ep_test_0002')).toBe('false');
    expect(cellById('ep_test_0002')?.textContent).not.toMatch(/Watched/i);
  });

  it('does not treat lastWatched as a watched-up-to range', async () => {
    const progressApi = stubProgressApi({
      dramaProgress: () =>
        ok(
          dramaProgressView({
            items: [
              dramaProgressItem({
                episodeId: 'ep_test_0003',
                episodeNumber: 3,
                completed: true,
              }),
            ],
            lastWatched: { episodeId: 'ep_test_0003', episodeNumber: 3, positionSec: 90 },
          }),
        ),
    });
    renderPicker(scriptedApi(catalogEpisodes(4)), { progressApi });

    await waitFor(() => {
      expect(cellWatched('ep_test_0003')).toBe('true');
    });
    expect(cellWatched('ep_test_0001')).toBe('false');
    expect(cellWatched('ep_test_0002')).toBe('false');
  });

  it('omits every mark when the progress read fails, rather than guessing from episode numbers', async () => {
    const progressApi = stubProgressApi({
      dramaProgress: () => err(httpFailure(503)),
    });
    renderPicker(scriptedApi(catalogEpisodes(4)), { episodeId: 'ep_test_0003', progressApi });

    await waitFor(() => {
      expect(progressApi.dramaProgressCalls).toEqual(['drm_test_0001']);
    });
    await screen.findByTestId('episode-picker-grid');

    for (const cell of screen.getAllByTestId('episode-picker-cell')) {
      expect(cell.getAttribute('data-watched')).toBe('false');
      expect(cell.textContent).not.toMatch(/Watched/i);
    }
  });
});
