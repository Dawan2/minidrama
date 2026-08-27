import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { HistoryPage } from './HistoryPage';
import { dramaSummary, offlineFailure, page } from '../testing/catalog-fixtures';
import {
  historyHttpFailure,
  stubHistoryApi,
  stubSession,
  watchHistoryEntry,
} from '../testing/history-fixtures';
import { renderSurface } from '../testing/render';

/**
 * SCR-07. The assertions that matter are the ones separating the three ways this screen can show
 * nothing: an empty list, a missing session, and an endpoint that is not deployed. A viewer who has
 * watched twenty episodes and is told "nothing to continue yet" because a token was missing has
 * been told their progress is gone.
 */
describe('the history screen', () => {
  it('asks for the history once, with no cursor', async () => {
    const historyApi = stubHistoryApi({ history: () => ok(page([watchHistoryEntry()])) });
    renderSurface(<HistoryPage />, { historyApi });

    await waitFor(() => {
      expect(historyApi.historyCalls.length).toBe(1);
    });
    expect(historyApi.historyCalls[0]).toEqual({});
  });

  it('shows a skeleton while the first page is in flight', () => {
    renderSurface(<HistoryPage />);
    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('renders a row per drama, newest first as the server ordered them', async () => {
    const historyApi = stubHistoryApi({
      history: () =>
        ok(
          page([
            watchHistoryEntry({ drama: dramaSummary({ id: 'drm_1', title: 'One' }) }),
            watchHistoryEntry({ drama: dramaSummary({ id: 'drm_2', title: 'Two' }) }),
          ]),
        ),
    });
    renderSurface(<HistoryPage />, { historyApi });

    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(2);
    });
    const titles = screen
      .getAllByTestId('history-row')
      .map((row) => row.getAttribute('data-drama-id'));
    expect(titles).toEqual(['drm_1', 'drm_2']);
  });

  it('sends an empty history to the feed, because the way out of an empty list is content', async () => {
    const historyApi = stubHistoryApi({ history: () => ok(page([])) });
    renderSurface(<HistoryPage />, { historyApi });

    const empty = await screen.findByTestId('empty-state');
    expect(empty.textContent).toContain('Nothing to continue yet.');
    expect(screen.getByRole('link', { name: 'Find something to watch' }).getAttribute('href')).toBe(
      '/home',
    );
    expect(screen.getByTestId('history-page').getAttribute('data-state')).toBe('empty');
  });
});

/**
 * The one distinction the screen exists to make. Both of these show no dramas; they are not the
 * same screen, they do not say the same thing, and the recovery is the opposite in each case.
 */
describe('no session versus no history', () => {
  it('offers a sign-in rather than an empty list when the server answers 401', async () => {
    const historyApi = stubHistoryApi({ history: () => err(historyHttpFailure(401)) });
    renderSurface(<HistoryPage />, { historyApi });

    const prompt = await screen.findByTestId('history-sign-in');
    expect(prompt.textContent).toContain('Sign in to pick up where you left off.');
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.getByTestId('history-page').getAttribute('data-state')).toBe('auth_required');
  });

  // The screen must not tell a viewer their progress is gone. The two states differ in copy, in the
  // action they offer, and in the DOM.
  it('says something different from the empty state, and offers a different action', async () => {
    const unauthorised = stubHistoryApi({ history: () => err(historyHttpFailure(401)) });
    const { unmount } = renderSurface(<HistoryPage />, { historyApi: unauthorised });
    const promptText = (await screen.findByTestId('history-sign-in')).textContent ?? '';
    expect(screen.queryByRole('link', { name: 'Find something to watch' })).toBeNull();
    unmount();

    const emptyApi = stubHistoryApi({ history: () => ok(page([])) });
    renderSurface(<HistoryPage />, { historyApi: emptyApi });
    const emptyText = (await screen.findByTestId('empty-state')).textContent ?? '';

    expect(promptText).not.toBe(emptyText);
    expect(screen.queryByTestId('history-sign-in')).toBeNull();
  });

  it('rereads the history once a session exists', async () => {
    const historyApi = stubHistoryApi({
      history: (_request, index) =>
        index === 0 ? err(historyHttpFailure(401)) : ok(page([watchHistoryEntry()])),
    });
    renderSurface(<HistoryPage />, {
      historyApi,
      session: stubSession({ signInSucceeds: true }),
    });

    fireEvent.click(await screen.findByTestId('sign-in'));

    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeDefined();
    });
    expect(historyApi.historyCalls.length).toBe(2);
  });

  // Silent login cannot succeed until the identity slot lands. The viewer is told, and the screen
  // stays where it was rather than becoming an error.
  it('keeps the prompt and explains itself when silent login cannot produce a session', async () => {
    const historyApi = stubHistoryApi({ history: () => err(historyHttpFailure(401)) });
    renderSurface(<HistoryPage />, { historyApi, session: stubSession({ signInSucceeds: false }) });

    fireEvent.click(await screen.findByTestId('sign-in'));

    expect(await screen.findByTestId('sign-in-unavailable')).toBeDefined();
    expect(screen.getByTestId('history-sign-in')).toBeDefined();
    expect(historyApi.historyCalls.length).toBe(1);
  });

  /**
   * The screen requests even when it already believes the viewer is anonymous. The session state
   * decides copy; the server decides access. A client-side skip would make the client the authority
   * on identity, and would show a sign-in prompt over a history the server would have returned.
   */
  it('requests the history even when the client believes nobody is signed in', async () => {
    const historyApi = stubHistoryApi({ history: () => ok(page([watchHistoryEntry()])) });
    renderSurface(<HistoryPage />, {
      historyApi,
      session: stubSession({ state: { status: 'ANONYMOUS' } }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeDefined();
    });
    expect(historyApi.historyCalls.length).toBe(1);
  });
});

