import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { SearchHitRow } from './SearchHitRow';
import { renderSurface } from '../testing/render';
import { searchHit } from '../testing/search-fixtures';

function renderRow(hit = searchHit()) {
  return renderSurface(
    <ol>
      <SearchHitRow hit={hit} />
    </ol>,
  );
}

describe('a search result', () => {
  it('is a title, its tags and a link to the drama', () => {
    renderRow(
      searchHit({ dramaId: 'drm_7', title: 'Twin Moons', tags: ['revenge', 'time-travel'] }),
    );

    const row = screen.getByTestId('search-hit');
    expect(row.getAttribute('data-drama-id')).toBe('drm_7');
    expect(screen.getByText('Twin Moons')).toBeDefined();
    expect(screen.getByText('revenge')).toBeDefined();
    expect(screen.getByText('time-travel')).toBeDefined();
    expect(row.querySelector('a')?.getAttribute('href')).toBe('/drama/drm_7');
  });

  // An id reaches the client from the wire and is untrusted. Interpolated raw, a slash in one
  // addresses a different route entirely.
  it('escapes an identifier that would otherwise change the destination', () => {
    renderRow(searchHit({ dramaId: 'drm/1#x' }));
    expect(screen.getByTestId('search-hit').querySelector('a')?.getAttribute('href')).toBe(
      '/drama/drm%2F1%23x',
    );
  });

  /**
   * The label answers "why is this in my results" for the row whose title looks nothing like what
   * was typed. On a title match the answer is already on screen, so labelling it would be noise on
   * every row.
   */
  it('labels a tag match and leaves a title match unlabelled', () => {
    const { unmount } = renderRow(searchHit({ matchedOn: 'TAG' }));
    expect(screen.getByTestId('search-hit-matched')).toBeDefined();
    unmount();

    renderRow(searchHit({ matchedOn: 'TITLE' }));
    expect(screen.queryByTestId('search-hit-matched')).toBeNull();
  });

  /**
   * The contract publishes two tiers and the ranking already distinguishes four, so a tier this
   * build does not know will arrive. It reaches the row as `null`: the label is dropped, and the
   * row — which the viewer asked for — is not.
   */
  it('renders a hit whose match tier this build does not recognise', () => {
    renderRow(searchHit({ matchedOn: null, title: 'Unknown Tier' }));

    expect(screen.getByText('Unknown Tier')).toBeDefined();
    expect(screen.queryByTestId('search-hit-matched')).toBeNull();
    expect(screen.getByTestId('search-hit').getAttribute('data-matched-on')).toBe('');
  });

  it('renders a drama that carries no tags', () => {
    renderRow(searchHit({ tags: [], title: 'Untagged' }));
    expect(screen.getByText('Untagged')).toBeDefined();
  });

  /**
   * A hit deliberately carries no cover art: it holds what search itself knows, and a second
   * partial copy of `DramaSummary` is how two shapes of one drama start disagreeing. Nothing here
   * should be inventing one.
   */
  it('renders no image, because a hit carries no cover', () => {
    renderRow();
    expect(screen.getByTestId('search-hit').querySelector('img')).toBeNull();
  });
});
