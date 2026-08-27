# Handoff — Wave 9, Work Slot: a verified payment unlocks the episode

> **Branch:** `cursor/w9-work-unlock-grant-5224`, cut from `cursor/w8-work-session-viewer-bc30`
> (`f24aa2f`).
> **Scope:** the grant. Slot K modelled a coin order as an intent, slot W8 attributed it to the
> account a session names, and the verified TikTok callback recorded the payment and stopped —
> `PAID → FULFILLED` had no caller and a viewer who paid owned nothing. This slot writes the `Unlock`
> record on the verified callback, deduplicates it per `(userId, episodeId)`, and joins it onto the
> entitlement facts so the decision endpoint and the playback endpoint can act on it.
> **Not in scope:** the coin wallet and its ledger (W14), the real trade-order API (W23), the real
> code exchange, and the data layer (W7) — all four are still absent, and all four still refuse by
> default. The favourites consume path is in flight elsewhere and is untouched. Nothing was merged
> and **no pull request was opened.** `app/` is byte-identical to the base and the built bundle still
> hashes to `index-B_KnFxaH.js`.

---

## 1. What was wrong

The purchase funnel was complete except for the last write, and the last write is the product.

W8's own §5 said so: *"No unlock grant. A paid order is a paid order. `PAID → FULFILLED` still has no
caller."* Its funnel test asserted it as a passing property — `grants nothing by being paid` — which
was the right call for a slot that had no receipt to write and is exactly the assertion this slot had
to invert. So a viewer could tap "Unlock", pay TikTok, watch the order go `PAID`, and be shown a
locked episode, permanently, with no error anywhere and a `200` on the callback.

Underneath that there were two separate gaps, and only one of them was the missing write.

**The receipt had nowhere to go.** `decideEpisodeAccess` reads `viewer.unlocks` and those facts come
from an `EntitlementFactsPort`, which in the finished system is one query against the same database
as the content rows. That database is W7. So a slot that wrote unlock records into a store of its own
would have satisfied its own tests and changed no verdict: payment verified, row written, episode
still `NEED_UNLOCK`. The write and the read had to be introduced to each other, and that is a wiring
decision (S69), not a rule.

**Every path into the grant is a retry path.** TikTok delivers at least once for 72 hours, the raw
event is stored so it can be replayed by hand, and a viewer with two open orders for one episode can
pay both. A grant that is written once per delivery instead of once per `(userId, episodeId)` is not
a tidiness problem: two receipts for one purchase is what makes a refund unable to revoke access, and
it is the defect that only appears in production, on the redelivery, after the money has moved.

---

## 2. What was delivered

Seven commits before this document, in dependency order, each one green on its own.

| File | Contents |
|---|---|
| `server/src/modules/unlock/unlocks.ts` | New. The `Unlock` row of `docs/12-domain-model.md` §6.1 — `ulk_` ids, and `createCoinUnlock` as the only constructor, which takes neither `method` nor `expiresAtMs` from a caller |
| `server/src/modules/unlock/unlock-store.ts` | New. The `(userId, episodeId)` unique index as behaviour: `record` reports a duplicate rather than failing on one, and answers with the row that is **already there** |
| `server/src/modules/unlock/grant.ts` | New. `PAID → FULFILLED`: the `PENDING` guard, and the receipt written before the order claims it exists |
| `server/src/modules/unlock/granted-facts.ts` | New. The seam — a facts port that adds the viewer's receipt for the episode under decision, and decides nothing |
| `server/src/modules/unlock/payment-sink.ts` | Two writes instead of one. Records the payment, then grants |
| `server/src/modules/platform-tiktok/paid-trade-orders.ts`, `routes.ts` | Two outcomes added to the operator vocabulary, with `ERROR_OUTCOMES` named next to the type instead of inline at the log line, so adding an outcome forces a decision about whether it pages anybody |
| `server/src/app.ts` | One unlock store, given to the sink and joined onto the entitlement facts every module reads |
| `contracts/openapi.yaml` | The callback grants; a successful purchase is normally observed as `FULFILLED`; the `409` case that is now reachable |

