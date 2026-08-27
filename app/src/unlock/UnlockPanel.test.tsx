import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@minidrama/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import {
  episodeItem,
  lockedEpisodeItem,
  stubCatalogApi,
  viewerAccess,
} from '../testing/catalog-fixtures';
import {
  coinOrder,
  grantedCoinOrder,
  instantPacing,
  paidCoinOrder,
  payingBridge,
  stubUnlockApi,
  unlockFailure,
} from '../testing/unlock-fixtures';
import { renderSurface } from '../testing/render';
import { UnlockPanel } from './UnlockPanel';
import { knownBalance, stubWalletApi, UNAVAILABLE_WALLET } from '../testing/wallet-fixtures';
import type { EpisodeItem } from '@minidrama/shared';
import type { PayingBridge, StubUnlockApi, StubUnlockApiScript } from '../testing/unlock-fixtures';
import type { PurchaseCapabilities } from '../catalog/access-presentation';

const BOTH: PurchaseCapabilities = { coin: true, vip: true };

interface PanelHarness {
  readonly unlockApi: StubUnlockApi;
  readonly bridge: PayingBridge;
  readonly onClose: ReturnType<typeof vi.fn>;
  readonly onEntitlementChanged: ReturnType<typeof vi.fn>;
}

function renderPanel(
  options: {
    readonly episode?: EpisodeItem;
    readonly capabilities?: PurchaseCapabilities;
    readonly script?: StubUnlockApiScript;
    readonly bridge?: PayingBridge;
    readonly polls?: number;
  } = {},
): PanelHarness {
  const unlockApi = stubUnlockApi(options.script ?? {});
  const bridge = options.bridge ?? payingBridge();
  const onClose = vi.fn();
  const onEntitlementChanged = vi.fn();

  renderSurface(
    <UnlockPanel
      bridge={bridge}
      capabilities={options.capabilities ?? BOTH}
      episode={options.episode ?? lockedEpisodeItem({ priceCoins: 30 })}
      onClose={onClose}
      onEntitlementChanged={onEntitlementChanged}
      pacing={instantPacing(options.polls ?? 1)}
    />,
    { api: stubCatalogApi(), unlockApi },
  );

  return { unlockApi, bridge, onClose, onEntitlementChanged };
}

function confirm(): void {
  fireEvent.click(screen.getByTestId('unlock-confirm'));
}

