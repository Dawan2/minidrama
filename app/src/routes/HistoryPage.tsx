import { Link } from 'react-router';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { HistoryRow } from '../history/HistoryRow';
import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { presentHistoryFailure } from '../history/history-presentation';
import { translate } from '../core/i18n';
import { useHistoryApi } from '../data/history-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import type { PagedResourceHandle } from '../data/use-paged-resource';
import type { WatchHistoryEntry } from '../data/history-api';

/**
 * SCR-07, the history / continue-watching screen.
 *
 * The five states of `docs/02-information-architecture.md` §8.1, plus the one this screen is the
 * first in the client to need: **no session**. The screen inventory marks SCR-07 as not
 * anonymous-accessible and resolves it by silent login before the list is shown
 * (`docs/02-screen-inventory.md` §1, IA §5), so a `401` is not an error and not an empty list — it
 * is a fourth answer with its own recovery. `presentHistoryFailure` holds that decision; this file
 * only renders it.
 *
 * The screen requests unconditionally, even when the session state says the viewer is anonymous.
 * That is deliberate: the session state decides what the profile screen *says*, and the server
 * decides what the viewer may *see*. Skipping the request on a client-side guess would make the
 * client the authority on identity, and it would also mean a viewer whose session exists but whose
 * client-side state is stale is shown a sign-in prompt over a history the server would have
 * returned.
 */

/** History is one entry per drama (`docs/12-domain-model.md` §7.2), so the drama id identifies it. */
function identifyEntry(entry: WatchHistoryEntry): string {
  return entry.drama.id;
}

export function HistoryPage(): React.JSX.Element {
  const api = useHistoryApi();

  const history = usePagedResource(
    (cursor: string | undefined) => api.fetchWatchHistory(cursor === undefined ? {} : { cursor }),
    identifyEntry,
    'watch-history',
  );

  return (
    <main className="page page--history" data-testid="history-page" data-state={stateOf(history)}>
      <Link className="page__back" to={ROUTES.me}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('history.heading')}</h1>
      {renderHistory(history)}
    </main>
  );
}

/**
 * The state, as an attribute, so the three ways this screen can show nothing stay distinguishable
 * from the outside. The viewer sees the same empty state for `UNAVAILABLE` and for an empty list —
 * that is the intended degradation — and a test, a bug report or a future analytics event can still
 * tell "we have not built this" from "you have watched nothing".
 */
function stateOf(history: PagedResourceHandle<WatchHistoryEntry>): string {
  if (history.status === 'loading') {
    return 'loading';
  }
  if (history.status === 'failed' && history.error !== null) {
    return presentHistoryFailure(history.error.failure).kind.toLowerCase();
  }
  return history.items.length === 0 ? 'empty' : 'ready';
}

function renderHistory(history: PagedResourceHandle<WatchHistoryEntry>): React.JSX.Element {
  if (history.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (history.status === 'failed' && history.error !== null) {
    const presented = presentHistoryFailure(history.error.failure);

    if (presented.kind === 'AUTH_REQUIRED') {
      return (
        <SignInPrompt
          messageKey="history.signInRequired"
          onSignedIn={history.reload}
          testId="history-sign-in"
        />
      );
    }

    if (presented.kind === 'ERROR') {
      return presented.error.kind === 'RETRYABLE' ? (
        <RetryableError error={presented.error} onRetry={history.reload} />
      ) : (
        // The shared terminal copy is about a drama. On this screen the missing thing is the
        // viewer's own list, so the message is overridden and the reason is kept for the attribute.
        <TerminalError
          reason={presented.error.reason}
          messageKey="history.unavailable"
          traceId={presented.error.failure.traceId}
        />
      );
    }

    // UNAVAILABLE: the endpoint is not deployed. Rendered as the empty state on purpose — there is
    // no history, and an error screen would ask the viewer to fix our missing feature.
    return emptyState();
  }

  if (history.items.length === 0) {
    return emptyState();
  }

  return (
    <>
      <ul className="history" data-testid="history-list">
        {history.items.map((entry) => (
          <HistoryRow entry={entry} key={entry.drama.id} />
        ))}
      </ul>
      {history.appendError === null ? null : renderAppendFailure(history)}
      {history.nextCursor === null ? null : (
        <button
          className="feed__more"
          type="button"
          data-testid="load-more-history"
          onClick={history.loadMore}
          disabled={history.appending}
        >
          {translate(history.appending ? 'home.loadingMore' : 'home.loadMore')}
        </button>
      )}
    </>
  );
}

/**
 * A failure while appending, rendered under the list and never over it: once there is content on
 * screen, replacing it because page three failed costs the viewer their place to tell them
 * something they can see (`docs/handoff/w2-work-h.md` decision H9).
 *
 * The `401` mapping holds here too. A session that expires mid-scroll is the same fact as one that
 * was missing at the first page, and the recovery is the same — so it is a sign-in prompt under the
 * rows, not a retry button that cannot succeed.
 */
function renderAppendFailure(
  history: PagedResourceHandle<WatchHistoryEntry>,
): React.JSX.Element | null {
  if (history.appendError === null) {
    return null;
  }

  const presented = presentHistoryFailure(history.appendError.failure);
  return presented.kind === 'AUTH_REQUIRED' ? (
    <SignInPrompt
      messageKey="history.signInRequired"
      onSignedIn={history.loadMore}
      testId="history-sign-in-more"
    />
  ) : (
    <RetryableError error={history.appendError} onRetry={history.loadMore} />
  );
}

/** The way out of an empty history is content, so the action is the feed (`J8`). */
function emptyState(): React.JSX.Element {
  return (
    <EmptyState
      messageKey="history.empty"
      action={{ kind: 'link', to: ROUTES.home, labelKey: 'history.browse' }}
    />
  );
}