No new endpoint, no new field, no new error code. The grant is reachable from exactly one place —
the verified callback — and `unlockGranted` is the field it makes true.

### 2.1 The suites

| File | Tests | The property |
|---|---|---|
| `unlock-store.test.ts` | **10**, new | One row per viewer per episode: the second write reports the stored row, does not create a second, does not restamp the first. Both halves of the index are asserted separately, and nothing is evicted as the store fills |
| `grant.test.ts` | **18**, new | A `PENDING` order writes **no receipt** — asserted against the store, not the returned status. Repetition grants once; a replay completes an order whose receipt was written but never recorded; a write that does not land is reported rather than thrown |
| `granted-facts.test.ts` | **14**, new | The verdict changes from `NEED_UNLOCK` to `UNLOCKED` because a row exists, and nothing else moves: a failing base port stays failing, an anonymous request stays anonymous, and a `VIP` viewing receipt for the same episode does not hide the purchase (DM-3) |
| `payment-sink.test.ts` | **18** (was 9) | The receipt carries the order's own fields; a redelivery restamps neither the payment nor the grant; a failed grant is reported as `NOT_FULFILLED` with the payment still recorded; a second paid order for one episode is `DUPLICATE_PURCHASE` |
| `paid-unlock.test.ts` | **20**, new | The same thing over HTTP, with the unlock store injected so the assertions are on the rows. Includes the replay across a restart, the deployment whose receipts cannot be written, and the enumeration of deliveries that must write no receipt at all |
| `routes.test.ts` | 64 (was 61) | The verified callback now grants, and grants only the episode the order named. Every way of skipping the signature is unchanged |
| `session-orders.test.ts` | 26 (was 24) | The funnel: the episode is granted to the account the session named, survives a re-login, and is granted to nobody when the payer is not the buyer |

Server tests went 544 → **620**.

### 2.2 The shape of the write

```
POST /v1/payments/callbacks/tiktok
  │
  ├── store raw bytes → verify HMAC → timestamp window → client key → idempotency  (unchanged)
  │
  └── redeem.success ──▶ PaidTradeOrderSink.recordPaid
                            │
                            ├── correlate on trade_order_id      → NO_MATCHING_ORDER
                            ├── payer == order.userId            → PAYER_MISMATCH
                            ├── 1. PENDING → PAID                → ORDER_NOT_PAYABLE
                            └── 2. grantUnlockForOrder
                                   ├── refuse a PENDING order    → NOT_FULFILLED
                                   ├── write Unlock (dedup)      → NOT_FULFILLED
                                   └── PAID → FULFILLED          → NOT_FULFILLED
                                                                 → DUPLICATE_PURCHASE
```

Every arrow on the right is an outcome, logged and answered `200`. None of them is an exception and
none of them changes the response, because the delivery's idempotency key is already spent: a `500`
here would be retried and then discarded as a duplicate, which is a payment lost to a stack trace.

---

## 3. Decisions taken in this slot

