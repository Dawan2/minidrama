import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BridgeProvider, useBridge } from './bridge-context';
import { MockBridge } from './mock-bridge';

function BridgeProbe(): React.JSX.Element {
  const bridge = useBridge();
  return <p data-testid="probe">{bridge.kind}</p>;
}

describe('the bridge context', () => {
  it('hands the provided bridge to the surface below it', () => {
    render(
      <BridgeProvider bridge={new MockBridge()}>
        <BridgeProbe />
      </BridgeProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('mock');
  });

  it('refuses to render without a provider rather than assuming a mock', () => {
    expect(() => render(<BridgeProbe />)).toThrow(/BridgeProvider/);
  });
});
