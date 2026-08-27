import { createRoot, type Root } from 'react-dom/client';
import type { ConfigView } from '@minidrama/shared';

import { BootError } from './BootError';
import { SplashScreen } from './SplashScreen';
import { ClientConfigProvider } from '../config/client-config-context';
import { loadBootConfig } from './load-config';
import type { ConfigApi } from '../data/config-api';

export { loadBootConfig };

/**
 * SCR-01's control flow, extracted so the splash and the init-failure retry are tests rather
 * than uncovered lines in `main.tsx`. `main` still owns transport construction and the tree.
 */

let retained: Root | undefined;

export function rootFor(
  container: HTMLElement,
  create: (element: HTMLElement) => Root = createRoot,
): Root {
  retained ??= create(container);
  return retained;
}

export function resetRetainedRoot(): void {
  retained = undefined;
}

export function splashElement(): React.JSX.Element {
  return <SplashScreen />;
}

export function initFailureElement(onRetry: () => void): React.JSX.Element {
  return <BootError onRetry={onRetry} />;
}

export function wrapWithClientConfig(
  config: ConfigView,
  children: React.ReactNode,
): React.JSX.Element {
  return <ClientConfigProvider config={config}>{children}</ClientConfigProvider>;
}

export function isInitFailure(init: { readonly ok: boolean }): init is { readonly ok: false } {
  return !init.ok;
}

export async function configAfterLogin(api: ConfigApi): Promise<ConfigView> {
  return loadBootConfig(api);
}