Numbering resumes after W8's `S64`.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S65 | **The grant happens in the payment sink, on the verified callback, and nowhere else** | It is the only code path that has proof the platform took the viewer's money. An endpoint that granted — even one behind a session — would be a free episode for anyone who could reach it, and a flag that simulated one would be the same thing with a deployment variable in front of it. The sink has no HTTP route, and the tests that matter assert the unlock table is empty for every delivery that is not a verified payment for that order | It is one call site |
| S66 | **The receipt is written before the order records that it exists** | Dying between the two writes has to fail in the survivable direction. This order leaves a viewer who can watch what they paid for and an order a redelivery finishes; the reverse leaves an order that says `FULFILLED`, names an `unlockId` no table holds, and grants nothing — while reading as a completed purchase to every client and every operator | Swap two statements; one test |
| S67 | **The `PENDING` check is in `grant.ts`, before the write, even though `advanceUnlockOrder` already refuses `PENDING → FULFILLED`** | The transition table guards the *order*. A caller that wrote the row first and was then refused would have handed over the episode and merely failed to record it. Two lines of defence for the one rule that gives away paid content, and the test asserts the store is empty rather than reading the returned status | One condition |
| S68 | **Deduplication is on `(userId, episodeId)` in the store, not on the order and not on the delivery** | It is the unique index the domain model specifies, and it is the only key that makes all three retry paths converge: a redelivered callback, a replayed stored event, and two orders for one episode. Keying on the order would give one viewer two receipts for one episode; keying on the delivery would give them one per redelivery | It is the store's key; 11 tests |
| S69 | **The unlock records are joined onto the entitlement facts in `buildApp`, by a port that wraps the configured one** | The alternatives were worse in ways that outlive this slot: teaching the fixture facts port about unlocks makes the grant invisible in production, and letting playback read the unlock store directly gives the enforcement point a second opinion about entitlement — the exact defect `decideEpisodeAccess` exists to prevent. The decorator adds facts and decides nothing, so a facts port that refuses still refuses, and the default deployment still has no entitlements at all | One line in `buildApp`; 8 tests |
| S70 | **Two outcomes were added to the callback's vocabulary and both are error level: `NOT_FULFILLED` and `DUPLICATE_PURCHASE`** | Both mean an authentic payment arrived and the money is in the wrong place — charged and owns nothing, or charged twice and owns it once. Neither is visible to the viewer, and neither can be answered with a non-200. An error-level line naming the event id and the trade order is the whole of the alerting, and `ERROR_OUTCOMES` sits next to the type so a future outcome cannot be added without deciding. Neither name says *unlock*: the callback module does not know what a payment bought, and a subscription sink reports the same two things | Two constants |
| S71 | **A second paid order for one episode is fulfilled against the existing receipt, not refused** | Both payments happened. Leaving the second order `PAID` forever would be a client polling an order that never completes for an episode the viewer can already watch, and writing a second receipt would be an entitlement a refund cannot revoke. What is owed is a refund decision, which is a human's, and `unlock.orderId` is what tells them which order paid for the receipt | One comparison; three tests |
| S72 | **Nothing is evicted from the unlock store** | The order store bounds its map and drops oldest-first, which is survivable there — a forgotten `PENDING` order is a payment to reconcile. Here it would silently revoke an episode somebody paid for, under load, for the viewers unlucky enough to be oldest. A row can only be created by a verified payment, so the growth is paid for | A bound, if the durable table is ever late |
| S73 | **No wallet is debited and no `WalletTransaction` is written; `costCoins` is recorded and `transactionId` is absent** | The platform charged the viewer for the trade order. A debit against a coin balance that does not exist yet (W14) would be bookkeeping somebody would have to unpick, and a plausible-looking `transactionId` pointing at no ledger row is worse than an absent one. `orderId` is the provenance until the ledger exists | Add a field |

### 3.1 What was deliberately not changed

`unlockGranted` keeps its meaning and its wording — *"whether this order has actually bought
access"*, `status && unlockId !== null` — and it starts being `true` only when the row exists, which
is what W8's §7 asked the granting slot to check on arrival. `advanceUnlockOrder`, `order-store.ts`,
`orders.test.ts` and the whole signature-verification path are untouched: the transition table
already had the rule this slot needed, which is what S46 and S47 were for.

The response shape did not move. No field was added to `CoinUnlockOrder`, so a client written against
W8's contract polls the same field and now sees it become `true`. The contract text changed only
where it described a payment that granted nothing.

The favourites consume path was not touched, and neither was anything under `app/`.

---

## 4. Reverse verification

Each rule was reintroduced as a defect on the working tree and the full server suite re-run, per
`SR-1`. Scope is all **620** server tests in every row.

