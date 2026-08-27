import { Link } from 'react-router';

import { EmptyState, RetryableError, Skeleton, TerminalError } from '../components/states';
import { ROUTES } from './routes';
import { SignInPrompt } from '../auth/SignInPrompt';
import { WalletBalance } from '../wallet/WalletBalance';
import { presentSessionReadFailure } from '../data/session-read';
import { translate } from '../core/i18n';
import { usePagedResource } from '../data/use-paged-resource';
import { useResource } from '../data/use-resource';
import { useWalletApi } from '../data/wallet-api-context';
import type { CoinBalance, WalletTransaction } from '../data/wallet-api';
import type { ApiFailure } from '../data/failure';
import type { PagedResourceHandle } from '../data/use-paged-resource';
import type { ResourceHandle } from '../data/use-resource';
import type { SessionReadPresentation } from '../data/session-read';
import type { TranslationKey } from '../core/i18n';

/**
 * SCR-09, the wallet screen.
 *
 * The five states of `docs/02-information-architecture.md` §8.1, plus the two this screen is
 * about: **no session** and **no figure**. The second is not an error. `GET /v1/wallet` is not
 * served today, and a missing coin balance is `UNAVAILABLE` rather than `0` — a viewer who has
 * recharged and sees an invented zero will not believe the next number
 * (`docs/plan/cycle-3-backlog.md` C3-04). The empty ledger is a required state, not an edge case
 * (`docs/02-screen-inventory.md` SCR-09).
 *
 * Two reads, two independent sections. A failed ledger leaves the balance card where it is, and a
 * missing balance still shows the ledger: the alternative is throwing away a successfully loaded
 * half to report that the other is late. A `401` on either is the whole screen, because a wallet
 * without a session is not a wallet.
 *
 * Recharge (SCR-10) stays off this route. The amounts are `C3-09` and the `pay()` call is gated;
 * a `#/recharge` that invented a Beans price would be a commercial decision in a front-end file.
 * The entry is present and says so.
 */

const TRANSACTION_TYPE_KEYS: Readonly<Record<WalletTransaction['type'], TranslationKey>> = {
  RECHARGE: 'wallet.txRecharge',
  CONSUME: 'wallet.txConsume',
  REWARD: 'wallet.txReward',
  REFUND: 'wallet.txRefund',
};

function identifyTransaction(row: WalletTransaction): string {
  return row.id;
}

export function WalletPage(): React.JSX.Element {
  const api = useWalletApi();

  const wallet = useResource(() => api.fetchWallet(), 'wallet');
  const ledger = usePagedResource(
    (cursor: string | undefined) => api.fetchTransactions(cursor === undefined ? {} : { cursor }),
    identifyTransaction,
    'wallet-transactions',
  );

  return (
    <main
      className="page page--wallet"
      data-testid="wallet-page"
      data-state={stateOf(wallet, ledger)}
    >
      <Link className="page__back" to={ROUTES.me}>
        {translate('drama.back')}
      </Link>
      <h1 className="page__heading">{translate('wallet.heading')}</h1>
      {renderWallet(wallet, ledger)}
    </main>
  );
}

function stateOf(
  wallet: ResourceHandle<CoinBalance>,
  ledger: PagedResourceHandle<WalletTransaction>,
): string {
  const auth = authFailure(wallet, ledger);
  if (auth !== null) {
    return 'auth_required';
  }
  if (wallet.resource.status === 'loading' && ledger.status === 'loading') {
    return 'loading';
  }
  if (isSectionError(wallet, ledger)) {
    return 'failed';
  }
  if (ledger.status === 'ready' && ledger.items.length > 0) {
    return 'ready';
  }
  if (wallet.resource.status === 'ready' && wallet.resource.data.kind === 'KNOWN') {
    return 'empty';
  }
  return 'unavailable';
}

function authFailure(
  wallet: ResourceHandle<CoinBalance>,
  ledger: PagedResourceHandle<WalletTransaction>,
): Extract<SessionReadPresentation, { kind: 'AUTH_REQUIRED' }> | null {
  for (const failure of sectionFailures(wallet, ledger)) {
    const presented = presentSessionReadFailure(failure);
    if (presented.kind === 'AUTH_REQUIRED') {
      return presented;
    }
  }
  return null;
}

function isSectionError(
  wallet: ResourceHandle<CoinBalance>,
  ledger: PagedResourceHandle<WalletTransaction>,
): boolean {
  if (wallet.resource.status === 'failed') {
    const presented = presentSessionReadFailure(wallet.resource.error.failure);
    if (presented.kind === 'ERROR') {
      return true;
    }
  }
  if (ledger.status === 'failed' && ledger.error !== null) {
    const presented = presentSessionReadFailure(ledger.error.failure);
    if (presented.kind === 'ERROR') {
      return true;
    }
  }
  return false;
}

function sectionFailures(
  wallet: ResourceHandle<CoinBalance>,
  ledger: PagedResourceHandle<WalletTransaction>,
): readonly ApiFailure[] {
  const failures: ApiFailure[] = [];
  if (wallet.resource.status === 'failed') {
    failures.push(wallet.resource.error.failure);
  }
  if (ledger.status === 'failed' && ledger.error !== null) {
    failures.push(ledger.error.failure);
  }
  return failures;
}

