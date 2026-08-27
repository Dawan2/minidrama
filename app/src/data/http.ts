import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure, isAutoRetryable, readErrorEnvelope } from './failure';
import type { ApiFailure } from './failure';

/**
 * The one place in the client that makes an HTTP request.
 *
 * It exists to hold three rules that are easy to state and easy to forget in a component:
 *
 * 1. **Every request is bounded.** An unbounded request inside a WebView is a loading state that
 *    never ends and a user whose only escape is killing the mini app
 *    (`docs/02-information-architecture.md` §8.2: 10s for a normal read).
 * 2. **Every failure is a value.** Nothing here rejects. The surfaces switch on a classified
 *    failure, so there is no path where an unhandled rejection becomes a blank screen.
 * 3. **An idempotent GET retries exactly once.** The IA asks for it (§8.2) and the limit matters:
 *    "retry until it works" against a failing dependency is an outage amplifier.
 *
 * `fetch` and `sleep` are injected rather than imported so the behaviour above is testable without
 * a server and without a clock.
 */

export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  readonly method: 'GET';
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export type FetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

/** `undefined` means "omit"; every other value is stringified. */
export type QueryParams = Readonly<Record<string, string | number | undefined>>;

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRY_DELAY_MS = 1_000;

export interface HttpClientOptions {
  /** Origin only, no trailing slash. In production this is `VITE_API_BASE_URL`. */
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly timeoutMs?: number;
  readonly retryDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface HttpClient {
  getJson(path: string, query?: QueryParams): Promise<Result<unknown, ApiFailure>>;
}

export function buildUrl(baseUrl: string, path: string, query: QueryParams = {}): string {
  const origin = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const search = Object.entries(query)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return search === '' ? `${origin}${path}` : `${origin}${path}?${search}`;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  const attempt = async (url: string): Promise<Result<unknown, ApiFailure>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: HttpResponseLike;
    try {
      response = await options.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (cause) {
      // An aborted request and a dead network both surface as a thrown error, and only the signal
      // can tell them apart. Reporting a timeout as "you are offline" sends the user to check a
      // connection that was never the problem.
      const kind = controller.signal.aborted ? 'TIMEOUT' : 'OFFLINE';
      return err(
        apiFailure({
          kind,
          message:
            kind === 'TIMEOUT'
              ? `${url} did not answer in ${String(timeoutMs)}ms`
              : describeCause(url, cause),
        }),
      );
    } finally {
      clearTimeout(timer);
    }

    // The error envelope is JSON too, so a failed parse of a failed response must still yield the
    // status. Losing the status here would turn every 404 into a retry button.
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      return err(
        response.ok
          ? apiFailure({
              kind: 'MALFORMED',
              status: response.status,
              message: describeCause(url, cause),
            })
          : apiFailure({
              kind: 'HTTP',
              status: response.status,
              message: `HTTP ${String(response.status)} with an unreadable body`,
            }),
      );
    }

    return response.ok ? ok(body) : err(readErrorEnvelope(response.status, body));
  };

  return {
    getJson: async (path, query) => {
      const url = buildUrl(options.baseUrl, path, query);

      const first = await attempt(url);
      if (first.ok || !isAutoRetryable(first.error)) {
        return first;
      }

      await sleep(retryDelayMs);
      return attempt(url);
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeCause(url: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `${url} failed: ${detail}`;
}
