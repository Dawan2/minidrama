import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FavoritesApiProvider, useFavoritesApi } from './favorites-api-context';
import { stubFavoritesApi } from '../testing/favorites-fixtures';

function FavoritesApiProbe(): React.JSX.Element {
  const api = useFavoritesApi();
  return <p data-testid="probe">{typeof api.readFavorite}</p>;
}

describe('the favourites client context', () => {
  it('hands the provided client to the surface below it', () => {
    render(
      <FavoritesApiProvider api={stubFavoritesApi()}>
        <FavoritesApiProbe />
      </FavoritesApiProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('function');
  });

  /**
   * There is no default client, and the reason is sharper here than for the other contexts: a
   * default that answered "you follow nothing" is indistinguishable from a correct empty list, on
   * the one screen whose whole job is to keep an empty list apart from a list we could not read.
   */
  it('refuses to render without a provider', () => {
    expect(() => render(<FavoritesApiProbe />)).toThrow(/FavoritesApiProvider/);
  });
});
