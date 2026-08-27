# W14 — C4 again: stubbed `POST /v2/minis/trade_order/create/` (C4-06 / C3-09)

> **Slot:** W14, work slot. One backlog item, no pull request.
> **Branch:** `cursor/w14-work-c4-again-72c4`, cut from `origin/main` at `a8e1023` (G2.6 on
> main). Merged forward onto `33d149f` (`GET /v1/users/me`).
> **Item:** `C4-06` / `C3-09` unblocked half — the `POST /v2/minis/trade_order/create/` call
> behind a stubbed HTTP client. No coin→Beans rate. D7 stays `[ ]`.
> **Not in scope:** G2.6, G2.2, G2.7, G2.8, C4-01, C4-05 OAuth, PLY-002, D-16/playNext,
> `GET /v1/users/me` (`bc-e35c1229`, landed as `33d149f` while this slot ran), remaining L2
> (`bc-33b61d7a`). Enabling wallet top-up, SCR-10, inventing ad-unit ids. No pull request.

---

## 1. What was picked, and why

`docs/plan/cycle-4-backlog.md` remaining unblocked engineering after C4-01, C4-02 (G2.7, G2.2,
G2.6), C4-05, PLY-002, and playNext: G2.3/G2.4/G2.5 (in flight as `bc-33b61d7a`), GET users/me
(in flight as `bc-e35c1229`), then **C4-06**. C4-03 is T14 Postgres ("do not fake"). C4-04
(`GET /config`) shares OpenAPI / `app.ts` with the users/me sibling. C4-06 does not.

The coin-order route, the refusing default, and the webhook sink already exist. Exactly one
seam still minted nothing against TikTok: `PlatformTradeOrderPort`. The unblocked work is
request shaping, timeout, failure mapping, and the rule that `token_amount` is an observed
integer on the request — against a stubbed transport. Copying `priceCoins`, multiplying it, or
reading `BEANS_RATE` from the environment is the C4-06 regression.

---

## 2. What changed

`createTiktokTradeOrderPort` POSTs `application/json` to
`https://open.tiktokapis.com/v2/minis/trade_order/create/` with `token_type: "BEANS"`,
`token_amount` from `TradeOrderRequest.tokenAmount`, and `order_info` of `{ order_id,
product_id, quantity: 1, quantity_unit: "episode" }`. It does not invent `order_url`,
`product_name`, or `image_url`. Production uses `fetch` with `AbortSignal.timeout` and
`redirect: 'error'`. Tests inject `http`. `buildApp` still defaults to
`createUnavailableTradeOrderPort()`.

| Situation | Result |
| --- | --- |
| No `tokenAmount`, or not a positive integer | `TRADE_ORDER_UNAVAILABLE`. Transport is not called. `priceCoins` is not copied |
| No user access token | `TRADE_ORDER_UNAVAILABLE`. Transport is not called. Identity still drops tokens (`C4-05`) |
| Transport throws / abort / 5xx / unparseable | `TRADE_ORDER_UNAVAILABLE` |
| HTTP 200 with no `trade_order_id` | `TRADE_ORDER_UNAVAILABLE`. Not a synthesised id from our `orderId` |
| HTTP 200 with `trade_order_id` (top-level or `data.`) | `{ tradeOrderId }` from the platform body |

The coin-order route still does not populate `tokenAmount`. Q-G-7 has no observation. A wired
TikTok port therefore answers the same `503 PAYMENT_CHANNEL_UNAVAILABLE` as the default. A
wrapper that supplies a cited integer is how the field enters later.

| File | Change |
| --- | --- |
| `server/src/modules/unlock/trade-order-port.ts` | Optional `tokenAmount`. Compile-time refuse of a rate key. Comments point at the HTTP adapter |
| `server/src/modules/platform-tiktok/trade-order-create.ts` | The create call |
| `server/src/modules/platform-tiktok/trade-order-create.test.ts` | Request shape, mapping, no-synthesis, no-rate scan, token leak checks |
| `server/src/modules/unlock/tiktok-trade-order-routes.test.ts` | Default refuse, wired-but-unobserved 503, observed integer → platform id |
| `server/src/modules/unlock/fixtures.ts` | Comment: fixtures still mint `tto_fx_*`; `buildApp` still refuses |

`docs/11-official-onboarding-checklist.md` D7 is still `[ ]`. This slot did not flip it.
`WalletPage` recharge stays disabled and Beans-free. `.github/workflows/` is unchanged.

---

## 3. Reverse verification

The tests are the injection. Against a 200 whose body is our order id and no `trade_order_id`:

```
FAIL  createTiktokTradeOrderPort — 200 with no trade_order_id > is TRADE_ORDER_UNAVAILABLE, not a synthesised identifier
expected { ok: true, value: { tradeOrderId: 'uord_abc123' } } to equal { ok: false, error: 'TRADE_ORDER_UNAVAILABLE' }
```

A missing `tokenAmount` still does not call the transport, even when the stub would return a
`trade_order_id` and `priceCoins` is 500. A thrown `Error(access_token)` becomes
`TRADE_ORDER_UNAVAILABLE` and the Result JSON does not contain the token.

The route suite: injecting `createTiktokTradeOrderPort` with a 200 stub and an access token,
but no observation on the request, is still `503 PAYMENT_CHANNEL_UNAVAILABLE` and zero HTTP
calls.

---

## 4. Overlap with in-flight

| Who | Overlap |
| --- | --- |
| `bc-e35c1229` (GET users/me) | Landed as `33d149f`. Identity `me-routes`, OpenAPI, ProfilePage. Merged in; no overlap with trade-order-create |
| `bc-33b61d7a` (remaining L2) | `l2.yml` / Playwright or SAST. This slot does not touch `.github/workflows/` |
| C4-01 / C4-02 / C4-05 / PLY-002 / playNext / G2.6 | Already on `main` at pick. Not retaken |

`git diff origin/main -- .github/workflows/` is empty of this slot's work.

---

## 5. Verification

`pnpm verify` green on this branch after merging `origin/main` (`33d149f` users/me). L1
sequence unchanged: format → lint → typecheck → test:coverage → check:coverage → build →
guardrails.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 58 |
| `packages/config` | 45 |
| `packages/quality` | 67 |
| `server` | 1,705 |
| `app` | 1,050 |
| **Total** | **2,925** |

Zero skipped. Thirty-two tests for C4-06 (29 adapter, 3 route). Coverage gate:

```
coverage global lines 94.13% (12827/13627), branches 92.23%, core lines 98.13%, diff lines 100.00% (126/126)
coverage gate passed
```

Guardrails passed against `app/dist` (`index-DdfT1FNc.js` 342.98 kB / 104.21 kB gzip — the
users/me merge's artifact, not this slot's). Native `<video>` remains absent.

---

## 6. Left open

- **D7.** Still `[ ]`. The create call is stubbed. GATE-2, GATE-4, and one observed (coins,
  Beans) pair (Q-G-7) are still required for a live `token_amount`. No rate in types.
- **User access tokens.** Identity still drops them after `open_id` is read. The adapter
  refuses without `accessTokenForUser`. Token persistence is not this slot.
- **Wallet top-up / SCR-10.** The recharge control remains disabled. Enabling it without a
  cited observation fails C4-06 acceptance item 4.
- **G2.3, G2.4, G2.5.** Left for `bc-33b61d7a`. Not faked with a grep.
- **C4-04, C4-07, C4-08.** Splash contract, VIP, ads.
- **`docs/plan/cycle-4-backlog.md`.** Not rewritten. The document belongs to the plan slot.
