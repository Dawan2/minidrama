import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { MockBridge } from './platform/mock-bridge';
import { MockVePlayer } from './player/mock-veplayer';

beforeEach(() => {
  MockVePlayer.reset();
});

function renderAt(path: string) {
  const bridge = new MockBridge();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App bridge={bridge} />
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  it('redirects the root to home', async () => {
    renderAt('/');
    expect(await screen.findByTestId('home-page')).toBeDefined();
  });

  it('renders the player route', async () => {
    renderAt('/play/ep_demo_0001');
    expect(await screen.findByTestId('play-page')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId('player-surface')).toBeDefined();
    });
  });

  // A static ZIP cannot 404 gracefully, so an unknown path must land somewhere with a way out.
  it('sends an unknown route to the fallback screen', async () => {
    renderAt('/not-a-real-route');
    expect(await screen.findByTestId('fallback-page')).toBeDefined();
  });
});
