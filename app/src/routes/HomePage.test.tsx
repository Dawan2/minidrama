import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { HomePage } from './HomePage';
import {
  continueWatchingCard,
  dramaSummary,
  feedCard,
  httpFailure,
  offlineFailure,
  page,
  stubCatalogApi,
} from '../testing/catalog-fixtures';
import { renderSettled, renderSurface, settle } from '../testing/render';

/**
 * SCR-02. The assertions are about the five states of the IA (§8.1) and about the two card types
 * landing in different places, which is the whole product claim of the feed.
 */
describe('the feed', () => {
  it('asks for the HOME scene', async () => {
    const api = stubCatalogApi({ feed: () => ok(page([feedCard()])) });
    renderSurface(<HomePage />, { api });

    await waitFor(() => {
      expect(api.feedCalls.length).toBeGreaterThan(0);
    });
    expect(api.feedCalls[0]).toMatchObject({ scene: 'HOME' });
  });

  // There is no tab bar yet, so without this the search route is reachable only by deep link.
  it('offers the only way into search', async () => {
    const api = stubCatalogApi({ feed: () => ok(page([feedCard()])) });
    renderSurface(<HomePage />, { api });

    const entry = await screen.findByTestId('search-entry');
    expect(entry.getAttribute('href')).toBe('/search');
  });

  it('shows a skeleton while the first page is in flight', () => {
    const api = stubCatalogApi({ feed: () => ok(page([])) });
    renderSurface(<HomePage />, { api });

    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('renders a card per drama', async () => {
    const api = stubCatalogApi({
      feed: () =>
        ok(
          page([
            feedCard({ drama: dramaSummary({ id: 'drm_1', title: 'One' }) }),
            feedCard({ drama: dramaSummary({ id: 'drm_2', title: 'Two' }) }),
          ]),
        ),
    });
    renderSurface(<HomePage />, { api });

    await waitFor(() => {
      expect(screen.getAllByTestId('feed-card')).toHaveLength(2);
    });
    expect(screen.getByText('One')).toBeDefined();
    expect(screen.getByText('Two')).toBeDefined();
  });

  // An empty feed means an empty catalogue: the server already falls back to popularity when there
  // is nothing personal to show. There is nowhere to send the viewer, so the action is to retry.
  it('offers a retry from the empty state rather than a dead end', async () => {
    const api = stubCatalogApi({ feed: () => ok(page([])) });
    renderSurface(<HomePage />, { api });

    const empty = await screen.findByTestId('empty-state');
    expect(empty).toBeDefined();
    expect(screen.queryByTestId('feed')).toBeNull();

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(api.feedCalls.length).toBeGreaterThan(1);
    });
  });

  it('offers a retry when the network failed, and reloads on it', async () => {
    const api = stubCatalogApi({
      feed: (_request, index) =>
        index === 0 ? err(offlineFailure()) : ok(page([feedCard({ recReason: null })])),
    });
    renderSurface(<HomePage />, { api });

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-failure-kind')).toBe('OFFLINE');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.getByTestId('feed')).toBeDefined();
    });
    expect(screen.queryByTestId('retryable-error')).toBeNull();
  });

  it('shows the wait hint when the server asked for one', async () => {
    const api = stubCatalogApi({
      feed: () => err({ ...httpFailure(429), retryAfterSec: 30 }),
    });
    renderSurface(<HomePage />, { api });

    expect(await screen.findByTestId('retry-after')).toBeDefined();
  });

  // A retry button on a 410 is a button that cannot work. The state matrix gives the feed no
  // terminal variant; if the server produces one anyway, the honest state beats the documented one.
  it('renders a terminal state with no retry when the server says the feed is gone', async () => {
    const api = stubCatalogApi({ feed: () => err(httpFailure(410)) });
    renderSurface(<HomePage />, { api });

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.getAttribute('data-reason')).toBe('OFFLINE');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('carries the trace id into the error state so a report maps to a server trace', async () => {
    const api = stubCatalogApi({ feed: () => err(httpFailure(500, 'trace_zz')) });
    renderSurface(<HomePage />, { api });

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-trace-id')).toBe('trace_zz');
  });
});