/**
 * There is no progress module on the server yet, so the endpoint answers 404 today. That is our
 * gap, not the viewer's missing data, and an error screen would ask them to fix it.
 */
describe('an endpoint that is not deployed', () => {
  it('degrades to the empty state rather than to an error', async () => {
    const historyApi = stubHistoryApi({ history: () => err(historyHttpFailure(404)) });
    renderSurface(<HistoryPage />, { historyApi });

    expect(await screen.findByTestId('empty-state')).toBeDefined();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('history-sign-in')).toBeNull();
  });

  // The viewer sees the empty state; the DOM still says which of the two it was, so a bug report
  // and a future analytics event can tell "we have not built this" from "you watched nothing".
  it('stays distinguishable from a genuinely empty history', async () => {
    const historyApi = stubHistoryApi({ history: () => err(historyHttpFailure(404)) });
    renderSurface(<HistoryPage />, { historyApi });

    await screen.findByTestId('empty-state');
    expect(screen.getByTestId('history-page').getAttribute('data-state')).toBe('unavailable');
  });
});

describe('history failures that are neither', () => {
  it('offers a retry when the network failed, and rereads on it', async () => {
    const historyApi = stubHistoryApi({
      history: (_request, index) =>
        index === 0 ? err(offlineFailure()) : ok(page([watchHistoryEntry()])),
    });
    renderSurface(<HistoryPage />, { historyApi });

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-failure-kind')).toBe('OFFLINE');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeDefined();
    });
  });

  // A terminal state's only job is to explain itself, and the shared copy explains a drama.
  it('explains a refused request in terms of the viewer’s list, not of a drama', async () => {
    const historyApi = stubHistoryApi({ history: () => err(historyHttpFailure(400)) });
    renderSurface(<HistoryPage />, { historyApi });

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.textContent).toContain('We could not load your list.');
    expect(terminal.textContent).not.toContain('drama');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('carries the trace id so a report maps to a server trace', async () => {
    const historyApi = stubHistoryApi({ history: () => err(historyHttpFailure(500, 'trace_h')) });
    renderSurface(<HistoryPage />, { historyApi });

    expect((await screen.findByTestId('retryable-error')).getAttribute('data-trace-id')).toBe(
      'trace_h',
    );
  });
});

describe('history paging', () => {
  it('appends the next page and stops offering more when the cursor runs out', async () => {
    const historyApi = stubHistoryApi({
      history: (request) =>
        request.cursor === undefined
          ? ok(page([watchHistoryEntry({ drama: dramaSummary({ id: 'drm_1' }) })], 'cur_2'))
          : ok(page([watchHistoryEntry({ drama: dramaSummary({ id: 'drm_2' }) })])),
    });
    renderSurface(<HistoryPage />, { historyApi });

    fireEvent.click(await screen.findByTestId('load-more-history'));

    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(2);
    });
    expect(screen.queryByTestId('load-more-history')).toBeNull();
    expect(historyApi.historyCalls[1]?.cursor).toBe('cur_2');
  });

  // The rows the viewer is reading stay on screen. The error goes underneath them.
  it('keeps the loaded rows when the next page fails', async () => {
    const historyApi = stubHistoryApi({
      history: (request) =>
        request.cursor === undefined
          ? ok(page([watchHistoryEntry()], 'cur_2'))
          : err(offlineFailure()),
    });
    renderSurface(<HistoryPage />, { historyApi });

    fireEvent.click(await screen.findByTestId('load-more-history'));

    await waitFor(() => {
      expect(screen.getByTestId('retryable-error')).toBeDefined();
    });
    expect(screen.getAllByTestId('history-row')).toHaveLength(1);
  });

  /**
   * A session that expires mid-scroll is the same fact as one that was missing at the first page,
   * so it gets the same recovery — but under the rows rather than over them, because the rows that
   * loaded are still correct and still the viewer's place in the list.
   */
  it('offers a sign-in under the loaded rows when a later page loses the session', async () => {
    const historyApi = stubHistoryApi({
      history: (request) =>
        request.cursor === undefined
          ? ok(page([watchHistoryEntry()], 'cur_2'))
          : err(historyHttpFailure(401)),
    });
    renderSurface(<HistoryPage />, { historyApi });

    fireEvent.click(await screen.findByTestId('load-more-history'));

    await waitFor(() => {
      expect(screen.getByTestId('history-sign-in-more')).toBeDefined();
    });
    expect(screen.getAllByTestId('history-row')).toHaveLength(1);
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.getByTestId('history-page').getAttribute('data-state')).toBe('ready');
  });
});
