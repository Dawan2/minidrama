import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import type { EpisodeItem } from '@minidrama/shared';

import { describeUnlockOffer } from './unlock-offer';
import { playPath } from '../routes/routes';
import { translate } from '../core/i18n';
import { useCoinUnlock } from './use-coin-unlock';
import { useResource } from '../data/use-resource';
import { useUnlockApi } from '../data/unlock-api-context';
import { useWalletApi } from '../data/wallet-api-context';
import { WalletBalance } from '../wallet/WalletBalance';
import { watchRewardedAdUnlock } from '../ads/rewarded-unlock';
import type { CoinUnlockFailure, CoinUnlockStage, UnlockPacing } from './coin-unlock';
import type { CoinUnlockSettlement } from './use-coin-unlock';
import type { PlatformBridge } from '../platform/types';
import type { PurchaseCapabilities } from '../catalog/access-presentation';
import type { TranslationKey } from '../core/i18n';
import type { UnlockOffer, UnpurchasableCause } from './unlock-offer';
import type { AdPlacement } from '../data/unlock-api';
import type { RewardedUnlockFailure, RewardedUnlockOutcome } from '../ads/rewarded-unlock';

/**
 * PNL-02, the unlock panel, as an overlay over the episode list.
 *
 * It is the surface behind `EpisodeRow`'s `onUnlockRequested`, and it exists to do one thing
 * carefully: turn a tap on a locked episode into a *recorded intent to buy*, and then say honestly
 * what became of it. It hands over no content. The only thing that ever changes what the viewer may
 * watch is the server's `viewerAccess`, refetched afterwards.
 *
 * The panel opens for any episode whose row offered a purchase, and then splits three ways
 * (`unlock-offer.ts`), because the brief's distinction is the product:
 *
 * - **coins** gets the funnel: a price, a button, and the order/pay/confirm flow;
 * - **VIP** gets a statement and *no coin path at all*. It is a different product on a different
 *   rail, and there is no subscription order API yet, so the panel says so rather than offering a
 *   button that would be refused with `422` if it were pressed;
 * - **unpurchasable** gets four different sentences, one per cause, because "we cannot take money
 *   on this device", "this episode is withdrawn", "you can already watch it" and "the server quoted
 *   no price" ask the viewer for four different things.
 *
 * The states after a purchase starts are equally deliberate. `AWAITING_UNLOCK` — charged, not yet
 * granted — is the state a successful purchase actually reaches today, and it gets its own copy
 * that says the money moved and the episode has not opened yet. Rendering that as either a success
 * or an error would be a lie in one of the two directions that matter.
 */

const STAGE_KEYS: Readonly<Record<CoinUnlockStage, TranslationKey>> = {
  ORDERING: 'unlock.stageOrdering',
  PAYING: 'unlock.stagePaying',
  CONFIRMING: 'unlock.stageConfirming',
};

const FAILURE_KEYS: Readonly<Record<CoinUnlockFailure, TranslationKey>> = {
  NOT_FOR_SALE: 'unlock.failedNotForSale',
  SIGN_IN_REQUIRED: 'unlock.failedSignIn',
  EPISODE_GONE: 'unlock.failedEpisodeGone',
  PAYMENT_UNAVAILABLE: 'unlock.failedPaymentUnavailable',
  PAYMENT_FAILED: 'unlock.failedPaymentFailed',
  PAYMENT_NOT_CONFIRMED: 'unlock.failedNotConfirmed',
  ORDER_CONFLICT: 'unlock.failedOrderConflict',
  ORDER_LOST: 'unlock.failedOrderLost',
  UNREACHABLE: 'unlock.failedUnreachable',
  REFUSED: 'unlock.failedRefused',
};

const UNPURCHASABLE_KEYS: Readonly<Record<UnpurchasableCause, TranslationKey>> = {
  PLATFORM_BLOCKED: 'unlock.blockedPlatform',
  NOT_FOR_SALE: 'unlock.notForSale',
  ALREADY_PLAYABLE: 'unlock.alreadyPlayable',
  UNPRICED: 'unlock.unpriced',
};

