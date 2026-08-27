# W13 — C3-04: wallet / Beans balance UI, fail-closed

> **Slot:** W13, work slot (`bc-5f167886`). One backlog item, no pull request.
> **Branch:** `cursor/w13-work-wallet-7c66`, cut from `origin/main` at `a2122c1`.
> **Item:** `C3-04` — SCR-09 wallet, the profile balance card, and the unlock-panel figure. Coins
> only; no Beans rate (`C3-09` is AM-blocked).
> **Not in scope:** PNL-01 episode picker, SCR-10/PNL-03 recharge, SCR-11 VIP, durable stores
> (`bc-1668e0df`), seed floor (`bc-3fe41928`), CI L2 (`bc-0cbc44ca`), `wave-protocol.md` /
> `docs/gates/`. No pull request.

---

## 1. What was picked, and why

Cycle 1 noted no wallet UI. On `origin/main` at `a2122c1` that was still true:

```
$ rg -n 'wallet|balance|recharge' app/src --glob '!**/*.test.*'
```

Every hit was a comment explaining why the screen was *not* built. `ROUTES` had eight paths and
none was `#/wallet`. `GET /v1/wallet` is still absent from `contracts/openapi.yaml` and from
`server/`. The login body is `{ accessToken, expiresInSec, openId }` — those three cannot be a
balance, and `session-api.ts` strips anything else on purpose.

`C3-04` asked for the screen against the defined contract, fail-closed, and for no invented
endpoint. The assignment was the same bound: show a session-derived or stubbed balance the server
already exposes, and quote nothing if it exposes none. It exposes none. The screen is built
anyway, because an empty ledger is a required state (`docs/02-screen-inventory.md` SCR-09) and a
missing figure is a statement, not a `0`.

In flight at start: favourites `DramaSummary` (`bc-3439f016`, already on `main`), gate writeback
docs (`bc-d2609cbd`, already on `main`), catalogue seed floor, durable stores. This slot did not
touch those files.

---

## 2. What changed

### 2.1 The probe

`app/src/data/wallet-api.ts` calls `GET /v1/wallet` and `GET /v1/wallet/transactions` — the paths
`docs/12-api-contracts.md` §4.6 already names, under the live `/v1` prefix. It does not invent a
second path and it does not stub a number.

`narrowCoinBalance` is the fail-closed gate:

| Body | Result |
| --- | --- |
| `{ coinBalance, bonusBalance, totalBalance }` as non-negative integers that add up | `KNOWN` |
| `{ totalBalance }` alone | `KNOWN`, split `null` — a lone total is not "all paid" |
| `{ accessToken, expiresInSec, openId }` (a session grant) | `UNAVAILABLE` |
| `{ beansAmount, amountCents }` | `UNAVAILABLE` |
| `{}` | `UNAVAILABLE` |
| `{ coinBalance: "100" }` / a negative / a float | `null` → `MALFORMED` (truncated body, retryable) |
| three figures that do not add up | `UNAVAILABLE` (picking one would be a client-side ledger) |

`0` the server sent is a real empty wallet. `0` the client invented is the number M16 forbade.

No `beansPerCoin` / `coinToBeans` / `BEANS_RATE` appears in production source. A source scan in
`import-hygiene.test.ts` keeps it that way.

### 2.2 The surfaces

| Surface | What it does |
| --- | --- |
| `#/wallet` (SCR-09) | Loading, content, empty ledger, retryable error, `401` as sign-in, `404` as unavailable. Pending-credit banner only when the server set `pendingCredit: true`. |
| Profile assets card | Independent of identity and of the entries. Quotes a figure only on `KNOWN`. Anonymous still gets the login card, not a fake balance. |
| PNL-02 coin channel | Shows the figure next to the price when `KNOWN`. Omits it otherwise. Never claims "insufficient" from an invented zero. |

Recharge (SCR-10) is present as a disabled control that says prices have not been set. There is no
`#/recharge` route. A Beans price on that button would be `C3-09` decided in a front-end file.

VIP and the episode picker (PNL-01) are untouched. PNL-01 is still the unblocked remainder of
`C3-04`.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 An empty body becomes `{ totalBalance: 0 }`

Four tests failed, including:

```
FAIL  src/data/wallet-api.test.ts > a coin balance > returns a successful UNAVAILABLE from GET /v1/wallet when the body exposes nothing
AssertionError: expected { ok: true, value: { kind: 'UNAVAILABLE' } }
             to deeply equal { ok: true, value: { kind: 'KNOWN', totalBalance: 0, … } }
```

A session grant, a Beans-only body, and the unavailable card on the screen all went with it.

### 3.2 `beansAmount` is read as `coinBalance`

```
FAIL  src/data/wallet-api.test.ts > a coin balance > ignores Beans and fiat fields rather than quoting them as coins
AssertionError: expected { kind: 'KNOWN', coinBalance: 60, totalBalance: 60, … }
             to deeply equal { kind: 'UNAVAILABLE' }
```

That is the whole of `C3-09` leaking into the client: a Beans amount displayed as coins, with no
rate, to a viewer who will believe it.

---

## 4. Verify

`pnpm verify` exited 0 on this branch after the lint fix (the wallet route assertions had briefly
replaced the favourites 401 routing test; that test is back). After taking `origin/main` at
`58abb3e` (seed floor + unlock sqlite, neither overlapping):

```
$ pnpm test
```

| Package | Tests |
| --- | ---: |
| `packages/shared` | 51 |
| `packages/config` | 45 |
| `server` | 1,362 |
| `app` | 857 |
| **Total** | **2,315** |

`pnpm verify` on the pre-durable tree: format, lint, typecheck, test, build, guardrails all green.
Artifact `dist/assets/index-CQnFIqTJ.js` 318.14 kB / 98.12 kB gzip. Guardrails passed.

---

## 5. What is still open

- **PNL-01 episode picker.** Unblocked; this slot was the balance UI. DramaPage still lists
  episodes inline. The overlay grid is the rest of `C3-04`.
- **SCR-10 / PNL-03 recharge.** Blocked on a Beans rate (`C3-09`) and on `pay()`. The entry exists
  and says so.
- **SCR-11 VIP.** No subscription contract.
- **`GET /v1/wallet` on the server.** The client is ready. A 200 with `WalletView` is enough; a
  404 stays the unavailable card. Do not invent a ledger that unlocks do not debit (`S73`).
- **C3-09.** Still a missing business input. No rate was written.

Mid-slot landings, no overlap: seed floor (`119bae5`, catalog fixtures), unlock sqlite
(`61ee341`, `server/src/db/` and `unlock-store`). CI L2 (`bc-0cbc44ca`) was still running and
was not touched.
