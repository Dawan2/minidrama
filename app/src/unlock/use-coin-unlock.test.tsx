import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ok } from '@minidrama/shared';

import {
  coinOrder,
  grantedCoinOrder,
  instantPacing,
  payingBridge,
  stubUnlockApi,
} from '../testing/unlock-fixtures';
import { useCoinUnlock } from './use-coin-unlock';
import type { CoinUnlockOptions } from './use-coin-unlock';

/**
 * The two things about the hook that the panel's own tests cannot reach, because both are about
 * what happens *between* renders.
 */

function Harness({
  startsPerPress = 1,
  ...options
}: CoinUnlockOptions & { readonly startsPerPress?: number }): React.JSX.Element {
  const unlock = useCoinUnlock(options);

  return (
    <button
      data-testid="go"
      data-status={unlock.state.status}
      type="button"
      onClick={() => {
        for (let i = 0; i < startsPerPress; i += 1) {
          unlock.start();
        }
      }}
    >
      {unlock.state.status}
    </button>
  );
}

/**
 * The realistic double tap: two presses that both land before React has re-rendered the button
 * away. A `disabled` attribute cannot stop this one, which is why the guard is a ref checked
 * before anything asynchronous begins — and why opening two payments is the failure it prevents.
 */
describe('one attempt at a time', () => {
  it('opens one order for two starts that land in the same tick', async () => {
    const api = stubUnlockApi({
      create: () => ok(coinOrder()),
      read: () => ok(grantedCoinOrder()),
    });

    render(
      <Harness
        api={api}
        bridge={payingBridge()}
        episodeId="ep_1"
        onEntitlementChanged={vi.fn()}
        pacing={instantPacing()}
        startsPerPress={3}
      />,
    );

    fireEvent.click(screen.getByTestId('go'));

    await waitFor(() => {
      expect(screen.getByTestId('go').getAttribute('data-status')).toBe('SETTLED');
    });
    expect(api.createCalls).toHaveLength(1);
  });
});

describe('a hook that went away mid-purchase', () => {
  /**
   * An abandoned purchase must not hold the poll loop open for the rest of its sixty-second budget,
   * calling `setState` on a component that no longer exists. The flow asks before every wait, and
   * unmounting is what makes the answer yes.
   */
  it('stops polling once it is unmounted', async () => {
    let reads = 0;
    const api = stubUnlockApi({
      create: () => ok(coinOrder()),
      read: () => {
        reads += 1;
        return ok(coinOrder());
      },
    });

    const { unmount } = render(
      <Harness
        api={api}
        bridge={payingBridge()}
        episodeId="ep_1"
        onEntitlementChanged={vi.fn()}
        pacing={instantPacing(20)}
      />,
    );

    fireEvent.click(screen.getByTestId('go'));
    unmount();

    const readsAtUnmount = reads;
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(reads - readsAtUnmount).toBeLessThan(3);
    expect(reads).toBeLessThan(20);
  });

  it('does not report an entitlement change to a surface that is gone', async () => {
    const onEntitlementChanged = vi.fn();
    const api = stubUnlockApi({
      create: () => ok(coinOrder()),
      read: () => ok(grantedCoinOrder()),
    });

    const { unmount } = render(
      <Harness
        api={api}
        bridge={payingBridge()}
        episodeId="ep_1"
        onEntitlementChanged={onEntitlementChanged}
        pacing={instantPacing()}
      />,
    );

    fireEvent.click(screen.getByTestId('go'));
    unmount();

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(onEntitlementChanged).not.toHaveBeenCalled();
  });
});
