import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WalletApiProvider, useWalletApi } from './wallet-api-context';
import { stubWalletApi } from '../testing/wallet-fixtures';

function WalletApiProbe(): React.JSX.Element {
  const api = useWalletApi();
  return <p data-testid="probe">{typeof api.fetchWallet}</p>;
}

describe('the wallet client context', () => {
  it('hands the provided client to the surface below it', () => {
    render(
      <WalletApiProvider api={stubWalletApi()}>
        <WalletApiProbe />
      </WalletApiProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('function');
  });

  /**
   * There is no default client. A default that answered "0 coins" is a wrong balance; a default
   * that answered UNAVAILABLE would hide a wiring bug behind the honest empty state.
   */
  it('refuses to render without a provider', () => {
    expect(() => render(<WalletApiProbe />)).toThrow(/WalletApiProvider/);
  });
});
