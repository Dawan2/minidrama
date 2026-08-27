# Handoff — Wave 13: the next durable store (coin unlock orders)

> **Slot:** W13, work slot (`bc-d7eb8bf5`).
> **Branch:** `cursor/w13-work-durable-orders-72c4`, cut from `origin/main` at `96788f3`.
> **Item:** `C3-06` / C2 **T2-2**, the remaining payment-severity store: a SQLite `unlock_orders`
> table behind the existing `UnlockOrderStore` interface. Same runner, same `DATABASE_URL=sqlite:`
> wiring, same refusal of a postgres URL.
> **Not in scope:** the remaining four in-memory stores (favourites, progress, catalogue, search
> directory), Postgres, Drizzle, Redis, D9, wallet ledger UI (`bc-5894f9dd`), drama-progress OpenAPI
> (`bc-046f6d65`). No pull request.

---

## 1. What was picked, and why

Unlocks persist (`docs/handoff/w13-durable.md`). Sessions persist
(`docs/handoff/w13-durable-next.md`). Webhook events persist
(`docs/handoff/w13-durable-webhooks.md`, `96788f3`). C3-06 names eight stores and says the payment
three should land first; this is the last of those. A bounce that forgot a `PENDING` order makes a
late callback match nothing, so the money is taken and the episode is never granted.

The order store was still in-memory on `96788f3`. No sibling was editing the migration runner
(webhook events is IDLE; wallet ledger UI and drama progress are a different file set). Favourites
were the fallback if orders were already durable; they were not.

In flight at pick: wallet ledger UI (`bc-5894f9dd`), drama progress OpenAPI (`bc-046f6d65`). This
slot did not touch picker, OpenAPI, or the wallet page.

---

## 2. What changed

### 2.1 Migration `0004_unlock_orders`

`server/migrations/0004_unlock_orders.{up,down}.sql`. One table:

- `unlock_orders` — one row per coin unlock intent. Three unique indexes, matching the in-memory
  Maps and `docs/handoff/w2-work-k.md`: `id`, `(user_id, idempotency_key)`, `trade_order_id`. The
  last is what makes callback correlation single-valued. `seq INTEGER PRIMARY KEY` is insertion
  order for the capacity eviction (`node:sqlite` still rejects an index on `rowid`). `status` is
  `PENDING` / `PAID` / `FULFILLED`; a CHECK is a dump-time backstop, not a second transition table.

The down file drops the table. The existing runner applies both directions; an up without a down is
still refused. The reverse check now covers four stores: after rollback, `INSERT INTO unlocks`,
`INSERT INTO sessions`, `INSERT INTO webhook_events`, and `INSERT INTO unlock_orders` fail with
`no such table`; after a second up, all four succeed.

### 2.2 One store, the existing interface

`createSqliteUnlockOrderStore` implements `UnlockOrderStore`. The interface was already async, so
no caller changes. The existing suite runs against both implementations (`describe.each`). Status
only changes through `advanceUnlockOrder`; there is no UPDATE that skips it. Unique-constraint
failures map to `IDEMPOTENCY_CONFLICT` and `TRADE_ORDER_TAKEN`.

### 2.3 Wiring, and what is refused

`DATABASE_URL=sqlite:<path>` opens **one** file, migrates it, and puts SQLite behind unlock
receipts, sessions, webhook events, **and** coin unlock orders. Two connections to two files would
let a restart keep the receipt and drop the pending order a late callback has to match. Unset keeps
every remaining store in memory. A `postgres://` (or any other) URL is still **refused at boot**.
Redis is not read.

### 2.4 Restart

POST a coin order, close the process, open a new one on the same file: `GET` still answers
`PENDING` with the same `tradeOrderId`. A signed payment callback after that bounce still matches
the order and records the payment. A second bounce keeps the paid (fulfilled) order. Unlock
receipts, sessions, and webhook events already survived this bounce; they still do, on the same
connection.

---

## 3. Files

| File | Contents |
| --- | --- |
| `server/migrations/0004_unlock_orders.up.sql` / `.down.sql` | `unlock_orders` with three unique indexes, integer seq for eviction |
| `server/src/modules/unlock/sqlite-order-store.ts` | durable `UnlockOrderStore` |
| `server/src/modules/unlock/order-store.ts` | comment: sqlite is the durable backend; options type shared |
| `server/src/modules/unlock/order-store.test.ts` | suite against both backends |
| `server/src/modules/unlock/sqlite-order-store.test.ts` | close/reopen; pending and paid survive |
| `server/src/modules/unlock/durable-order.test.ts` | process restart; postgres URL refused |
| `server/src/app.ts` | one sqlite connection for unlocks, sessions, webhook events, and orders |
| `server/src/db/migrate.test.ts` | four stores up, down, and reverse-insert |
| `.env.example` | documents coin unlock orders on the sqlite file |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | Orders next, not favourites | Last of the C3-06 payment-severity three. A bounce that forgot a pending order cannot match a late callback |
| D2 | Three unique indexes, not a unique id alone | Idempotency is per viewer; trade order id is the single correlation key. The in-memory Maps already enforced this |
| D3 | Integer `seq` for eviction order, not an index on `rowid` | Same `node:sqlite` trap as sessions and webhook events |
| D4 | Status only through `advanceUnlockOrder` | A store UPDATE that skipped the transition table would be a free episode with extra steps |
| D5 | One connection for unlocks, sessions, webhook events, and orders | A bounce that kept receipts and dropped the pending order would look like "sqlite is wired" while a late payment matches nothing |
| D6 | Unset `DATABASE_URL` stays in-memory; `postgres://` fails closed | Same as unlocks, sessions, and webhook events. Do not rewrite a postgres URL to a file. Do not add Redis |

---

## 5. Mutations

**Filter the sqlite backend out of `describe.each`:** the in-memory suite would still pass and the
durable implementation would be untested. Same trap as unlocks, sessions, and webhook events. Not
done.

---

## 6. Verification

`pnpm verify` green on this branch (exit 0, first try). `origin/main` was `96788f3` at pick
(webhook events sqlite). This branch is that commit plus coin unlock orders.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 53 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,485 |
| `app` | 882 |
| **Total** | **2,502** |

Guardrails passed against `app/dist`. Bundle `index-ByxZPC2_.js` 323.28 kB (gzip 99.35 kB).
`node:sqlite` is experimental on Node 22 and prints a warning; it is not a failure.

---

## 7. Left open

- **The other four stores.** Favourites, progress, catalogue, search directory. Payment severity
  is done for the three C3-06 named as severe (unlocks, orders, webhook events). Sessions already
  persist.
- **PostgreSQL / Drizzle (T14 / T16).** The order interface was already async. Do not rewrite
  `DATABASE_URL` to a file to make the swap look done.
- **Redis (T15).** Not read. Do not add it as a no-op client.
- **C3-05 D9.** Still the cheapest unblocked client item. Different files.

Wallet ledger UI (`bc-5894f9dd`) and drama progress OpenAPI (`bc-046f6d65`) were in flight at pick.
This slot did not touch OpenAPI, the episode picker, or the wallet page.
