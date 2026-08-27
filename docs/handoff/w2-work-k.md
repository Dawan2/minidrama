# Handoff — Wave 2, Work Slot K: the coin unlock order, and nothing more

> **Branch:** `cursor/w2-work-k-6bb5`, cut from `cursor/w2-work-i-e53c` (`0be48a9`).
> **Scope:** a fail-closed unlock *intent* API. `POST /v1/unlock/coin-orders` records that a viewer
> wants to buy an episode and returns the platform trade order they pay against;
> `GET /v1/unlock/coin-orders/{orderId}` reports where that order got to. An order becomes an unlock
> only when the signed TikTok callback confirms the payment — and since writing the `Unlock` row is
> W14 work, it does not become one here at all. Nothing is fake-fulfilled.
> **Not in scope:** playback, `modules/entitlement/access.ts`, search and the app feed UI, all
> untouched; the wallet, the coin ledger, whole-drama unlocks, refunds, order expiry, the real
> `/v2/minis/trade_order/create/` call. `app/` is byte-identical — the built bundle still hashes
> `index-B_KnFxaH.js` — and no pull request was opened.

---

## 1. The problem this slot had to solve without solving too much

A coin unlock has three steps, and only the middle one belongs to TikTok: we record what the viewer
wants to buy, the platform charges them Beans, and we hand over the episode. Slot I closed the
enforcement side — playback now refuses a locked episode from the real entitlement verdict — and the
webhook has verified signatures since slot C. What was missing was the thing in between: an order.

The failure mode to design against is not "the unlock endpoint is missing". It is an unlock endpoint
that works *before* the payment does. Every shortcut available here gives an episode away:

- a `POST /unlock` that writes the unlock row and leaves the payment for later is a free episode
  with an audit trail;
- an order endpoint that reports `unlockGranted: true` on creation is the same thing with an extra
  field;
- an order that any caller can move to `PAID` is the same thing with an extra request;
- an order that a *forged* callback can move to `PAID` is the same thing with an extra HMAC that
  nobody checks.

`docs/12-api-contracts.md` §4.5 describes the first of those shapes: `POST /episodes/{id}/unlock`
returning `200` with the unlock record and the new wallet balance, synchronously. That contract was
written for a self-hosted wallet where the viewer already holds coins. It is not implementable for a
Beans purchase — the charge happens on TikTok's side and we learn about it over a webhook that
arrives after the response — so this slot builds the asynchronous shape and registers the conflict
for slot B (§5).

---

## 2. What was delivered

| File | Contents |
|---|---|
| `server/src/modules/unlock/orders.ts` | New. The order record and the transition table, as a pure function |
| `server/src/modules/unlock/order-store.ts` | New. `UnlockOrderStore` — three lookups, one write — and the in-memory Wave 2 implementation |
| `server/src/modules/unlock/trade-order-port.ts` | New. `PlatformTradeOrderPort` and the refusing default |
| `server/src/modules/unlock/payment-sink.ts` | New. The unlock module's subscription to verified payments: the only thing that can move an order |
| `server/src/modules/unlock/routes.ts` | New. The two endpoints, and the verdict→HTTP mapping for "is there anything to sell" |
| `server/src/modules/unlock/fixtures.ts` | New. A deterministic trade-order port, a refusing one, and `createCountingTradeOrderPort` |
| `server/src/modules/platform-tiktok/paid-trade-orders.ts` | New. `PaidTradeOrderSink` — the callback's published event — and the ignoring default |
| `server/src/modules/platform-tiktok/routes.ts` | A verified `redeem.success` is now published to the sink. Verification is untouched |
| `server/src/modules/platform-tiktok/webhook-events.ts` | `readTradeOrderId` extracted from the idempotency key, and `REDEEM_SUCCESS_EVENT` named |
| `packages/shared/src/errors.ts` | Six codes from `docs/12-error-catalog.md` that now have a producer |
| `server/src/app.ts` | The unlock module is registered with the **same** facts port and viewer resolver as entitlement and playback, and the **same** order store the callback's sink writes to |
| `contracts/openapi.yaml` | Both operations, their failure surfaces, and what a client must not infer from `status` |

**Tests: 111 new, 0 skipped, 0 deleted.** `orders.test.ts` 17, `order-store.test.ts` 12,
`payment-sink.test.ts` 9, `routes.test.ts` 61, plus 7 in `webhook-events.test.ts`, 3 in
`app.test.ts` and 2 in `contract.test.ts`.

