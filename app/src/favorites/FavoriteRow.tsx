import { useState } from 'react';
import { Link } from 'react-router';

import { CoverImage } from '../components/CoverImage';
import { SignInPrompt } from '../auth/SignInPrompt';
import { dramaPath } from '../routes/routes';
import { isRetryableAction, presentFavoriteActionFailure } from './favorite-action';
import { translate } from '../core/i18n';
import { useFavoritesApi } from '../data/favorites-api-context';
import type { FavoriteActionPresentation } from './favorite-action';
import type { FavoriteEntry } from './favorite-collection';

/**
 * One favourite: the drama, one tap to it, and the way to stop following it.
 *
 * Two decisions shape this component.
 *
 * **A removed row stays on screen, un-followed, with an undo.** The alternative — deleting the row
 * from the list — is what most lists do and it is wrong here for a specific reason: the list is
 * assembled by asking the server about twenty dramas (`favorite-collection.ts`), so a row that
 * disappears cannot be brought back without redoing that, and the viewer's own scroll position moves
 * under their finger at the moment they touched it. Keeping the row is also what makes `PUT` reachable
 * from this screen at all, which matters because re-following is the favourite request that can fail.
 *
 * **The action state is the row's own, not the list's.** A failed remove must not blank the list, and
 * a viewer un-following three dramas must not have the second attempt cancel the first. Lifting this
 * into the page would mean one failure state for twenty rows, which is exactly how "something went
 * wrong" ends up on a screen where nineteen things went right.
 *
 * The favourite timestamp is displayed nowhere. It is the list's sort key and the client has no
 * authority over the server's clock; "following since 3 August" is a claim we would be quoting.
 */

export interface FavoriteRowProps {
  readonly entry: FavoriteEntry;
}

/** Un-follow, and its inverse. Named by what the viewer asked for, not by the verb it sends. */
type RowAction = 'REMOVE' | 'RESTORE';

type RowState =
  | { readonly kind: 'FOLLOWED' }
  | { readonly kind: 'WORKING'; readonly action: RowAction }
  | { readonly kind: 'REMOVED' }
  | {
      readonly kind: 'FAILED';
      readonly action: RowAction;
      readonly presented: FavoriteActionPresentation;
    };

const FOLLOWED: RowState = { kind: 'FOLLOWED' };
const REMOVED: RowState = { kind: 'REMOVED' };

export function FavoriteRow({ entry }: FavoriteRowProps): React.JSX.Element {
  const api = useFavoritesApi();
  const [state, setState] = useState<RowState>(FOLLOWED);
  const { drama } = entry;

  const run = async (action: RowAction): Promise<void> => {
    // Guarded rather than merely disabled. A second request while the first is in flight is two
    // writes racing for one row, and the loser decides what the viewer ends up following.
    if (state.kind === 'WORKING') {
      return;
    }
    setState({ kind: 'WORKING', action });

    const result =
      action === 'REMOVE' ? await api.removeFavorite(drama.id) : await api.addFavorite(drama.id);

    if (result.ok) {
      setState(action === 'REMOVE' ? REMOVED : FOLLOWED);
      return;
    }

    setState({ kind: 'FAILED', action, presented: presentFavoriteActionFailure(result.error) });
  };

  const start = (action: RowAction): void => {
    void run(action);
  };

  return (
    <li
      className={`favorite-row${followedNow(state) ? '' : ' favorite-row--removed'}`}
      data-testid="favorite-row"
      data-drama-id={drama.id}
      data-row-state={state.kind}
      data-row-failure={state.kind === 'FAILED' ? state.presented.kind : ''}
    >
      <Link className="favorite-row__link" to={dramaPath(drama.id)}>
        <CoverImage className="favorite-row__cover" src={drama.coverUrl} alt={drama.title} />
        <div className="favorite-row__body">
          <h2 className="favorite-row__title">{drama.title}</h2>
          <p className="favorite-row__meta">
            {translate('feed.episodeCount', undefined, { n: drama.totalEpisodes })}
          </p>
        </div>
      </Link>
      <div className="favorite-row__action">{renderAction(state, drama.title, start)}</div>
    </li>
  );
}