const TITLE_KEYS: Readonly<Record<UnlockOffer['kind'], TranslationKey>> = {
  COINS: 'unlock.title',
  VIP: 'unlock.titleVip',
  UNPURCHASABLE: 'unlock.titleUnavailable',
};

const TITLE_ID = 'unlock-panel-title';

export interface UnlockPanelProps {
  readonly episode: EpisodeItem;
  readonly capabilities: PurchaseCapabilities;
  readonly bridge: PlatformBridge;
  readonly onClose: () => void;
  /** Refetch the episode list. Called on a grant, and on an episode the viewer already owned. */
  readonly onEntitlementChanged: () => void;
  /**
   * How long to wait for the payment callback. Injected for the same reason `sleep` is injected
   * into the HTTP client: a sixty-second budget is a value a test should be able to supply, not a
   * clock it has to fake.
   */
  readonly pacing?: UnlockPacing;
  /**
   * F-4 permitted slot. Absent means this panel is not an ad offer (drama-list unlock stays
   * coins/VIP only). Present only for 连播 (`AFTER_EPISODE`) and 切集 (`MANUAL_SKIP`).
   */
  readonly adPlacement?: AdPlacement;
}

export function UnlockPanel({
  episode,
  capabilities,
  bridge,
  onClose,
  onEntitlementChanged,
  pacing,
  adPlacement,
}: UnlockPanelProps): React.JSX.Element {
  const api = useUnlockApi();
  const offer = describeUnlockOffer(episode, capabilities);

  const unlock = useCoinUnlock({
    api,
    bridge,
    episodeId: episode.id,
    onEntitlementChanged,
    ...(pacing === undefined ? {} : { pacing }),
  });

  /**
   * Escape closes it, at every point including mid-purchase. A panel that traps the viewer while it
   * waits on a callback we do not control is a mini app with no way out, and closing costs them
   * nothing: the order lives on the server, the payment is the platform's, and the episode list
   * shows the result whenever it arrives.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const settled = unlock.state.status === 'SETTLED' ? unlock.state.outcome : null;

  return (
    <div className="unlock-panel" data-testid="unlock-panel">
      {/*
        A backdrop that dismisses. It is a button rather than a div with a handler so that it is
        reachable and announced; the sheet above it carries the dialog semantics.
      */}
      <button
        className="unlock-panel__scrim"
        data-testid="unlock-panel-scrim"
        type="button"
        aria-label={translate('unlock.close')}
        onClick={onClose}
      />
      <section
        className="unlock-panel__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        data-offer={offer.kind}
        data-cause={offer.kind === 'UNPURCHASABLE' ? offer.cause : undefined}
        data-flow={unlock.state.status}
        data-outcome={settled === null ? undefined : settled.kind}
      >
        <h2 className="unlock-panel__title" id={TITLE_ID}>
          {translate(TITLE_KEYS[offer.kind])}
        </h2>
        <p className="unlock-panel__episode">
          {translate('drama.episodeLabel', undefined, { n: episode.globalEpisodeNumber })}
        </p>

        {offer.kind === 'COINS' ? (
          <>
            <CoinChannel
              offer={offer}
              episode={episode}
              state={unlock.state.status}
              stage={unlock.state.status === 'RUNNING' ? unlock.state.stage : null}
              settled={settled}
              onStart={unlock.start}
            />
            {adPlacement !== undefined &&
            unlock.state.status === 'OFFERED' &&
            bridge.canIUse('createRewardedVideoAd') ? (
              <AdChannel
                bridge={bridge}
                episodeId={episode.id}
                placement={adPlacement}
                onEntitlementChanged={onEntitlementChanged}
              />
            ) : null}
          </>
        ) : offer.kind === 'VIP' ? (
          <VipChannel />
        ) : (
          <p className="unlock-panel__message" data-testid="unlock-unpurchasable">
            {translate(UNPURCHASABLE_KEYS[offer.cause])}
          </p>
        )}

        <button
          className="unlock-panel__close"
          data-testid="unlock-panel-close"
          type="button"
          onClick={onClose}
        >
          {translate('unlock.close')}
        </button>
      </section>
    </div>
  );
}

