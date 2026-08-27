# W13 — C3-04 remainder: `GET /v1/wallet/transactions`, fail-closed

> **Slot:** W13, work slot (`bc-da8da7ff`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-c3-remain-72c4`, cut from `origin/main` at `cee5075`.
> **Item:** the leftover of `C3-04` after `GET /v1/wallet`. The client already probes
> `GET /v1/wallet/transactions`; this slot serves it. Empty ledger if the platform sent no
> rows. Unlocks never become spend (S73). Coins only; no Beans rate (`C3-09`).
> **Not in scope:** SCR-10/PNL-03 recharge, SCR-11 VIP, PNL-01 episode picker
> (`bc-1a2c6242`), sqlite next-store (`bc-d26f106a`), cycle-4. No pull request.

---

## 1. What was picked, and why

`GET /v1/wallet` landed on `main` (`cee5075` / `ff692d7`). Its sibling, the ledger the
wallet screen already fetches, was still absent: the not-found handler answered `404` and
the client drew the empty-ledger card. That is an honest client; it is not a served page.

The assignment: add the fail-closed server route. Auth required. If the platform has not
given us a movement list, answer `200` with `{ items: [], pageInfo: { nextCursor: null,
hasMore: false } }`. Never fill that page from unlock receipts — S73 still holds: a
verified payment grants the episode, and inventing a `CONSUME` against a coin ledger this
process does not own would be bookkeeping somebody would have to unpick. OpenAPI and the
router stay in lockstep (D-04).

In flight at start: sqlite next-store (`bc-d26f106a`), episode picker PNL-01 (`bc-1a2c6242`).
This slot did not touch those files.

---

## 2. What changed

### 2.1 The contract

`GET /v1/wallet/transactions` in `contracts/openapi.yaml`, operationId
`listWalletTransactions`, tag `wallet`. Query: `cursor`, `limit` (default 20, max 100),
`type?` (`RECHARGE` | `CONSUME` | `REWARD` | `REFUND`). Unknown `type` is `400`, not an
empty page that looks like "this viewer has no CONSUMEs".

`WalletTransaction` requires `id` and `type`. Deltas, `refType`/`refId` and `createdAt` are
optional: a missing `coinDelta` is not `0`. Beans, fiat and a coin→Beans rate are not in
the schema.

`server/src/contract.test.ts` asserts the path both ways. An unauthenticated inject
answers `401`, not `404`.

### 2.2 The handler

Same `requireViewer` seam as `GET /v1/wallet`. `Cache-Control: private, no-store` on every
answer (CA-3). The rows come from `WalletLedgerPort`:

| Port result | HTTP |
| --- | --- |
| `UNAVAILABLE` (default) | `200` empty page |
| `KNOWN` with rows | `200` with those rows, most-recent first |
| `LEDGER_UNREADABLE` | `503` — we could not complete the check |
| `INVALID_CURSOR` | `400` |

The default is `createUnavailableWalletLedgerPort`. It does not read the unlock store. A
viewer who paid for an episode still sees an empty ledger, because the platform charged
the trade order and nothing here posted a coin movement.

`toWalletTransaction` copies the closed key set and nothing else. A `beansAmount` stuffed
onto a row is dropped. A row without `id` or a domain `type` is dropped. A missing delta
stays missing.

### 2.3 Shared type

`packages/shared/src/wallet.ts` gains `WalletTransaction` and the two enums. A compile-time
assertion rejects Beans, fiat and rate keys on the type, same as `WalletView`.

### 2.4 Client comments

`wallet-api.ts` and `WalletPage.tsx` now say the route is served. Behaviour is unchanged:
an empty page is still the empty ledger; a `404` is still drawn as unavailable/empty.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 An unlock receipt becomes `{ type: "CONSUME", coinDelta: -300 }`

```
FAIL  src/modules/wallet/routes.test.ts > GET /v1/wallet/transactions — fail-closed empty ledger > does not turn an unlock receipt into a CONSUME row
AssertionError: expected { items: [ { type: 'CONSUME', coinDelta: -300, … } ], … } to deeply equal { items: [], pageInfo: { nextCursor: null, hasMore: false } }
```

That is S73 leaking into the ledger: a spend we invented from a grant, against a coin
balance that does not exist.

### 3.2 `beansAmount: 60` is copied onto every row

```
FAIL  src/modules/wallet/view.test.ts > toWalletTransactionPage > drops Beans and fiat keys rather than quoting them as coin movement
AssertionError: expected { id: 'txn_1', type: 'RECHARGE', coinDelta: 100, beansAmount: 60 } to deeply equal { id: 'txn_1', type: 'RECHARGE', coinDelta: 100 }
```

That is C3-09 leaking into the ledger: a Beans amount displayed as if it were a coin
movement, with no rate.

---

## 4. Verify

`pnpm verify` exited 0 on this branch at `c15ff74`.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,450 |
| `app` | 857 |
| **Total** | **2,444** |

Format, lint, typecheck, test, build, guardrails all green. Artifact
`dist/assets/index-CQnFIqTJ.js` 318.14 kB / 98.12 kB gzip (unchanged: comments only on the
client). Guardrails passed.

New server tests: 3 (ledger-port) + 5 (query) + 5 (view) + 14 (routes) + 2 (app) + 1
(`contract.test.ts` `it.each` for the new path) = 30. Shared: 2.

---

## 5. What is still open

- **A real ledger.** Needs a platform movement API or a ledger this process owns and
  writes. The port is the seam. Do not default it to spend-from-unlocks while waiting.
- **A real coin figure.** Same as the wallet GET slot. The balance port is unchanged.
- **SCR-10 / PNL-03 recharge.** Blocked on a Beans rate (`C3-09`) and on `pay()`.
- **SCR-11 VIP.** No subscription contract.
- **PNL-01 episode picker.** In flight (`bc-1a2c6242`); different files.
- **C3-09.** Still a missing business input. No rate was written.
- **Durable stores besides unlock.** In flight (`bc-d26f106a`); not this slot.

Sqlite next-store and the episode picker were running and were not touched.
