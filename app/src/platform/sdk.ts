import { bridgeError, err, ok } from '@minidrama/shared';
import type { BridgeError, Result } from '@minidrama/shared';

/**
 * The only module in the repository that reads `window.TTMinis`.
 *
 * `tools/source-rules.ts` enforces that, and the check runs in CI. Business code that reaches for
 * the global directly is how a mini-app becomes impossible to test off-device.
 */

/**
 * The SDK is described by its documentation, not by a package we can install, and its error
 * payloads are undocumented (U-05). So the global is typed as loosely as it actually is, and
 * every value that crosses back into the app is narrowed explicitly.
 */
type SdkNamespace = Record<string, unknown>;

interface SdkGlobal {
  TTMinis?: SdkNamespace & { game?: SdkNamespace };
}

export const DEFAULT_SDK_TIMEOUT_MS = 10_000;

/**
 * Open item O-1: the mini-drama docs use the bare `TTMinis.*` namespace while the mini-games docs
 * use `TTMinis.game.*`. Resolving once at init keeps a namespace difference to a one-line change.
 */
export function resolveSdkNamespace(globalObject: unknown = globalThis): SdkNamespace | null {
  const candidate = (globalObject as SdkGlobal).TTMinis;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (typeof candidate['getPlayer'] === 'function') {
    return candidate;
  }
  const gameNamespace = candidate.game;
  if (gameNamespace && typeof gameNamespace['getPlayer'] === 'function') {
    return gameNamespace;
  }
  return candidate;
}

export function sdkHas(namespace: SdkNamespace | null, method: string): boolean {
  return typeof namespace?.[method] === 'function';
}

/**
 * The SDK is not documented to guarantee a callback, so an un-timed call can hang a UI state
 * forever (U-06). Every dispatch is bounded and a hang becomes `BRIDGE_TIMEOUT`.
 */
export async function withTimeout<T>(
  operation: Promise<Result<T, BridgeError>>,
  label: string,
  timeoutMs: number = DEFAULT_SDK_TIMEOUT_MS,
): Promise<Result<T, BridgeError>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Result<T, BridgeError>>((resolve) => {
    timer = setTimeout(() => {
      resolve(err(bridgeError('BRIDGE_TIMEOUT', `${label} did not settle in ${timeoutMs}ms`)));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Normalizes a callback-style SDK method (`success` / `fail` / `complete`) into a `Result`.
 * The failure payload is attached as an opaque `cause` and never destructured.
 */
export function callSdk<T>(
  namespace: SdkNamespace | null,
  method: string,
  options: Readonly<Record<string, unknown>> = {},
  mapSuccess: (payload: unknown) => T,
): Promise<Result<T, BridgeError>> {
  const fn = namespace?.[method];
  if (typeof fn !== 'function') {
    return Promise.resolve(
      err(bridgeError('BRIDGE_UNSUPPORTED', `TTMinis.${method} is not available`)),
    );
  }

  return new Promise<Result<T, BridgeError>>((resolve) => {
    let settled = false;
    const settle = (result: Result<T, BridgeError>): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    try {
      (fn as (arg: Record<string, unknown>) => void).call(namespace, {
        ...options,
        success: (payload: unknown) => {
          try {
            settle(ok(mapSuccess(payload)));
          } catch (cause) {
            settle(
              err(
                bridgeError(
                  'BRIDGE_UNKNOWN',
                  `TTMinis.${method} returned an unexpected payload`,
                  cause,
                ),
              ),
            );
          }
        },
        fail: (payload: unknown) => {
          settle(err(bridgeError('BRIDGE_UNKNOWN', `TTMinis.${method} failed`, payload)));
        },
      });
    } catch (cause) {
      settle(err(bridgeError('BRIDGE_UNKNOWN', `TTMinis.${method} threw synchronously`, cause)));
    }
  });
}
