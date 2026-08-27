import { describe, expect, it, vi, afterEach } from 'vitest';
import { CONSERVATIVE_CLIENT_CONFIG, err, ok } from '@minidrama/shared';
import { render, screen } from '@testing-library/react';

import { apiFailure } from '../data/failure';
import { loadBootConfig } from './load-config';
import {
  configAfterLogin,
  initFailureElement,
  isInitFailure,
  resetRetainedRoot,
  rootFor,
  splashElement,
  wrapWithClientConfig,
} from './sequence';
import { useClientConfig } from '../config/client-config-context';
import type { ConfigApi } from '../data/config-api';
import type { Root } from 'react-dom/client';

afterEach(() => {
  resetRetainedRoot();
});

describe('loadBootConfig', () => {
  it('keeps a successful body', async () => {
    const api: ConfigApi = {
      fetchConfig: () => Promise.resolve(ok(CONSERVATIVE_CLIENT_CONFIG)),
    };
    await expect(loadBootConfig(api)).resolves.toEqual(CONSERVATIVE_CLIENT_CONFIG);
  });

  it('falls back to comments off when the read fails', async () => {
    const api: ConfigApi = {
      fetchConfig: () => Promise.resolve(err(apiFailure({ kind: 'TIMEOUT', message: 'timeout' }))),
    };
    const config = await loadBootConfig(api);
    expect(config.features.comments).toBe(false);
    expect(config.features.adUnlock).toBe(false);
    expect(config.playback.progressHeartbeatSec).toBe(10);
  });
});

describe('boot sequence helpers', () => {
  it('reuses the first root so a retry cannot mount a second tree', () => {
    const created: HTMLElement[] = [];
    const fakeRoot = { render: vi.fn() } as unknown as Root;
    const create = (element: HTMLElement): Root => {
      created.push(element);
      return fakeRoot;
    };
    const container = document.createElement('div');

    expect(rootFor(container, create)).toBe(fakeRoot);
    expect(rootFor(container, create)).toBe(fakeRoot);
    expect(created).toHaveLength(1);
  });

  it('treats a refused init as the terminal retry, not a continue', () => {
    expect(isInitFailure({ ok: true })).toBe(false);
    expect(isInitFailure({ ok: false })).toBe(true);
  });

  it('paints the splash without claiming comments are on', () => {
    render(splashElement());
    expect(screen.getByTestId('splash-screen').textContent).not.toMatch(/comment/i);
  });

  it('paints the init-failure retry', () => {
    const retries: number[] = [];
    render(initFailureElement(() => retries.push(1)));
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retries).toEqual([1]);
  });

  it('wraps the tree in the boot snapshot, comments still off', () => {
    function Probe(): React.JSX.Element {
      const config = useClientConfig();
      return <p data-testid="flag">{String(config.features.comments)}</p>;
    }
    render(wrapWithClientConfig(CONSERVATIVE_CLIENT_CONFIG, <Probe />));
    expect(screen.getByTestId('flag').textContent).toBe('false');
  });

  it('loads config after login through the same helper boot uses', async () => {
    const api: ConfigApi = {
      fetchConfig: () => Promise.resolve(ok(CONSERVATIVE_CLIENT_CONFIG)),
    };
    await expect(configAfterLogin(api)).resolves.toEqual(CONSERVATIVE_CLIENT_CONFIG);
  });
});
