import { translate } from '../core/i18n';
import type { CoinBalance } from '../data/wallet-api';

/**
 * The balance figure, as a surface is allowed to render it.
 *
 * The only number that may appear is one the server sent (`CoinBalance.kind === 'KNOWN'`).
 * Everything else is a statement that we do not have a figure — never `0`, never a Beans amount,
 * never a rate. Shared by the wallet screen, the profile card and the unlock panel so those three
 * cannot drift into three different lies.
 */

export function balanceTestId(balance: CoinBalance): string {
  return balance.kind === 'KNOWN' ? 'wallet-balance' : 'wallet-balance-unavailable';
}

export function balanceCopy(balance: CoinBalance): string {
  if (balance.kind === 'UNAVAILABLE') {
    return translate('wallet.balanceUnavailable');
  }
  return translate('wallet.balance', undefined, { n: balance.totalBalance });
}

export function WalletBalance({
  balance,
  pendingCredit,
}: {
  readonly balance: CoinBalance;
  readonly pendingCredit?: boolean;
}): React.JSX.Element {
  return (
    <section
      className="wallet-balance"
      data-testid={balanceTestId(balance)}
      data-kind={balance.kind}
      data-pending={pendingCredit === true && balance.kind === 'KNOWN' ? 'true' : 'false'}
    >
      {pendingCredit === true && balance.kind === 'KNOWN' ? (
        <p className="wallet-balance__pending" data-testid="wallet-pending" role="status">
          {translate('wallet.pendingCredit')}
        </p>
      ) : null}
      <p className="wallet-balance__figure">{balanceCopy(balance)}</p>
      {balance.kind === 'KNOWN' && balance.coinBalance !== null && balance.bonusBalance !== null ? (
        <p className="wallet-balance__split" data-testid="wallet-balance-split">
          {translate('wallet.balanceSplit', undefined, {
            paid: balance.coinBalance,
            bonus: balance.bonusBalance,
          })}
        </p>
      ) : null}
    </section>
  );
}
