# Handoff — Wave 13: the next durable store (sessions)

> **Slot:** W13, work slot (`bc-d26f106a`).
> **Branch:** `cursor/w13-work-durable-next-72c4`, cut from `origin/main` at `497f89f`.
> **Item:** `C3-06` / C2 **T2-2**, the next slice after unlock receipts: a SQLite `sessions` table
> behind the existing `SessionStore` interface. Same runner, same `DATABASE_URL=sqlite:` wiring,
> same refusal of a postgres URL.
> **Not in scope:** the other six in-memory stores (orders, webhook events, favourites, progress,
> catalogue, search directory), Postgres, Drizzle, Redis, D9, wallet GET API, episode picker. No
> pull request.

---

## 1. What was picked, and why

Unlocks already persist (`docs/handoff/w13-durable.md`). C3-06 names eight stores and says the
payment three should land first; unlocks was the first of those. Of what remains, **sessions** is
the next smallest named store: issue / resolve / revoke, a fingerprint key, a TTL, and a ceiling.
The backlog notes a lost session is recoverable by silent re-login (`C3-01`, already on `main`);
that is why it is smaller than the order store or the webhook event store, not why it should stay
a map. `DATABASE_URL=sqlite:` already opens a file for unlocks, and leaving sessions in memory
meant a bounce kept the receipt and signed the viewer out.

In flight at pick: wallet GET API (`bc-5678f211`), episode picker (`bc-1a2c6242`). Just landed:
observability request-id JSON logs (`497f89f`), L2 licenses. Different files.

---

## 2. What changed

### 2.1 Migration `0002_sessions`

`server/migrations/0002_sessions.{up,down}.sql`. The table is keyed by a SHA-256 fingerprint of
the access token, never by the token. `id INTEGER PRIMARY KEY` is insertion order for the ceiling
eviction. `expires_at_ms` is the instant the session dies; reading it does not extend it. The down
file drops the table. The existing runner applies both directions; an up without a down is still
refused.

The reverse check now covers both tables: after rollback, `INSERT INTO unlocks` and
`INSERT INTO sessions` fail with `no such table`; after a second up, both succeed.

### 2.2 One store, the existing interface

`createSqliteSessionStore` implements `SessionStore`. The interface stays synchronous —
`node:sqlite` `DatabaseSync` is synchronous — so no caller changes. The existing suite runs
against both implementations (`describe.each`). The ceiling still evicts oldest-first after
reclaiming expired rows. A dump of the table does not contain the raw token.

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens **one** file, migrates it, and puts SQLite behind both unlock
receipts and sessions. Two connections to two files would let a restart keep one store and lose
the other. Unset keeps every store in memory. A `postgres://` (or any other) URL is still
**refused at boot**. Redis is not read.

### 2.4 Restart

Login, close the process, open a new one on the same file: the same bearer token still identifies
the viewer (`GET /v1/users/me/watch-history` is 200, not 401). Unlock receipts already survived
this bounce; they still do, on the same connection. Orders and webhook events are still in memory.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0002_sessions.up.sql` / `.down.sql` | `sessions` table, fingerprint unique, integer id for eviction order |
| `server/src/modules/identity/sqlite-session-store.ts` | durable `SessionStore` |
| `server/src/modules/identity/session-store.ts` | comment: sqlite is the durable backend; Redis is not read |
| `server/src/modules/identity/session-store.test.ts` | suite against both backends |
| `server/src/modules/identity/sqlite-session-store.test.ts` | close/reopen; the table holds no raw token |
| `server/src/modules/identity/durable-session.test.ts` | process restart; postgres URL refused |
| `server/src/app.ts` | one sqlite connection for unlocks and sessions |
| `server/src/db/migrate.test.ts` | both tables up, down, and reverse-insert |
| `.env.example` | documents sessions on the sqlite file |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Sessions next, not orders or webhook events | Smallest remaining named store. Orders have status transitions; webhook events have a raw payload and an idempotency claim. Payment severity still favours those two next |
| D2 | Fingerprint column, not the token | The in-memory Map was already keyed by SHA-256. A table dump must not be a set of bearer credentials |
| D3 | Integer `id` for eviction order, not an index on `rowid` | `CREATE INDEX … (created_at_ms, rowid)` is `no such column: rowid` on `node:sqlite`. Two issues in one millisecond still need a total order |
| D4 | One connection for unlocks and sessions | A bounce that kept receipts and dropped sessions would look like "sqlite is wired" while every viewer is signed out |
| D5 | Interface stays synchronous | `DatabaseSync` is sync. Making `issue`/`resolve` async would touch every caller for no gain |
| D6 | Unset `DATABASE_URL` stays in-memory; `postgres://` fails closed | Same as unlocks. Do not rewrite a postgres URL to a file. Do not add Redis |

---

## 5. Mutations

**Index on `rowid`:** `CREATE INDEX sessions_created_at ON sessions (created_at_ms, rowid)` fails
at migrate-up with `no such column: rowid`, which also broke the unlock sqlite suite (the runner
applies every pending up). Replaced with `id INTEGER PRIMARY KEY`.

**Filter the sqlite backend out of `describe.each`:** the in-memory suite still passes and the
durable implementation is untested. Same trap as unlocks. Restored.

---

## 6. Verification

`pnpm verify` green on this branch (first try, exit 0). `origin/main` then moved to `2aea931`
(wallet GET API and episode picker). Merged; `server/src/app.ts` auto-merged (wallet routes next
to unlock, sqlite wiring untouched). Server tests 1,452. No overlap with identity or migrations.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 53 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,452 |
| `app` | 882 |
| **Total** | **2,469** |

Guardrails passed against `app/dist`. Bundle `index-ByxZPC2_.js` 323.28 kB (gzip 99.35 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **The other six stores.** Orders and webhook events are the remaining two C3-06 named as severe.
  Favourites, progress, catalogue, search directory after that.
- **PostgreSQL / Drizzle (T14 / T16).** Interfaces are in place (sessions stayed sync because
  sqlite is). Do not rewrite `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. The original session-store comment promised Redis at W7; this slice
  does not add a no-op client.
- **C3-05 D9.** Still the cheapest unblocked client item. Different files.

Wallet GET API (`bc-5678f211`) and episode picker (`bc-1a2c6242`) landed on `main` as `2aea931`
while this slot ran. This branch has taken them; `server/src/app.ts` auto-merged and the identity
and migration files do not overlap.
