import { Link } from 'react-router';
import type { FeedCard } from '@minidrama/shared';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { FeedCardView } from '../catalog/FeedCardView';
import { splitHomeFeed } from '../catalog/home-feed';
import { ROUTES } from './routes';
import { translate } from '../core/i18n';
import { useCatalogApi } from '../data/catalog-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import type { PagedResourceHandle } from '../data/use-paged-resource';

/**
 * SCR-02, the recommendation feed. The consumption entry point and the first screen after boot.
 *
 * It implements the five states of `docs/02-information-architecture.md` §8.1 in the shapes SCR-02
 * asks for, and one thing the state matrix does not: a terminal variant. The matrix gives the feed
 * a retryable error and no terminal one, on the reasoning that the feed always has a popularity
 * fallback and therefore always has an answer. If the server nonetheless returns `410` or a refused
 * request, a retry button is a lie, so the honest state is rendered instead of the documented one.
 *
 * Paging is a button rather than an intersection observer. Both are legitimate; a button is
 * assertable without faking a scroll viewport, and infinite scroll on top of a feed cursor that is
 * only stable while the ranking is (`docs/handoff/w2-work-d.md` §5) would page through a shifting
 * list automatically instead of on request.
 *
 * Continue-watching is a rail projected from the same mix. The server already leads HOME with
 * `CONTINUE_WATCHING` when heartbeats exist (`docs/handoff/w14-c4-after-seek.md`). Fetching history
 * or inventing a resume from the catalogue would be a second list, and an anonymous or empty
 * response would then disagree with the mix the feed already returned.
 */

/** Stable by construction — a new identity each render would reload the feed each render. */
function identifyCard(card: FeedCard): string {
  return card.drama.id;
}

/** The scene is the whole identity of this read: one feed, one list, no parameters of its own. */
const FEED_SCENE = 'HOME';

export function HomePage(): React.JSX.Element {
  const api = useCatalogApi();

  const loadPage = (cursor: string | undefined) =>
    api.fetchFeed({ scene: FEED_SCENE, ...(cursor === undefined ? {} : { cursor }) });

  const feed = usePagedResource(loadPage, identifyCard, `feed:${FEED_SCENE}`);

  return (
    <main className="page page--home" data-testid="home-page">
      {/*
        The only way to the theatre tab and the personal screens. There is no tab bar yet (IA §2
        gives SCR-02, SCR-03 and SCR-06 a Tab root each), and a tab bar is a chrome decision that
        belongs with a later navigation pass — but a screen nobody can reach is not a delivered
        screen. Two links, and the feed below them is untouched.
      */}
      <p className="page__nav">
        <Link className="page__nav-link" data-testid="browse-link" to={ROUTES.browse}>
          {translate('nav.browse')}
        </Link>
        <Link className="page__nav-link" data-testid="profile-link" to={ROUTES.me}>
          {translate('nav.profile')}
        </Link>
      </p>
      <h1 className="page__heading">{translate('home.heading')}</h1>
      {/*
        The only way into search. There is no tab bar yet, so without an entry here the route is
        reachable only by deep link — which is the state the 剧场 tab's hidden search entry was in
        for the whole of Wave 2 (`docs/02-information-architecture.md` §10, gap G5).
      */}
      <Link className="home__search-entry" data-testid="search-entry" to={ROUTES.search}>
        {translate('search.entry')}
      </Link>
      {renderFeed(feed)}
    </main>
  );
}

function renderFeed(feed: PagedResourceHandle<FeedCard>): React.JSX.Element {
  if (feed.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (feed.status === 'failed' && feed.error !== null) {
    return feed.error.kind === 'RETRYABLE' ? (
      <RetryableError error={feed.error} onRetry={feed.reload} />
    ) : (
      <TerminalError reason={feed.error.reason} traceId={feed.error.failure.traceId} />
    );
  }

  if (feed.items.length === 0) {
    // The server falls back to popularity when there is nothing personal to show, so an empty feed
    // means an empty catalogue. There is nowhere to send the viewer, so the action is to retry.
    return (
      <EmptyState
        messageKey="home.empty"
        action={{ kind: 'button', onAction: feed.reload, labelKey: 'state.retry' }}
      />
    );
  }

  const { continueWatching, mix } = splitHomeFeed(feed.items);

  return (
    <>
      {continueWatching.length === 0 ? null : (
        <section className="continue-rail" data-testid="continue-rail">
          <h2 className="page__subheading">{translate('home.continue')}</h2>
          <ul className="feed feed--continue" data-testid="continue-rail-list">
            {continueWatching.map((card) => (
              <FeedCardView card={card} key={card.drama.id} />
            ))}
          </ul>
        </section>
      )}
      {mix.length === 0 ? null : (
        <ul className="feed" data-testid="feed">
          {mix.map((card) => (
            <FeedCardView card={card} key={card.drama.id} />
          ))}
        </ul>
      )}
      {/*
        An append failure is shown under the list and never replaces it. The viewer keeps their
        position and the cards they were reading; the retry re-requests the same cursor.
      */}
      {feed.appendError === null ? null : (
        <RetryableError error={feed.appendError} onRetry={feed.loadMore} />
      )}
      {feed.nextCursor === null ? null : (
        <button
          className="feed__more"
          type="button"
          data-testid="load-more"
          onClick={feed.loadMore}
          disabled={feed.appending}
        >
          {translate(feed.appending ? 'home.loadingMore' : 'home.loadMore')}
        </button>
      )}
    </>
  );
}