describe('the coin channel', () => {
  it('shows the price the server quoted and an action that names it', () => {
    renderPanel({ episode: lockedEpisodeItem({ priceCoins: 80 }) });

    expect(screen.getByTestId('unlock-price').textContent).toContain('80');
    expect(screen.getByTestId('unlock-confirm').textContent).toContain('80');
  });

  it('quotes a known coin balance next to the price, and never as Beans', async () => {
    renderSurface(
      <UnlockPanel
        bridge={payingBridge()}
        capabilities={BOTH}
        episode={lockedEpisodeItem({ priceCoins: 30 })}
        onClose={vi.fn()}
        onEntitlementChanged={vi.fn()}
      />,
      {
        api: stubCatalogApi(),
        walletApi: stubWalletApi({
          wallet: () => ok(knownBalance({ totalBalance: 90, coinBalance: 90, bonusBalance: 0 })),
        }),
      },
    );

    expect(await screen.findByTestId('wallet-balance')).toBeDefined();
    expect(screen.getByTestId('wallet-balance').textContent).toContain('90 coins');
    expect(screen.getByTestId('unlock-panel').textContent).not.toMatch(/beans/i);
  });

  it('omits the figure when the server exposed none, rather than inventing zero', async () => {
    renderSurface(
      <UnlockPanel
        bridge={payingBridge()}
        capabilities={BOTH}
        episode={lockedEpisodeItem({ priceCoins: 30 })}
        onClose={vi.fn()}
        onEntitlementChanged={vi.fn()}
      />,
      {
        api: stubCatalogApi(),
        walletApi: stubWalletApi({ wallet: () => ok(UNAVAILABLE_WALLET) }),
      },
    );

    expect(await screen.findByTestId('unlock-price')).toBeDefined();
    expect(screen.queryByTestId('wallet-balance')).toBeNull();
    expect(screen.getByTestId('unlock-panel').textContent).not.toMatch(/insufficient/i);
  });

  it('records the intent for the episode, with an idempotency key', async () => {
    const { unlockApi } = renderPanel({
      episode: lockedEpisodeItem({ id: 'ep_test_0004' }),
      script: { create: () => ok(coinOrder()), read: () => ok(grantedCoinOrder()) },
    });

    confirm();

    await waitFor(() => {
      expect(unlockApi.createCalls).toHaveLength(1);
    });
    expect(unlockApi.createCalls[0]?.episodeId).toBe('ep_test_0004');
    expect(unlockApi.createCalls[0]?.idempotencyKey).toBeTruthy();
  });

  it('hands the trade order to the platform and reports the grant the server confirmed', async () => {
    const { bridge, onEntitlementChanged } = renderPanel({
      script: {
        create: () => ok(coinOrder({ payment: { provider: 'TIKTOK', tradeOrderId: 'trade_7' } })),
        read: () => ok(grantedCoinOrder()),
      },
    });

    confirm();

    expect(await screen.findByTestId('unlock-success')).toBeDefined();
    expect(bridge.payCalls).toEqual(['trade_7']);
    // The list is refetched. Nothing here edits the episode it was handed.
    expect(onEntitlementChanged).toHaveBeenCalledTimes(1);
  });

  it('reports the stage it is at while the purchase is in flight', async () => {
    const unlockApi = stubUnlockApi();
    const deferred: { resolve: () => void } = { resolve: () => undefined };
    const held = new Promise<void>((resolve) => {
      deferred.resolve = resolve;
    });

    renderSurface(
      <UnlockPanel
        bridge={payingBridge()}
        capabilities={BOTH}
        episode={lockedEpisodeItem()}
        onClose={vi.fn()}
        onEntitlementChanged={vi.fn()}
        pacing={instantPacing()}
      />,
      {
        api: stubCatalogApi(),
        unlockApi: {
          ...unlockApi,
          createCoinOrder: async () => {
            await held;
            return ok(coinOrder());
          },
        },
      },
    );

    confirm();

    const progress = await screen.findByTestId('unlock-progress');
    expect(progress.textContent).toBeTruthy();
    expect(screen.queryByTestId('unlock-confirm')).toBeNull();
    deferred.resolve();
  });

  /**
   * The button is gone, not merely disabled, for as long as the purchase is in flight — so a
   * second press has nothing to land on. `use-coin-unlock.test.tsx` covers the case a disappearing
   * button cannot: two presses that both arrive before the re-render.
   */
  it('takes the purchase button away while the purchase is running', async () => {
    const { unlockApi } = renderPanel({
      script: { create: () => ok(coinOrder()), read: () => ok(grantedCoinOrder()) },
    });

    confirm();

    await screen.findByTestId('unlock-success');
    expect(screen.queryByTestId('unlock-confirm')).toBeNull();
    expect(unlockApi.createCalls).toHaveLength(1);
  });
});

/**
 * A different product on a different rail. There is no subscription order endpoint, and posting a
 * coin order for a VIP episode is a request whose only purpose is to be refused with `422` — after
 * the viewer has been told it would work.
 */
describe('the VIP channel', () => {
  /**
   * Priced, because the listing's `priceCoins` is an episode field and the access decision's is
   * not: a VIP-only episode can reach the client carrying a number. Selling against it would quote
   * a price for a product coins do not buy.
   */
  const vipEpisode = episodeItem({
    unlockPolicy: 'VIP_ONLY',
    priceCoins: 120,
    viewerAccess: viewerAccess('NEED_VIP'),
  });

  it('says what it is, and offers no coin purchase', () => {
    renderPanel({ episode: vipEpisode });

    expect(screen.getByTestId('unlock-vip')).toBeDefined();
    expect(screen.queryByTestId('unlock-confirm')).toBeNull();
    expect(screen.queryByTestId('unlock-price')).toBeNull();
  });

  it('opens no order and no payment, whatever is pressed in it', async () => {
    const { unlockApi, bridge } = renderPanel({ episode: vipEpisode });

    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button);
    }
    await Promise.resolve();

    expect(unlockApi.createCalls).toEqual([]);
    expect(bridge.payCalls).toEqual([]);
  });

  it('reads as a different panel from a coin unlock', () => {
    const { unmount } = renderSurface(
      <UnlockPanel
        bridge={payingBridge()}
        capabilities={BOTH}
        episode={vipEpisode}
        onClose={vi.fn()}
        onEntitlementChanged={vi.fn()}
      />,
      { api: stubCatalogApi() },
    );

    const vipTitle = screen.getByRole('dialog').getAttribute('data-offer');
    unmount();

    renderPanel();
    expect(screen.getByRole('dialog').getAttribute('data-offer')).not.toBe(vipTitle);
  });
});

