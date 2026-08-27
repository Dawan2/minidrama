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
 * 4. **A POST never retries by itself.** Rule 3 is safe because a GET changes nothing. The only
 *    POST this client makes opens a payment, and a transport failure does not say whether the
 *    request arrived — an automatic second attempt is a second thing the viewer can be charged for.
 *    Repeating a write is the caller's decision, made with the same `Idempotency-Key`, which is
 *    what makes the repeat harmless.
 * 5. **The `Authorization` header is attached here and nowhere else.** An order belongs to an
 *    account, so a request that should carry a session and does not is answered `401 AUTH_REQUIRED`
 *    (`docs/12-api-contracts.md` §2). One attachment point means one thing to audit and one thing
 *    to change when the token's lifecycle grows: a call site cannot forget the header, and — because
 *    a caller's own `Authorization` is dropped before the token source is consulted — a call site
 *    cannot invent one either.
 *
 * `fetch`, `sleep` and the token source are injected rather than imported so the behaviour above is
 * testable without a server, without a clock and without a platform.
 */

export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  /** Already serialised. Present on a `POST` and absent on a `GET`. */
  readonly body?: string;
}

export type FetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

/**
 * Where the bearer token comes from, asked once per attempt rather than read once at construction.
 *
 * Per-attempt is the whole point: the token arrives after boot, is dropped the moment the server
 * refuses it, and will later be replaced by a refresh. A value captured when the client was built
 * would be `null` forever in the first case and stale in the last.
 *
 * `null` means "there is no session", and the request goes out without the header — never with a
 * placeholder, an empty bearer or a locally minted identifier. A missing session has to reach the
 * server as a missing session, because the server is the only thing that can decide what an
 * anonymous caller may have.
 */
export type AuthTokenSource = () => string | null;

export const AUTHORIZATION_HEADER = 'Authorization';

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
  /**
   * Absent means the transport is anonymous *by construction*, which is what the login exchange
   * itself needs: a session cannot be created by presenting one. It is deliberately not a
   * per-request flag — a flag is an opt-out every other call site also gets.
   */
  readonly authToken?: AuthTokenSource;
  /**
   * Called when a request that **did** carry a token was answered `401`. The token is dead; the
   * session holder drops it so the next request is honestly anonymous instead of replaying a
   * credential the server has already refused.
   *
   * Not a refresh-and-replay interceptor (IA §8.2). Replaying a `POST` after a refresh is a second
   * write, and the only `POST` here opens a payment — see rule 4.
   */
  readonly onCredentialRefused?: () => void;
}

export interface PostOptions {
  /**
   * Extra request headers, `Idempotency-Key` above all
   * (`docs/12-api-contracts.md` §2.4). Kept as a caller's concern rather than minted here: the key
   * has to be the *same* one across a retry of the same purchase attempt, and only the caller knows
   * where one attempt ends and the next begins.
   */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface HttpClient {
  getJson(path: string, query?: QueryParams): Promise<Result<unknown, ApiFailure>>;
  postJson(
    path: string,
    body: unknown,
    options?: PostOptions,
  ): Promise<Result<unknown, ApiFailure>>;
}

/**
 * The read half, handed to the clients that only read.
 *
 * The catalogue is three anonymous `GET`s and it should stay that way, so it is given a transport
 * it cannot write through. A narrower type is a cheaper guarantee than a review comment: adding a
 * `POST` to `catalog-api.ts` would have to widen this first, in a diff.
 */
export type HttpReader = Pick<HttpClient, 'getJson'>;

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

  const attempt = async (
    url: string,
    request: Omit<HttpRequestInit, 'signal'>,
  ): Promise<Result<unknown, ApiFailure>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Rule 5: the token is read here, per attempt, and merged last. Nothing a caller passed can
    // survive into `Authorization`, and a retry after the session changed uses the current token.
    const bearer = bearerHeader(options.authToken);
    const headers = { ...request.headers, ...bearer };

    let response: HttpResponseLike;
    try {
      response = await options.fetch(url, { ...request, headers, signal: controller.signal });
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

    // Only when the request actually presented a token: a `401` on an anonymous read is the server
    // declining a stranger, and dropping a good session because of one would sign the viewer out
    // for no reason. Checked before the body is parsed, because a refused credential is a refused
    // credential whether or not a gateway bothered to send an envelope.
    if (response.status === 401 && AUTHORIZATION_HEADER in bearer) {
      options.onCredentialRefused?.();
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
      const request = { method: 'GET', headers: { Accept: 'application/json' } } as const;

      const first = await attempt(url, request);
      if (first.ok || !isAutoRetryable(first.error)) {
        return first;
      }

      await sleep(retryDelayMs);
      return attempt(url, request);
    },

    postJson: (path, body, postOptions) =>
      attempt(buildUrl(options.baseUrl, path), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...withoutAuthorization(postOptions?.headers),
        },
        body: JSON.stringify(body),
      }),
  };
}

/**
 * The header, or nothing at all.
 *
 * An empty or blank token is treated as no token. `Bearer ` with nothing after it is a credential
 * the server can only refuse, and it refuses it as `401`, which is the same answer an anonymous
 * request gets after a great deal more confusion in the logs.
 */
function bearerHeader(source: AuthTokenSource | undefined): Readonly<Record<string, string>> {
  const token = source?.() ?? null;
  return token === null || token.trim() === '' ? {} : { [AUTHORIZATION_HEADER]: `Bearer ${token}` };
}

/**
 * A caller's `Authorization`, in any casing, is dropped rather than honoured.
 *
 * `PostOptions.headers` exists for the idempotency key. Letting it carry a credential too would put
 * a second, unaudited way to authenticate next to the first, and the interesting case is not a
 * malicious call site but a well-meaning one that hard-codes a header during debugging and ships
 * it.
 */
function withoutAuthorization(
  headers: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  if (headers === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== AUTHORIZATION_HEADER.toLowerCase(),
    ),
  );
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
