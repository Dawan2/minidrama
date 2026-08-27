import { ok } from '@minidrama/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Chrome } from './Chrome';
import { DEFAULT_CAPSULE_INSET_PX } from './capsule-inset';
import { CHROME_NAV_BAR, IMMERSIVE_NAV_BAR } from './navigation-bar';
import { App } from '../App';
import { BridgeProvider } from '../platform/bridge-context';
import { MockBridge } from '../platform/mock-bridge';
import { dramaDetail, episodeItem, page, stubCatalogApi } from '../testing/catalog-fixtures';
import { renderSurface, settle } from '../testing/render';
import type { MenuButtonRect } from '../platform/types';
import type { PlatformBridge } from '../platform/types';

afterEach(() => {
  document.documentElement.style.removeProperty('--capsule-safe-area');
  vi.restoreAllMocks();
});

async function readyBridge(
  options: ConstructorParameters<typeof MockBridge>[0] = {},
): Promise<MockBridge> {
  const bridge = new MockBridge(options);
  await bridge.init();
  return bridge;
}

function renderChrome(bridge: PlatformBridge, path: string) {
  return renderSurface(
    <BridgeProvider bridge={bridge}>
      <Chrome>
        <div data-testid="chrome-child">child</div>
      </Chrome>
    </BridgeProvider>,
    { path },
  );
}

function renderApp(bridge: PlatformBridge, path: string) {
  const api = stubCatalogApi({
    drama: () => ok(dramaDetail()),
    episodes: () => ok(page([episodeItem()])),
  });
  return renderSurface(<App bridge={bridge} />, { api, path });
}

describe('Chrome', () => {
  it('keeps the CSS default and does not call the SDK when the capability is missing', async () => {
    const bridge = await readyBridge({
      unavailable: ['getMenuButtonBoundingClientRect', 'setNavigationBarColor'],
    });
    const rect = vi.spyOn(bridge, 'getMenuButtonRect');
    const color = vi.spyOn(bridge, 'setNavigationBarColor');

    renderChrome(bridge, '/home');

    const chrome = screen.getByTestId('chrome');
    expect(chrome.getAttribute('data-capsule')).toBe('fallback');
    expect(chrome.getAttribute('data-capsule-inset')).toBe(String(DEFAULT_CAPSULE_INSET_PX));
    expect(chrome.getAttribute('data-nav-bar')).toBe('chrome');
    expect(chrome.getAttribute('data-nav-bar-applied')).toBe('false');
    expect(rect).not.toHaveBeenCalled();
    expect(color).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--capsule-safe-area')).toBe(
      `${DEFAULT_CAPSULE_INSET_PX}px`,
    );
  });

  it('drives the CSS variable from the measured capsule, not from a guessed zero', async () => {
    const bridge = await readyBridge();
    const measured: MenuButtonRect = {
      top: 8,
      right: 300,
      bottom: 40,
      left: 200,
      width: 100,
      height: 32,
    };
    vi.spyOn(bridge, 'getMenuButtonRect').mockResolvedValue(ok(measured));
    const viewport = 375;
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(viewport);

    renderChrome(bridge, '/home');

    await waitFor(() => {
      expect(screen.getByTestId('chrome').getAttribute('data-capsule')).toBe('measured');
    });
    expect(screen.getByTestId('chrome').getAttribute('data-capsule-inset')).toBe(
      String(viewport - measured.left),
    );
    // The CSS variable is written in an effect of `inset`, so it can lag the attribute by one
    // paint. Waiting on the attribute and then reading the variable is the flake this test hit
    // under a full `pnpm verify`.
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--capsule-safe-area')).toBe(
        `${viewport - measured.left}px`,
      );
    });
  });

  it('keeps the default when the rect is unusable rather than treating it as spendable space', async () => {
    const bridge = await readyBridge();
    vi.spyOn(bridge, 'getMenuButtonRect').mockResolvedValue(
      ok({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }),
    );

    renderChrome(bridge, '/me');

    await waitFor(() => {
      expect(bridge.getMenuButtonRect).toHaveBeenCalled();
    });
    await settle(() => undefined);
    expect(screen.getByTestId('chrome').getAttribute('data-capsule')).toBe('fallback');
    expect(screen.getByTestId('chrome').getAttribute('data-capsule-inset')).toBe(
      String(DEFAULT_CAPSULE_INSET_PX),
    );
    expect(screen.getByTestId('chrome').getAttribute('data-capsule-inset')).not.toBe('0');
  });

  it('sets the chrome bar on list screens and the immersive bar on the player', async () => {
    const homeBridge = await readyBridge();
    const homeColor = vi.spyOn(homeBridge, 'setNavigationBarColor');
    const { unmount } = renderChrome(homeBridge, '/home');
    await waitFor(() => {
      expect(homeColor).toHaveBeenCalledWith(
        CHROME_NAV_BAR.frontColor,
        CHROME_NAV_BAR.backgroundColor,
      );
    });
    expect(screen.getByTestId('chrome').getAttribute('data-nav-bar')).toBe('chrome');
    unmount();

    const playBridge = await readyBridge();
    const playColor = vi.spyOn(playBridge, 'setNavigationBarColor');
    renderChrome(playBridge, '/play/ep_test_0001');
    await waitFor(() => {
      expect(playColor).toHaveBeenCalledWith(
        IMMERSIVE_NAV_BAR.frontColor,
        IMMERSIVE_NAV_BAR.backgroundColor,
      );
    });
    expect(screen.getByTestId('chrome').getAttribute('data-nav-bar')).toBe('immersive');
  });
});

describe('App chrome on every route', () => {
  it('wraps the feed so a screen cannot opt out of the capsule', async () => {
    const bridge = new MockBridge();
    renderApp(bridge, '/home');
    expect(await screen.findByTestId('chrome')).toBeDefined();
    expect(screen.getByTestId('home-page')).toBeDefined();
    expect(screen.getByTestId('chrome').getAttribute('data-capsule')).toBe('fallback');
  });

  it('wraps the player, the wallet, and the fallback the same way', async () => {
    const bridge = new MockBridge();
    const { unmount: unmountPlay } = renderApp(bridge, '/play/ep_test_0001');
    expect(await screen.findByTestId('chrome')).toBeDefined();
    expect(screen.getByTestId('play-page')).toBeDefined();
    expect(screen.getByTestId('chrome').getAttribute('data-nav-bar')).toBe('immersive');
    unmountPlay();

    const { unmount: unmountWallet } = renderApp(bridge, '/wallet');
    expect(await screen.findByTestId('wallet-page')).toBeDefined();
    expect(screen.getByTestId('chrome').getAttribute('data-nav-bar')).toBe('chrome');
    unmountWallet();

    renderApp(bridge, '/not-a-real-route');
    expect(await screen.findByTestId('fallback-page')).toBeDefined();
    expect(screen.getByTestId('chrome')).toBeDefined();
  });
});
