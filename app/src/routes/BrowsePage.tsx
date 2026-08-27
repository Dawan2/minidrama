import { Link, useSearchParams } from 'react-router';
import { DRAMA_CATEGORIES } from '@minidrama/shared';
import type { DramaCategory, DramaSummary } from '@minidrama/shared';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { DramaCard } from '../catalog/DramaCard';
import { ROUTES } from './routes';
import {
  browseHasFilters,
  browseRequestKey,
  browseSearchParams,
  parseBrowseQuery,
} from './browse-query';
import type { BrowseQuery, BrowseSort } from './browse-query';
import { translate } from '../core/i18n';
import { useCatalogApi } from '../data/catalog-api-context';
import { usePagedResource } from '../data/use-paged-resource';
import type { TranslationKey } from '../core/i18n';
import type { PagedResourceHandle } from '../data/use-paged-resource';

/**
 * SCR-03, the published-catalogue grid. Category, tag and sort live in the route so a back press
 * or a shared link restores the same filters (`docs/02-information-architecture.md` §5).
 *
 * Search stays off this screen. The inventory hides that entry until G5 closes, and `#/search`
 * already exists as its own route from the feed. Putting a second box here would be two ways to
 * spell one query, which is how they start disagreeing.
 *
 * There is no tag taxonomy endpoint, so a `tag=` in the URL is honoured and dismissable, and is
 * not invented from the current page. Multi-select would be a second query shape; the contract
 * publishes one `tag` string.
 */

const CATEGORY_KEYS: Readonly<Record<DramaCategory, TranslationKey>> = {
  ROMANCE: 'browse.category.ROMANCE',
  REVENGE: 'browse.category.REVENGE',
  FAMILY: 'browse.category.FAMILY',
  SUSPENSE: 'browse.category.SUSPENSE',
  COMEDY: 'browse.category.COMEDY',
  FANTASY: 'browse.category.FANTASY',
  OTHER: 'browse.category.OTHER',
};

function identifyDrama(drama: DramaSummary): string {
  return drama.id;
}

export function BrowsePage(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const query = parseBrowseQuery(params);
  const api = useCatalogApi();

  const loadPage = (cursor: string | undefined) =>
    api.fetchDramas({
      sort: query.sort,
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.tag === undefined ? {} : { tag: query.tag }),
      ...(cursor === undefined ? {} : { cursor }),
    });

  const list = usePagedResource(loadPage, identifyDrama, browseRequestKey(query));

  const write = (next: BrowseQuery): void => {
    setParams(browseSearchParams(next), { replace: true });
  };

  return (
    <main
      className="page page--browse"
      data-testid="browse-page"
      data-sort={query.sort}
      data-category={query.category ?? ''}
    >
      <p className="page__nav">
        <Link className="page__nav-link" data-testid="browse-home-link" to={ROUTES.home}>
          {translate('nav.home')}
        </Link>
        <Link className="page__nav-link" data-testid="profile-link" to={ROUTES.me}>
          {translate('nav.profile')}
        </Link>
      </p>
      <h1 className="page__heading">{translate('browse.heading')}</h1>
      <BrowseFilters query={query} onChange={write} />
      {renderList(list, query, () => write({ category: undefined, tag: undefined, sort: 'HOT' }))}
    </main>
  );
}

function BrowseFilters({
  query,
  onChange,
}: {
  readonly query: BrowseQuery;
  readonly onChange: (next: BrowseQuery) => void;
}): React.JSX.Element {
  const selectCategory = (category: DramaCategory | undefined): void => {
    onChange({ ...query, category: query.category === category ? undefined : category });
  };

  const selectSort = (sort: BrowseSort): void => {
    onChange({ ...query, sort });
  };

  return (
    <div className="browse-filters" data-testid="browse-filters">
      <div
        className="browse-filters__row"
        data-testid="browse-categories"
        role="group"
        aria-label={translate('browse.categories')}
      >
        <FilterChip
          testId="browse-category-all"
          pressed={query.category === undefined}
          onPress={() => selectCategory(undefined)}
        >
          {translate('browse.categoryAll')}
        </FilterChip>
        {DRAMA_CATEGORIES.map((category) => (
          <FilterChip
            key={category}
            testId={`browse-category-${category}`}
            pressed={query.category === category}
            onPress={() => selectCategory(category)}
          >
            {translate(CATEGORY_KEYS[category])}
          </FilterChip>
        ))}
      </div>
      <div
        className="browse-filters__row"
        data-testid="browse-sorts"
        role="group"
        aria-label={translate('browse.sorts')}
      >
        <FilterChip
          testId="browse-sort-HOT"
          pressed={query.sort === 'HOT'}
          onPress={() => selectSort('HOT')}
        >
          {translate('browse.sortHot')}
        </FilterChip>
        <FilterChip
          testId="browse-sort-NEW"
          pressed={query.sort === 'NEW'}
          onPress={() => selectSort('NEW')}
        >
          {translate('browse.sortNew')}
        </FilterChip>
      </div>
      {query.tag === undefined ? null : (
        <button
          className="browse-chip browse-chip--tag"
          type="button"
          data-testid="browse-tag"
          onClick={() => onChange({ ...query, tag: undefined })}
        >
          {translate('browse.tag', undefined, { tag: query.tag })}
        </button>
      )}
    </div>
  );
}

function FilterChip({
  pressed,
  onPress,
  testId,
  children,
}: {
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly testId: string;
  readonly children: string;
}): React.JSX.Element {
  return (
    <button
      className="browse-chip"
      type="button"
      data-testid={testId}
      aria-pressed={pressed}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

function renderList(
  list: PagedResourceHandle<DramaSummary>,
  query: BrowseQuery,
  clearFilters: () => void,
): React.JSX.Element {
  if (list.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  if (list.status === 'failed' && list.error !== null) {
    return list.error.kind === 'RETRYABLE' ? (
      <RetryableError error={list.error} onRetry={list.reload} />
    ) : (
      <TerminalError reason={list.error.reason} traceId={list.error.failure.traceId} />
    );
  }

  if (list.items.length === 0) {
    return browseHasFilters(query) ? (
      <EmptyState
        messageKey="browse.emptyFiltered"
        action={{ kind: 'button', onAction: clearFilters, labelKey: 'browse.clearFilters' }}
      />
    ) : (
      <EmptyState
        messageKey="browse.empty"
        action={{ kind: 'button', onAction: list.reload, labelKey: 'state.retry' }}
      />
    );
  }

  return (
    <>
      <ul className="feed" data-testid="browse-list">
        {list.items.map((drama) => (
          <DramaCard drama={drama} key={drama.id} />
        ))}
      </ul>
      {list.appendError === null ? null : (
        <RetryableError error={list.appendError} onRetry={list.loadMore} />
      )}
      {list.nextCursor === null ? null : (
        <button
          className="feed__more"
          type="button"
          data-testid="load-more"
          onClick={list.loadMore}
          disabled={list.appending}
        >
          {translate(list.appending ? 'home.loadingMore' : 'home.loadMore')}
        </button>
      )}
    </>
  );
}
