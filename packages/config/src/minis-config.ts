import { TRUSTED_DOMAINS, portalDomainList, validateDomainRegistry } from './domains.js';
import type { TrustedDomain } from './domains.js';

/**
 * `minis.config.json` generation.
 *
 * The complete field set of this file is not documented publicly and is registered as an open
 * item (U-11 / O-4): it is confirmed against the output of `minis init` in Wave 2. This
 * generator therefore emits only the fields the architecture depends on — the two domain lists —
 * and merges anything else through untouched, so that filling in the real schema later is an
 * additive change rather than a rewrite.
 */
export interface MinisConfig {
  readonly domain: {
    readonly trustedDomains: readonly string[];
    readonly allowList: readonly string[];
  };
  readonly [key: string]: unknown;
}

export class DomainRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainRegistryError';
  }
}

export function buildMinisConfig(
  domains: readonly TrustedDomain[] = TRUSTED_DOMAINS,
  extra: Readonly<Record<string, unknown>> = {},
): MinisConfig {
  const violations = validateDomainRegistry(domains);
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.url}: ${v.rule}`).join('; ');
    throw new DomainRegistryError(`trusted domain registry is invalid — ${detail}`);
  }

  const urls = portalDomainList(domains);
  return {
    ...extra,
    domain: {
      trustedDomains: urls,
      allowList: urls,
    },
  };
}

/** Serialized exactly as the generator writes it, so a byte comparison is a valid drift check. */
export function serializeMinisConfig(config: MinisConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