Nothing under `server/src/modules/entitlement/` or `server/src/modules/playback/` was modified, and
no assertion in an existing test was changed — the three existing files that grew only gained cases.

### 2.1 The ladder

```
  POST /v1/unlock/coin-orders
             │
             ▼
         PENDING ──────── PAYMENT_VERIFIED ────────▶ PAID
             │        (raised only by the verified          │
             │         TikTok payment callback)             │
             │                                     UNLOCK_RECORDED
             │                                     (no caller yet — W14)
             │                                              │
             │                                              ▼
             └──────────────── refused ───────────────▶ FULFILLED
```

`PENDING → FULFILLED` is refused by the transition table, so the slot that eventually writes the
`Unlock` row inherits the ordering rule rather than inventing one. `FULFILLED` is unreachable today
and that is the honest state of the system: a viewer who pays gets an order that says `PAID` and an
episode that is still locked. Under-delivering is the only direction a half-built payment path may
fail in.

### 2.2 The one gate: is there anything to sell

An order is opened only when `decideEpisodeAccess` **refused** the episode and offered **coins** as
the remedy. Everything else is answered without a payment being opened anywhere.

| Verdict | Answer | Why |
|---|---|---|
| `reason: UNLOCKED` | `409 UNLOCK_ALREADY_UNLOCKED` | The viewer owns it. Selling it again is a refund |
| `playable`, `reason: FREE` | `422 UNLOCK_POLICY_NOT_ALLOWED` | Charging for a free episode |
| `playable`, `reason: VIP` | `422 UNLOCK_POLICY_NOT_ALLOWED` | Their subscription already covers it, and the decision quotes no price for it |
| `NEED_VIP` | `422 UNLOCK_POLICY_NOT_ALLOWED` | No quantity of coins opens a VIP-only episode |
| `unavailableCause` | `404` / `410` / `503` | The same mapping as the other two endpoints |
| anonymous | `401 AUTH_REQUIRED` | An order belongs to an account |
| `NEED_UNLOCK` with `COINS` | `201` + a `PENDING` order | The only path that opens a payment |

The refusal is the default: `refusalToSell` sells only on an explicit `unlockOptions` match, so a
reason added to the vocabulary later declines the sale until somebody handles it.

### 2.3 The price is never the client's

The request body carries an episode id. The amount frozen onto the order is the one
`decideEpisodeAccess` quoted for this viewer at this instant — the same number the unlock panel was
rendered from — and it is what the trade order is opened for. A body proposing `priceCoins: 0`,
`priceCoins: -300`, `coins`, `amountCents` or a price belonging to another episode is answered with
`300`, and four tests say so.

### 2.4 A refused sale opens no payment