| Defect reintroduced | Failing | Representative names |
|---|---|---|
| The receipt written with `method: 'VIP'` instead of `COIN` — a viewing receipt, not a purchase (DM-3) | **17** | `reports it as a purchase`, `grants the unlock, and says so where the client reads it`, `writes a permanent coin receipt`, + 14 |
| Two unlock stores in `buildApp`: the sink writes one, the decision reads the other | **15** | `records the receipt from the order, with the price the order froze`, `grants once across a restart`, `grants the episode to the account that paid`, + 12 |
| The store stops deduplicating: `record` overwrites and reports every write as created | **11** | `keeps one row for one viewer and one episode`, `grants once, however many times it is asked`, `leaves one receipt`, + 8 |
| The unlock records not joined onto the entitlement facts (S69 removed) | **8** | `lets the viewer play the episode they paid for`, `refuses a fresh order for an episode the payment already unlocked`, `keeps the episode unlocked for a later session of the same account`, + 5 |
| A coin unlock given an expiry instead of being permanent | **7** | `grants it permanently`, `writes the receipt from the order, and nothing from anywhere else`, + 5 |
| The payer check dropped, so a payment grants the order of an account that did not make it | **5** | `writes no receipt for an authentic payment by another account`, `grants nothing to either account when the payer is not the buyer`, + 3 |
| A refused `PAYMENT_VERIFIED` transition granted anyway | **2** | `reports a refused transition as not payable, and grants nothing`, `reports an order that vanished between the lookup and the write` |
| A failed grant reported as an ordinary recorded payment | **2** | `reports a receipt that could not be written`, `reports an order that could not be advanced, having already granted` |
| The facts port synthesising a viewer out of `query.viewerId` when the base port reports none | **2** | `does not build a viewer out of the id the query named`, `does not attach a receipt bought by nobody` |
| The facts port deduplicating on the episode alone, dropping a purchase behind a `VIP` receipt | **1** | `reports a purchase for an episode the viewer also has a VIP receipt for` |
| A duplicate purchase reported as an ordinary payment | **1** | `reports it as a duplicate purchase rather than as an ordinary payment` |
| The `PENDING` guard removed from `grant.ts` (S67) | **1** | `writes no receipt for a pending order` |

Four rows deserve a note.

**The `PENDING` guard fails one test, and it has to.** There is no reachable path to it: the sink
advances the payment before it grants, so by the time `grant.ts` sees an order it is `PAID` or
`FULFILLED`. That is the same posture as slot K's S47 — the guard is the second line for a caller
that does not exist yet, and its test asserts the *store* is empty rather than reading a status, so
it cannot be satisfied by a well-behaved return value.

**Two rows were found by probing rather than by writing**, and both are in their own commit
(`9b308ae`). Synthesising a viewer out of the query's id failed **nothing** on the first run: the
anonymity test passes for a decorator that invents one, because nothing has ever bought anything as
`anonymous`, so the lookup misses and the facts come back untouched. And the signature-failure
enumeration asserted the order's status, which is a proxy for the thing that matters — an episode is
played from the receipt, so a grant written beside an order nobody advanced would have passed all
eight cases. Both are the same lesson W8 §4 recorded: an assertion that holds for two different
reasons is testing neither.

**The two-store row is the S69 defect in its other form.** Not forgetting to join the facts, but
joining the *wrong instance* — which is the failure mode of every store in this codebase that is
constructed more than once (slot L's sessions, S59's resolver), and the reason `buildApp` builds one
of each and hands it out.

**Most of the "no receipt" enumeration never reaches this slot's own code.** Four of its five cases
are refused before the sink is called — three at the signature, one because a refund is not a redeem
— and only the payer mismatch gets that far. They are asserted anyway, because the property worth
holding down is "no receipt exists", not "the module I wrote behaved".

### 4.1 Gates

Every gate was run on this branch, at `pnpm verify`.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **753 passing, 0 skipped, 0 failing** — 620 server, 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

No test of another slot's was deleted or weakened. Ten assertions across three files changed sides,
all in `6e361bc`: five that observed a paid order as `PAID` where a paid order is now `FULFILLED`, and
five that stated a paid order grants nothing. Two of the second group are the same test under a new
name — `does not grant the unlock, and does not pretend to` and `grants nothing by being paid` now
assert the grant they were written to deny.

