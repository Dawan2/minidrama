import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import {
  episodeItem,
  lockedEpisodeItem,
  stubCatalogApi,
  viewerAccess,
} from '../testing/catalog-fixtures';
import { EpisodeRow } from './EpisodeRow';
import { renderSurface } from '../testing/render';
import type { EpisodeItem } from '@minidrama/shared';
import type { PurchaseCapabilities } from './access-presentation';

const BOTH: PurchaseCapabilities = { coin: true, vip: true };

function renderRow(
  episode: EpisodeItem,
  options: {
    readonly capabilities?: PurchaseCapabilities;
    readonly onUnlockRequested?: (episode: EpisodeItem) => void;
  } = {},
) {
  return renderSurface(
    <ul>
      <EpisodeRow
        capabilities={options.capabilities ?? BOTH}
        episode={episode}
        {...(options.onUnlockRequested === undefined
          ? {}
          : { onUnlockRequested: options.onUnlockRequested })}
      />
    </ul>,
    { api: stubCatalogApi() },
  );
}

/**
 * The seam itself. It was an unwired optional prop until this slot, and it stays optional, so both
 * halves of its contract still have to hold: live when something is behind it, and inert — visibly,
 * honestly inert — when nothing is.
 */
describe('the unlock seam on a row', () => {
  it('is live for a purchase row once a handler exists', () => {
    const onUnlockRequested = vi.fn();
    const episode = lockedEpisodeItem();
    renderRow(episode, { onUnlockRequested });

    const action = screen.getByTestId('episode-action') as HTMLButtonElement;
    expect(action.disabled).toBe(false);
    fireEvent.click(action);

    // The whole episode is handed over, not an id: the panel's offer and the row's call to action
    // are then derived from the same object and cannot disagree about what is on sale.
    expect(onUnlockRequested).toHaveBeenCalledWith(episode);
  });

  it('offers a VIP row the same seam, which is what keeps the two sales one gesture apart', () => {
    const onUnlockRequested = vi.fn();
    const episode = episodeItem({ viewerAccess: viewerAccess('NEED_VIP') });
    renderRow(episode, { onUnlockRequested });

    fireEvent.click(screen.getByTestId('episode-action'));
    expect(onUnlockRequested).toHaveBeenCalledWith(episode);
  });

  /**
   * The rows that must never start a purchase cannot, whatever is passed in. They do not render a
   * button at all, so there is nothing for a handler to be attached to — which is a stronger
   * guarantee than a handler that checks the state before acting.
   */
  it('cannot be reached from a row that must never start a purchase', () => {
    const onUnlockRequested = vi.fn();

    for (const [name, episode, capabilities] of [
      [
        'unavailable',
        episodeItem({ priceCoins: 60, viewerAccess: viewerAccess('UNAVAILABLE') }),
        BOTH,
      ],
      ['purchase blocked', lockedEpisodeItem(), { coin: false, vip: false }],
      ['playable', episodeItem(), BOTH],
    ] as const) {
      const { unmount } = renderRow(episode, { onUnlockRequested, capabilities });

      const action = screen.getByTestId('episode-action');
      expect(action.tagName, name).not.toBe('BUTTON');
      fireEvent.click(action);
      unmount();
    }

    expect(onUnlockRequested).not.toHaveBeenCalled();
  });

  /**
   * The prop is still optional, and a purchase surface with an enabled button that does nothing is
   * the worst thing it can be. Hiding the offer instead would make a locked episode
   * indistinguishable from an unavailable one, which is the distinction the row exists to draw.
   */
  it('says so, disabled, when nothing is behind it', () => {
    renderRow(lockedEpisodeItem());

    const action = screen.getByTestId('episode-action') as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    expect(action.title).toBeTruthy();
  });
});
