# Handoff — Wave 8, Work Slot: the coin order's viewer comes from the session

> **Branch:** `cursor/w8-work-session-viewer-bc30`, cut from `cursor/w3-work-l-8551` (`d7ca8c4`).
> **Scope:** the last link in the purchase chain. The client presents `Authorization: Bearer` (W7),
> slot L gave the server a store that can resolve one, and slot K built the coin-order endpoints
> against a `ViewerResolver` that nothing had wired. This slot brings slot K's unlock module onto
> the session branch, hands its routes the session-backed resolver `buildApp` already gives every
> other module, and proves — with sessions the app itself issued — that an order is attributed to
> the account the token names.
> **Not in scope:** the real TikTok code exchange, which still refuses every code, so production
> remains fail-closed and no deployment a client can reach can open a coin order. The favourites
> list API is in flight elsewhere and is untouched. No unlock is granted, no branch was merged, and
> **no pull request was opened.** `app/` is byte-identical to the base and the built bundle still
> hashes to `index-B_KnFxaH.js`.

---

## 1. What was wrong

Three slots had each done their half correctly and the feature still did not exist.

W7 shipped the client's session and said so in its own §7: *"the server still resolves every request
to the anonymous viewer… Until that changes, a coin order authenticated by this slot is still
refused."* It named the order of work — a session record, then a `ViewerResolver` that reads it,
then the grant — and slot L delivered the first two. Slot K, meanwhile, had built
`POST /v1/unlock/coin-orders` and `GET /v1/unlock/coin-orders/{orderId}` on a different branch,
against entitlement's `ViewerResolver` interface, and had proved them against
`createFixtureViewerResolver`: `fxt_<userId>` in, a viewer id out, no session anywhere.

So the funnel was: tap "Unlock" → a real bearer token on the wire → an endpoint that exists on
another branch → and, wherever the two met, no test that a session had ever been involved.

The gap worth naming is the last one, because it is the one that survives a merge. A fixture
resolver is the right seam for testing the order rules — it makes "already unlocked", "the
subscription covers it" and "coins do not open this" legible without a login — and it is the wrong
seam for testing who owns an order. **Every assertion in slot K's 61-test suite passes on an app
whose login route writes to one session store while its coin-order routes read another**, because
none of them ever presents a token that a login produced. That defect is invisible in review for
exactly the reason slot L named: each half looks right.

---

## 2. What was delivered

The branch is in two halves, and they are separate commits so the diff stays readable.

### 2.1 The port (commits `494cb98`…`481ef76`)

Slot K's eight commits, cherry-picked from `cursor/w2-work-k-6bb5` (`0be48a9..7b81146`). Both
branches were cut from `cursor/w2-work-i-e53c`, so this is the stack the slot would have had if it
had been cut in order — not a merge of two lines of work.

| File | Origin |
|---|---|
| `server/src/modules/unlock/*` | New, slot K: `orders.ts`, `order-store.ts`, `routes.ts`, `trade-order-port.ts`, `payment-sink.ts`, `fixtures.ts` and their suites |
| `server/src/modules/platform-tiktok/paid-trade-orders.ts`, `routes.ts`, `webhook-events.ts` | Slot K: the callback publishes a verified payment to a sink instead of dropping it |
| `contracts/openapi.yaml`, `packages/shared/src/errors.ts` | Slot K: the two coin-order operations and the unlock and payment error codes |
| `docs/handoff/w2-work-k.md` | Slot K's handoff, carried with the module it documents |

One conflict, in `server/src/app.ts`, where slot K added the unlock registration and slot L replaced
the identity wiring. It was resolved by keeping both: slot L's single session store and
session-backed resolver, and slot K's order store, unlock registration and payment sink. **No file
of slot K's was otherwise modified** — 111 of its server tests came across and passed unchanged.

### 2.2 This slot (commits `ae9440c`…)

| File | Contents |
|---|---|
| `server/src/modules/unlock/session-orders.test.ts` | New, **24 tests**. Coin orders driven end to end by sessions the app issued, with no `ViewerResolver` injected |
| `server/src/app.test.ts` | **+2 tests**: the default deployment refuses a presented session at both coin-order endpoints, rather than answering the `503` it would have before a store existed |
| `server/src/app.ts` | The comment on the one resolver, naming the coin-order routes as a reader and why that matters more there than elsewhere |

That is the whole of the production diff: seven lines of comment. The wiring itself is
`viewerResolver`, the same variable entitlement and playback already receive — which is the point of
§3's first decision, and the reason this slot is mostly a test file.

### 2.3 What the new suite holds down

Nothing in it injects a `ViewerResolver`; injecting one replaces the thing under test. The session
store is injected instead, which is the flagless login `docs/handoff/w3-work-l.md` §6 documents, and
one block goes through `POST /v1/auth/login` itself.

