import { randomBytes } from 'node:crypto';

/**
 * Session issuance.
 *
 * The token is opaque random bytes, not a JWT yet. Two things about it are not placeholders and must
 * survive the switch to signed sessions:
 *
 *   - it is **not derived from `open_id`**. A token that encodes the user identifier without a
 *     signature is a token an attacker can construct;
 *   - it is generated with a CSPRNG. `Math.random` would be a predictable session token, which is
 *     the same defect wearing a different hat.
 *
 * On Minis the client keeps the access token in memory only and re-runs silent login when it
 * expires, so there is no refresh token to issue here (`docs/design/api-contracts.md` §5).
 */

export interface Session {
  readonly accessToken: string;
  readonly expiresInSec: number;
}

export interface SessionIssuer {
  issue(openId: string): Session;
}

export interface SessionIssuerOptions {
  readonly ttlSec?: number;
  /** Injected only by tests that need a deterministic token. */
  readonly generateToken?: () => string;
}

export function createSessionIssuer(options: SessionIssuerOptions = {}): SessionIssuer {
  const ttlSec = options.ttlSec ?? 3600;
  const generateToken = options.generateToken ?? (() => randomBytes(32).toString('base64url'));

  return {
    issue: (_openId: string): Session => ({
      accessToken: generateToken(),
      expiresInSec: ttlSec,
    }),
  };
}
