import { err, ok } from '@minidrama/shared';
import type { Result } from '@minidrama/shared';

import { apiFailure, isAutoRetryable, readErrorEnvelope } from './failure';
import type { ApiFailure } from './failure';

/**
 * The one place in the client that makes an HTTP request.
 *
 * It exists to hold four rules that are easy to state and easy to forget in a component:
 *
 * 1. **Every request is bounded.** An unbounded request inside a WebView is a loading state that
 *    never ends and a user whose only escape is killing the mini app
 *    (`docs/02-information-architecture.md` §8.2: 10s for a normal read).
 * 2. **Every failure is a value.** Nothing here rejects. The surfaces switch on a classified
 *    failure, so there is no path where an unhandled rejection becomes a blank screen.
 * 3. **An idempotent request retries exactly once.** The IA asks for it (§8.2) and the limit
 *    matters: "retry until it works" against a failing dependency is an outage amplifier. This
 *    covers the reads and the favourite writes alike, because both are idempotent at the endpoint.
 * 4. **A `POST` never retries by itself.** Rule 3 is safe because repeating the request cannot
 *    change the outcome. The only `POST` this client makes opens a payment, and a transport failure
 *    does not say whether the request arrived — an automatic second attempt is a second thing the
 *    viewer can be charged for. Repeating that write is the caller's decision, made with the same
 *    `Idempotency-Key`, which is what makes the repeat harmless.
 *
 * `fetch` and `sleep` are injected rather than imported so the behaviour above is testable without
 * a server and without a clock.
 */

export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/**
 * The verbs rule 3's automatic retry is allowed to repeat, and — deliberately — no others.
 *
 * `PUT` and `DELETE` are here because favouriting a drama is a write
 * (`docs/12-api-contracts.md` §4.3) and the server publishes both as idempotent. `POST` is a verb
 * this client also sends, for the coin order, and its absence from this list is the whole of rule 4:
 * the retry is switched off by the type rather than per call site.
 */
export const WRITE_METHODS = ['PUT', 'DELETE'] as const;

export type WriteMethod = (typeof WRITE_METHODS)[number];

export type HttpMethod = 'GET' | 'POST' | WriteMethod;

export interface HttpRequestInit {
  readonly method: HttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  /** Already serialised. Present on a `POST` and absent on every other verb. */
  readonly body?: string;
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

export interface PostOptions {
  /**
   * Extra request headers, `Idempotency-Key` above all
   * (`docs/12-api-contracts.md` §2.4). Kept as a caller's concern rather than minted here: the key
   * has to be the *same* one across a retry of the same purchase attempt, and only the caller knows
   * where one attempt ends and the next begins.
   */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The transport, split by capability rather than published as one interface.
 *
 * A read client that cannot write is not a style preference: `HttpReader` is the entire dependency
 * of the catalogue, history and search clients, and declaring it that way is what makes "this module
 * cannot mutate anything" a fact a reader can check at the import rather than a claim in a comment.
 * It also keeps the test doubles honest — a stub for a read client supplies one method because one
 * method is all it is allowed to be asked for.
 *
 * The split is three-way rather than two because the two writes are not the same kind of thing. A
 * favourite is idempotent and answers `204`; a coin order is neither. Giving each its own interface
 * is what lets the favourites client be handed a transport that cannot open a payment.
 */
export interface HttpReader {
  getJson(path: string, query?: QueryParams): Promise<Result<unknown, ApiFailure>>;
}

export interface HttpWriter {
  /**
   * An idempotent write whose answer is its status, not its body.
   *
   * The favourite writes answer `204` (`docs/12-api-contracts.md` §4.3), so a success has nothing
   * to parse and this never calls `json()` on one — a `204` has no body, and `Response.json()`
   * rejects on an empty one, which would turn every successful write into a `MALFORMED` failure. A
   * *failed* write still carries the error envelope, and that is still read.
   */
  send(method: WriteMethod, path: string, query?: QueryParams): Promise<Result<void, ApiFailure>>;
}

export interface HttpPoster {
  /**
   * The non-idempotent write, and the only one. It carries a JSON body, it may carry an
   * `Idempotency-Key`, and per rule 4 it is the one call in this module that is never retried
   * automatically.
   */
  postJson(
    path: string,
    body: unknown,
    options?: PostOptions,
  ): Promise<Result<unknown, ApiFailure>>;
}

export interface HttpClient extends HttpReader, HttpWriter, HttpPoster {}

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
    /** `NONE` for a write whose success is a `204` with nothing in it. */
    successBody: 'JSON' | 'NONE',
  ): Promise<Result<unknown, ApiFailure>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: HttpResponseLike;
    try {
      response = await options.fetch(url, { ...request, signal: controller.signal });
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

    if (response.ok && successBody === 'NONE') {
      return ok(undefined);
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

  /**
   * The single automatic retry, applied identically to a read and to an idempotent write.
   *
   * It is safe for the writes it is given because the server publishes both of them as idempotent:
   * a repeated `PUT` does not move `favoritedAt`, and a `DELETE` answers `204` whether or not there
   * was a row (`docs/handoff/w2-work-j.md` decisions S45, S47). That is a property of the endpoint,
   * not an assumption about the network — which is why `postJson` does not come through here.
   */
  const withRetry = async (
    url: string,
    request: Omit<HttpRequestInit, 'signal'>,
    successBody: 'JSON' | 'NONE',
  ): Promise<Result<unknown, ApiFailure>> => {
    const first = await attempt(url, request, successBody);
    if (first.ok || !isAutoRetryable(first.error)) {
      return first;
    }

    await sleep(retryDelayMs);
    return attempt(url, request, successBody);
  };

  return {
    getJson: (path, query) =>
      withRetry(
        buildUrl(options.baseUrl, path, query),
        { method: 'GET', headers: { Accept: 'application/json' } },
        'JSON',
      ),

    send: async (method, path, query) => {
      const result = await withRetry(
        buildUrl(options.baseUrl, path, query),
        // `Accept` is sent on a write too: the success has no body, but the failure envelope is
        // JSON and it is the half of the answer a surface has to render.
        { method, headers: { Accept: 'application/json' } },
        'NONE',
      );
      // The success value is discarded rather than cast: a write's answer is its status, and a body
      // a caller cannot see is a body nobody can start depending on.
      return result.ok ? ok(undefined) : result;
    },

    // Rule 4: `attempt` directly, never `withRetry`.
    postJson: (path, body, postOptions) =>
      attempt(
        buildUrl(options.baseUrl, path),
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...postOptions?.headers,
          },
          body: JSON.stringify(body),
        },
        'JSON',
      ),
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