| Block | Tests | The property |
|---|---|---|
| An order is opened for the account the session names | 5 | The price is quoted to the token's account; the same episode asked for by two accounts gets two different answers; the order is readable by a **later session of the same account** and absent to anyone else's; the token is never echoed back |
| A session this server did not issue buys nothing | 9 | No credential, a token nothing issued, a token from **another store**, a non-bearer credential, an empty bearer, an expired session, a revoked session — each `401`, with no facts read, no platform payment opened and no order written. Plus the one case that separates a refused credential from an absent one |
| The idempotency key spans the account, not the session | 2 | A retry made with a *new* session returns the first order and opens no second payment; one account's key does not answer another's request |
| Login, order, pay | 4 | The whole funnel over HTTP with the mock exchange: the token the login endpoint issued opens an order, a signed callback naming the same open id pays it, it still grants nothing, and a callback naming a different account leaves it `PENDING` |
| A deployment without the mock path | 3 | Login refuses both a real-looking code and a mock one and issues nothing, so the coin-order endpoint has nothing to authenticate and sells nothing |

The fourth block is the one that reaches outside this slot. A session is bound to the platform's
`open_id` (slot L, S57) and the payment sink pays an order only when the callback's `user_openid`
equals the account that placed it (slot K, S53). Those are two files that have never been read
together, and they are only compatible for as long as both mean the same identifier. The test makes
that a failing assertion instead of a coincidence.

---

## 3. Decisions taken in this slot

Slots K and L numbered in parallel from `S46`, and this branch now carries both, so numbering
resumes after the higher of the two.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S59 | **The coin-order routes read the same `ViewerResolver` instance as entitlement and playback** | An order is attributed to whatever the resolver returns and a payment is later correlated against that same account id, so a second resolver here would not be a wiring inconsistency — it would be a purchase recorded for the wrong viewer, with a `201` and nothing in the logs. It is one variable in `buildApp`, which is what makes "the money and the browse view agree about who is asking" structural rather than a convention | None; it is one argument |
| S60 | **The unlock module was cherry-picked, not merged, and slot K's files were not edited** | Both branches came off the same commit, so the eight commits replay as the stack this slot would have had if the slots had run in order — no merge commit, no second parent, and a diff a reviewer can read as "slot K, then this". Editing K's files to make them session-aware would have been the tempting alternative and would have put this slot's changes inside a suite it does not own | Rebase, or take K's branch instead |
| S61 | **An order belongs to the account, not to the session that opened it** | It is what the client's own failure path requires: a refused token is dropped and silent login is re-run (W7, A4), and the viewer then presses "Unlock" once. If the new session could not see the first order, that one press would become two payments. Stated as three tests — the later session reads it, the retry replays it, another account cannot | It is the existing keying; the tests are what make it deliberate |
| S62 | **A credential we could not read and no credential at all stay one `401 AUTH_REQUIRED`, distinguished only by the error detail** | The client's remedy is the same for both, and a distinct status would make the endpoint an oracle for which tokens exist. But the sameness is also why a resolver that quietly downgraded an unreadable token to "anonymous" was invisible here — an anonymous caller is refused too, so every other assertion passes either way. The detail is the one honest difference: a request that offered nothing is told to sign in *for the episode it named* | One assertion |
| S63 | **The refusal is asserted to happen before the entitlement facts are read** | It is what the contract already promises — *"an order is attributed to an account, so this is refused before a price is quoted"* — and it was unenforced. "An anonymous creation is refused" passed for the wrong reason: the fixture world does not know a viewer called `anonymous` either, so a route that stopped refusing and invented an account id was still answered `401`, by `VIEWER_NOT_FOUND`, one layer too late, and only for as long as the invented id happens to name nobody. Removing the anonymous denial failed a single test in the whole suite, and not one about anonymity | A counting wrapper in one test file |
| S64 | **`open_id` as the account id was not fixed here, it was pinned** | Slot L recorded the conflation as a gap and slot K's payer check depends on it. Two slots' worth of behaviour rests on an identifier space nobody has decided on, and changing it in a slot about wiring would be changing it in the dark. The funnel test makes the dependency fail loudly the moment either side moves | It is a test, not a constraint |

### 3.1 What was deliberately not changed

`server/src/modules/unlock/` is byte-identical to slot K's. So is `platform-tiktok`, so is
`entitlement`, so is `identity` — the resolver this slot wires was already written and already
tested by slot L, and `contracts/openapi.yaml` needed nothing: it already says the coin-order `401`
covers *"no credential, or one that could not be read or resolved"*, which is now true rather than
aspirational. No endpoint, status or body shape moved in this slot.

