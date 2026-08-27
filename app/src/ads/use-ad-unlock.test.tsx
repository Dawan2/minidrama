import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ok } from '@minidrama/shared';

import { adGrant, adSession, payingBridge, stubUnlockApi } from '../testing/unlock-fixtures';
import { useAdUnlock } from './use-ad-unlock';
import type { AdUnlockOptions } from './use-ad-unlock';

function Harness({
  startsPerPress = 1,
  ...options
}: AdUnlockOptions & { readonly startsPerPress?: number }): React.JSX.Element {
  const unlock = useAdUnlock(options);

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

describe('one ad attempt at a time', () => {
  it('opens one session for two starts that land in the same tick', async () => {
    const api = stubUnlockApi({
      createAdSession: () => ok(adSession()),
      grantAdUnlock: () => ok(adGrant()),
    });

    render(
      <Harness
        api={api}
        bridge={payingBridge()}
        episodeId="ep_1"
        adUnitId="test-rewarded-unit"
        onEntitlementChanged={vi.fn()}
        startsPerPress={3}
      />,
    );

    fireEvent.click(screen.getByTestId('go'));

    await waitFor(() => {
      expect(screen.getByTestId('go').getAttribute('data-status')).toBe('SETTLED');
    });
    expect(api.adSessionCalls).toHaveLength(1);
  });
});

describe('a hook that went away mid-showing', () => {
  it('does not report a grant after it is unmounted', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onEntitlementChanged = vi.fn();
    const api = stubUnlockApi({
      createAdSession: async () => {
        await held;
        return ok(adSession());
      },
      grantAdUnlock: () => ok(adGrant()),
    });

    const { unmount } = render(
      <Harness
        api={api}
        bridge={payingBridge()}
        episodeId="ep_1"
        adUnitId="test-rewarded-unit"
        onEntitlementChanged={onEntitlementChanged}
      />,
    );

    fireEvent.click(screen.getByTestId('go'));
    unmount();
    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(onEntitlementChanged).not.toHaveBeenCalled();
  });
});