The response body is the weak half of "we did not sell it": an absent order in a `422` proves
nothing was *returned*, not that TikTok was never asked to open a payment. A route that created the
trade order first and refused afterwards would satisfy a body assertion while leaving a payable
order on the platform for an episode we had just decided not to sell — and the viewer can pay that
one. So `createCountingTradeOrderPort` records every request the route makes, and the assertion
after every refusal is `expect(tradeOrders.requests).toEqual([])`. It is the same technique, and the
same reasoning, as `createCountingPlaybackMediaPort` in slot I (S38).

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-i.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S46 | **The order state machine is a pure function, and `PENDING → FULFILLED` is refused** | The rule that costs money — an unlock may only be recorded against an order the platform confirmed — is testable exhaustively with no route, store or clock. Putting it in the store or the route would make it a property of whoever remembered to check, and the caller that will grant unlocks has not been written yet | One condition; three tests |
| S47 | **`FULFILLED` exists and has no caller** | The alternative is a two-state machine that the wallet slot extends, which means it invents the ordering rule at the moment it is under pressure to ship a grant. An unreachable state with a refused shortcut is cheaper than a rule delivered by handoff prose | Deleting a branch |
| S48 | **The only producer of `PAID` is the verified webhook, through a sink the callback module declares** | The callback owns authenticity and nothing else; the unlock module owns what a payment means. Declaring the interface on the publisher's side means the day a VIP subscription is bought with Beans, it subscribes to the same event instead of the callback growing a second opinion about what an order is | The interface is one file; rewiring it is a constructor argument |
| S49 | **The price comes from `decideEpisodeAccess`, never from the request** | §2.3. A price field in a request body is a discount coupon with no expiry date | One expression; four tests |
| S50 | **The platform trade order is opened after the sale gate and before the order is stored** | After, so a refused sale leaves nothing payable on TikTok's side (§2.4). Before, so an order is never stored without the identifier a callback can be correlated on — an order with no `tradeOrderId` is a support ticket by construction | Moving one `await`, which is what the counting port exists to catch |
| S51 | **The trade-order port defaults to refusing, and an unopenable payment is `503 PAYMENT_CHANNEL_UNAVAILABLE`** | The same posture as the entitlement facts port (S33) and the media port (S39). `/v2/minis/trade_order/create/` is W23 behind milestones M2 and M4, and a deployment that cannot create a real trade order must not invent an identifier no callback will ever carry | Injecting a real port, which is the intended path |
| S52 | **`Idempotency-Key` is required, scoped per viewer, and a joined duplicate header is refused** | `docs/12-api-contracts.md` §2.4 requires it on unlock writes, and here it is what stops a retried tap from opening a second payment. The index is `(userId, key)` because a global one lets any viewer's chosen key block another's order. Node joins a repeated header into `key-a, key-b`, and deduplicating on that join keys two requests on a value neither sent — so a key with a comma or whitespace in it is refused rather than trimmed into shape | Five tests |
| S53 | **The payer's open id must equal the order's user id** | `LoginResponse.openId` is documented as the TikTok user identifier *and* our user primary key, so this is a real comparison. Without it an authentic callback for one viewer's payment can pay another viewer's order, and the second viewer is the one who ends up owning the episode. It fails closed and loudly: the order stays `PENDING` and the callback logs at error level. See §8 — if the webhook's `user_openid` turns out to be scoped differently, this is the line that will stop payments, and it will stop them safely | One condition; two tests |
| S54 | **Order ids are `uord_`, not the `ord_` of `RechargeOrder`** | `docs/12-domain-model.md` §2.1 gives prefixes so an id identifies its own type in a log line. Two order families sharing a prefix means a support ticket quoting an id needs both tables searched. Registered here as an addition to §2.1 | One constant |
| S55 | **`unlockGranted` is stated on the wire, not inferred from `status`** | "The viewer was charged" and "the episode is unlocked" are different facts, and in this slot the second is always false. A client inferring access from `status: PAID` would show a locked episode as playable — and would be wrong in production the day a fulfilment fails, not just today | One field; two tests |
| S56 | **Another viewer's order is `404`, not `403`** | A `403` confirms that an id exists and that it is somebody else's, which is enough to enumerate orders. Absent and forbidden are deliberately indistinguishable | One condition |
| S57 | **The store refuses a second order claiming the same `tradeOrderId`** | It should be unreachable — the platform mints those — and that is exactly why it is refused rather than tolerated: a trade order matching two orders makes correlation pick one arbitrarily, and nothing downstream would notice. In the durable store it is a unique index | One check |
| S58 | **A callback that could not be recorded still answers `200`** | Unchanged from slot C, and load-bearing: the delivery's idempotency key is claimed before the sink runs, so a non-`200` would bring the event back only to be discarded as a duplicate. Recovery is replay from the stored raw payload, and the sink is documented as never throwing for the same reason | It is the existing posture; changing it is the webhook module's decision |

### 3.1 What was deliberately not changed

`modules/entitlement/access.ts` is byte-identical, as are the facts port, the viewer resolver, the
entitlement fixtures and every file under `modules/playback/`. This slot imports
`decideEpisodeAccess` and uses its verdict for one question — is there anything to sell — and the
table in §2.2 is a translation of that verdict rather than a second reading of the rules. There are
now three endpoints reading one decision function through one facts port instance.

The webhook's verification path is also untouched: the signature check, the timestamp window, the
client-key comparison, the raw-payload-first storage and the idempotency claim are the same code in
the same order. What was added sits strictly after all of them.

---

## 4. Reverse verification

Each rule was reintroduced as a defect and the full server suite re-run, per `SR-1`. A rule nothing
fails for is a rule that is not being enforced.

