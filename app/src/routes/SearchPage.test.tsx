import { describe, expect, it } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { MAX_SEARCH_QUERY_LENGTH } from '../data/search-api';
import { SearchPage } from './SearchPage';
import { httpFailure, offlineFailure } from '../testing/catalog-fixtures';
import {
  malformedFailure,
  searchHit,
  searchResults,
  stubSearchApi,
} from '../testing/search-fixtures';
import { renderSurface } from '../testing/render';
import type { StubSearchApi } from '../testing/search-fixtures';

function renderSearch(search: StubSearchApi, path = '/search') {
  return renderSurface(<SearchPage />, { search, path });
}

/**
 * The three answers this screen exists to keep apart. Everything else here is in service of them.
 */
describe('an empty query is not an empty result set', () => {
  it('prompts, and asks the server nothing at all', async () => {
    const search = stubSearchApi();
    renderSearch(search);

    expect(screen.getByTestId('search-idle')).toBeDefined();
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByTestId('search-results')).toBeNull();

    // Nothing is in flight, so nothing can arrive late and turn the prompt into a result.
    await waitFor(() => {
      expect(screen.getByTestId('search-idle')).toBeDefined();
    });
    expect(search.searchCalls).toEqual([]);
  });

  it('treats a query of only whitespace as an empty box', () => {
    const search = stubSearchApi();
    renderSearch(search, '/search?q=%20%20%20');

    expect(screen.getByTestId('search-idle')).toBeDefined();
    expect(search.searchCalls).toEqual([]);
  });

  it('says so on the surface, so the state is legible from outside', () => {
    renderSearch(stubSearchApi());
    expect(screen.getByTestId('search-page').getAttribute('data-query-state')).toBe('EMPTY');
  });
});

