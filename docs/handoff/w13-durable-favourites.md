# Handoff — Wave 13: the next durable store (favourites)

> **Slot:** W13, work slot (`bc-a824ef82`).
> **Branch:** `cursor/w13-work-durable-favourites-72c4`, cut from `origin/main` at `8c2ec29`.
> **Item:** `C3-06` / C2 **T2-2**, the next slice after watch progress: a SQLite `favorite` table
> behind the existing `FavoritesStore` interface. Same runner, same `DATABASE_URL=sqlite:` wiring,
> same refusal of a postgres URL.
> **Not in scope:** the remaining two in-memory stores (catalogue, search directory), Postgres,
> Drizzle, Redis, C3-more chrome (`bc-7cccf28c`). No pull request.

---

## 1. What was picked, and why

Watch progress persists (`docs/handoff/w13-durable-progress.md`, `8c2ec29`). C3-06 names eight
stores; unlocks, sessions, webhook events, and watch progress were already on the file. **Orders**
were in flight as `bc-d7eb8bf5` and own migration `0004`. Favourites were the assigned next named
store once progress was durable, which it was. A bounce forgot every heart SCR-08 had just shown.

Catalogue and search directory stay in memory: they rehydrate from the same seed, so a restart
does not lose a viewer's decision the way a forgotten favourite does.

In flight at pick: orders sqlite (`bc-d7eb8bf5` — this slot took `0006` so the two compose), C3-more
chrome (`bc-7cccf28c`, app routes, not migrations). Different files from `favorite`.

---

## 2. What changed

### 2.1 Migration `0006_favorites`

`server/migrations/0006_favorites.{up,down}.sql`. One table:

- `favorite` — keyed `(user_id, drama_id)`, the primary key `favorites.ts` already named.
  `created_at_ms` is epoch milliseconds, INTEGER, not TEXT. `seq INTEGER PRIMARY KEY` is insertion
  order for the capacity eviction (`node:sqlite` still rejects an index on `rowid`). A repeated add
  is `INSERT … ON CONFLICT DO NOTHING`, so neither the timestamp nor `seq` moves, matching the
  in-memory Map that does not re-insert.
- Index `(user_id, created_at_ms DESC, drama_id DESC)` for the keyset list. The in-memory map
  scans instead.

`0004` is unused on this branch on purpose: the in-flight orders slot owns that version. A gap is
fine; the runner sorts by id and applies anything missing. Orders then landed on `origin/main` as
`0004_unlock_orders` while this slot ran; this branch has taken that merge. `0005` remains watch
progress. The three compose.

The down file drops the table. The existing runner applies both directions; an up without a down
is still refused. The reverse check now covers six stores: after rollback, `INSERT INTO unlocks`,
`INSERT INTO sessions`, `INSERT INTO webhook_events`, `INSERT INTO unlock_orders`,
`INSERT INTO watch_progress`, and `INSERT INTO favorite` fail with `no such table`; after a
second up, all six succeed.

### 2.2 One store, the existing interface

`createSqliteFavoritesStore` implements `FavoritesStore`. `add` keeps the original timestamp —
rewriting "following since" on a retry would make a sqlite write disagree with an in-memory write
of the same pair. `list` is the keyset
`(created_at_ms, drama_id) < (cursor)` ordered descending on both, `LIMIT limit + 1`, so `hasMore`
is observed rather than guessed. The existing suite runs against both implementations
(`describe.each`). The ceiling still evicts oldest-inserted; a repeated add does not reorder it.

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens **one** file, migrates it, and puts SQLite behind unlock
receipts, sessions, webhook events, coin unlock orders, watch progress, **and** favourites. Two
connections to two files would let a restart keep the receipt and drop a heart. Unset keeps every
remaining store in memory. A `postgres://` (or any other) URL is still **refused at boot**. Redis
is not read.

### 2.4 Restart

PUT a favourite, close the process, open a new one on the same file: `GET /v1/dramas/{id}/favorite`
still reports `favorited: true` with the original timestamp, and `GET /v1/users/me/favorites`
still lists it. Unlock receipts, sessions, webhook events, coin unlock orders, and watch progress
already survived this bounce; they still do, on the same connection. Catalogue and search
directory stay in memory.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0006_favorites.up.sql` / `.down.sql` | `favorite` table, `(user_id, drama_id)` unique, integer seq for eviction |
| `server/src/modules/search/sqlite-favorites-store.ts` | durable `FavoritesStore` |
| `server/src/modules/search/favorites.ts` | comment: sqlite is the durable backend; Redis is not read |
| `server/src/modules/search/favorites.test.ts` | suite against both backends |
| `server/src/modules/search/sqlite-favorites-store.test.ts` | close/reopen; `created_at_ms` is INTEGER |
| `server/src/modules/search/durable-favorites.test.ts` | process restart; favourites survive; postgres URL refused |
| `server/src/app.ts` | one sqlite connection including favourites |
| `server/src/db/migrate.test.ts` | six stores up, down, and reverse-insert |
| `.env.example` | documents favourites on the sqlite file |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Favourites next, not catalogue or search directory | Progress was already durable. Orders were in flight. A forgotten favourite is a viewer's decision; a forgotten catalogue reverts to the seed |
| D2 | Migration `0006`, not `0004` | Compose with the in-flight orders slot. Reusing `0004` is a collision; a gap is not |
| D3 | Table name `favorite`, column `created_at_ms` | The interface comments already named the table. Other sqlite timestamps are epoch milliseconds with an `_ms` suffix |
| D4 | `INSERT … ON CONFLICT DO NOTHING` | The suite is the specification. A retry must not restamp "following since" |
| D5 | Integer `seq` for eviction order, not an index on `rowid` | Same `node:sqlite` trap as sessions, webhook events, orders, and watch progress |
| D6 | One connection for every durable store | A bounce that kept receipts and dropped hearts would look like "sqlite is wired" while SCR-08 is empty |
| D7 | Unset `DATABASE_URL` stays in-memory; `postgres://` fails closed | Same as unlocks, sessions, webhook events, orders, and watch progress. Do not rewrite a postgres URL to a file. Do not add Redis |

---

## 5. Mutations

**Filter the sqlite backend out of `describe.each`:** the in-memory suite would still pass and the
durable implementation would be untested. Same trap as unlocks, sessions, webhook events, orders,
and watch progress. Not done.

**Reuse `0004`:** would collide with in-flight (now landed) orders sqlite. Took `0006`.

---

## 6. Verification

`pnpm verify` green on this branch (format fix on the first try, then exit 0). `origin/main` then
moved to `fcc6fd6` (coin unlock orders as `0004`). Merged; conflicts in `app.ts`, `migrate.test.ts`,
`.env.example`, and the sqlite-file comments — resolved by listing both stores. `pnpm verify` green
again after the merge. Server tests 1,565. App tests 916. No overlap with C3-more chrome.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,565 |
| `app` | 916 |
| **Total** | **2,618** |

Guardrails passed against `app/dist`. Bundle `index-Da9f2iuu.js` 327.17 kB (gzip 100.37 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **The other two stores.** Catalogue and search directory rehydrate from the seed. They are the
  last of C3-06's eight.
- **PostgreSQL / Drizzle (T14 / T16).** The favourites interface was already async. Do not rewrite
  `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. This slice does not add a no-op client.

Orders (`bc-d7eb8bf5`) landed on `main` as `fcc6fd6` while this slot ran. This branch has taken
them; `0004_unlock_orders` and `0006_favorites` sit on the same runner and the same file.