| Defect reintroduced | Failing tests | Representative names |
|---|---|---|
| The payment is published **before** the signature is verified | **10** | `leaves the order pending for no signature header`, `leaves the order pending for a body signed with somebody else's secret`, `cannot be talked into paying an order`, + 7 |
| The sale gate removed — every verdict is sellable | **5** | `refuses a free episode inside the drama-level window`, `refuses an episode the viewer already bought`, `refuses a VIP-only episode, which no quantity of coins opens` |
| `Idempotency-Key` made optional | **5** | `refuses a creation with no key at all`, `refuses a creation with a duplicated header`, `refuses a creation with a key that is two tokens` |
| The trade order opened before the sale gate | **6** | `never opens a platform payment for a request it refuses`, `returns the first order for a retry, and opens no second payment`, + 4 |
| The client's `priceCoins` trusted when present | **4** | `ignores a free one supplied by the client`, `ignores a negative one supplied by the client`, + 2 |
| The callback wired to a different order store | **4** | `records the payment against the order`, `pays exactly the order the trade order belongs to`, + 2 |
| `unlockGranted` derived from `status: PAID` | **2** | `does not grant the unlock, and does not pretend to`, `replays a paid order without moving it back to pending` |
| `PENDING → FULFILLED` allowed | **3** | `refuses to fulfil an order that was never paid`, `has no path from a fresh order to a granted one without a payment` |
| The payer's open id no longer compared | **2** | `leaves the order pending when the callback pays somebody else's order`, `refuses a payer who did not place the order` |
| Order reads no longer scoped to their owner | **1** | `reports another viewer's order as absent` |

Three rows deserve a note.

The **pre-verification publish** is the defect this slot exists to prevent, and the first version of
the suite caught it in nine cases rather than ten. The tenth — the tampered body — altered the
payer's open id, so it was rejected on its *content* and passed for the wrong reason. It now alters
a field nothing reads, which leaves the HMAC as the only thing that can catch it. That test was
worthless until the defect was introduced against it, which is the argument for running these at
all.

The **`PENDING → FULFILLED`** row fails only unit tests, and it must: no HTTP path raises
`UNLOCK_RECORDED` yet. That is the state the rule is in — enforced and unused — and the tests are
the only thing holding it in place until W14 arrives.

The **separate order store** row is the one a reviewer would not see. Both stores are valid, both
modules look correct, and the symptom is that every order stays `PENDING` forever while the callback
reports success.

### 4.1 Gates

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **561 passing, 0 skipped, 0 failing** — 428 server (was 317), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

---

## 5. Contract divergences, registered rather than resolved

Three, all for slot B at `CTR-009`/`CTR-010`.

**The endpoint shape.** `docs/12-api-contracts.md` §4.5 specifies
`POST /episodes/{episodeId}/unlock` answering `200` with `{ unlock, wallet }` — a synchronous coin
debit. That is not implementable for a Beans purchase: the charge happens on TikTok's side and is
confirmed by a webhook that arrives after the response, so the honest answer at request time is an
order, not an unlock. `/v1/unlock/coin-orders` is modelled on §4.6's recharge-order pair
(`POST` returning `{ orderId, status: PENDING }`, `GET` for polling) because that is the shape that
matches how the money actually moves. §4.5 is not deleted; if a coin *balance* ever exists, its
synchronous debit is a different operation and can keep its path.

**The payment channel.** `RechargeOrder.paymentChannel` is `WECHAT | ALIPAY | APPLE_IAP`
(`docs/12-domain-model.md` §5.3), none of which is how a Minis viewer pays. The order view reports
`payment.provider: "TIKTOK"`, which the enum will have to admit.

**The `UNLOCK_ALREADY_UNLOCKED` details.** The catalogue specifies `{ unlockId, unlockedAt }`. The
access facts carry neither — `UnlockFacts` has an episode id, a method and an expiry — so the
response sends `{ episodeId, unlockPolicy, reason }`. Either the facts grow the fields or the
catalogue entry changes; both are cheap, and guessing now would put an invented id on the wire.

---

## 6. Deliberately not built

- **No unlock record, no wallet, no coin ledger.** Nothing in this slot writes anything an
  entitlement decision reads. That is the point of it.
- **No real trade-order call.** `PlatformTradeOrderPort` is an interface with a refusing default and
  a fixture. `/v2/minis/trade_order/create/` is W23, gated on M2 and M4.
- **No refunds.** `refund_success`, `refund_fail` and `refund_traceback` are stored and acted on by
  nobody. Reversing an order is a different decision from making one, and inventing it from an event
  shape we have never seen (G-R4) would be guessing with somebody's money.
- **No order expiry or cancellation.** There is no `CLOSED` state, so a `PENDING` order lives until
  the process restarts. See §8.
- **No whole-drama unlock, no unlock quote, no `GET /users/me/unlocks`.** All three are §4.5 and
  belong with the wallet.
- **No ad unlock.** `unlockOptions` still cannot say `AD` (W16).
- **No rate limiting.** `docs/12-api-contracts.md` §2.6 applies to this endpoint and nothing here
  implements it.
- **No client code.** `app/` is byte-identical; the feed and search work in flight needs no rebase.

---

## 7. For the next slots

