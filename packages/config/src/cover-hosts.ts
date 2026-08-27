import { checkImageUrl, isTrustedImageUrl, normalizeImageHost } from '@minidrama/shared';
import type { ImageUrlRejection, Result } from '@minidrama/shared';

import { TRUSTED_DOMAINS } from './domains.js';
import type { TrustedDomain } from './domains.js';

/**
 * The hosts a cover or poster image may be loaded from.
 *
 * `domains.ts` answers "may the client talk to this host at all", which the platform enforces.
 * This file answers a narrower question about the same traffic: which of those hosts may appear in
 * a *content field* — a drama cover, a horizontal cover, an episode cover, a poster
 * (`docs/12-domain-model.md` §2). The two are not the same list and neither implies the other. The
 * API host is trusted for requests this repository writes; it is not a host a cover URL may name,
 * because a cover URL is not written here. It arrives from a licensor delivery, a CMS field or a
 * fixture table, and an allowlist whose entries are "everywhere we talk to" would let any of those
 * point the WebView at any of them.
 *
 * The list is deliberately short and deliberately fail-closed:
 *
 *   - the decision is `checkCoverUrl`, which refuses everything if this registry is empty. There
 *     is no configuration and no environment variable, so there is nothing to set to `*` at 2am
 *     when covers stop loading;
 *   - every host here must also be a registered `image` trusted domain, checked by
 *     `validateCoverHostRegistry` in both directions. A cover host absent from the Portal list is
 *     a broken image on device only; a registered image domain absent from here is a host the
 *     platform allows and we do not, which is a slot spent on nothing;
 *   - an entry is a bare hostname, compared exactly. No scheme, no path, no port, no wildcard —
 *     `validateCoverHostRegistry` refuses each of those rather than interpreting it.
 */
export interface TrustedCoverHost {
  /** A bare hostname, lower-case, punycode if internationalised. Compared with `===`. */
  readonly host: string;
  /** Why images may come from here. A host nobody can justify is a host to remove. */
  readonly reason: string;
}

/**
 * Wave 1's placeholder convention, continued: `.invalid` is reserved by RFC 2606 and can never
 * resolve, so a registry that accidentally ships refuses every real host instead of trusting
 * somebody else's. The host TikTok's media library serves an `open_pic_id` from is not documented
 * anywhere we hold (U-IMG-1) and cannot be guessed — an allowlist entry is only useful if it is
 * exactly right — so the real value is read off a real cover URL and replaces this one, here and
 * in `TRUSTED_DOMAINS` together.
 */
export const TRUSTED_COVER_HOSTS: readonly TrustedCoverHost[] = [
  {
    host: 'cdn.example.invalid',
    reason:
      'Cover, horizontal cover, episode cover and poster images. Placeholder for the platform ' +
      'image host (U-IMG-1); also the host the catalogue fixtures use, so fixture data is ' +
      'checked by the same rule as production data rather than exempted from it.',
  },
];

/** The hostnames, sorted, in the form `checkImageUrl` compares. */
export function coverHostList(
  hosts: readonly TrustedCoverHost[] = TRUSTED_COVER_HOSTS,
): readonly string[] {
  return [...hosts].map((entry) => entry.host).sort((a, b) => a.localeCompare(b));
}

export interface CoverHostViolation {
  readonly host: string;
  readonly rule: string;
}

/**
 * Checks the registry, and checks it against the trusted domains.
 *
 * The second half is the point. Two lists that must agree and are maintained by hand disagree
 * eventually, and this particular disagreement is invisible in every environment where it can be
 * tested: a cover host missing from the Portal list works locally, works in CI, and shows a broken
 * image to a viewer. So the agreement is a test failure here instead.
 */
export function validateCoverHostRegistry(
  hosts: readonly TrustedCoverHost[] = TRUSTED_COVER_HOSTS,
  domains: readonly TrustedDomain[] = TRUSTED_DOMAINS,
): readonly CoverHostViolation[] {
  const violations: CoverHostViolation[] = [];
  const seen = new Set<string>();

  const imageDomains = new Map<string, string>();
  for (const domain of domains) {
    if (domain.usage !== 'image') continue;
    try {
      imageDomains.set(new URL(domain.url).hostname, domain.url);
    } catch {
      // A malformed entry is `validateDomainRegistry`'s violation to report, not this one's.
      // Reporting it twice would make one typo look like two problems in two lists.
    }
  }

  for (const { host, reason } of hosts) {
    const normalized = normalizeImageHost(host);

    if (normalized === null) {
      violations.push({
        host,
        rule: 'must be a bare hostname (no scheme, path, port or wildcard)',
      });
    } else if (normalized !== host) {
      // The comparison uses the parsed form, so an entry that is not already in that form would
      // silently mean something other than what it says. `CDN.Example.invalid` is the harmless
      // case; a name that needs punycode is the one nobody spots.
      violations.push({ host, rule: `must be written as it is compared (${normalized})` });
    }

    if (reason.trim() === '') {
      violations.push({ host, rule: 'must state why images may come from this host' });
    }

    if (seen.has(host)) {
      violations.push({ host, rule: 'no duplicate entries' });
    }
    seen.add(host);

    if (normalized !== null && !imageDomains.has(normalized)) {
      violations.push({
        host,
        rule: 'must also be a trusted domain with usage image, or the image is blocked on device',
      });
    }
  }

  const trusted = new Set(coverHostList(hosts));
  for (const [hostname, url] of imageDomains) {
    if (!trusted.has(hostname)) {
      violations.push({
        host: url,
        rule: 'a trusted domain with usage image must be a trusted cover host, or it buys nothing',
      });
    }
  }

  return violations;
}

/**
 * Is this a cover URL we will render?
 *
 * The registry is the default and the only list any caller should need. The parameter exists for
 * this file's own tests; passing an empty list refuses everything, which is the behaviour a caller
 * gets for free by not passing anything at all once the registry is real.
 *
 * On success the value is the URL as parsed. Render that string — a check against one spelling and
 * a render of another is not a check.
 */
export function checkCoverUrl(
  raw: unknown,
  hosts: readonly TrustedCoverHost[] = TRUSTED_COVER_HOSTS,
): Result<string, ImageUrlRejection> {
  return checkImageUrl(raw, coverHostList(hosts));
}

/** The same decision when the reason does not matter. */
export function isTrustedCoverUrl(
  raw: unknown,
  hosts: readonly TrustedCoverHost[] = TRUSTED_COVER_HOSTS,
): boolean {
  return isTrustedImageUrl(raw, coverHostList(hosts));
}
