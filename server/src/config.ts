import { isTestLoginEnabled } from './modules/identity/test-login.js';
import { parseDatabaseUrl } from './db/database-url.js';
import { parseOriginAllowlist } from './core/origin-policy.js';
import type { DatabaseConfig } from './db/database-url.js';
import type { RejectedOrigin } from './core/origin-policy.js';

/**
 * Server configuration.
 *
 * Secrets are read from the environment and are never logged, never returned by an endpoint and
 * never shared with the client bundle (`docs/architecture/system-overview.md` §12). `.env.example`
 * documents every variable with a placeholder.
 */
export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  /**
   * The browser origins allowed to read a response from this API. Empty by default and empty
   * whenever the variable is unusable: there is no value of `CORS_ALLOWED_ORIGINS` that means
   * "any origin", because `*` on an API that reads an `Authorization` header is not a
   * configuration option (`core/origin-policy.ts`).
   */
  readonly corsAllowedOrigins: readonly string[];
  /** Entries that were discarded, kept so a typo is a log line rather than a silent outage. */
  readonly corsRejectedOrigins: readonly RejectedOrigin[];
  /** A presence flag only. The values themselves never leave the platform adapter. */
  readonly hasPlatformCredentials: boolean;
  /**
   * Accepted clock skew for a webhook timestamp, in seconds. The TikTok IAP page suggests five
   * minutes (`docs/research/tiktok-minis-official.md` §6.3). It is not a secret and it is not a
   * switch: no value disables verification, and a non-positive or unparseable value falls back to
   * the default rather than widening the window.
   */
  readonly webhookToleranceSec: number;
  /**
   * Whether the mock login path is live. False for every deployment that has not deliberately asked
   * for it twice, in two variables, one of which is a sentence — see
   * `modules/identity/test-login.ts`. It is read here rather than in the module so that the whole of
   * what the environment can switch on is visible in one file.
   */
  readonly testLoginEnabled: boolean;
  /**
   * Where durable stores read and write. Unset is in-memory, `sqlite:<path>` is unlock receipts,
   * sessions, webhook events, coin unlock orders, watch progress, favourites, and the catalogue,
   * and any other scheme is `unwired` so a postgres URL cannot silently become a file.
   */
  readonly database: DatabaseConfig;
}

const DEFAULT_WEBHOOK_TOLERANCE_SEC = 300;

function parseToleranceSec(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_WEBHOOK_TOLERANCE_SEC;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEBHOOK_TOLERANCE_SEC;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = parseOriginAllowlist(env['CORS_ALLOWED_ORIGINS']);

  return {
    host: env['HOST'] ?? '0.0.0.0',
    port: Number.parseInt(env['PORT'] ?? '8080', 10),
    logLevel: env['LOG_LEVEL'] ?? 'info',
    corsAllowedOrigins: origins.allowed,
    corsRejectedOrigins: origins.rejected,
    hasPlatformCredentials: Boolean(env['TIKTOK_CLIENT_KEY'] && env['TIKTOK_CLIENT_SECRET']),
    webhookToleranceSec: parseToleranceSec(env['TIKTOK_WEBHOOK_TOLERANCE_SEC']),
    testLoginEnabled: isTestLoginEnabled(env),
    database: parseDatabaseUrl(env['DATABASE_URL']),
  };
}