The blocks around them are unchanged. Opening an order still grants nothing, and every way of
skipping the signature still leaves the order `PENDING` and `unlockGranted` `false`.

---

## 5. Deliberately not built

- **No wallet, no ledger, no coin balance.** S73. The platform charges for the trade order; nothing
  here reads or writes a balance, so `docs/12-domain-model.md` §6.1's debit-then-write orchestration
  is still half-built and the half that exists is the write.
- **No refund handling.** The refund events are still stored and left alone (slot K), and this slot
  gives them something to reverse for the first time. A refunded payment now leaves a permanent
  receipt behind, which is named as a gap in §8 rather than guessed at from an event shape nobody
  has seen (G-R4).
- **No ad unlock and no operational grant.** `method` is the full enum and `AD` and `GRANT` have no
  writer. The store and the decision function already handle them; W16 needs a caller, not a schema.
- **No whole-drama or whole-season unlock.** `docs/12-domain-model.md` §6.1 reserves it as "multiple
  Unlock rows plus one transaction", which is a batch of exactly what this slot writes. Nothing here
  assumes one order buys one episode except the order itself.
- **No unlock list endpoint.** `UnlockStore` has `findForEpisode` because that is the lookup the
  decision needs, plus `list()` for tests. "Which episodes do I own" is a browse-path query against a
  data layer that does not exist.
- **No replay endpoint or operator tool.** Recovery from `NOT_FULFILLED` is a redelivery from
  TikTok or a replay of the stored payload, and the second one has no button. It is proven in a test
  by building a second app around the same stores; a human would need a script.
- **No durable store.** Both stores are process-local maps. §8.
- **No real trade-order API, no real code exchange, no data layer.** Unchanged, and all three still
  default to refusing.

---

## 6. How to buy and play an episode in a test

W8's §6 still applies for opening an order. To take it all the way, inject the unlock store so you
can read the receipt back, and pay with a signed callback:

```ts
const orderStore = createInMemoryUnlockOrderStore();
const unlockStore = createInMemoryUnlockStore();
const app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, {
  platformCredentials: createPlatformCredentials('awtest', SECRET),
  entitlementFactsPort: createFixtureEntitlementFactsPort(),
  viewerResolver: createFixtureViewerResolver(),
  playbackMediaPort: createFixturePlaybackMediaPort(),
  unlockOrderStore: orderStore,
  unlockStore,
  tradeOrderPort: createFixtureTradeOrderPort(),
  now: () => FIXTURE_NOW_MS,
});
// POST /v1/unlock/coin-orders → tradeOrderId
// POST /v1/payments/callbacks/tiktok, signed with computeWebhookSignature
// → unlockStore.list() has one row, and POST /v1/playback/sessions answers 201
```

`paid-unlock.test.ts` is the worked example, including the two things that are easy to get wrong:

- **a replay needs a new app.** The webhook's idempotency key is `trade_order:<id>` and the event
  store is process-local, so redelivering to the same app is answered `duplicate: true` and never
  reaches the sink. Build a second app around the same order and unlock stores — that is what a
  restart, a second replica or an operator replaying a stored payload actually looks like;
- **do not inject `entitlementFactsPort` expecting it to be the last word.** `buildApp` wraps it with
  the unlock records (S69). A test that wants to see a grant must let it, and a test that wants to
  assert a viewer owns nothing must not write a receipt for them.

---

## 7. For the next slots

**For the wallet slot (W14).** The receipt is written and the ledger is not, so
`Unlock.transactionId` is the field to fill and `grant.ts` is the one place that writes the row. Two
things to keep: the receipt must still be written before the order records it (S66), and the debit
must not become a fourth thing that can fail after the money moved — if the ledger write can fail,
it belongs on the same side of the boundary as the receipt, not between the payment and the grant.
`costCoins` is already the price the order froze.

