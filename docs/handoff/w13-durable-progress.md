# Handoff — Wave 13: the next durable store (watch progress)

> **Slot:** W13, work slot (`bc-2fda0be7`).
> **Branch:** `cursor/w13-work-durable-progress-72c4`, cut from `origin/main` at `45d6f65`.
> **Item:** `C3-06` / C2 **T2-2**, the next slice after webhook events: a SQLite `watch_progress`
> table behind the existing `WatchProgressStore` interface. Same runner, same
> `DATABASE_URL=sqlite:` wiring, same refusal of a postgres URL.
> **Not in scope:** the remaining four in-memory stores (orders, favourites, catalogue, search
> directory), Postgres, Drizzle, Redis, D9 (landed while this ran). No pull request.

---

## 1. What was picked, and why

`GET /v1/progress/dramas/{id}` is on main (`45d6f65`, `docs/handoff/w13-drama-progress.md`). The
handler was already fail-closed and shared the per-episode store; the store was still a map. A
bounce forgot every completed mark the picker had just painted.

Unlocks, sessions, and webhook events already persist. C3-06 names eight stores and says the
payment three should land first; two of those three are done (unlocks, webhook events) and
**orders** were in flight as `bc-d7eb8bf5`. Progress was the assigned fallback if the drama GET
had already landed with an in-memory store, which it had. Favourites stay in memory; they are the
next named store if a later slot finds progress already durable.

In flight at pick: orders sqlite (`bc-d7eb8bf5` — migrations; this slot took `0005` so the two
compose), wallet ledger UI (`bc-5894f9dd`, landed as D9 on `dd37df6` while this ran). Different
files from `watch_progress`.

---

## 2. What changed

### 2.1 Migration `0005_watch_progress`

`server/migrations/0005_watch_progress.{up,down}.sql`. One table:

- `watch_progress` — keyed `(user_id, episode_id)`, the primary key of
  `docs/12-domain-model.md` §7.1. `completed` is INTEGER 0/1, not TEXT. `seq INTEGER PRIMARY KEY`
  is insertion order for the capacity eviction (`node:sqlite` still rejects an index on `rowid`).
  A rewrite deletes and re-inserts so the row becomes newest, matching the in-memory Map's
  delete-then-set.
- `drama_id` is omitted. `WatchProgressRecord` does not carry it, and inventing a column no
  writer can fill honestly is how a later slot thinks the join is done. The drama GET still
  numbers rows through `catalog`.

`0004` is unused on purpose: the in-flight orders slot owns that version. A gap is fine; the
runner sorts by id and applies anything missing.

The down file drops the table. The existing runner applies both directions; an up without a down
is still refused. The reverse check now covers four stores: after rollback, `INSERT INTO unlocks`,
`INSERT INTO sessions`, `INSERT INTO webhook_events`, and `INSERT INTO watch_progress` fail with
`no such table`; after a second up, all four succeed.

### 2.2 One store, the existing interface

`createSqliteWatchProgressStore` implements `WatchProgressStore`. `save` stays unconditional —
the merge lives in `mergeReport`, and encoding last-write-wins here would make a sqlite write
disagree with an in-memory write of the same record. The existing suite runs against both
implementations (`describe.each`). The ceiling still evicts oldest-written after a rewrite.

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens **one** file, migrates it, and puts SQLite behind unlock
receipts, sessions, webhook events, **and** watch progress. Two connections to two files would
let a restart keep the receipt and drop a completed mark. Unset keeps every store in memory. A
`postgres://` (or any other) URL is still **refused at boot**. Redis is not read.

### 2.4 Restart

PUT a report that crosses the 0.9 completion threshold, close the process, open a new one on the
same file: `GET /v1/progress/dramas/{id}` still returns `completed: true` for that episode.
Unlock receipts, sessions, and webhook events already survived this bounce; they still do, on
the same connection. Orders stay in memory.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0005_watch_progress.up.sql` / `.down.sql` | `watch_progress` table, `(user_id, episode_id)` unique, integer seq for eviction |
| `server/src/modules/progress/sqlite-watch-progress-store.ts` | durable `WatchProgressStore` |
| `server/src/modules/progress/store.ts` | comment: sqlite is the durable backend; Redis is not read |
| `server/src/modules/progress/store.test.ts` | suite against both backends |
| `server/src/modules/progress/sqlite-watch-progress-store.test.ts` | close/reopen; completed is INTEGER |
| `server/src/modules/progress/durable-progress.test.ts` | process restart; completed marks survive; postgres URL refused |
| `server/src/app.ts` | one sqlite connection for unlocks, sessions, webhook events, and watch progress |
| `server/src/db/migrate.test.ts` | four stores up, down, and reverse-insert |
| `.env.example` | documents watch progress on the sqlite file |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Watch progress next, not orders or favourites | The drama GET was on main with an in-memory store. Orders were in flight. Favourites are the fallback if progress is already durable |
| D2 | Migration `0005`, not `0004` | Compose with the in-flight orders slot. Reusing `0004` is a collision; a gap is not |
| D3 | No `drama_id` column | The record type does not have it. Catalog still numbers the drama GET |
| D4 | INTEGER 0/1 for `completed`, not TEXT | A string column would make a dump lie about a boolean the picker paints from |
| D5 | `save` stays unconditional | The suite is the specification. LWW belongs in `mergeReport` (and later in a Postgres `WHERE`) |
| D6 | Integer `seq` for eviction order, not an index on `rowid` | Same `node:sqlite` trap as sessions and webhook events |
| D7 | One connection for unlocks, sessions, webhook events, and watch progress | A bounce that kept receipts and dropped completed marks would look like "sqlite is wired" while PNL-01 is unmarked |
| D8 | Unset `DATABASE_URL` stays in-memory; `postgres://` fails closed | Same as unlocks, sessions, and webhook events. Do not rewrite a postgres URL to a file. Do not add Redis |

---

## 5. Mutations

**Filter the sqlite backend out of `describe.each`:** the in-memory suite would still pass and the
durable implementation would be untested. Same trap as unlocks, sessions, and webhook events. Not
done.

**Reuse `0004`:** would collide with in-flight orders sqlite. Took `0005`.

---

## 6. Verification

`pnpm verify` green on this branch (first try, exit 0). `origin/main` then moved to `dd37df6`
(D9 capsule measurement / wallet ledger UI). Merged; no overlap with progress, migrations, or
`server/src/app.ts` sqlite wiring. Server tests 1,521. App tests 916 after taking D9.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,521 |
| `app` | 916 |
| **Total** | **2,574** |

Guardrails passed against `app/dist`. Bundle `index-Da9f2iuu.js` 327.17 kB (gzip 100.37 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **The other four stores.** Orders are the remaining C3-06 named as severe (`bc-d7eb8bf5`,
  migration `0004`). Favourites, catalogue, search directory after that.
- **PostgreSQL / Drizzle (T14 / T16).** The progress interface was already async. Do not rewrite
  `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. Progress is Redis-then-batched-upsert in the design; this slice does
  not add a no-op client.
- **`drama_id` on `watch_progress`.** Add it when a writer can fill it honestly, not before.

D9 (`bc-5894f9dd`) landed on `main` as `dd37df6` while this slot ran. This branch has taken it;
the chrome files do not overlap with watch-progress sqlite.
