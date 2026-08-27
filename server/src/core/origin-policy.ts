/**
 * Which browser origins may talk to this API, and what a request from one of them may carry.
 *
 * The client bundle is hosted and served by TikTok, so the API is *never* the page's own origin
 * (`docs/architecture/system-overview.md` §2): every real browser call is a cross-origin call and
 * the browser will not hand the response to the app without our permission. That permission is what
 * this file grants, and the only interesting question about it is what happens when nobody
 * configured it. The answer here is "nothing is allowed", because the alternatives are worse than
 * an outage:
 *
 *   - `Access-Control-Allow-Origin: *` on an API that reads an `Authorization` header lets any page
 *     on the internet call it on a viewer's behalf and read the answer;
 *   - reflecting whatever `Origin` arrived is the same thing written less obviously, and it also
 *     defeats the browser's own protection for the state-changing endpoints;
 *   - a default allowlist with a development origin in it is `*` for whoever registers that name.
 *
 * So the allowlist comes from configuration, an entry that is not an exact origin is discarded
 * rather than repaired, and a request whose `Origin` is not on the list is refused before it
 * reaches a route. Refusing rather than merely omitting the header matters for the endpoints that
 * do something: a `POST` the browser considers "simple" is *sent* before the response is checked,
 * so a silent denial would still have opened the order.
 *
 * This file decides. `cors.ts` is the wiring, and holds no rules of its own.
 */

/** Why an allowlist entry was discarded. Every one of these is a configuration typo with a name. */
export type OriginRejectionReason =
  'WILDCARD' | 'NOT_AN_ABSOLUTE_URL' | 'SCHEME_NOT_ALLOWED' | 'NOT_A_BARE_ORIGIN' | 'DUPLICATE';

export interface RejectedOrigin {
  readonly value: string;
  readonly reason: OriginRejectionReason;
}

export interface OriginAllowlist {
  /** Normalised, deduplicated, and safe to compare with `===` against an `Origin` header. */
  readonly allowed: readonly string[];
  /** Kept so an unusable entry can be logged by name instead of vanishing. */
  readonly rejected: readonly RejectedOrigin[];
}

/**
 * Loopback is the one place plain HTTP is not a downgrade: nothing is on the wire to intercept.
 * Any other `http://` entry is refused rather than upgraded, because guessing that the author
 * meant `https://` is how an allowlist ends up naming a host that answers on neither.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function rejectionFor(value: string): OriginRejectionReason | null {
  // Checked before parsing: `https://*.example.com` is a valid URL, and it is exactly the entry
  // this API must never hold. Subdomain wildcards are a standing invitation to whoever finds a
  // dangling DNS record.
  if (value.includes('*')) return 'WILDCARD';

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'NOT_AN_ABSOLUTE_URL';
  }

  // `data:`, `blob:` and friends serialise to the opaque origin, which is the literal string
  // "null" — the same value a sandboxed iframe sends. Matching it would allow every one of them.
  if (url.origin === 'null') return 'NOT_A_BARE_ORIGIN';

  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  ) {
    return 'SCHEME_NOT_ALLOWED';
  }

  // An origin is a scheme, a host and a port. Credentials, a path, a query or a fragment mean the
  // author wrote a URL, and a URL in an allowlist is a rule about a page rather than about an
  // origin — which is not a distinction the browser makes.
  if (url.username !== '' || url.password !== '') return 'NOT_A_BARE_ORIGIN';
  if (url.search !== '' || url.hash !== '') return 'NOT_A_BARE_ORIGIN';
  if (url.pathname !== '' && url.pathname !== '/') return 'NOT_A_BARE_ORIGIN';

  return null;
}

/**
 * Reads the configured allowlist.
 *
 * Entries are comma-separated. Unusable ones are dropped individually and reported, rather than
 * failing the boot: a deployment that refuses to start over one bad entry gets restarted with the
 * whole variable deleted, which is the outcome this design exists to avoid.
 */
export function parseOriginAllowlist(raw: string | undefined): OriginAllowlist {
  const allowed: string[] = [];
  const rejected: RejectedOrigin[] = [];
  const seen = new Set<string>();

  for (const segment of (raw ?? '').split(',')) {
    const value = segment.trim();
    if (value === '') continue;

    const reason = rejectionFor(value);
    if (reason !== null) {
      rejected.push({ value, reason });
      continue;
    }

    // `new URL(...).origin` is the serialisation a browser sends: lower-cased host, no default
    // port, no trailing slash. Normalising here is what lets the comparison below be `===`.
    const normalised = new URL(value).origin;
    if (seen.has(normalised)) {
      rejected.push({ value, reason: 'DUPLICATE' });
      continue;
    }

    seen.add(normalised);
    allowed.push(normalised);
  }

  return { allowed, rejected };
}

/**
 * Reads an inbound `Origin` header.
 *
 * The match is against the exact serialisation a browser sends, so this returns a value only when
 * the header *is* that serialisation. Anything else — `null` from a sandboxed frame, two joined
 * headers, an origin with a path glued on, a trailing slash — is not an origin we can reason about,
 * and a value we cannot reason about is not a value we allow.
 */
export function readRequestOrigin(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string' || raw === '') return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  return url.origin === raw ? raw : null;
}

export interface CorsPolicy {
  readonly allowedOrigins: readonly string[];
  /** Upper-case, as they appear on the wire. */
  readonly allowedMethods: readonly string[];
  /** Lower-case, as `Access-Control-Request-Headers` is compared case-insensitively. */
  readonly allowedHeaders: readonly string[];
  readonly maxAgeSec: number;
}

/**
 * The methods this API answers. `PUT`, `PATCH` and `DELETE` are absent because no route implements
 * one; a preflight asking for them is a client bug or a probe, and either way there is nothing to
 * advertise.
 */
