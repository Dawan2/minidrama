import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WalletBalance } from './WalletBalance';
import { knownBalance, UNAVAILABLE_WALLET } from '../testing/wallet-fixtures';

describe('the balance figure', () => {
  it('quotes a number the server sent, in coins', () => {
    render(<WalletBalance balance={knownBalance({ totalBalance: 40 })} />);

    expect(screen.getByTestId('wallet-balance').textContent).toContain('40 coins');
    expect(screen.getByTestId('wallet-balance').getAttribute('data-kind')).toBe('KNOWN');
  });

  it('quotes a zero the server sent, because that is an empty wallet rather than a missing one', () => {
    render(
      <WalletBalance
        balance={knownBalance({ totalBalance: 0, coinBalance: 0, bonusBalance: 0 })}
      />,
    );

    expect(screen.getByTestId('wallet-balance').textContent).toContain('0 coins');
  });

  it('says the figure is unavailable rather than substituting zero', () => {
    render(<WalletBalance balance={UNAVAILABLE_WALLET} />);

    const card = screen.getByTestId('wallet-balance-unavailable');
    expect(card.textContent).toContain('Balance is not available yet');
    expect(card.textContent).not.toMatch(/\d/);
    expect(card.textContent).not.toMatch(/beans/i);
    expect(screen.queryByTestId('wallet-balance')).toBeNull();
  });

  it('splits paid and bonus only when both arrived', () => {
    render(
      <WalletBalance
        balance={knownBalance({ coinBalance: 80, bonusBalance: 20, totalBalance: 100 })}
      />,
    );

    expect(screen.getByTestId('wallet-balance-split').textContent).toContain('80');
    expect(screen.getByTestId('wallet-balance-split').textContent).toContain('20');
  });

  it('does not invent a split from a lone total', () => {
    render(
      <WalletBalance
        balance={knownBalance({ totalBalance: 40, coinBalance: null, bonusBalance: null })}
      />,
    );

    expect(screen.queryByTestId('wallet-balance-split')).toBeNull();
  });

  it('raises the pending-credit banner only when asked', () => {
    const { rerender } = render(<WalletBalance balance={knownBalance()} />);
    expect(screen.queryByTestId('wallet-pending')).toBeNull();

    rerender(<WalletBalance balance={knownBalance()} pendingCredit />);
    expect(screen.getByTestId('wallet-pending').textContent).toContain('still confirming');
  });
});