function renderWallet(
  wallet: ResourceHandle<CoinBalance>,
  ledger: PagedResourceHandle<WalletTransaction>,
): React.JSX.Element {
  const auth = authFailure(wallet, ledger);
  if (auth !== null) {
    return (
      <SignInPrompt
        messageKey="wallet.signInRequired"
        onSignedIn={() => {
          wallet.reload();
          ledger.reload();
        }}
        testId="wallet-sign-in"
      />
    );
  }

  if (wallet.resource.status === 'loading' && ledger.status === 'loading') {
    return <Skeleton rows={4} />;
  }

  return (
    <>
      {renderBalanceSection(wallet)}
      {renderLedgerSection(ledger)}
      <p className="wallet-recharge" data-testid="wallet-recharge">
        <button className="wallet-recharge__action" type="button" disabled>
          {translate('wallet.recharge')}
        </button>
        <span className="wallet-recharge__hint">{translate('wallet.rechargeUnavailable')}</span>
      </p>
    </>
  );
}

function renderBalanceSection(wallet: ResourceHandle<CoinBalance>): React.JSX.Element {
  if (wallet.resource.status === 'loading') {
    return <Skeleton rows={1} />;
  }

  if (wallet.resource.status === 'failed') {
    const presented = presentSessionReadFailure(wallet.resource.error.failure);
    if (presented.kind === 'UNAVAILABLE') {
      return <WalletBalance balance={{ kind: 'UNAVAILABLE' }} />;
    }
    if (presented.kind === 'ERROR') {
      return presented.error.kind === 'RETRYABLE' ? (
        <RetryableError error={presented.error} onRetry={wallet.reload} />
      ) : (
        <TerminalError
          reason={presented.error.reason}
          messageKey="wallet.unavailable"
          traceId={presented.error.failure.traceId}
        />
      );
    }
  }

  if (wallet.resource.status === 'ready') {
    return (
      <WalletBalance
        balance={wallet.resource.data}
        pendingCredit={wallet.resource.data.kind === 'KNOWN' && wallet.resource.data.pendingCredit}
      />
    );
  }

  return <WalletBalance balance={{ kind: 'UNAVAILABLE' }} />;
}

function renderLedgerSection(ledger: PagedResourceHandle<WalletTransaction>): React.JSX.Element {
  if (ledger.status === 'loading') {
    return <Skeleton rows={3} />;
  }

  if (ledger.status === 'failed' && ledger.error !== null) {
    const presented = presentSessionReadFailure(ledger.error.failure);
    if (presented.kind === 'UNAVAILABLE') {
      return emptyLedger();
    }
    if (presented.kind === 'ERROR') {
      return presented.error.kind === 'RETRYABLE' ? (
        <RetryableError error={presented.error} onRetry={ledger.reload} />
      ) : (
        <TerminalError
          reason={presented.error.reason}
          messageKey="wallet.ledgerUnavailable"
          traceId={presented.error.failure.traceId}
        />
      );
    }
  }

  if (ledger.items.length === 0) {
    return emptyLedger();
  }

  return (
    <>
      <ul className="wallet-ledger" data-testid="wallet-ledger">
        {ledger.items.map((row) => (
          <LedgerRow row={row} key={row.id} />
        ))}
      </ul>
      {ledger.appendError === null ? null : renderAppendFailure(ledger)}
      {ledger.nextCursor === null ? null : (
        <button
          className="feed__more"
          type="button"
          data-testid="load-more-wallet"
          onClick={ledger.loadMore}
          disabled={ledger.appending}
        >
          {translate(ledger.appending ? 'home.loadingMore' : 'home.loadMore')}
        </button>
      )}
    </>
  );
}

function renderAppendFailure(
  ledger: PagedResourceHandle<WalletTransaction>,
): React.JSX.Element | null {
  if (ledger.appendError === null) {
    return null;
  }
  const presented = presentSessionReadFailure(ledger.appendError.failure);
  return presented.kind === 'AUTH_REQUIRED' ? (
    <SignInPrompt
      messageKey="wallet.signInRequired"
      onSignedIn={ledger.loadMore}
      testId="wallet-sign-in-more"
    />
  ) : (
    <RetryableError error={ledger.appendError} onRetry={ledger.loadMore} />
  );
}

function emptyLedger(): React.JSX.Element {
  return <EmptyState messageKey="wallet.ledgerEmpty" />;
}

function LedgerRow({ row }: { readonly row: WalletTransaction }): React.JSX.Element {
  const movement = ledgerMovement(row);
  return (
    <li className="wallet-ledger__row" data-testid="wallet-ledger-row" data-type={row.type}>
      <span className="wallet-ledger__type">{translate(TRANSACTION_TYPE_KEYS[row.type])}</span>
      {movement === null ? (
        <span className="wallet-ledger__amount wallet-ledger__amount--unknown">
          {translate('wallet.txAmountUnknown')}
        </span>
      ) : (
        <span className="wallet-ledger__amount">
          {translate(movement >= 0 ? 'wallet.txCredit' : 'wallet.txDebit', undefined, {
            n: Math.abs(movement),
          })}
        </span>
      )}
    </li>
  );
}

/**
 * The figure a row may show. Missing deltas are not a zero movement: a recharge rendered as
 * `+0 coins` because the server omitted the field is a wrong ledger line.
 */
function ledgerMovement(row: WalletTransaction): number | null {
  const parts: number[] = [];
  if (row.coinDelta !== null) {
    parts.push(row.coinDelta);
  }
  if (row.bonusDelta !== null) {
    parts.push(row.bonusDelta);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.reduce((sum, value) => sum + value, 0);
}
