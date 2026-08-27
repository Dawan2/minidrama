# W16 — C5-02 / D-18: merge `GET /v1/wallet/transactions`

> **Slot:** W16, work slot (`bc-8f301285`). One backlog item, no pull request.
> **Branch:** `cursor/w16-work-c5-follow-72c4`, cut from `origin/main` at `0cb0504`
> (PLY-010 playNext+swipe on main, after PRG-001 compose). Merged forward onto `26b3c97`
> (drama-detail Continue CTA landed while this slot verified; no file overlap).
> **Item:** `C5-02` / **D-18** / **X-25** — merge the leftover
> `cursor/w13-work-c3-remain-72c4` ledger (`GET /v1/wallet/transactions`, fail-closed empty
> page) onto this tree. Not a second implementation. Lockstep: OpenAPI, router, client probe.
> **Not in scope:** D-17 billing, C4-03 Postgres, C4-07 VIP, C5-01 / D-20 G1.10
> (`bc-fed59ba3`), drama-detail Continue CTA (`bc-5d32d64f`, landed at `26b3c97` while this
> slot verified), PLY-010 / PRG-001 (already on `main`), Beans, `#/vip`. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-5-backlog.md` remaining unblocked engineering after skipping D-17, C4-03,
and C4-07, and after protocol-C4 slices already on `main` or in flight:

| Item | State |
| --- | --- |
| PLY-010 autoplay / swipe `playNext` | on `main` at `0cb0504` (`bc-2fd6c885`) |
| PRG-001 cross-end conflict case | on `main` at `8e5c803` (`bc-3c74c2c9`) |
| Third playback exit | **Landed** `26b3c97` as SCR-04 drama-detail Continue (`bc-5d32d64f`) |
| C5-01 / D-20 G1.10 | in flight (`bc-fed59ba3`, "next C5 after PRG-001") |
| D-17 / C4-03 / C4-07 | skipped; cannot code-fix, do not fake, no contract |
| **C5-02 / D-18 wallet transactions** | **this slot** |
| C5-03 / D-19 `wave-protocol.md` §6.2 | P3's file. Not rewritten |

The client has called `GET /v1/wallet/transactions` since the wallet UI slot. `main`'s wallet
route comment said the path was deliberately absent, so the not-found handler answered `404`.
`origin/cursor/w13-work-c3-remain-72c4` already served the fail-closed empty page. C5-02 is
merge-or-drop, not a rewrite. This slot **merged**.

---

## 2. What changed

Ported the remain-branch implementation (`31645e8` + `15606cf` + `c15ff74`) onto `0cb0504`.
Conflicts were `server/src/app.ts` and `server/src/app.test.ts` only: keep current sqlite
watch-progress defaults and the drama-progress app tests, and wire `walletLedgerPort`.

### 2.1 The contract

`GET /v1/wallet/transactions` in `contracts/openapi.yaml`, operationId
`listWalletTransactions`, tag `wallet`. Query: `cursor`, `limit` (default 20, max 100),
`type?` (`RECHARGE` | `CONSUME` | `REWARD` | `REFUND`). Unknown `type` is `400`, not an
empty page that looks like "this viewer has no CONSUMEs".

`WalletTransaction` requires `id` and `type`. Deltas, `refType`/`refId` and `createdAt` are
optional: a missing `coinDelta` is not `0`. Beans, fiat and a coin→Beans rate are not in
the schema.

`server/src/contract.test.ts` asserts the path both ways. An unauthenticated inject
answers `401`, not `404`. `docs/12-api-parity.md` flips the row from `design-only` to
`live` (same one-row write C4 used for `GET /users/me`).

### 2.2 The handler

Same `requireViewer` seam as `GET /v1/wallet`. `Cache-Control: private, no-store` on every
answer (CA-3). Rows come from `WalletLedgerPort`:

| Port result | HTTP |
| --- | --- |
| `UNAVAILABLE` (default) | `200` empty page |
| `KNOWN` with rows | `200` with those rows, most-recent first |
| `LEDGER_UNREADABLE` | `503` |
| `INVALID_CURSOR` | `400` |

The default is `createUnavailableWalletLedgerPort`. It does not read the unlock store. A
viewer who paid for an episode still sees an empty ledger.

### 2.3 Client comments

`wallet-api.ts` and `WalletPage.tsx` now say the route is served. Behaviour is unchanged:
an empty page is still the empty ledger; a `404` is still drawn as unavailable/empty.

The original remain-branch handoff is kept at `docs/handoff/w13-wallet-transactions.md`.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 An unlock receipt becomes `{ type: "CONSUME", coinDelta: -300 }`

```
FAIL  src/modules/wallet/routes.test.ts > GET /v1/wallet/transactions — fail-closed empty ledger > does not turn an unlock receipt into a CONSUME row
AssertionError: expected { items: [ { type: 'CONSUME', coinDelta: -300, … } ], … } to deeply equal { items: [], pageInfo: { nextCursor: null, hasMore: false } }
```

That is S73 leaking into the ledger.

### 3.2 `beansAmount: 60` is copied onto every row

```
FAIL  src/modules/wallet/view.test.ts > toWalletTransactionPage > drops Beans and fiat keys rather than quoting them as coin movement
AssertionError: expected { id: 'txn_1', type: 'RECHARGE', coinDelta: 100, beansAmount: 60 } to deeply equal { id: 'txn_1', type: 'RECHARGE', coinDelta: 100 }
```

That is C3-09 leaking into the ledger.

---

## 4. In-flight overlap

| Who | Overlap |
|---|---|
| `bc-fed59ba3` C5-01 / G1.10 | Running. This slot does not touch `.github/` or skip-detection |
| `bc-5d32d64f` third playback | **Landed** as drama-detail Continue CTA (`26b3c97` / `cursor/w16-work-playback-ux3-72c4`). No file overlap. This slot does not add axe-core |
| `bc-2fd6c885` / `bc-3c74c2c9` | Idle. PLY-010 and PRG-001 already on `main`. Player files not edited |

`docs/plan/cycle-5-backlog.md` is not rewritten. `wave-protocol.md` is not rewritten.
Recharge stays disabled. `adUnlock` stays false.

---

## 5. Verify

`pnpm verify` exited 0 on this branch at `175bccb` (cut `0cb0504`).

| Gate | Result |
|---|---|
| Format / lint / types | pass |
| Tests + coverage | **3,325 passing** — shared 63, quality 282, config 45, server 1,785, app 1,150. Coverage: global lines 94.11%, branches 91.26%, core 95.70%, **diff lines 97.16% (205/211)** |
| Build | pass — `index-B-Efb-vk.js` 356.59 kB / 109.02 kB gzip (client comments only; same artifact as PLY-010) |
| Guardrails | `platform guardrails passed (artifact: /workspace/app/dist)` |

OpenAPI path count is 24. `GET /v1/wallet/transactions` is documented and routed. Native `<video>` remains absent.

---

## 6. What is still open

- **A real ledger.** Needs a platform movement API or a ledger this process owns and writes.
  The port is the seam. Do not default it to spend-from-unlocks while waiting.
- **C5-01 / D-20** G1.10. In flight.
- **QA-011 / QA-010** a11y. Still not started. The third playback sibling took drama-detail Continue, not axe-core.
- **D-17** GitHub Actions billing. Local verify is not CI.
- **C4-03 / C4-07**, GATE-7 / GATE-8, Beans. Unchanged.
- **C5-03 / D-19** P3 writeback of `wave-protocol.md` §6.2.

D-18 is closed as merge: the client probe, the OpenAPI path, and the router agree.
