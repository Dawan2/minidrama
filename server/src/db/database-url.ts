/**
 * What `DATABASE_URL` means in this process.
 *
 * T14 is PostgreSQL. This slice persists to a SQLite file so migrations can run forward and roll
 * back in CI without a Postgres (or a Redis). A `postgres:` URL is therefore **not** rewritten to a
 * file — that would be serving sqlite behind a postgres connection string, which is how a later
 * slot thinks the data layer is done. Unset keeps the in-memory stores so tests and an unconfigured
 * process behave as they do today. Redis is T15 and is not read at all. The sqlite file currently
 * holds unlock receipts, sessions, webhook events, watch progress, and favourites; the other stores
 * stay in memory.
 */

export type DatabaseConfig =
  | { readonly kind: 'memory' }
  | { readonly kind: 'sqlite'; readonly path: string }
  | { readonly kind: 'unwired'; readonly scheme: string };

export function parseDatabaseUrl(raw: string | undefined): DatabaseConfig {
  if (raw === undefined) return { kind: 'memory' };

  const value = raw.trim();
  if (value === '') return { kind: 'memory' };

  if (value === ':memory:' || value === 'sqlite::memory:' || value === 'sqlite:memory:') {
    return { kind: 'sqlite', path: ':memory:' };
  }

  if (value.startsWith('sqlite:')) {
    const rest = value.slice('sqlite:'.length);
    // `sqlite:///abs/path` is a three-slash URI. `sqlite:./relative` is a path, not a host.
    const path = rest.startsWith('///') ? rest.slice(2) : rest;
    if (path === '') return { kind: 'unwired', scheme: 'sqlite' };
    return { kind: 'sqlite', path };
  }

  const colon = value.indexOf(':');
  const scheme = colon === -1 ? value : value.slice(0, colon);
  return { kind: 'unwired', scheme: scheme === '' ? value : scheme };
}

export function databaseNotWiredMessage(scheme: string): string {
  return (
    `DATABASE_URL uses scheme "${scheme}", which is not wired. PostgreSQL is the production ` +
    'target (docs/architecture/tech-stack.md T14) and is not faked as a file. Set ' +
    'DATABASE_URL=sqlite:<path> for the durable sqlite slice, or unset it for in-memory stores.'
  );
}