function CoinChannel({
  offer,
  episode,
  state,
  stage,
  settled,
  onStart,
}: {
  readonly offer: Extract<UnlockOffer, { kind: 'COINS' }>;
  readonly episode: EpisodeItem;
  readonly state: 'OFFERED' | 'RUNNING' | 'SETTLED';
  readonly stage: CoinUnlockStage | null;
  readonly settled: CoinUnlockSettlement | null;
  readonly onStart: () => void;
}): React.JSX.Element {
  if (stage !== null) {
    return (
      <p className="unlock-panel__message" data-testid="unlock-progress" role="status" aria-busy>
        {translate(STAGE_KEYS[stage])}
      </p>
    );
  }

  if (settled !== null) {
    return <Settlement episode={episode} settlement={settled} onRetry={onStart} />;
  }

  return (
    <>
      <UnlockWalletBalance />
      <p className="unlock-panel__price" data-testid="unlock-price">
        {translate('episode.price', undefined, { n: offer.priceCoins })}
      </p>
      <button
        className="unlock-panel__action"
        data-testid="unlock-confirm"
        type="button"
        disabled={state !== 'OFFERED'}
        onClick={onStart}
      >
        {translate('unlock.coinAction', undefined, { n: offer.priceCoins })}
      </button>
    </>
  );
}

const AD_FAILURE_KEYS: Readonly<Record<RewardedUnlockFailure, TranslationKey>> = {
  UNSUPPORTED: 'unlock.adUnavailable',
  UNAVAILABLE: 'unlock.adUnavailable',
  NOT_COMPLETED: 'unlock.adIncomplete',
  QUOTA: 'unlock.adQuota',
  ALREADY_UNLOCKED: 'unlock.unlocked',
  REFUSED: 'unlock.adUnavailable',
  UNREACHABLE: 'unlock.failedUnreachable',
};