export const ALLOWED_METHODS: readonly string[] = ['GET', 'POST', 'OPTIONS'];

/**
 * `authorization` is the session, `content-type` is every JSON body, and `idempotency-key` is
 * required on unlock writes (`docs/12-api-contracts.md` §2.4). The rest are the CORS-safelisted
 * names: a browser may send those cross-origin with no preflight at all, so listing them concedes
 * nothing and stops a client that sets `Accept` explicitly from being refused by a technicality.
 */
export const ALLOWED_REQUEST_HEADERS: readonly string[] = [
  'accept',
  'accept-language',
  'authorization',
  'content-language',
  'content-type',
  'idempotency-key',
];

/** Ten minutes. Long enough that a session is not one preflight per request, short enough that a
 * removed origin stops working the same morning. Chrome caps this at two hours regardless. */
export const PREFLIGHT_MAX_AGE_SEC = 600;

export function createCorsPolicy(allowedOrigins: readonly string[]): CorsPolicy {
  return {
    allowedOrigins,
    allowedMethods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_REQUEST_HEADERS,
    maxAgeSec: PREFLIGHT_MAX_AGE_SEC,
  };
}

export type CorsDenialReason =
  | 'ORIGIN_MALFORMED'
  | 'NO_ALLOWLIST_CONFIGURED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'METHOD_NOT_ALLOWED'
  | 'REQUEST_HEADER_NOT_ALLOWED';

export interface CorsRequest {
  readonly method: string;
  readonly origin: string | string[] | undefined;
  readonly requestMethod: string | string[] | undefined;
  readonly requestHeaders: string | string[] | undefined;
  /** This server's own origin, for the case where it *is* the page origin. */
  readonly selfOrigin: string | null;
}

export type CorsVerdict =
  /** Not a cross-origin browser request: server-to-server traffic, or the page's own origin. */
  | { readonly kind: 'NOT_CROSS_ORIGIN'; readonly reason: 'NO_ORIGIN' | 'SAME_ORIGIN' }
  | { readonly kind: 'ALLOWED'; readonly origin: string; readonly headers: CorsHeaders }
  | { readonly kind: 'PREFLIGHT_ALLOWED'; readonly origin: string; readonly headers: CorsHeaders }
  | {
      readonly kind: 'DENIED';
      readonly reason: CorsDenialReason;
      readonly preflight: boolean;
      /** Present only when the header was a readable origin. */
      readonly origin: string | null;
    };

export type CorsHeaders = Readonly<Record<string, string>>;

function headerValue(raw: string | string[] | undefined): string | null {
  return typeof raw === 'string' ? raw : null;
}

function requestedHeaderNames(raw: string | string[] | undefined): readonly string[] {
  const value = headerValue(raw);
  if (value === null) return [];

  return value
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
}

/**
 * Decides one request.
 *
 * The order is deliberate: whether the request is cross-origin at all, then whether the origin is
 * allowed, and only then what the preflight asked for. An unallowed origin is refused before its
 * requested method or headers are looked at, so the response cannot be used to learn which methods
 * exist from an origin that may not use any of them.
 */
export function decideCors(policy: CorsPolicy, request: CorsRequest): CorsVerdict {
  const rawOrigin = headerValue(request.origin);
  const preflight =
    request.method.toUpperCase() === 'OPTIONS' && headerValue(request.requestMethod) !== null;

  if (rawOrigin === null || rawOrigin === '') {
    // No `Origin` means no browser asked, which means no browser has to be answered. The TikTok
    // payment callback arrives this way, and refusing it here would turn a CORS policy into a
    // payment outage.
    return { kind: 'NOT_CROSS_ORIGIN', reason: 'NO_ORIGIN' };
  }

  const origin = readRequestOrigin(rawOrigin);
  if (origin === null) {
    return { kind: 'DENIED', reason: 'ORIGIN_MALFORMED', preflight, origin: null };
  }

  // A same-origin request is not something CORS has an opinion about, and the browser sends
  // `Origin` on same-origin `POST`s too. Both sides of this comparison are set by the browser, so
  // a cross-origin page cannot make it true by choosing a header.
  if (request.selfOrigin !== null && origin === request.selfOrigin) {
    return { kind: 'NOT_CROSS_ORIGIN', reason: 'SAME_ORIGIN' };
  }

  if (policy.allowedOrigins.length === 0) {
    return { kind: 'DENIED', reason: 'NO_ALLOWLIST_CONFIGURED', preflight, origin };
  }

  if (!policy.allowedOrigins.includes(origin)) {
    return { kind: 'DENIED', reason: 'ORIGIN_NOT_ALLOWED', preflight, origin };
  }

  if (!preflight) {
    return { kind: 'ALLOWED', origin, headers: { 'access-control-allow-origin': origin } };
  }

  const method = (headerValue(request.requestMethod) ?? '').trim().toUpperCase();
  if (!policy.allowedMethods.includes(method)) {
    return { kind: 'DENIED', reason: 'METHOD_NOT_ALLOWED', preflight: true, origin };
  }

  const requested = requestedHeaderNames(request.requestHeaders);
  if (requested.some((name) => !policy.allowedHeaders.includes(name))) {
    // Advertising the list anyway and letting the browser refuse would be the same outcome with
    // the decision taken somewhere we cannot see it. This way the refusal is ours, and it is in
    // the log.
    return { kind: 'DENIED', reason: 'REQUEST_HEADER_NOT_ALLOWED', preflight: true, origin };
  }

  return {
    kind: 'PREFLIGHT_ALLOWED',
    origin,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': policy.allowedMethods.join(', '),
      'access-control-allow-headers': policy.allowedHeaders.join(', '),
      'access-control-max-age': String(policy.maxAgeSec),
    },
  };
}