describe('feed card destinations', () => {
  // The one-tap resume is the point of the card. Sending it to the detail screen would ask the
  // viewer to find their own place again (`docs/02-user-journeys.md` J3).
  it('sends a continue-watching card straight to the player', async () => {
    const api = stubCatalogApi({ feed: () => ok(page([continueWatchingCard()])) });
    renderSurface(<HomePage />, { api });

    const card = await screen.findByTestId('feed-card');
    expect(card.getAttribute('data-card-type')).toBe('CONTINUE_WATCHING');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/play/ep_test_0007');
    expect(screen.getByTestId('feed-resume').textContent).toContain('7');
  });

  it('sends an ordinary card to the drama detail screen', async () => {
    const api = stubCatalogApi({
      feed: () => ok(page([feedCard({ drama: dramaSummary({ id: 'drm_9' }) })])),
    });
    renderSurface(<HomePage />, { api });

    const card = await screen.findByTestId('feed-card');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/drama/drm_9');
  });

  // The events endpoint does not exist yet. Dropping the impression id now would mean re-plumbing
  // every card when it does (`docs/handoff/w2-work-d.md` decision S34).
  it('keeps the tracking id on the card', async () => {
    const api = stubCatalogApi({
      feed: () => ok(page([feedCard({ trackingId: 'trk_abc' })])),
    });
    renderSurface(<HomePage />, { api });

    const card = await screen.findByTestId('feed-card');
    expect(card.getAttribute('data-tracking-id')).toBe('trk_abc');
  });

  it('renders the free-episode badge only when some episodes are paid', async () => {
    const api = stubCatalogApi({
      feed: () =>
        ok(
          page([
            feedCard({
              drama: dramaSummary({ id: 'drm_paid', freeEpisodes: 3, totalEpisodes: 80 }),
            }),
            feedCard({
              drama: dramaSummary({ id: 'drm_free', freeEpisodes: 8, totalEpisodes: 8 }),
            }),
          ]),
        ),
    });
    renderSurface(<HomePage />, { api });

    await waitFor(() => {
      expect(screen.getAllByTestId('feed-card')).toHaveLength(2);
    });
    const badges = screen.getAllByTestId('free-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toContain('3');
  });
});

/**
 * Two-round paging tests are driven through `renderSettled`/`settle` rather than stacked
 * `findBy*`/`waitFor`. Each async utility is a one-second wall-clock budget that a worker
 * descheduled under parallel load can spend without doing any work. `act` returns when React has
 * run out of work rather than when a timer says so, which starvation delays but cannot break. The
 * rest of this file keeps `findBy*` because those assertions need one round of the stub.
 */
describe('feed paging', () => {
  it('appends the next page and stops offering more when the cursor runs out', async () => {
    const api = stubCatalogApi({
      feed: (request) =>
        request.cursor === undefined
          ? ok(page([feedCard({ drama: dramaSummary({ id: 'drm_1' }) })], 'cur_2'))
          : ok(page([feedCard({ drama: dramaSummary({ id: 'drm_2' }) })])),
    });
    await renderSettled(<HomePage />, { api });

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more'));
    });

    expect(screen.getAllByTestId('feed-card')).toHaveLength(2);
    expect(screen.queryByTestId('load-more')).toBeNull();
    expect(api.feedCalls[1]?.cursor).toBe('cur_2');
  });

  it('drops a drama the feed has already shown', async () => {
    const repeated = dramaSummary({ id: 'drm_same' });
    const api = stubCatalogApi({
      feed: (request) =>
        request.cursor === undefined
          ? ok(page([feedCard({ drama: repeated })], 'cur_2'))
          : ok(page([feedCard({ drama: repeated, trackingId: 'trk_second' })])),
    });
    await renderSettled(<HomePage />, { api });

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more'));
    });

    expect(screen.queryByTestId('load-more')).toBeNull();
    expect(screen.getAllByTestId('feed-card')).toHaveLength(1);
  });

  // The cards the viewer is reading stay on screen. The error goes underneath them.
  it('keeps the loaded cards when the next page fails', async () => {
    const api = stubCatalogApi({
      feed: (request) =>
        request.cursor === undefined ? ok(page([feedCard()], 'cur_2')) : err(offlineFailure()),
    });
    await renderSettled(<HomePage />, { api });

    await settle(() => {
      fireEvent.click(screen.getByTestId('load-more'));
    });

    expect(screen.getByTestId('retryable-error')).toBeDefined();
    expect(screen.getAllByTestId('feed-card')).toHaveLength(1);
    expect(screen.getByTestId('load-more')).toBeDefined();
  });
});
