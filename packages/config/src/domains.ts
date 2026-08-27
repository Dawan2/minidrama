/**
 * The single source of truth for trusted domains.
 *
 * The platform enforces two lists that must agree: the Developer Portal trusted-domain
 * configuration and `domain.*` in `minis.config.json`. Maintaining them by hand is how a
 * request silently starts failing on device only. Both are generated from this file
 * (`docs/architecture/system-overview.md` §3.2, `docs/architecture/tech-stack.md` §6).
 *
 * Platform rules, all enforced by `validateDomainRegistry` and covered by tests:
 *   - at most 20 entries
 *   - `https://` or `wss://` only
 *   - no wildcards
 *   - no path, query or fragment components
 */

export type TrustedDomainUsage = 'api' | 'websocket' | 'sdk';

export interface TrustedDomain {
  readonly url: string;
  readonly usage: TrustedDomainUsage;
  /** Why this domain exists. A domain nobody can justify is a domain that should be removed. */
  readonly reason: string;
}

export const MAX_TRUSTED_DOMAINS = 20;

/**
 * Wave 1 placeholders. `.invalid` is reserved by RFC 2606 and can never resolve, so a skeleton
 * that accidentally ships would fail loudly rather than talk to someone else's host. Wave 2
 * replaces these with the real API domains as they are registered in the Portal.
 */
export const TRUSTED_DOMAINS: readonly TrustedDomain[] = [
  {
    url: 'https://api.example.invalid',
    usage: 'api',
    reason: 'Drama API — the only origin the client calls directly. Placeholder until W2.',
  },
  {
    url: 'https://connect.tiktok-minis.com',
    usage: 'sdk',
    reason:
      'Platform SDK host (the one sanctioned external script tag). Registered defensively: ' +
      'whether the SDK host consumes a trusted-domain slot is unconfirmed (U-19).',
  },
];

export interface DomainViolation {
  readonly url: string;
  readonly rule: string;
}

export function validateDomainRegistry(
  domains: readonly TrustedDomain[] = TRUSTED_DOMAINS,
): readonly DomainViolation[] {
  const violations: DomainViolation[] = [];
  const seen = new Set<string>();

  if (domains.length > MAX_TRUSTED_DOMAINS) {
    violations.push({
      url: `<registry:${String(domains.length)}>`,
      rule: `at most ${String(MAX_TRUSTED_DOMAINS)} trusted domains`,
    });
  }

  for (const domain of domains) {
    const { url } = domain;

    if (url.includes('*')) {
      violations.push({ url, rule: 'no wildcards' });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      violations.push({ url, rule: 'must be an absolute URL' });
      continue;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'wss:') {
      violations.push({ url, rule: 'scheme must be https: or wss:' });
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      violations.push({ url, rule: 'no path component' });
    }
    if (parsed.search !== '' || parsed.hash !== '') {
      violations.push({ url, rule: 'no query or fragment component' });
    }
    if (url.endsWith('/')) {
      violations.push({ url, rule: 'no trailing slash (the Portal stores bare origins)' });
    }
    if (seen.has(url)) {
      violations.push({ url, rule: 'no duplicate entries' });
    }
    seen.add(url);
  }

  return violations;
}

/** The list to paste into the Developer Portal, in the order the Portal shows it. */
export function portalDomainList(
  domains: readonly TrustedDomain[] = TRUSTED_DOMAINS,
): readonly string[] {
  return [...domains].map((domain) => domain.url).sort((a, b) => a.localeCompare(b));
}
