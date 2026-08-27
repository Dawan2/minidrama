import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { BrowsePage } from './BrowsePage';
import { browsePath } from './browse-query';
import {
  dramaSummary,
  httpFailure,
  offlineFailure,
  page,
  stubCatalogApi,
} from '../testing/catalog-fixtures';
import { renderSettled, renderSurface, settle } from '../testing/render';

/**
 * SCR-03. The assertions are the five states the inventory asks for, and the rule that filters
 * live in the route rather than in component state: a back press has to restore the same grid.
 */
describe('the browse grid', () => {
  it('asks for HOT with no category when the route is bare', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([dramaSummary()])) });
    renderSurface(<BrowsePage />, { api, path: '/browse' });

    await waitFor(() => {
      expect(api.dramaListCalls.length).toBeGreaterThan(0);
    });
    expect(api.dramaListCalls[0]).toMatchObject({ sort: 'HOT' });
    expect(api.dramaListCalls[0]?.category).toBeUndefined();
    expect(api.dramaListCalls[0]?.tag).toBeUndefined();
  });

  it('sends the category the route carries, not a default of OTHER', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([dramaSummary()])) });
    renderSurface(<BrowsePage />, { api, path: browsePath({ category: 'REVENGE' }) });

    await waitFor(() => {
      expect(api.dramaListCalls[0]?.category).toBe('REVENGE');
    });
    expect((await screen.findByTestId('browse-page')).getAttribute('data-category')).toBe(
      'REVENGE',
    );
  });

  // A deep link that invented a category must not become a 400. The parser drops it; the request
  // is the unfiltered list.
  it('does not forward a category the contract does not list', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([dramaSummary()])) });
    renderSurface(<BrowsePage />, { api, path: '/browse?category=BOGUS' });

    await waitFor(() => {
      expect(api.dramaListCalls.length).toBeGreaterThan(0);
    });
    expect(api.dramaListCalls[0]?.category).toBeUndefined();
    expect(screen.getByTestId('browse-category-all').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a skeleton while the first page is in flight', () => {
    const api = stubCatalogApi({ dramas: () => ok(page([])) });
    renderSurface(<BrowsePage />, { api, path: '/browse' });

    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('renders a card per drama that opens the detail, not the player', async () => {
    const api = stubCatalogApi({
      dramas: () =>
        ok(
          page([
            dramaSummary({ id: 'drm_1', title: 'One' }),
            dramaSummary({ id: 'drm_2', title: 'Two' }),
          ]),
        ),
    });
    renderSurface(<BrowsePage />, { api, path: '/browse' });

    const cards = await screen.findAllByTestId('browse-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('One')).toBeDefined();
    expect(cards[0]?.querySelector('a')?.getAttribute('href')).toBe('/drama/drm_1');
  });

  it('offers a retry from the unfiltered empty state rather than a dead end', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([])) });
    renderSurface(<BrowsePage />, { api, path: '/browse' });

    const empty = await screen.findByTestId('empty-state');
    expect(empty).toBeDefined();
    expect(screen.queryByTestId('browse-list')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(api.dramaListCalls.length).toBeGreaterThan(1);
    });
  });

  it('offers a clear from a filtered empty list, not a retry of the same nothing', async () => {
    const api = stubCatalogApi({
      dramas: (request) =>
        request.category === 'COMEDY' ? ok(page([])) : ok(page([dramaSummary({ title: 'Back' })])),
    });
    renderSurface(<BrowsePage />, { api, path: browsePath({ category: 'COMEDY' }) });

    expect(await screen.findByTestId('empty-state')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('Back')).toBeDefined();
    expect(api.dramaListCalls.some((call) => call.category === undefined)).toBe(true);
  });

  it('writes a category chip into the route so back restores it', async () => {
    const api = stubCatalogApi({
      dramas: (request) =>
        ok(page([dramaSummary({ id: request.category === 'FAMILY' ? 'drm_fam' : 'drm_all' })])),
    });
    renderSurface(<BrowsePage />, { api, path: '/browse' });
    await screen.findByTestId('browse-list');

    fireEvent.click(screen.getByTestId('browse-category-FAMILY'));

    expect((await screen.findByTestId('browse-card')).getAttribute('data-drama-id')).toBe(
      'drm_fam',
    );
    expect(screen.getByTestId('browse-category-FAMILY').getAttribute('aria-pressed')).toBe('true');
    expect(api.dramaListCalls.some((call) => call.category === 'FAMILY')).toBe(true);
  });

  it('sends NEW when that sort is selected', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([dramaSummary()])) });
    renderSurface(<BrowsePage />, { api, path: '/browse' });
    await screen.findByTestId('browse-list');

    fireEvent.click(screen.getByTestId('browse-sort-NEW'));

    await waitFor(() => {
      expect(api.dramaListCalls.some((call) => call.sort === 'NEW')).toBe(true);
    });
    expect(screen.getByTestId('browse-page').getAttribute('data-sort')).toBe('NEW');
  });

  it('honours a tag in the URL and lets the viewer drop it', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([dramaSummary()])) });
    renderSurface(<BrowsePage />, { api, path: browsePath({ tag: 'ceo' }) });

    await waitFor(() => {
      expect(api.dramaListCalls[0]?.tag).toBe('ceo');
    });
    fireEvent.click(screen.getByTestId('browse-tag'));
    await waitFor(() => {
      expect(api.dramaListCalls.some((call) => call.tag === undefined)).toBe(true);
    });
    expect(screen.queryByTestId('browse-tag')).toBeNull();
  });

  it('offers a retry when the network failed, and reloads on it', async () => {
    const api = stubCatalogApi({
      dramas: (_request, index) =>
        index === 0 ? err(offlineFailure()) : ok(page([dramaSummary({ title: 'Recovered' })])),
    });
    renderSurface(<BrowsePage />, { api, path: '/browse' });

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-failure-kind')).toBe('OFFLINE');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recovered')).toBeDefined();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
  });

  it('renders a terminal state with no retry when the server says the list is gone', async () => {
    const api = stubCatalogApi({ dramas: () => err(httpFailure(410)) });
    renderSurface(<BrowsePage />, { api, path: '/browse' });

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.getAttribute('data-reason')).toBe('OFFLINE');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('does not offer a search box: that entry stays on the feed until G5 closes', async () => {
    const api = stubCatalogApi({ dramas: () => ok(page([dramaSummary()])) });
    renderSurface(<BrowsePage />, { api, path: '/browse' });
    await screen.findByTestId('browse-list');
    expect(screen.queryByTestId('search-entry')).toBeNull();
    expect(screen.queryByTestId('search-input')).toBeNull();
  });
});

describe('browse paging', () => {
  it('appends the next page onto the cards already on screen', async () => {
    const api = stubCatalogApi({
      dramas: (request) =>
        request.cursor === undefined
          ? ok(page([dramaSummary({ id: 'drm_1', title: 'One' })], 'cur_2'))
          : ok(page([dramaSummary({ id: 'drm_2', title: 'Two' })])),
    });
    await renderSettled(<BrowsePage />, { api, path: '/browse' });

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more'));
    });

    expect(screen.getAllByTestId('browse-card')).toHaveLength(2);
    expect(screen.queryByTestId('load-more')).toBeNull();
    expect(api.dramaListCalls[1]?.cursor).toBe('cur_2');
  });

  // The cards the viewer is reading stay on screen. The error goes underneath them.
  it('keeps the loaded cards when the next page fails', async () => {
    const api = stubCatalogApi({
      dramas: (request) =>
        request.cursor === undefined ? ok(page([dramaSummary()], 'cur_2')) : err(offlineFailure()),
    });
    await renderSettled(<BrowsePage />, { api, path: '/browse' });

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more'));
    });

    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(screen.getAllByTestId('browse-card')).toHaveLength(1);
    expect(screen.getByTestId('load-more')).toBeDefined();
  });
});
