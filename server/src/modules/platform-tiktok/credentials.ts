/**
 * TikTok platform credentials.
 *
 * `client_secret` is the webhook signing key (`docs/research/tiktok-minis-official.md` §6.3), so it
 * is the one value in this process whose disclosure lets anyone mint a payment callback. It is
 * therefore deliberately *not* a field on `ServerConfig`: that object is passed around, logged at
 * boot and asserted against in `config.test.ts`.
 *
 * The secret is held in a closure and reached only through `signingKey()`. No own property carries
 * it, so `JSON.stringify`, object spread, `Object.values` and `util.inspect` cannot leak it —
 * including from a log line nobody reviewed.
 */
export interface PlatformCredentials {
  /** Public value. Also present in the client bundle, so it is safe to log. */
  readonly clientKey: string;
  /** Presence flag. Callers branch on this instead of testing the secret itself. */
  readonly hasClientSecret: boolean;
  /**
   * The HMAC key for webhook verification. Returns an empty string when unset, which every caller
   * must treat as "cannot verify" — never as "verification passed".
   */
  readonly signingKey: () => string;
}

export function createPlatformCredentials(
  clientKey: string,
  clientSecret: string,
): PlatformCredentials {
  const secret = clientSecret;

  return {
    clientKey,
    hasClientSecret: secret.length > 0,
    signingKey: () => secret,
  };
}

export function loadPlatformCredentials(env: NodeJS.ProcessEnv = process.env): PlatformCredentials {
  return createPlatformCredentials(
    env['TIKTOK_CLIENT_KEY'] ?? '',
    env['TIKTOK_CLIENT_SECRET'] ?? '',
  );
}