**For whoever writes the grant (W14).** The transition you want is `UNLOCK_RECORDED`, and it will
refuse anything that is not `PAID` — that refusal is the whole safety property, so route the write
through `advanceUnlockOrder` rather than around it. Two things to get right that this slot could not:
the `Unlock` row and the order transition must land in one transaction, or a crash between them
leaves a viewer charged with no episode (recoverable) or an episode with no order (not); and the real
idempotency backstop for a double purchase is the `(userId, episodeId)` unique index on `Unlock`
from `docs/12-domain-model.md` §6.1, because this module deliberately does **not** dedupe orders per
episode (§8). Also note the order carries `dramaId`, taken from the facts that priced it, so the
grant cannot name a different drama than the one access was decided against.

**For whoever lands the data layer (W7).** `UnlockOrderStore` needs three unique indexes: `id`,
`(userId, idempotencyKey)` and `tradeOrderId`. The last is what makes callback correlation
single-valued, and the in-memory implementation enforces all three so the tests already describe the
schema. `docs/12-api-contracts.md` §2.4 gives idempotency keys a 24-hour life; nothing here expires
them.

**For whoever does the real payment integration (W23).** Three things are waiting for you.
`PlatformTradeOrderPort` carries `priceCoins` and no Beans amount, because what a coin is worth in
Beans is a pricing decision nobody has made — the conversion belongs next to the create call, not
inside a type. `TradeOrder` returns one field, and if `TTMinis.pay` needs a second, add it with a
source next to it. And confirm S53: the sink requires the webhook's `user_openid` to equal the
order's user id, which is what `LoginResponse.openId` says it is — if that turns out to be false,
payments will stop being recorded and the callback will log `PAYER_MISMATCH` at error level, which
is the safe failure but is still a failure.

**For whoever owns the app.** The unlock flow is: create the order, hand `payment.tradeOrderId` to
`TTMinis.pay`, then poll the order. Poll for `unlockGranted`, not for `status` — `PAID` means the
viewer was charged and says nothing about whether the episode is playable, and today it never
becomes playable. Playability is still `POST /v1/entitlement/episode-access`. Send an
`Idempotency-Key` per purchase attempt and reuse it verbatim on retry, or a double tap opens two
payments.

**For slot B at `CTR-009`.** §5 lists the three divergences. The implementation exists to check the
transcription against.

---

## 8. Known gaps in this slot's own work

- **Nothing is proven against a database, or against TikTok.** Every path here runs on fixtures and
  an in-memory store. The wrapper is tested; the query and the platform call do not exist.
- **`FULFILLED` has no caller, so the fulfilment half is proven only as a pure function.** The
  refusal to fulfil an unpaid order is enforced and untested end to end, because there is no end to
  end for it yet.
- **Orders are not deduplicated per episode.** Two deliberate creations for the same episode by the
  same viewer, under different idempotency keys, produce two payable trade orders — and both can be
  paid. The `Unlock` unique index is the real backstop and it does not exist yet, so until W14 a
  determined viewer can pay twice for one episode. Reusing an open order instead would need order
  expiry, which needs the platform's trade-order lifetime, which is W23.
- **No order expiry.** A `PENDING` order is `PENDING` until the process restarts. A viewer who
  abandons a payment leaves one behind, and a stale trade order id may be dead platform-side with
  nothing here saying so.
- **The in-memory store forgets on restart.** Survivable only because nothing here has been
  fulfilled: a forgotten `PAID` order is a payment to reconcile, not an unlock to revoke. A
  forgotten `PENDING` order whose payment then succeeds becomes a `NO_MATCHING_ORDER` in the log and
  a charge with no record — which is exactly the shape of the W34 dropped-order compensation task.
- **A payment that cannot be recorded is only a log line.** There is no alert, no dead-letter queue
  and no replay tool. `PAYER_MISMATCH` and `ORDER_NOT_PAYABLE` are logged at error level and the raw
  payload is stored, which makes recovery possible and not automatic.
- **The coins-to-Beans mapping does not exist.** The order quotes a coin price and the trade order
  is opened for that number. Somebody has to decide what it means before real money moves.
- **No concurrency test.** The idempotency race is closed by a store-level check (S57 and its
  sibling), and the in-memory store is single-threaded, so the check is asserted rather than raced.
  It becomes a real question against Postgres, where the unique index is the thing being relied on.
- **`priceCoins` is validated but never reconciled.** Nothing compares the amount the platform
  charged against the amount the order quoted, because the callback's `content` field set is not
  exhaustive (G-R4) and we do not know whether it carries one.