**For whoever lands the data layer (W7).** `createGrantedUnlockFactsPort` is the seam that stops
existing when your query reads unlocks and content together. Delete it, and keep two of its
properties: a viewer's rows are loaded for the episode under decision only, and a failing facts port
does not become a viewer who owns nothing — it stays a failure. Its suite is the specification of
what your query has to answer, including the `VIP`-receipt case that must not hide a purchase.

**For whoever handles refunds.** This slot is the reason it now matters. A refunded payment leaves a
`FULFILLED` order and a permanent `Unlock` row, and `docs/12-domain-model.md` has no revocation
rule — §6.1 does not say what a refund does to a receipt. The events are stored and unread, the
`(userId, episodeId)` index means there is exactly one row to reverse, and `unlock.orderId` says
which order paid for it. Decide the rule before writing the code; the reverse of a grant is not
obviously "delete the row".

**For whoever lands Redis or Postgres.** The window W8 named is now wider in one direction and
narrower in another. A restart between opening an order and paying it still loses the order, and now
loses the receipt too — but a replay of the stored event rebuilds both, which is tested. What is *not*
survivable is a durable order store in front of an in-memory unlock store: the order would come back
`FULFILLED`, naming an `unlockId` no table holds, and the episode would be locked with nothing left
to replay. Land them together, and make `record` a real `INSERT … ON CONFLICT (user_id, episode_id)
DO NOTHING … RETURNING`, which is what its contract already describes.

**For whoever builds the client's unlock panel.** Poll `unlockGranted`, not `status`, and it now
becomes `true` on the first poll after a successful payment. `POST /v1/entitlement/episode-access` is
still the authority on playability, and it is the call to make after the grant lands rather than
inferring access from the order.

---

## 8. Known gaps in this slot's own work

- **Both stores are process-local, and they now fail together.** A restart loses orders and receipts
  alike. It is recoverable by replay only because TikTok redelivers for 72 hours and the raw events
  are stored; nothing automates that, and a viewer whose receipt vanished sees a locked episode they
  paid for.
- **A grant failure is only a log line.** `NOT_FULFILLED` is error level with the event id and
  the trade order id on it, and there is no alert, no metric, no dead-letter queue and no query for
  "orders that are `PAID` and older than five minutes". That query is the operational answer and it
  does not exist.
- **The sink can still throw.** Its contract says implementations must not, and every failure this
  slot's own code produces is an outcome, but a durable store that throws — a lost connection, a
  deadlock — would become a `500`, be retried, and be discarded as a duplicate. It is a pre-existing
  hazard (`orderStore.apply` has always been able to throw) that this slot doubles the surface of.
- **Nothing limits how many orders one account may open for one episode.** `DUPLICATE_PURCHASE`
  reports the second charge; it does not prevent it. The front door refuses an episode the viewer
  already owns, which closes the case that happens after a payment and not the one where two orders
  are open at once.
- **No concurrency is tested.** Two deliveries arriving together hit the same in-memory map, and
  Node's event loop is what makes `record` atomic. The `(userId, episodeId)` uniqueness is a property
  of the map here and must be a property of the schema there.
- **The grant is stamped with the instant the payment was learned of, not the platform's.** The
  sender's `create_time` is on the stored payload and is deliberately unused — a receipt dated by a
  clock we do not control is worse — but it means `grantedAtMs` on a replayed event is the replay's
  time, and for a healed grant it is minutes or days after the charge.
- **Nothing has been run against a real payment.** The callback is signed with a test secret, the
  trade order comes from a fixture that mints `tto_fx_0001`, and the payer's `open_id` is a fixture
  user id — which is still the conflation W8's S64 pinned rather than fixed. A real `user_openid`
  that does not equal the account id stops every grant, with a `200` and a `PAYER_MISMATCH`.
- **This slot did not run the server against the real client.** The episode is playable in a test
  after a payment; nobody has watched it happen in the app.
- **`list()` on the unlock store is for tests.** It has no pagination and no scoping, and it must not
  become the implementation of a "my unlocks" endpoint.