The favourites list API was not touched, and neither was anything under `app/`.

---

## 4. Reverse verification

Each rule was reintroduced as a defect on the working tree and the full server suite re-run, per
`SR-1`. Scope is all 544 server tests in every row.

| Defect reintroduced | Failing | Representative names |
|---|---|---|
| The coin-order routes left on the unresolved resolver — the S28 state this slot closes | **20** | `quotes the price to the viewer the token was issued to`, `records the payment against the order the session opened`, `refuses a presented session when opening an order`, + 17 |
| Two session stores in `buildApp` — one issuing, one resolving | **14** | `opens an order with the token the login endpoint issued`, `reports the order to a later session of the same account`, `answers a live subscriber as the subscriber they are`, + 11 |
| A token the store does not hold read as an anonymous viewer | **9** | `does not report a refused credential as an absent one`, `refuses a presented session rather than downgrading it to anonymous` (both other endpoints), + 6 |
| The idempotency index keyed by the key alone, not by the account | **4** | `does not let one account's key answer another's request`, `lets a different viewer use the same key`, + 2 |
| The payment sink not checking that the payer is the account that ordered | **3** | `leaves the order pending when the payer is not the account that opened it`, `refuses a payer who did not place the order, and leaves it pending`, + 1 |
| The order read not scoped to the account the session names | **2** | `reports it as absent to another account's session`, `reports another viewer's order as absent` |
| An order opened for a caller with no account | **2** | `refuses a request that carries no credential`, `does not report a refused credential as an absent one` |
| Expiry not checked when a session is resolved | **7** | `refuses to report an order once the session that opened it has expired`, `refuses an expired session`, + 5 |

Three rows deserve a note.

**The two-store row was three tests before this slot** — all of them slot L's end-to-end
entitlement checks — and is fourteen now. That is the shape of what was added: the defect that
motivated slot L is the same defect that silently attributes a purchase to nobody, and until this
branch nothing in the money path could see it.

**The last two rows are two tests each, and both were found by probing rather than by writing.** The
anonymous-denial row failed *one* test on the first run, and not one about anonymity — the fixture
facts port was refusing the invented viewer a layer later and covering for the route. The expiry row
missed this slot's own case, because it presented a made-up token and so asserted the unknown-session
path twice. Both are fixed in their own commits, and both are the same lesson: an assertion that
holds for two different reasons is testing neither.

**The `401` rows overlap on purpose.** `does not report a refused credential as an absent one` is the
only assertion that separates "we could not read your credential" from "you did not send one", which
is why it appears under three different defects (S62).

### 4.1 Gates

