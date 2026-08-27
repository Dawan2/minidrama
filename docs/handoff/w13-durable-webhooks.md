# Handoff — Wave 13: the next durable store (webhook events)

> **Slot:** W13, work slot (`bc-a20c83ad`).
> **Branch:** `cursor/w13-work-durable-webhooks-72c4`, cut from sessions sqlite at `121411d`
> (`cursor/w13-work-durable-next-72c4`). Sessions was not yet on `origin/main` at pick time.
> **Item:** `C3-06` / C2 **T2-2**, the next slice after sessions: a SQLite `webhook_events` table
> (and a unique `webhook_idempotency_keys` table) behind the existing `WebhookEventStore`
> interface. Same runner, same `DATABASE_URL=sqlite:` wiring, same refusal of a postgres URL.
> **Not in scope:** the remaining five in-memory stores (orders, favourites, progress, catalogue,
> search directory), Postgres, Drizzle, Redis, D9, drama-progress OpenAPI (`bc-046f6d65`), C3
> remainder (`bc-da8da7ff`). No pull request.

---

## 1. What was picked, and why

Unlocks persist (`docs/handoff/w13-durable.md`). Sessions persist
(`docs/handoff/w13-durable-next.md`, `121411d`). C3-06 names eight stores and says the payment
three should land first; unlocks was the first of those, sessions the smallest remaining named
store. Of what remains, **webhook events** are the next payment-severity store: a redelivery after
a bounce must still be a duplicate, or a paid order is honoured twice. Orders have status
transitions and stay in memory for the next slot.

The webhook store was still in-memory on `121411d`. No sibling was editing the migration runner
(sessions is IDLE; drama progress and C3 remainder are OpenAPI). Orders were the fallback if
webhooks were already durable; they were not.

In flight at pick: drama progress OpenAPI (`bc-046f6d65`), C3 remainder (`bc-da8da7ff`). Different
files.

---

## 2. What changed

### 2.1 Migration `0003_webhook_events`

`server/migrations/0003_webhook_events.{up,down}.sql`. Two tables in one migration:

- `webhook_events` — one row per delivery. `raw_payload` is a BLOB, never TEXT, so bytes that are
  not valid UTF-8 survive and a stored event stays re-verifiable. `seq INTEGER PRIMARY KEY` is
  insertion order for the capacity eviction (`node:sqlite` still rejects an index on `rowid`).
  `idempotency_key` on the event is the last key this delivery claimed, including when it lost;
  that column is not unique, because a losing redelivery still records the key on its own row.
- `webhook_idempotency_keys` — `key TEXT PRIMARY KEY`. First INSERT wins. Evicting an old event
  does not drop a claimed key, matching the in-memory `Set`.

The down file drops both. The existing runner applies both directions; an up without a down is
still refused. The reverse check now covers three stores: after rollback, `INSERT INTO unlocks`,
`INSERT INTO sessions`, and `INSERT INTO webhook_events` fail with `no such table`; after a
second up, all three succeed.

### 2.2 One store, the existing interface

`createSqliteWebhookEventStore` implements `WebhookEventStore`. The interface was already async,
so no caller changes. The existing suite runs against both implementations (`describe.each`).
The claim is `INSERT OR IGNORE` into the keys table inside a transaction that also stamps the
event row, so a losing claimant still carries the key.

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens **one** file, migrates it, and puts SQLite behind unlock
receipts, sessions, **and** webhook events. Two connections to two files would let a restart keep
the receipt and honour a redelivery as a new payment. Unset keeps every store in memory. A
`postgres://` (or any other) URL is still **refused at boot**. Redis is not read.

### 2.4 Restart

POST a signed webhook, close the process, open a new one on the same file: the same delivery
answers `{ received: true, duplicate: true }`. Unlock receipts and sessions already survived this
bounce; they still do, on the same connection. Orders stay in memory.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0003_webhook_events.up.sql` / `.down.sql` | `webhook_events` BLOB payload, unique claim table, integer seq for eviction |
| `server/src/modules/platform-tiktok/sqlite-event-store.ts` | durable `WebhookEventStore` |
| `server/src/modules/platform-tiktok/event-store.ts` | comment: sqlite is the durable backend; options type shared |
| `server/src/modules/platform-tiktok/event-store.test.ts` | suite against both backends |
| `server/src/modules/platform-tiktok/sqlite-event-store.test.ts` | close/reopen; BLOB is not TEXT |
| `server/src/modules/platform-tiktok/durable-webhook.test.ts` | process restart; postgres URL refused |
| `server/src/app.ts` | one sqlite connection for unlocks, sessions, and webhook events |
| `server/src/db/migrate.test.ts` | three stores up, down, and reverse-insert |
| `.env.example` | documents webhook events on the sqlite file |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Webhook events next, not orders | Payment severity. A bounce that forgot the claim honours a paid redelivery. Orders have status transitions and are the remaining C3-06 named store |
| D2 | BLOB column, not TEXT | The signature covers bytes. A string column that decoded and re-encoded would substitute U+FFFD and make a stored event unverifiable |
| D3 | Separate unique keys table, not a unique column on the event | The in-memory store records the key on the losing claimant too. A unique event column cannot do that |
| D4 | Eviction does not drop claimed keys | The in-memory `Set` survived capacity eviction. A flood must not reopen a paid order |
| D5 | Integer `seq` for eviction order, not an index on `rowid` | Same `node:sqlite` trap as sessions |
| D6 | One connection for unlocks, sessions, and webhook events | A bounce that kept receipts and dropped the claim would look like "sqlite is wired" while a redelivery pays twice |
| D7 | Unset `DATABASE_URL` stays in-memory; `postgres://` fails closed | Same as unlocks and sessions. Do not rewrite a postgres URL to a file. Do not add Redis |

---

## 5. Mutations

**Prettier wrap on the close/reopen claim assertion.** `format:check` refused a 101-character
`claimIdempotencyKey` line. Split the arguments. No behaviour change.

**Filter the sqlite backend out of `describe.each`:** the in-memory suite would still pass and the
durable implementation would be untested. Same trap as unlocks and sessions. Not done.

---

## 6. Verification

`pnpm verify` green on this branch (exit 0 after the Prettier wrap). `origin/main` was still
`2aea931` at pick (sessions sqlite lived only on `cursor/w13-work-durable-next-72c4` at
`121411d`). This branch is that commit plus webhook events.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 53 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,469 |
| `app` | 882 |
| **Total** | **2,486** |

Guardrails passed against `app/dist`. Bundle `index-ByxZPC2_.js` 323.28 kB (gzip 99.35 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **The other five stores.** Orders are the remaining C3-06 named as severe. Favourites, progress,
  catalogue, search directory after that.
- **PostgreSQL / Drizzle (T14 / T16).** The webhook interface was already async. Do not rewrite
  `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. Do not add it as a no-op client.
- **C3-05 D9.** Still the cheapest unblocked client item. Different files.

Drama progress OpenAPI (`bc-046f6d65`) and C3 remainder (`bc-da8da7ff`) were in flight at pick.
This slot did not touch OpenAPI, wallet transactions, or their files.