describe('an episode that is not for sale', () => {
  const cases = [
    {
      name: 'a platform that cannot take money',
      episode: lockedEpisodeItem(),
      capabilities: { coin: false, vip: false },
      cause: 'PLATFORM_BLOCKED',
    },
    {
      name: 'a withdrawn episode that still carries a price',
      episode: episodeItem({ priceCoins: 60, viewerAccess: viewerAccess('UNAVAILABLE') }),
      capabilities: BOTH,
      cause: 'NOT_FOR_SALE',
    },
    {
      name: 'an episode the viewer can already watch',
      episode: episodeItem(),
      capabilities: BOTH,
      cause: 'ALREADY_PLAYABLE',
    },
    {
      name: 'a coin sale with no usable price',
      episode: lockedEpisodeItem({ priceCoins: null }),
      capabilities: BOTH,
      cause: 'UNPRICED',
    },
  ] as const;

  it.each(cases)('refuses to sell for $name', ({ episode, capabilities, cause }) => {
    const { unlockApi } = renderPanel({ episode, capabilities });

    expect(screen.getByRole('dialog').getAttribute('data-cause')).toBe(cause);
    expect(screen.queryByTestId('unlock-confirm')).toBeNull();
    expect(screen.queryByTestId('unlock-price')).toBeNull();
    expect(unlockApi.createCalls).toEqual([]);
  });

  /**
   * Four causes, four sentences. Merged, they become the generic apology that tells nobody
   * anything and sends the viewer to support for a problem they could have solved.
   */
  it('gives each cause its own copy', () => {
    const seen = new Set<string>();

    for (const { episode, capabilities } of cases) {
      const { unmount } = renderSurface(
        <UnlockPanel
          bridge={payingBridge()}
          capabilities={capabilities}
          episode={episode}
          onClose={vi.fn()}
          onEntitlementChanged={vi.fn()}
        />,
        { api: stubCatalogApi() },
      );
      seen.add(screen.getByTestId('unlock-unpurchasable').textContent ?? '');
      unmount();
    }

    expect(seen.size).toBe(cases.length);
  });
});

describe('what the panel says after a purchase', () => {
  /**
   * The state a successful purchase actually reaches today: the viewer was charged and the episode
   * has not opened, because writing the unlock row is a later slot's work. Rendering that as a
   * success would be a lie about the content; rendering it as an error would be a lie about the
   * money.
   */
  it('keeps "charged, not yet unlocked" apart from success and from failure', async () => {
    const { onEntitlementChanged } = renderPanel({
      script: { create: () => ok(coinOrder()), read: () => ok(paidCoinOrder()) },
    });

    confirm();

    const awaiting = await screen.findByTestId('unlock-awaiting');
    expect(awaiting.getAttribute('data-order-id')).toBeTruthy();
    expect(screen.queryByTestId('unlock-success')).toBeNull();
    expect(screen.queryByTestId('unlock-failure')).toBeNull();
    // It also offers no way into the player, because the server has not said it may.
    expect(screen.queryByTestId('unlock-play')).toBeNull();
    expect(onEntitlementChanged).not.toHaveBeenCalled();
  });

  it('treats an already-unlocked episode as a success and refetches the list', async () => {
    const { onEntitlementChanged } = renderPanel({
      script: { create: () => err(unlockFailure(409, 'UNLOCK_ALREADY_UNLOCKED')) },
    });

    confirm();

    expect(await screen.findByTestId('unlock-success')).toBeDefined();
    expect(onEntitlementChanged).toHaveBeenCalledTimes(1);
  });

  it('offers the player only once the server has said the episode was bought', async () => {
    renderPanel({
      episode: lockedEpisodeItem({ id: 'ep_test_0004' }),
      script: { create: () => ok(coinOrder()), read: () => ok(grantedCoinOrder()) },
    });

    confirm();

    const play = await screen.findByTestId('unlock-play');
    expect(play.getAttribute('href')).toBe('/play/ep_test_0004');
  });

  it('says nothing was charged when the viewer dismissed the payment sheet', async () => {
    const { onEntitlementChanged } = renderPanel({
      script: { create: () => ok(coinOrder()) },
      bridge: payingBridge({ payFails: 'BRIDGE_USER_CANCELLED' }),
    });

    confirm();

    expect(await screen.findByTestId('unlock-cancelled')).toBeDefined();
    expect(screen.getByTestId('unlock-retry')).toBeDefined();
    expect(onEntitlementChanged).not.toHaveBeenCalled();
  });
});

