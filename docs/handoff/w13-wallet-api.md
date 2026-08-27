# W13 — C3-04 remainder: `GET /v1/wallet`, fail-closed

> **Slot:** W13, work slot (`bc-5678f211`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-wallet-api-72c4`, cut from `origin/main` at `c57ff0d`.
> **Item:** the server half of `C3-04`. The client already probes `GET /v1/wallet`; this slot
> serves it. Coins only; no Beans rate (`C3-09` is AM-blocked). No invented fiat.
> **Not in scope:** `GET /v1/wallet/transactions` (no ledger — S73), SCR-10/PNL-03 recharge,
> SCR-11 VIP, PNL-01 episode picker, observability (`bc-dd5c69d1`), CI L2 (`bc-0cbc44ca`).
> Durable unlocks already on `main` at `58abb3e`. No pull request.

---

## 1. What was picked, and why

The wallet UI landed on `main` (`c57ff0d` / `8a2b1aa`). Its probe is `GET /v1/wallet`. On
`c57ff0d` that path was absent from `contracts/openapi.yaml` and from `server/`, so the
not-found handler answered `404` and the screen rendered the unavailable card. That is an
honest client; it is not a served figure.

The assignment: add the fail-closed server route that matches OpenAPI and the client's
expected shape. Auth required. If the platform does not give a coin balance, omit the
fields — never lie with `0` unless the platform said zero. OpenAPI and the router stay in
lockstep (D-04).

In flight at start: observability (`bc-dd5c69d1`), CI L2 (`bc-0cbc44ca`). This slot did not
touch workflow files, logging, or tracing.

---

## 2. What changed

### 2.1 The contract

`GET /v1/wallet` in `contracts/openapi.yaml`, operationId `getWallet`, tag `wallet`.
`WalletView` has four optional properties: `coinBalance`, `bonusBalance`, `totalBalance`,
`pendingCredit`. They are optional on purpose: a required `coinBalance` would force a `0`
on every deployment that has no platform figure, which is today's deployment.

Beans, fiat, `amountCents`, `currency` and a coin→Beans rate are not in the schema.

`server/src/contract.test.ts` asserts the path both ways: documented ⇒ routed, routed ⇒
documented. An unauthenticated inject answers `401`, not `404`.

### 2.2 The handler

`server/src/modules/wallet/`. Same `requireViewer` seam as progress and favourites, so a
missing and a rejected credential are both `401 AUTH_REQUIRED`, and an unresolvable session
is `503`. `Cache-Control: private, no-store` on every answer (CA-3).

The figure comes from `WalletBalancePort`:

| Port result | HTTP |
| --- | --- |
| `UNAVAILABLE` (default) | `200` `{}` — successful read of an absence |
| `KNOWN` with figures | `200` with those fields only |
| `KNOWN` with `0` | `200` with `0` — a platform zero, a real empty wallet |
| `BALANCE_UNREADABLE` | `503` — we could not complete the check |

The default is `createUnavailableWalletBalancePort`. It is not a `503`: a retryable error
would ask the viewer to retry something that will never produce a number. Omitted fields
are the unavailable card the client already draws.

`toWalletView` copies the four `WalletView` keys and nothing else. A `beansAmount` stuffed
onto the facts is dropped. Three figures that do not add up become `{}`. A negative or a
float becomes `{}`. `pendingCredit` is emitted only when it is `true`.

No ledger. Unlocks still do not debit one (S73). `GET /v1/wallet/transactions` is still
absent: an empty page would claim the viewer has never moved coins, and we do not know
that. The client's 404-as-unavailable empty ledger stays the honest answer.

### 2.3 Shared type

`packages/shared/src/wallet.ts` is `WalletView`. A compile-time assertion rejects Beans,
fiat and rate keys on the type. Import sites will not move when CTR-008 generates from
OpenAPI.

### 2.4 Client comments

`wallet-api.ts` and `WalletPage.tsx` no longer say the route is missing. Behaviour is
unchanged: omitted fields are still `UNAVAILABLE`.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 An unavailable port becomes `{ coinBalance: 0, bonusBalance: 0, totalBalance: 0 }`

Three tests failed, including:

```
FAIL  src/modules/wallet/view.test.ts > toWalletView > omits every balance field when the platform named nothing
AssertionError: expected { coinBalance: +0, …(2) } to deeply equal {}

FAIL  src/modules/wallet/routes.test.ts > GET /v1/wallet — signed in, no platform figure > answers 200 with the balance fields omitted, which is not zero
FAIL  src/app.test.ts > GET /v1/wallet > answers 200 with the figure omitted, not zero, to a session that has no platform balance
```

That is M16 on the server: a viewer who has recharged and sees `0` will not believe the
next number either.

### 3.2 `beansAmount: 60` is copied onto every body

```
FAIL  src/modules/wallet/view.test.ts > toWalletView > drops Beans and fiat keys rather than quoting them as coins
AssertionError: expected { coinBalance: 100, beansAmount: 60 } to deeply equal { coinBalance: 100 }
```

That is C3-09 leaking into the server: a Beans amount displayed as if it were part of the
wallet, with no rate, to a client that will ignore the key and a future client that might
not.

---

## 4. Verify

`pnpm verify` exited 0 on this branch.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 53 |
| `packages/config` | 45 |
| `server` | 1,392 |
| `app` | 857 |
| **Total** | **2,347** |

Format, lint, typecheck, test, build, guardrails all green. Artifact
`dist/assets/index-CQnFIqTJ.js` 318.14 kB / 98.12 kB gzip (unchanged: comments only on the
client). Guardrails passed.

New server tests: 2 (port) + 11 (view) + 14 (routes) + 2 (app) + 1 (`contract.test.ts`
`it.each` for the new path) = 30. Shared: 2.

---

## 5. What is still open

- **`GET /v1/wallet/transactions`.** Deliberately not served. No ledger row is written.
  Do not invent an empty page that claims the viewer has never moved coins (S73).
- **A real coin figure.** Needs a platform balance API or a ledger this process owns.
  The port is the seam. Do not default it to zero while waiting.
- **SCR-10 / PNL-03 recharge.** Blocked on a Beans rate (`C3-09`) and on `pay()`.
- **SCR-11 VIP.** No subscription contract.
- **PNL-01 episode picker.** Unblocked remainder of `C3-04`; different files.
- **C3-09.** Still a missing business input. No rate was written.

Observability (`bc-dd5c69d1`) and CI L2 (`bc-0cbc44ca`) were running and were not touched.
L2 landed on `main` as `18fa6d4` while this slot verified (`.github/workflows/l2.yml`,
`packages/quality/`). This branch has taken it; the files do not overlap. `pnpm verify` after
that merge: still green, plus the 37 quality tests L2 added (total 2,384).
