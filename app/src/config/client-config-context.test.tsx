import { describe, expect, it } from 'vitest';
import { CONSERVATIVE_CLIENT_CONFIG } from '@minidrama/shared';
import { render, screen } from '@testing-library/react';

import { ClientConfigProvider, useClientConfig } from './client-config-context';

function ConfigProbe(): React.JSX.Element {
  const config = useClientConfig();
  return (
    <p data-testid="probe" data-comments={String(config.features.comments)}>
      {String(config.playback.progressHeartbeatSec)}
    </p>
  );
}

describe('the boot-config snapshot', () => {
  it('hands the provided flags to the surface below it', () => {
    render(
      <ClientConfigProvider config={CONSERVATIVE_CLIENT_CONFIG}>
        <ConfigProbe />
      </ClientConfigProvider>,
    );

    expect(screen.getByTestId('probe').getAttribute('data-comments')).toBe('false');
    expect(screen.getByTestId('probe').textContent).toBe('10');
  });

  it('refuses to render without a provider', () => {
    expect(() => render(<ConfigProbe />)).toThrow(/ClientConfigProvider/);
  });
});