describe('a purchase that failed', () => {
  it('names the reason on the element and never grants anything', async () => {
    const { onEntitlementChanged } = renderPanel({
      script: { create: () => err(unlockFailure(422, 'UNLOCK_POLICY_NOT_ALLOWED')) },
    });

    confirm();

    const failure = await screen.findByTestId('unlock-failure');
    expect(failure.getAttribute('data-reason')).toBe('NOT_FOR_SALE');
    expect(failure.getAttribute('data-trace-id')).toBe('trace_0001');
    expect(onEntitlementChanged).not.toHaveBeenCalled();
  });

  /**
   * A retry that cannot succeed is the button people press until they give up on the app. A retry
   * that could take a second payment is worse, which is why every "money may have moved" outcome
   * refuses one.
   */
  it('offers no retry when a repeat cannot help or could charge twice', async () => {
    for (const [status, code] of [
      [422, 'UNLOCK_POLICY_NOT_ALLOWED'],
      [401, 'AUTH_REQUIRED'],
      [410, 'CONTENT_OFFLINE'],
    ] as const) {
      const { unmount } = renderSurface(
        <UnlockPanel
          bridge={payingBridge()}
          capabilities={BOTH}
          episode={lockedEpisodeItem()}
          onClose={vi.fn()}
          onEntitlementChanged={vi.fn()}
          pacing={instantPacing()}
        />,
        {
          api: stubCatalogApi(),
          unlockApi: stubUnlockApi({ create: () => err(unlockFailure(status, code)) }),
        },
      );

      confirm();
      await screen.findByTestId('unlock-failure');
      expect(screen.queryByTestId('unlock-retry'), code).toBeNull();
      unmount();
    }
  });

  it('offers a retry that reuses the key, so it cannot open a second payment', async () => {
    const { unlockApi } = renderPanel({
      script: {
        create: (_request, index) =>
          index === 0 ? err(unlockFailure(503, 'PAYMENT_CHANNEL_UNAVAILABLE')) : ok(coinOrder()),
        read: () => ok(grantedCoinOrder()),
      },
    });

    confirm();
    fireEvent.click(await screen.findByTestId('unlock-retry'));

    await screen.findByTestId('unlock-success');
    expect(unlockApi.createCalls).toHaveLength(2);
    expect(unlockApi.createCalls[0]?.idempotencyKey).toBe(unlockApi.createCalls[1]?.idempotencyKey);
  });

  // The one case where reusing the key cannot work, because the key is what was refused.
  it('mints a fresh key when the server refused the one it was given', async () => {
    const { unlockApi } = renderPanel({
      script: {
        create: (_request, index) =>
          index === 0 ? err(unlockFailure(409, 'COMMON_IDEMPOTENCY_CONFLICT')) : ok(coinOrder()),
        read: () => ok(grantedCoinOrder()),
      },
    });

    confirm();
    fireEvent.click(await screen.findByTestId('unlock-retry'));

    await screen.findByTestId('unlock-success');
    expect(unlockApi.createCalls[0]?.idempotencyKey).not.toBe(
      unlockApi.createCalls[1]?.idempotencyKey,
    );
  });

  it('dead-ends without a retry when the order itself is gone', async () => {
    renderPanel({
      script: {
        create: () => ok(coinOrder()),
        read: () => err(unlockFailure(404, 'PAYMENT_ORDER_NOT_FOUND')),
      },
    });

    confirm();

    const failure = await screen.findByTestId('unlock-failure');
    expect(failure.getAttribute('data-reason')).toBe('ORDER_LOST');
    expect(screen.queryByTestId('unlock-retry')).toBeNull();
  });
});

describe('getting out of the panel', () => {
  it('closes from the button, the backdrop and the escape key', () => {
    const { onClose } = renderPanel();

    fireEvent.click(screen.getByTestId('unlock-panel-close'));
    fireEvent.click(screen.getByTestId('unlock-panel-scrim'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  /**
   * Including mid-purchase. A panel that traps the viewer while it waits on a callback we do not
   * control is a mini app with no way out, and closing costs them nothing: the order is the
   * server's, and the episode list shows the result whenever it arrives.
   */
  it('closes while a purchase is still in flight', async () => {
    const { onClose } = renderPanel({
      script: { create: () => ok(coinOrder()), read: () => ok(coinOrder()) },
      polls: 6,
    });

    confirm();
    await screen.findByTestId('unlock-progress');
    fireEvent.click(screen.getByTestId('unlock-panel-close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('announces itself as a dialog', () => {
    renderPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId ?? '')?.textContent).toBeTruthy();
  });
});