/**
 * Whether the viewer still follows this drama, as far as the server has told us.
 *
 * A failed remove counts as followed: the request was refused, so nothing changed, and dimming the
 * row would tell the viewer an un-follow succeeded when it did not.
 */
function followedNow(state: RowState): boolean {
  if (state.kind === 'REMOVED') {
    return false;
  }
  return !(state.kind === 'FAILED' && state.action === 'RESTORE');
}

/**
 * The action area.
 *
 * Every button carries an accessible name naming the drama, while showing two words. A list of five
 * buttons all announced as "Remove" is a list a screen-reader user cannot act on: the visible label
 * is disambiguated by the row it sits in, and an accessible name is not.
 */
function renderAction(
  state: RowState,
  title: string,
  start: (action: RowAction) => void,
): React.JSX.Element {
  if (state.kind === 'WORKING') {
    return (
      <button className="favorite-row__button" type="button" disabled>
        {translate(state.action === 'REMOVE' ? 'favorites.removing' : 'favorites.restoring')}
      </button>
    );
  }

  if (state.kind === 'REMOVED') {
    return (
      <>
        <p className="favorite-row__note" data-testid="favorite-removed">
          {translate('favorites.removed')}
        </p>
        <button
          className="favorite-row__button"
          type="button"
          data-testid="favorite-undo"
          aria-label={translate('favorites.undoLabel', undefined, { title })}
          onClick={() => {
            start('RESTORE');
          }}
        >
          {translate('favorites.undo')}
        </button>
      </>
    );
  }

  if (state.kind === 'FAILED') {
    return renderFailure(state.action, state.presented, start);
  }

  return (
    <button
      className="favorite-row__button"
      type="button"
      data-testid="favorite-remove"
      aria-label={translate('favorites.removeLabel', undefined, { title })}
      onClick={() => {
        start('REMOVE');
      }}
    >
      {translate('favorites.remove')}
    </button>
  );
}

/**
 * A failed action, at the row rather than over the list.
 *
 * The `401` is a sign-in prompt and not an error, for the same reason it is on the list itself:
 * nothing failed and nothing is gone, the viewer is simply not known. `onSignedIn` re-runs the action
 * the viewer originally asked for, so a session that expired between opening the screen and pressing
 * a button costs one tap rather than a reload.
 */
function renderFailure(
  action: RowAction,
  presented: FavoriteActionPresentation,
  start: (action: RowAction) => void,
): React.JSX.Element {
  if (presented.kind === 'AUTH_REQUIRED') {
    return (
      <SignInPrompt
        messageKey="favorites.rowSignInRequired"
        testId="favorite-row-sign-in"
        onSignedIn={() => {
          start(action);
        }}
      />
    );
  }

  return (
    <>
      <p className="favorite-row__note" data-testid="favorite-row-note" role="alert">
        {translate(FAILURE_MESSAGE_KEYS[presented.kind])}
      </p>
      {isRetryableAction(presented) ? (
        <button
          className="favorite-row__button"
          type="button"
          data-testid="favorite-retry"
          onClick={() => {
            start(action);
          }}
        >
          {translate('state.retry')}
        </button>
      ) : null}
    </>
  );
}

/**
 * One sentence per reason. `GONE` and `UNAVAILABLE` say different things on purpose: one is about the
 * viewer's drama and one is about our deployment, and a viewer told "no longer available" about a
 * drama that is perfectly fine has been misinformed by our own missing feature.
 */
const FAILURE_MESSAGE_KEYS = {
  GONE: 'favorites.rowGone',
  UNAVAILABLE: 'favorites.rowUnavailable',
  ERROR: 'favorites.rowFailed',
} as const;
