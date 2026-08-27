# Handoff — Wave 13: the first durable store (unlock receipts)

> **Slot:** W13, work slot (`bc-1668e0df`).
> **Branch:** `cursor/w13-work-durable-72c4`, cut from `origin/main` at `a2122c1`.
> **Item:** `C3-06` / C2 **T2-2**, the smallest slice: reversible migrations plus one store behind
> the existing `UnlockStore` interface, on a SQLite file. The payment store C3-06 said to land
> first.
> **Not in scope:** the other seven in-memory stores, seed scale (sibling `bc-3fe41928`), wallet UI
> (`bc-5f167886`), Postgres, Drizzle, Redis, D9 capsule. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-3-backlog.md` C3-06 and `docs/verify/cycle-2-report.md` §3.4: C2's first exit
condition is that migrations run forward and roll back, and W10 found seven in-memory stores, no
`server/migrations`, and no schema tooling in any manifest. Nothing survives a restart. The three
payment stores are the severe ones; this slot takes the unlock store — a viewer who paid owns
nothing after a bounce — and the migration runner the other two will share.

C3-06 says not to split the task across slots. This is still a split: seed scale (≥80 episodes) is
a running sibling, and the other stores stay in memory. The alternative was boiling the ocean in
one slot or shipping a fake Redis. The suites are the specification; one implementation that
passes them and that a process restart cannot wipe is the slice.

Earlier Tier A code items on the board at pick time were already on `main` (CoverImage, paging
flakes, ERROR_OUTCOMES, silent re-login, VePlayer replace, C3-07 `DramaSummary`, gate writeback) or
in flight (wallet UI). D9 is still open and cheaper; it is a different file set and was not this
assignment.

---

## 2. What changed

### 2.1 Migrations that go both ways

`server/migrations/0001_unlocks.{up,down}.sql` and `server/src/db/migrate.ts`. drizzle-kit's
runner is forward-only, so the files are plain SQL with a matching down, and the runner applies
both. An up file without a down is refused. CI exercises this as tests, including the reverse
check: after rollback, `INSERT INTO unlocks` fails with `no such table`; after a second up, it
succeeds.

`pnpm --filter @minidrama/server migrate` / `migrate:down` wrap the same functions for an
operator. Tests do not go through the CLI.

### 2.2 One store, the existing interface

`createSqliteUnlockStore` implements `UnlockStore`. The insert is
`INSERT … ON CONFLICT (user_id, episode_id) DO NOTHING` — the unique index of
`docs/12-domain-model.md` §6.1, which is what the in-memory Map was simulating. The existing
suite now runs against both implementations (`describe.each`). `UNLOCK_NOT_RECORDED` is reachable
here (read-only file, closed connection), which it is not in memory, and that is the Result the
payment callback already knew how to handle.

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens the file, migrates it, and puts the SQLite store behind
entitlement and the payment sink. Unset keeps every store in memory, so existing tests are
unchanged. A `postgres://` (or any other) URL is **refused at boot** rather than rewritten to a
file. Redis is not read. T14 remains PostgreSQL; this slice does not pretend it is.

### 2.4 Restart

Grant an unlock, close the process, open a new one on the same file: the episode is still
playable. The order store and the webhook event store are still in memory, so they are new after
the bounce — playback does not ask them.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0001_unlocks.up.sql` / `.down.sql` | `unlocks` table, `(user_id, episode_id)` unique |
| `server/src/db/migrate.ts` | journal, up, down, refuse up-only files |
| `server/src/db/sqlite.ts` | `node:sqlite` `DatabaseSync` |
| `server/src/db/database-url.ts` | `memory` / `sqlite` / `unwired` |
| `server/src/db/cli.ts` | `migrate` / `migrate:down` |
| `server/src/modules/unlock/sqlite-unlock-store.ts` | durable `UnlockStore` |
| `server/src/app.ts` | sqlite when configured; close the connection on shutdown |
| `server/src/config.ts` | `database` from `DATABASE_URL` |
| `.env.example` | documents sqlite; postgres is not a working value |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | SQLite via `node:sqlite`, not Postgres, not `better-sqlite3`, not a fake Redis | CI can run up and down without Docker or a native addon. Node 22.14 already has the module |
| D2 | Plain SQL + a runner, not drizzle-kit | C2 requires rollback. drizzle-kit migrate is up-only. T16 still stands; a later slot can generate these files |
| D3 | Unlock store first | C3-06: lost receipts are paid content the viewer no longer owns. Orders and webhook replay are next, same runner |
| D4 | Unset `DATABASE_URL` stays in-memory | Tests that do not opt in must not start writing files. Durability is a configuration, not a silent default |
| D5 | `postgres://` fails closed | Serving sqlite behind a postgres URL is how the data layer gets marked done while still being a file |

---

## 5. Mutations

**Down file that does not drop the table** (journal deleted, table left):

```
FAIL  refuses an insert after rollback, and accepts one after a second up
AssertionError: expected [Function] to throw an error
```

**Filter the sqlite backend out of `describe.each`:** the in-memory suite still passes and the
durable implementation is untested. Restored. The contract is the suite; one implementation of it
is not enough.

---

## 6. Verification

Server tests at this slice: `src/db/migrate.test.ts` (7), `database-url.test.ts` (6),
`unlock-store.test.ts` (18 — 8 contract cases × 2 backends + 2 constructors),
`sqlite-unlock-store.test.ts` (2), `durable-unlock.test.ts` (2). `pnpm --filter @minidrama/server
test` green, 1,357 tests.

`pnpm verify` is the gate; numbers after it lands go here.

---

## 7. Left open

- **The other seven stores.** Sessions, orders, webhook events, favourites, progress, catalogue,
  search directory. Orders and webhook events are the other two C3-06 named as severe.
- **Seed scale.** ≥80 episodes. Sibling slot. This branch does not touch `fixtures.ts`.
- **PostgreSQL / Drizzle (T14 / T16).** The interfaces are async so the swap does not touch
  callers. Do not rewrite `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. Do not add it as a no-op client.
- **C3-05 D9.** Still the cheapest unblocked client item. Different files.