Every gate was run on this branch, at `pnpm verify`.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **677 passing, 0 skipped, 0 failing** — 544 server, 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The server went 407 → 518 on the port (slot K's suites, unchanged) → 544 here. No test is skipped,
and no test of another slot's was deleted or weakened.

---

## 5. Deliberately not built

- **No unlock grant.** A paid order is a paid order. `PAID → FULFILLED` still has no caller, the
  `Unlock` row is W14's against a data layer that is W7's, and the funnel test asserts the episode
  is still locked after a verified payment. Under-delivering is the only direction a half-built
  payment path may fail in.
- **No real code exchange, and no change to the mock gate.** `createTiktokIdentityPort` still
  refuses every code; the mock port still needs two deliberate non-production environment values.
  A block of this slot's tests exists to state that a deployment without them has nothing to sell
  against.
- **No real trade-order API.** `createUnavailableTradeOrderPort` is still the default, so a
  deployment that is otherwise wired answers `503 PAYMENT_CHANNEL_UNAVAILABLE`. `/v2/minis/trade_order/create/`
  is W23 behind business milestones.
- **No re-login interceptor.** The server now gives a dropped session a `401` the client already
  knows how to answer; what the client does *next* is W7's §5, unbuilt.
- **No favourites, no watch progress.** In flight elsewhere. They need nothing from this slot beyond
  the resolver `buildApp` already hands out.
- **No contract change.** §3.1.
- **No rate limiting on login**, still. Coin orders are now a reason to want it: opening one is
  cheap, and the endpoint that mints the sessions in front of it has no limit.
- **No `Authorization` redaction in the request logger.** Named as a gap by slot L and still open;
  this slot adds two more endpoints that carry the header.

---

## 6. How to buy something in a test

Two supported ways, in order of preference. Neither needs an environment variable.

**Inject the session store** — the token exists before the request, and no resolver is replaced:

```ts
const sessionStore = createInMemorySessionStore();
const app = await buildApp({ ...loadConfig({}), logLevel: 'silent' }, {
  sessionStore,
  entitlementFactsPort: createFixtureEntitlementFactsPort(),
  tradeOrderPort: createFixtureTradeOrderPort(),
  now: () => FIXTURE_NOW_MS,
});
const { accessToken } = sessionStore.issue('usr_fx_newcomer');
// POST /v1/unlock/coin-orders, Authorization: Bearer ${accessToken}, Idempotency-Key: <yours>
```

**Go through the endpoints**, when the funnel itself is what is under test: enable the mock path
(`MINIDRAMA_TEST_LOGIN=yes-i-am-a-non-production-test-deployment`, `NODE_ENV=test`), log in with
`mock:usr_fx_newcomer`, and use the `accessToken` it returns. `session-orders.test.ts`'s fourth
block is the worked example, including the signed callback.

Do **not** inject `viewerResolver` when what you are testing is who owns an order. It replaces the
thing under test, which is how a coin-order suite of 61 tests came to say nothing about sessions.

---

## 7. For the next slots

**For whoever grants the unlock (W14).** The order already carries everything you need and none of
it comes from a client: `userId` is the resolved viewer, `dramaId` and `priceCoins` are frozen from
the facts that priced it. Raise `UNLOCK_RECORDED` through `orderStore.apply` — `PENDING → FULFILLED`
is refused by `advanceUnlockOrder`, so you cannot grant an unlock for an order the platform never
confirmed even if the sink is wrong. The one thing to check on arrival is that `unlockGranted`
starts being true only when the `Unlock` row exists, because that is the field the client acts on.

**For whoever lands the users table (W7).** The line to change is still the one slot L marked in
`identity/routes.ts` — but it now has a second reader. `payment-sink.ts` pays an order only when the
callback's `user_openid` equals `order.userId`, so minting a local `usr_` id at login without
translating the callback silently stops every payment, with a `200` and a `PAYER_MISMATCH` in the
log. `session-orders.test.ts`'s `records the payment against the order the session opened` fails the
moment the two diverge; make it pass by translating in the sink, not by widening the comparison.

**For whoever lands Redis.** Sessions and orders are both process-local, and they now fail together
in a way neither did alone: a restart between opening an order and paying it leaves the callback
holding a `tradeOrderId` for an order that no longer exists — an authentic payment with nothing to
attribute it to. The raw webhook event is stored and replayable, so it is recoverable, but the
window is real and it is the strongest argument for landing the durable stores with the trade-order
API rather than after it.

**For whoever builds the client's re-login.** The server side of the loop is now honest: a dropped
token gets a `401`, a fresh session sees the viewer's existing orders, and a retry carrying the same
`Idempotency-Key` returns the first order rather than opening a second payment. That last property
is what makes an automatic retry of the coin-order `POST` safe *if* the key is preserved across the
re-login — and unsafe if it is regenerated.

---

## 8. Known gaps in this slot's own work

- **The anonymous/refused distinction is only in an error detail.** Both are `401 AUTH_REQUIRED`
  (S62), so a client cannot tell them apart from the status, and the single test that can is
  asserting on a details field rather than on anything structural. If the details ever stop being
  part of the contract, the silent-downgrade defect goes back to being invisible at these endpoints.
- **The funnel is proven against the mock exchange.** `mock:<userId>` produces an `open_id` that is
  a fixture user id, which is exactly the conflation S64 pins rather than fixes. Nothing here has
  seen a real TikTok `open_id`, and nothing has seen a real `user_openid` on a callback.
- **Nothing was run against a real data layer or a real trade-order API.** The facts port and the
  trade-order port are fixtures; the default of both is still a refusal.
- **The `Idempotency-Key` is the client's.** Two devices signed into one account, or a client that
  regenerates the key on retry, still open two orders. The key is scoped per account, which is what
  makes the retry safe; nothing makes the client reuse it.
- **Nothing limits how many `PENDING` orders one account may hold.** The store's ceiling is a memory
  bound that evicts oldest-first, so under a flood a legitimate viewer's order can be dropped
  between opening it and paying it — and the callback then arrives for an order that is gone.
- **No concurrency is tested.** Two simultaneous creations with one key hit the store's
  `IDEMPOTENCY_CONFLICT` backstop, which is asserted, but Node's event loop is what makes the
  in-memory check atomic. That stops being true the moment either store is remote.
- **This slot did not run the server and drive it with the real client.** W7's §4.3 did that against
  a branch where these endpoints answered `404`; nobody has repeated it now that they answer. It is
  the obvious first thing for the integration slot to do.
- **Slot K's suite still injects a fixture resolver**, and deliberately: it is testing the order
  rules. The consequence is that the coin-order behaviour is asserted twice against two different
  notions of a viewer, and only one of them is the deployed one. If the two ever disagree, the
  session file is the one that describes what a viewer gets.