describe('a query that matched nothing', () => {
  it('is an empty state naming what was searched for, not an error', async () => {
    const search = stubSearchApi({ search: () => ok(searchResults([], { query: 'zebra' })) });
    renderSearch(search, '/search?q=zebra');

    const empty = await screen.findByTestId('empty-state');
    expect(empty.textContent).toContain('zebra');
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(screen.queryByTestId('terminal-error')).toBeNull();
    expect(screen.queryByTestId('search-idle')).toBeNull();
  });

  /**
   * Retrying re-asks a question that has already been answered. The way out of this state is the
   * search field directly above it, which still holds the query being complained about.
   */
  it('offers no retry, because the same query returns the same nothing', async () => {
    const search = stubSearchApi({ search: () => ok(searchResults([], { query: 'zebra' })) });
    renderSearch(search, '/search?q=zebra');

    await screen.findByTestId('empty-state');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  /**
   * The echo, not the input box. The two differ the moment the viewer keeps typing, and only the
   * response describes the absence of a list actually on screen.
   */
  it('names the server’s echo rather than whatever is in the box', async () => {
    const search = stubSearchApi({ search: () => ok(searchResults([], { query: 'twin moons' })) });
    renderSearch(search, '/search?q=twin%20moons');

    const empty = await screen.findByTestId('empty-state');
    expect(empty.textContent).toContain('twin moons');
  });

  // Search-term echo is on the XSS list precisely because it is so often rendered as markup
  // (`docs/14-security.md` §2). It is plain text in a JSON body and it stays text here.
  it('renders an echoed query as text and never as markup', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const search = stubSearchApi({ search: () => ok(searchResults([], { query: hostile })) });
    renderSearch(search, `/search?q=${encodeURIComponent(hostile)}`);

    const empty = await screen.findByTestId('empty-state');
    expect(empty.textContent).toContain(hostile);
    expect(empty.querySelector('img')).toBeNull();
  });
});

describe('a search that failed', () => {
  it('offers a retry when the network dropped, and reruns the same query on it', async () => {
    const search = stubSearchApi({
      search: (_request, index) =>
        index === 0 ? err(offlineFailure()) : ok(searchResults([searchHit()])),
    });
    renderSearch(search, '/search?q=heiress');

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-failure-kind')).toBe('OFFLINE');
    expect(screen.queryByTestId('empty-state')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByTestId('search-hits')).toBeDefined();
    });
    expect(screen.queryByTestId('retryable-error')).toBeNull();
    expect(search.searchCalls.map((call) => call.query)).toEqual(['heiress', 'heiress']);
  });

  // A refused request is our bug, not the viewer's situation, and repeating it cannot change the
  // answer. A retry button here is a button that cannot work.
  it('renders a refused request as terminal, with no retry', async () => {
    const search = stubSearchApi({ search: () => err(httpFailure(400)) });
    renderSearch(search, '/search?q=heiress');

    const terminal = await screen.findByTestId('terminal-error');
    expect(terminal.getAttribute('data-reason')).toBe('REJECTED');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('carries the trace id so a report maps to a server trace', async () => {
    const search = stubSearchApi({ search: () => err(httpFailure(500, 'trace_search')) });
    renderSearch(search, '/search?q=heiress');

    const error = await screen.findByTestId('retryable-error');
    expect(error.getAttribute('data-trace-id')).toBe('trace_search');
  });

  // A `200` the client cannot read is not "nothing matched". Reporting it as an empty result set
  // would tell the viewer a true-sounding thing about the catalogue that we do not know.
  it('is not confused with an empty result set when the body was unreadable', async () => {
    const search = stubSearchApi({ search: () => err(malformedFailure()) });
    renderSearch(search, '/search?q=heiress');

    expect(await screen.findByTestId('retryable-error')).toBeDefined();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('the results', () => {
  it('sends the normalised query and shows a hit per match', async () => {
    const search = stubSearchApi({
      search: () =>
        ok(
          searchResults([
            searchHit({ dramaId: 'drm_1', title: 'One' }),
            searchHit({ dramaId: 'drm_2', title: 'Two' }),
          ]),
        ),
    });
    renderSearch(search, '/search?q=%20twin%20%20moons%20');

    await waitFor(() => {
      expect(screen.getAllByTestId('search-hit')).toHaveLength(2);
    });
    expect(search.searchCalls[0]?.query).toBe('twin moons');
    expect(screen.getByText('One')).toBeDefined();
  });

  it('shows a skeleton while the search is in flight', () => {
    renderSearch(stubSearchApi(), '/search?q=heiress');
    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('links a hit to the drama it found', async () => {
    const search = stubSearchApi({
      search: () => ok(searchResults([searchHit({ dramaId: 'drm_9' })])),
    });
    renderSearch(search, '/search?q=heiress');

    const hit = await screen.findByTestId('search-hit');
    expect(hit.querySelector('a')?.getAttribute('href')).toBe('/drama/drm_9');
  });

  /**
   * There is no cursor: relevance order is not a keyset, so paging a ranking needs a snapshot of
   * that ranking to mean anything. The honest answer is to say the list is cut and ask for a
   * narrower query.
   */
  it('says the list was cut short instead of offering a next page', async () => {
    const search = stubSearchApi({
      search: () => ok(searchResults([searchHit()], { truncated: true })),
    });
    renderSearch(search, '/search?q=the');

    expect(await screen.findByTestId('search-truncated')).toBeDefined();
    expect(screen.queryByTestId('load-more')).toBeNull();
  });

  it('says nothing about truncation when the whole result set came back', async () => {
    const search = stubSearchApi({ search: () => ok(searchResults([searchHit()])) });
    renderSearch(search, '/search?q=heiress');

    await screen.findByTestId('search-hit');
    expect(screen.queryByTestId('search-truncated')).toBeNull();
  });
});

describe('the search box', () => {
  it('puts a submitted query in the route, so back and a shared link restore it', async () => {
    const search = stubSearchApi({ search: () => ok(searchResults([searchHit()])) });
    renderSearch(search);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'heiress' } });
    fireEvent.click(screen.getByTestId('search-submit'));

    await waitFor(() => {
      expect(search.searchCalls).toHaveLength(1);
    });
    expect(search.searchCalls[0]?.query).toBe('heiress');
  });

  it('is filled from the route on arrival, so a deep link is editable', () => {
    renderSearch(stubSearchApi(), '/search?q=heiress');
    expect(screen.getByTestId('search-input').getAttribute('value')).toBe('heiress');
  });

  it('does not search while the viewer is still typing', () => {
    const search = stubSearchApi();
    renderSearch(search);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'heir' } });
    expect(search.searchCalls).toEqual([]);
  });

  it('submitting an empty box returns to the prompt rather than searching for nothing', () => {
    const search = stubSearchApi();
    renderSearch(search);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('search-submit'));

    expect(screen.getByTestId('search-idle')).toBeDefined();
    expect(search.searchCalls).toEqual([]);
  });

  it('clears back to the prompt, which is not the no-results state', async () => {
    const search = stubSearchApi({ search: () => ok(searchResults([], { query: 'zebra' })) });
    renderSearch(search, '/search?q=zebra');

    await screen.findByTestId('empty-state');
    fireEvent.click(screen.getByTestId('search-clear'));

    expect(screen.getByTestId('search-idle')).toBeDefined();
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.getByTestId('search-input').getAttribute('value')).toBe('');
  });

  it('offers nothing to clear before anything has been searched', () => {
    renderSearch(stubSearchApi());
    expect(screen.queryByTestId('search-clear')).toBeNull();
  });

  // The contract publishes a 64-character maximum and the server refuses anything longer, so the
  // field is capped rather than left to earn a validation error.
  it('cannot be typed past the published maximum', () => {
    renderSearch(stubSearchApi());
    expect(screen.getByTestId('search-input').getAttribute('maxlength')).toBe(
      String(MAX_SEARCH_QUERY_LENGTH),
    );
  });

  /**
   * A deep link can still carry one, and it is a fourth distinct answer: not an empty box, not an
   * empty result set, and not a failure — a request we decline to make because it can only come
   * back refused.
   */
  it('refuses an over-long query from a deep link without asking the server', () => {
    const search = stubSearchApi();
    renderSearch(search, `/search?q=${'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 1)}`);

    expect(screen.getByTestId('search-too-long')).toBeDefined();
    expect(screen.queryByTestId('search-idle')).toBeNull();
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(search.searchCalls).toEqual([]);
  });

  it('always offers a way back to the feed', () => {
    renderSearch(stubSearchApi());
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/home');
  });
});
