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
  /** A presence flag only. The values themselves never leave the platform adapter. */
  readonly hasPlatformCredentials: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env['HOST'] ?? '0.0.0.0',
    port: Number.parseInt(env['PORT'] ?? '8080', 10),
    logLevel: env['LOG_LEVEL'] ?? 'info',
    hasPlatformCredentials: Boolean(env['TIKTOK_CLIENT_KEY'] && env['TIKTOK_CLIENT_SECRET']),
  };
}
