import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { MAX_SEARCH_QUERY_LENGTH, classifySearchQuery } from '../data/search-api';
import { ROUTES, SEARCH_QUERY_PARAM } from './routes';
import { SearchHitRow } from '../discovery/SearchHitRow';
import { translate } from '../core/i18n';
import { useResource } from '../data/use-resource';
import { useSearchApi } from '../data/search-api-context';
import type { Resource } from '../data/use-resource';
import type { SearchResults } from '../data/search-api';

/**
 * SCR-03's search half: the viewer types, and the catalogue answers.
 *
 * This is the only list in the product the viewer chooses the contents of, and the whole reason it
 * needs its own screen is that "you have not searched yet", "nothing matched" and "we could not
 * ask" are three different answers that a lazier surface renders as one empty box:
 *
 * | The viewer sees | Because | And the difference matters because |
 * | --- | --- | --- |
 * | A prompt, and no request was made | The box is empty | An empty box has not been searched. Sending `q=` earns a `400`, which would render "you have not typed anything yet" as an error |
 * | "No results for X", naming what they typed | `200` with `items: []` | This is a fact about the catalogue, and the recovery is a different query — not a retry, which would return the same nothing |
 * | An error, with a retry or a way out | The request failed | This is a fact about us. Telling the viewer their query matched nothing when the request never arrived sends them to rewrite a perfectly good query |
 *
 * The term lives in `?q=` rather than in component state so that back and a shared link both
 * restore the results (`docs/02-information-architecture.md` §5). Submitting replaces the entry
 * rather than pushing one: inside a WebView, back is also how the viewer leaves the mini app, and a
 * history stack one deep per refinement makes leaving take five presses.
 *
 * Searching is on submit, not on every keystroke. Search-as-you-type is the better feel and it is
 * also one request per character against an endpoint that folds every title on every call and has
 * no rate limit today (`docs/handoff/w2-work-j.md` §6); the debounce that makes it safe belongs
 * with the rate limit, not ahead of it.
 */
export function SearchPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const submitted = params.get(SEARCH_QUERY_PARAM) ?? '';
  const [draft, setDraft] = useState(submitted);

  // The route is the source of truth, so a back press, a forward press or a deep link has to be
  // able to put its term back in the box. Without this the field keeps whatever was last typed and
  // starts disagreeing with the results underneath it.
  useEffect(() => {
    setDraft(submitted);
  }, [submitted]);

  const query = classifySearchQuery(submitted);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const next = classifySearchQuery(draft);
    setParams(next.kind === 'READY' ? { [SEARCH_QUERY_PARAM]: next.query } : {}, { replace: true });
  };

  const clear = (): void => {
    setDraft('');
    setParams({}, { replace: true });
  };

  return (
    <main className="page page--search" data-testid="search-page" data-query-state={query.kind}>
      <Link className="page__back" to={ROUTES.home}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('search.heading')}</h1>

      <form className="search-form" role="search" onSubmit={submit}>
        <input
          className="search-form__input"
          data-testid="search-input"
          type="search"
          name={SEARCH_QUERY_PARAM}
          value={draft}
          /*
            The contract publishes a 64-character maximum and the server refuses anything longer.
            Capping the field means the viewer cannot type a query that can only come back as a
            validation error; a deep link can still carry one, which is what `TOO_LONG` is for.
          */
          maxLength={MAX_SEARCH_QUERY_LENGTH}
          placeholder={translate('search.placeholder')}
          aria-label={translate('search.inputLabel')}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <button className="search-form__submit" type="submit" data-testid="search-submit">
          {translate('search.submit')}
        </button>
        {submitted === '' ? null : (
          <button
            className="search-form__clear"
            type="button"
            data-testid="search-clear"
            onClick={clear}
          >
            {translate('search.clear')}
          </button>
        )}
      </form>

      {query.kind === 'READY' ? (
        <SearchResultsSection query={query.query} />
      ) : (
        <SearchPrompt state={query.kind} />
      )}
    </main>
  );
}

/**
 * The two states that never reach the network.
 *
 * Neither is an error and neither is an empty result set, so neither renders as one. `EMPTY` is the
 * screen the viewer arrives on; `TOO_LONG` is only reachable from a deep link, because the field
 * itself cannot produce one, and it says so instead of firing a request that can only be refused.
 */
function SearchPrompt({ state }: { readonly state: 'EMPTY' | 'TOO_LONG' }): React.JSX.Element {
  return (
    <p
      className="search-prompt"
      data-testid={state === 'EMPTY' ? 'search-idle' : 'search-too-long'}
    >
      {state === 'EMPTY'
        ? translate('search.prompt')
        : translate('search.tooLong', undefined, { n: MAX_SEARCH_QUERY_LENGTH })}
    </p>
  );
}

/**
 * Mounted only once there is something to search for, which is what keeps the request from being
 * made at all in the empty case: the hook cannot fire before its component exists.
 */
function SearchResultsSection({ query }: { readonly query: string }): React.JSX.Element {
  const api = useSearchApi();
  const { resource, reload } = useResource(() => api.search({ query }), `search:${query}`);

  return (
    <section className="search-results" data-testid="search-results" data-status={resource.status}>
      {renderResults(resource, reload)}
    </section>
  );
}

function renderResults(
  resource: Resource<SearchResults>,
  reload: () => void,
): React.JSX.Element | null {
  if (resource.status === 'loading') {
    return <Skeleton rows={4} label={translate('search.loading')} />;
  }

  if (resource.status === 'failed') {
    const { error } = resource;
    return error.kind === 'RETRYABLE' ? (
      <RetryableError error={error} onRetry={reload} />
    ) : (
      <TerminalError reason={error.reason} traceId={error.failure.traceId} />
    );
  }

  const results = resource.data;

  if (results.items.length === 0) {
    /*
      Named after the server's echo rather than after what is in the input box: the two differ the
      moment the viewer keeps typing, and the response is the only one of the two that describes the
      list — or the absence of one — actually on screen.

      No action button. The IA makes an empty state's way out mandatory (§8.1) and here it is the
      search field, which is directly above this and holds the query being complained about; a retry
      would re-ask a question that has already been answered, and a link home would leave the screen
      rather than fix the search.
    */
    return <EmptyState messageKey="search.noResults" messageParams={{ query: results.query }} />;
  }

  return (
    <>
      <ol className="search-results__list" data-testid="search-hits">
        {results.items.map((hit) => (
          <SearchHitRow hit={hit} key={hit.dramaId} />
        ))}
      </ol>
      {/*
        There is no cursor and no "load more", because relevance order is not a keyset: paging a
        ranking needs a snapshot of that ranking to mean anything. `truncated` is the honest answer
        available without one, and the move it asks for — narrow the query — is also the better
        search.
      */}
      {results.truncated ? (
        <p className="search-results__truncated" data-testid="search-truncated">
          {translate('search.truncated', undefined, { n: results.items.length })}
        </p>
      ) : null}
    </>
  );
}