function AdChannel({
  bridge,
  episodeId,
  placement,
  onEntitlementChanged,
}: {
  readonly bridge: PlatformBridge;
  readonly episodeId: string;
  readonly placement: AdPlacement;
  readonly onEntitlementChanged: () => void;
}): React.JSX.Element {
  const api = useUnlockApi();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RewardedUnlockOutcome | null>(null);

  async function start(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    const result = await watchRewardedAdUnlock({ api, bridge, episodeId, placement });
    setOutcome(result);
    setBusy(false);
    if (
      result.kind === 'UNLOCKED' ||
      (result.kind === 'FAILED' && result.reason === 'ALREADY_UNLOCKED')
    ) {
      onEntitlementChanged();
    }
  }

  if (busy) {
    return (
      <p className="unlock-panel__message" data-testid="unlock-ad-progress" role="status" aria-busy>
        {translate('unlock.adWatching')}
      </p>
    );
  }

  if (outcome !== null && outcome.kind === 'UNLOCKED') {
    return (
      <p className="unlock-panel__message" data-testid="unlock-ad-success">
        {translate('unlock.unlocked')}
      </p>
    );
  }

  if (outcome !== null && outcome.kind === 'FAILED') {
    return (
      <>
        <p
          className="unlock-panel__message"
          data-testid="unlock-ad-failure"
          data-reason={outcome.reason}
          role="alert"
        >
          {translate(AD_FAILURE_KEYS[outcome.reason])}
        </p>
        {outcome.reason === 'NOT_COMPLETED' || outcome.reason === 'UNREACHABLE' ? (
          <button
            className="unlock-panel__action"
            data-testid="unlock-ad-retry"
            type="button"
            onClick={() => {
              void start();
            }}
          >
            {translate('unlock.retry')}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <button
      className="unlock-panel__action"
      data-testid="unlock-ad-action"
      type="button"
      onClick={() => {
        void start();
      }}
    >
      {translate('unlock.adAction')}
    </button>
  );
}

/**
 * The current coin balance, when — and only when — the server sent one.
 *
 * PNL-02's spec puts the figure next to the price. `GET /v1/wallet` is not served today, and a
 * missing figure is omitted rather than shown as `0`: inventing a zero would make "insufficient
 * balance, go recharge" fire for every viewer, which is a commercial decision this panel is not
 * allowed to make. Beans never appear; the rate does not exist (`C3-09`).
 */
function UnlockWalletBalance(): React.JSX.Element | null {
  const api = useWalletApi();
  const wallet = useResource(() => api.fetchWallet(), 'unlock-wallet');

  if (wallet.resource.status !== 'ready' || wallet.resource.data.kind !== 'KNOWN') {
    return null;
  }
  return <WalletBalance balance={wallet.resource.data} />;
}

/**
 * A different sale, so a different panel body and no coin button anywhere in it. Offering one here
 * would post an order the server answers `422 UNLOCK_POLICY_NOT_ALLOWED` to — a request whose only
 * purpose is to be refused, made after the viewer has been told it would work.
 *
 * Whole-drama unlock is still without an API. Ad unlock exists as C4-08, but only from the
 * two F-4 placements PlayPage passes in — a greyed "watch an ad" on a drama-list open would
 * be the prohibited free-form offer.
 */
function VipChannel(): React.JSX.Element {
  return (
    <>
      <p className="unlock-panel__message" data-testid="unlock-vip">
        {translate('unlock.vip')}
      </p>
      <p className="unlock-panel__hint">{translate('unlock.vipPending')}</p>
    </>
  );
}

function Settlement({
  episode,
  settlement,
  onRetry,
}: {
  readonly episode: EpisodeItem;
  readonly settlement: CoinUnlockSettlement;
  readonly onRetry: () => void;
}): React.JSX.Element {
  /**
   * The two success outcomes. Both are the *server's* statement — `unlockGranted`, or a `409` that
   * says the viewer already owns the episode — and neither is treated as access here: the list has
   * been refetched and the row will render whatever `viewerAccess` now says. The link is a
   * navigation to the player, which asks for its own entitlement when it gets there.
   */
  if (settlement.kind === 'UNLOCKED' || settlement.kind === 'ALREADY_UNLOCKED') {
    return (
      <>
        <p className="unlock-panel__message" data-testid="unlock-success">
          {translate('unlock.unlocked')}
        </p>
        <Link className="unlock-panel__action" data-testid="unlock-play" to={playPath(episode.id)}>
          {translate('unlock.play')}
        </Link>
      </>
    );
  }

  // Charged, and the episode has not opened. The one state that must never read as either a
  // success or a plain failure, because the viewer's money moved and the content did not.
  if (settlement.kind === 'AWAITING_UNLOCK') {
    return (
      <p
        className="unlock-panel__message"
        data-testid="unlock-awaiting"
        data-order-id={settlement.orderId}
        role="status"
      >
        {translate('unlock.awaiting')}
      </p>
    );
  }

  if (settlement.kind === 'CANCELLED') {
    return (
      <>
        <p className="unlock-panel__message" data-testid="unlock-cancelled">
          {translate('unlock.cancelled')}
        </p>
        <button
          className="unlock-panel__action"
          data-testid="unlock-retry"
          type="button"
          onClick={onRetry}
        >
          {translate('unlock.retry')}
        </button>
      </>
    );
  }

  return (
    <>
      <p
        className="unlock-panel__message"
        data-testid="unlock-failure"
        data-reason={settlement.reason}
        data-trace-id={settlement.failure?.traceId ?? ''}
        role="alert"
      >
        {translate(FAILURE_KEYS[settlement.reason])}
      </p>
      {/*
        No retry button when the advice is `NONE`, which is every case where money may already have
        moved or where the server has already refused in a way a repeat cannot change. A retry that
        cannot succeed is the button people press until they give up on the app; a retry that can
        take a second payment is worse.
      */}
      {settlement.retry === 'NONE' ? null : (
        <button
          className="unlock-panel__action"
          data-testid="unlock-retry"
          type="button"
          onClick={onRetry}
        >
          {translate('unlock.retry')}
        </button>
      )}
    </>
  );
}
