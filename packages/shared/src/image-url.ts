import { err, ok } from './result.js';
import type { Result } from './result.js';

/**
 * Is this a URL the client may load an image from?
 *
 * Cover art is the one place in this app where a *string out of the content database* becomes a
 * request the WebView makes and a pixel a viewer sees. Everything else the client fetches is a
 * path this repository wrote against a host this repository registered; a cover URL arrives from
 * a licensor delivery, a CMS field or a fixture table, and none of those three is a place a
 * security decision should be taken. So the decision is taken here, and it is taken by allowlist.
 *
 * What the allowlist is defending against, in the order the mistakes are usually made:
 *
 *   - `javascript:` in a field that is rendered as a URL. An `<img src>` will not execute it, but
 *     a cover is also the thumbnail somebody eventually wraps in a link, drops into a CSS
 *     `url()`, or hands to a share sheet, and those do. The field is one field either way.
 *   - `data:`, which smuggles arbitrary bytes into the page from no host at all. The platform's
 *     trusted-domain list cannot see it, because there is no request to see, and the review that
 *     approved what this app loads never looked at it.
 *   - a host nobody registered. A cover URL from an unregistered host is a request the platform
 *     blocks on device and nowhere else (`docs/architecture/system-overview.md` §3.2), so it is
 *     found by a viewer rather than by CI. Refusing it here makes it a test failure instead.
 *   - a host that merely *looks* registered. `cdn.trusted.example.evil.example` matches a prefix
 *     rule, `evilcdn.trusted.example` matches a suffix rule, and either rule is what somebody
 *     writes when asked to "support subdomains".
 *
 * Three properties are what make this fail closed rather than nearly closed:
 *
 *   - **schemes are allowed, not banned.** Only `https:` passes. A list that bans `javascript:`
 *     and `data:` still admits `blob:`, `filesystem:`, `vbscript:`, `about:` and whatever the
 *     next WebView ships.
 *   - **an empty or unusable allowlist refuses everything.** There is no value of the host list
 *     that means "any host", including the one a deployment reaches for when covers stop loading.
 *   - **the caller renders what was checked.** The accepted value is the URL as parsed, not the
 *     string that arrived. A validator that approves one spelling while the page uses another is
 *     the shape of every sanitiser bypass ever written.
 *
 * This module holds the mechanism and no policy: the host list is a required argument, so there
 * is no default to get wrong. The list itself lives in `@minidrama/config`
 * (`packages/config/src/cover-hosts.ts`), next to the trusted domains it has to agree with.
 */

/** Why a URL is not one we will load an image from. Every one of these is a refusal with a name. */
export type ImageUrlRejection =
  /** `null`, `undefined`, or a string with nothing in it. */
  | 'MISSING'
  /** A JSON boundary handed us something that is not a string at all. */
  | 'NOT_A_STRING'
  /** Relative, protocol-relative, or not a URL. Nothing here is resolved against a base. */
  | 'NOT_AN_ABSOLUTE_URL'
  /** Anything but `https:`, which is what refuses `javascript:`, `data:` and plain `http:`. */
  | 'SCHEME_NOT_ALLOWED'
  /** `https://anything@trusted.example/` — a host written to be misread. */
  | 'CREDENTIALS_PRESENT'
  /** A trusted name on a port nobody registered is a different service. */
  | 'PORT_NOT_ALLOWED'
  | 'HOST_NOT_TRUSTED'
  /** The allowlist held no usable entry, so nothing could be trusted. */
  | 'NO_TRUSTED_HOSTS';

/**
 * Reads one allowlist entry, returning the hostname it will be compared as, or `null` if the
 * entry is not a bare host.
 *
 * Entries are parsed rather than pattern-matched so that the comparison and the entry agree about
 * what a host is: parsing lower-cases, converts an internationalised name to the punycode a URL
 * actually carries, and rejects an entry that turns out to be a URL, a host with a port, or a
 * host with credentials glued on.
 *
 * The regular expression is the one thing parsing does not do for us. `*` is not a forbidden host
 * code point, so `*.trusted.example` survives as a hostname — an allowlist holding it would match
 * a URL whose host is literally `*.trusted.example` and nothing else, which is a wildcard that
 * looks like it works. Discarding the entry is the only reading of it that is not a surprise.
 */
export function normalizeImageHost(entry: string): string | null {
  const value = entry.trim();
  if (value === '') return null;

  let url: URL;
  try {
    url = new URL(`https://${value}`);
  } catch {
    return null;
  }

  if (url.href !== `https://${url.hostname}/`) return null;
  if (!/^[a-z0-9.-]+$/.test(url.hostname)) return null;

  return url.hostname;
}

function trustedHostSet(entries: readonly string[]): ReadonlySet<string> {
  const hosts = new Set<string>();

  for (const entry of entries) {
    const host = normalizeImageHost(entry);
    if (host !== null) hosts.add(host);
  }

  return hosts;
}

/**
 * Checks one image URL against one allowlist.
 *
 * The allowlist is examined first, and an unusable one refuses even a well-formed URL: a caller
 * that passed no hosts has not asked a question this function can answer, and "no answer" has to
 * mean no. On success the value is the URL as parsed — render that, not the input.
 */
export function checkImageUrl(
  raw: unknown,
  trustedHosts: readonly string[],
): Result<string, ImageUrlRejection> {
  const hosts = trustedHostSet(trustedHosts);
  if (hosts.size === 0) return err('NO_TRUSTED_HOSTS');

  if (raw === null || raw === undefined) return err('MISSING');
  if (typeof raw !== 'string') return err('NOT_A_STRING');
  if (raw.trim() === '') return err('MISSING');

  let url: URL;
  try {
    // No base is passed on purpose. Resolving a relative reference against the page would make
    // the answer depend on where the page happens to be, which is not a property of the data.
    url = new URL(raw);
  } catch {
    return err('NOT_AN_ABSOLUTE_URL');
  }

  // Leading control characters and whitespace are stripped by the URL parser before the scheme is
  // read, so `"\njavascript:…"` arrives here as `javascript:` rather than as an unparseable
  // string. That is the bypass this ordering exists to close: the scheme is judged after parsing.
  if (url.protocol !== 'https:') return err('SCHEME_NOT_ALLOWED');

  // The host below is `evil.example`'s in one spelling and the trusted host's in the other, and
  // no human reads the difference reliably. Neither spelling has a legitimate use in a cover URL.
  if (url.username !== '' || url.password !== '') return err('CREDENTIALS_PRESENT');

  // `:443` is normalised away by the parser, so this rejects only a port somebody chose. Whether
  // the Portal treats a port as part of a trusted-domain entry is unconfirmed (U-11), and a
  // refusal is the direction that cannot be wrong on device.
  if (url.port !== '') return err('PORT_NOT_ALLOWED');

  // Exact equality against the parser's hostname. Not a prefix, not a suffix, not a domain
  // suffix: every one of those admits a name an attacker can register.
  if (!hosts.has(url.hostname)) return err('HOST_NOT_TRUSTED');

  return ok(url.href);
}

/** The same decision when the reason does not matter. */
export function isTrustedImageUrl(raw: unknown, trustedHosts: readonly string[]): boolean {
  return checkImageUrl(raw, trustedHosts).ok;
}
