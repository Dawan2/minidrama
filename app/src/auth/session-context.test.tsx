import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SessionProvider, useSession } from './session-context';
import { anonymousSession } from './session';
import { stubSession } from '../testing/history-fixtures';

function SessionProbe(): React.JSX.Element {
  const session = useSession();
  return <p data-testid="probe">{session.state.status}</p>;
}

describe('the session context', () => {
  it('hands the provided session to the surface below it', () => {
    render(
      <SessionProvider session={stubSession({ state: { status: 'AUTHENTICATED', openId: 'o_1' } })}>
        <SessionProbe />
      </SessionProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('AUTHENTICATED');
  });

  /**
   * No default value, deliberately. "Anonymous" is a claim about the viewer, and a claim nobody
   * supplied is a claim nobody checked — a silent default would let a screen tell every viewer they
   * are a guest because of a missing provider, which is a wiring bug that looks like a product
   * decision.
   */
  it('refuses to render without a provider rather than assuming a viewer is anonymous', () => {
    expect(() => render(<SessionProbe />)).toThrow(/SessionProvider/);
  });

  it('accepts the real boot session, not only a stub', () => {
    render(
      <SessionProvider session={anonymousSession()}>
        <SessionProbe />
      </SessionProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('ANONYMOUS');
  });
});
