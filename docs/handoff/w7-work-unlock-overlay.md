# Handoff — Wave 7, Unlock Overlay: the panel behind `onUnlockRequested`

> **Branch:** `cursor/w7-work-unlock-overlay-ec70`, cut from `cursor/w2-work-h-5c79` (`c10cdb8`).
> **Scope:** the client half of the coin unlock. PNL-02 as an overlay on the drama detail screen,
> the `UnlockApi` seam for `POST /v1/unlock/coin-orders` and its poll, the order→pay→confirm flow,
> and the wiring that finally fills `EpisodeRow`'s `onUnlockRequested`.
> **Not in scope:** nothing under `server/`, nothing in `app/tools/`, nothing in `contracts/`. No
> VIP subscription purchase, no wallet, no recharge sheet, no whole-drama or ad unlock, no
> favourites, no player integration. **No branch was merged into this one and no pull request was
> opened.**

---

## 1. What this closes, and what it deliberately does not

Slot H shipped the episode list with a hole in it. `EpisodeRow` took an optional
`onUnlockRequested`, nobody passed one, and a locked episode therefore rendered a *disabled* button
that said "Unlocking is not available yet" (H25). That was the right call at the time and it is the
end of the commercial funnel: the screen that earns the money had no next step.

Slot K built the server half on `cursor/w2-work-k-6bb5`: an unlock **intent** API. `POST` records
that a viewer wants to buy an episode and hands back the platform trade order they pay against;
`GET` reports where that order got to. Nothing in it grants an unlock, because writing the `Unlock`
row is W14 work against a data layer that is W7 work.

This slot joins the two. The result is a purchase surface that opens a real payment and **hands over
no content**, which is the only honest shape available while the grant does not exist.

The thing to understand before reading anything else: **a successful purchase today ends at "you
were charged and the episode has not opened."** That is not a bug in this slot, it is the state of
the system, and the panel says so in as many words. Every alternative was worse:

- reporting success on the `201` sells nothing and claims to;
- reporting success when `PlatformBridge.pay` resolves trusts the SDK about money;
- reporting success on `status: PAID` shows a locked episode as unlocked;
- reporting a plain error tells a viewer whose money moved that nothing happened.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `app/src/unlock/unlock-offer.ts` | New. `describeUnlockOffer` — coins, VIP, or one of four unpurchasable causes |
| `app/src/unlock/coin-unlock.ts` | New. `runCoinUnlock`: order → pay → confirm, as a plain async function. The whole money path |
| `app/src/unlock/use-coin-unlock.ts` | New. The flow published into React state, with the one-attempt guard and the key's lifetime |
| `app/src/unlock/UnlockPanel.tsx` | New. PNL-02: three channels, three settlement shapes, and a way out at every point |
| `app/src/unlock/idempotency.ts` | New. One opaque token per purchase attempt, `randomUUID` feature-detected |
| `app/src/data/unlock-api.ts` | New. `UnlockApi`, the two endpoints, and the coin-order narrowing |
| `app/src/data/unlock-api-context.tsx` | New. Provider and hook, no default value |
| `app/src/data/http.ts` | `postJson` with caller headers; `HttpRequestInit` admits `POST` and a body; `HttpReader` |
| `app/src/data/catalog-api.ts` | Takes `HttpReader` rather than `HttpClient`, so a catalogue call cannot become a write |
| `app/src/routes/DramaPage.tsx` | `onUnlockRequested` wired; the panel rendered; `episodes.reload` on a settled grant |
| `app/src/main.tsx` | One transport, two clients. `UnlockApiProvider` above the router |
| `packages/shared/src/errors.ts` | The six codes slot K added, transcribed verbatim (§6) |
| `app/src/core/i18n/locales/*.json` | 29 keys in both locales — one per state the panel can be in |
| `app/src/styles/app.css` | The overlay: scrim, sheet, and the safe-area padding a bottom sheet needs |
| `app/src/testing/unlock-fixtures.ts` | New. Order fixtures, a scriptable `UnlockApi`, an observable paying bridge, `instantPacing` |
| `app/src/testing/render.tsx` | Provides an unlock client, defaulting to a stub that answers nothing |

**Nothing outside `app/src/`, `packages/shared/src/errors.ts` and `docs/` is in this diff.** The
guardrail modules under `app/tools/` are untouched.

### 2.1 The flow

```
    tap on a locked row
            │
            ▼
   describeUnlockOffer ──── VIP ──────────▶ a statement. No coin path exists in this branch
            │         └──── unpurchasable ▶ one of four sentences. No button
            │ coins
            ▼
   POST /v1/unlock/coin-orders  ── 409 already unlocked ──▶ success: refetch the list
            │                    ── 422 / 401 / 404 / 410 ▶ failure, no retry offered
            │ 201
            ▼
   bridge.pay(payment.tradeOrderId)  ── user cancelled ──▶ "nothing was charged", retry offered
            │
            ▼
   GET /v1/unlock/coin-orders/{id}, immediately then backing off to 60s
            │
            ├── unlockGranted ─────▶ UNLOCKED     → refetch the episode list
            ├── PAID, no grant ────▶ AWAITING_UNLOCK  → its own copy. No player link
            ├── still PENDING ─────▶ PAYMENT_NOT_CONFIRMED, same-key retry
            └── order not found ───▶ ORDER_LOST, no retry ever
```

The only transition into `UNLOCKED` is the server's own `unlockGranted`, and even that is not
treated as access: the caller refetches and the row renders whatever `viewerAccess` then says.

### 2.2 Three access states, three products

The brief's distinction, kept as three branches that share no code:

| Server says | Panel shows | Why it cannot share a branch |
|---|---|---|
| `NEED_UNLOCK` | price, "Unlock for N coins", the flow above | The funnel. The only branch that may open a payment |
| `NEED_VIP` | "This episode comes with VIP", and that subscribing is not available in this version | A different product on a different rail. There is no subscription order endpoint; posting a coin order here is a request whose only purpose is to be refused with `422`, after the viewer was told it would work |
| unpurchasable | one of four sentences (§2.3) | Not a sale, for four reasons that ask the viewer for four different things |

**Whether to offer is read only from the presentation action.** `episode.priceCoins` is read
afterwards, and only to decide the amount. This is the same trap slot H documented and it now has a
second victim: the price belongs to the *episode listing* and the access decision's price is a
different field. The server's `decideEpisodeAccess` nulls its price for a VIP refusal; the listing
does not blank `priceCoins` for either a VIP-only or a withdrawn episode. So both a `NEED_VIP` and
an `UNAVAILABLE` episode can arrive carrying a number, and a panel that saw one and sold it would
charge coins for something coins do not buy. §4 records how that was found.

### 2.3 The four unpurchasable causes

| Cause | When | What it asks of the viewer |
|---|---|---|
| `PLATFORM_BLOCKED` | `canIUse('pay')` / `canIUse('createSubscription')` is false | Nothing. The block is ours (IA §9) |
| `NOT_FOR_SALE` | `UNAVAILABLE`, or a `viewerAccess` the server cannot emit | Nothing. There is no price at which this works |
| `ALREADY_PLAYABLE` | `FREE` / `UNLOCKED` / `VIP` | Watch it |
| `UNPRICED` | `NEED_UNLOCK` with a `priceCoins` that is not a positive integer | Come back later. Its own branch because charging a number we do not have means charging zero |

---

## 3. Decisions taken in this slot

Numbered `U*`, continuing the convention of `H*` for client slots and `S*` for server ones.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| U1 | **`UNLOCKED` is reported only from the server's `unlockGranted`, and even then the caller refetches rather than patching** | The three cheap alternatives each hand a paid episode over for free (§1). Refetching rather than patching is the same rule as H4 one layer up: an episode edited on the client is a second, unauthenticated entitlement system | One condition; ~30 tests |
| U2 | **Charged-but-not-granted is its own outcome with its own copy** | It is where a successful purchase actually stops today. Rendering it as a success lies about the content; rendering it as an error lies about the money, and the viewer acts on that by paying again | One branch |
| U3 | **The money path is a plain async function, not a hook** | The part that spends money should be assertable without a DOM, a router or a render. All 27 flow assertions run with no React at all | Inline it into the hook, and lose them |
| U4 | **A `POST` never retries automatically; a `GET` still retries once** | A transport failure does not say whether the request arrived, and an automatic second attempt is a second thing the viewer can be charged for. Repeating it is the caller's decision, made with the same key | One branch in `http.ts` |
| U5 | **The idempotency key lives for one panel session and is reused verbatim on retry** | Reuse is what makes "try again" return the existing order instead of minting a second payable one. It is replaced only on `COMMON_IDEMPOTENCY_*`, where the key itself was refused | A ref |
| U6 | **The retry button is absent whenever money may have moved or a repeat cannot help** | A retry that cannot succeed is the button people press until they give up on the app. A retry that can take a second payment is worse — and slot K's own §8 notes that nothing deduplicates orders per episode yet | One field, `retry` |
| U7 | **A failed `pay` still gets exactly one confirming read; a cancelled one gets none** | The SDK is not the authority on whether money moved, so an adapter returning `BRIDGE_UNKNOWN` for a payment that succeeded must not leave a charged viewer looking at "payment failed". A dismissed sheet is the one signal that says no charge happened, so it is the one case that may exit promptly | One argument |
| U8 | **The first poll is immediate, and the backoff sits between polls** | By the time the platform's sheet has closed the webhook may already have arrived. A mandatory one-second pause before the first read is a second of spinner for nothing | Reorder a loop |
| U9 | **A failed poll does not end the poll loop; a `PAYMENT_ORDER_NOT_FOUND` does** | One unanswered read says nothing about a payment still in flight, and giving up on the first timeout reports failure to a viewer whose money is on its way. A vanished order is not transient | Two branches |
| U10 | **`describeUnlockOffer` reads the action for *whether* and `priceCoins` only for *how much*** | §2.2. It inherits H4's guarantee instead of re-deriving anything, and the `UNPRICED` branch is what stops an `UNLOCK` action with no number from becoming a charge | Widen the condition, and lose it |
| U11 | **VIP has no coin path in its branch, rather than a disabled coin button** | The panel must not *have* the code that would sell a VIP episode for coins. A disabled button is a state; an absent branch is a guarantee | Merge two branches |
| U12 | **Whole-drama and ad channels are absent, not greyed out** | IA §2 P5 reserves structure for four channels and gates them on `/config`, which does not exist. Neither has an API, so a placeholder for them would be furniture that has to be removed before it can be built | Two components |
| U13 | **The panel closes at every point, including mid-purchase** | A panel that traps the viewer while it waits on a callback we do not control is a mini app with no way out. Closing costs them nothing: the order is the server's, and the list shows the result whenever it arrives | Guard three handlers |
| U14 | **One attempt in flight, guarded by a ref rather than by `disabled`** | A double tap is the cheapest way to open two payments, and the second press lands before the re-render. The panel also removes the button rather than disabling it, which is the belt to the ref's braces | A ref |
| U15 | **The panel keeps the episode it was opened with, rather than looking it up in the live list** | The refetch after a grant would otherwise pull the subject out from under the open panel and replace the settlement with "you can already watch this" | Hold an id |
| U16 | **`pacing` is a prop with a default** | A sixty-second budget should be a value a test can supply, not a clock a test has to fake. Same argument as `sleep` in `http.ts`, same shape | Move it into a context |
| U17 | **The catalogue client is given `HttpReader`, not `HttpClient`** | The catalogue is three anonymous `GET`s and should stay that way. A narrower type is a cheaper guarantee than a review comment: adding a write would have to widen it first, in a diff | One type |
| U18 | **The unlock client is its own seam, sharing one transport** | The timeout, the failure classification and — later — the `Authorization` header belong in one place. A coin order is a write against an account and a catalogue read is anonymous, so they are not one interface | Merge two interfaces |
| U19 | **The unlock provider has no default value** | A screen with no catalogue provider shows an error state; a purchase surface with a silently defaulted client renders a live "Unlock" button wired to nothing. `useUnlockApi` throwing is the loud version | Add a default |
| U20 | **A `2xx` that is not a coin order is `MALFORMED`, and `unlockGranted` is never defaulted** | H20, applied where it costs more. The two fields checked exactly are the identifier the viewer is about to pay against and the flag that says they bought something | Delete the narrower |

---

## 4. Verification

### 4.1 The suite

**99 new app tests, 0 skipped, 0 deleted.** App is 341, up from 242.

| File | Tests | Protects |
|---|---|---|
| `unlock/coin-unlock.test.ts` | 27 | The money path: what never grants, what each refusal means, what the payment sheet said, and the poll loop's four exits |
| `unlock/UnlockPanel.test.tsx` | 25 | Three channels, four unpurchasable causes with four distinct strings, the settlement shapes, and three ways out |
| `data/unlock-api.test.ts` | 14 | Paths and id escaping, the idempotency header, a body carrying an episode id and no price, and five malformed-order rejections |
| `routes/DramaPage.test.tsx` | 8 new | The wiring: which episode the panel opens for, VIP versus coins, refetch after a grant and not after a paid-only order, and that a blocked row cannot open it |
| `unlock/unlock-offer.test.ts` | 9 | Every access state under both capability sets, the priced-but-unsellable cases, and failing closed |
| `data/http.test.ts` | 6 new | `postJson`: body, headers, envelope, timeout, and that it never retries |
| `catalog/EpisodeRow.test.tsx` | 4 | The seam's two halves: live with a handler, disabled and saying so without one, unreachable from a row that must not sell |
| `unlock/use-coin-unlock.test.tsx` | 3 | Two starts in one tick, and an unmounted hook that stops polling and reports nothing |
| `testing/import-hygiene.test.ts` | 3 new | That `unlockGranted`, an order `status` and a constructed `viewerAccess` cannot appear at a surface |

One pre-existing assertion changed rather than being added to: `DramaPage.test.tsx`'s "disables the
unlock call to action while there is no unlock flow" is now "gives the unlock call to action
something to do", because the flow exists. The behaviour it was protecting did not disappear — it
moved to `EpisodeRow.test.tsx`, which still asserts the disabled state when the prop is absent, and
that is the case the row will keep having anywhere else the seam is reused.

### 4.2 Eight defects, introduced rather than assumed

Every one of these was written into the source and the suite run against it.

| Defect | Tests that failed |
|---|---|
| `confirmOrder` returns `GRANTED` when the status is `PAID` | **7** |
| `runCoinUnlock` returns `UNLOCKED` as soon as the order is created | **21** |
| `describeUnlockOffer` decides from `priceCoins` before reading the action | **6** |
| `postJson` retries like `getJson` | **1** |
| The panel renders `AWAITING_UNLOCK` in the success branch | **2** |
| The one-attempt ref guard removed | **1** |
| A retry re-mints the idempotency key instead of reusing it | **1** |
| A component reads `unlockGranted` | **1** (the source scan) |
| `describeUnlockOffer` sells coins for a `NEED_VIP` episode | **0 → 6** |

The last row is the one worth reading. Selling coins for a VIP episode passed the entire suite. The
VIP fixtures carried `priceCoins: null`, so every VIP assertion was refusing the sale for the wrong
reason — there was no price to sell against, and the branch under test was never the one deciding.
Chasing that down is what surfaced §2.2: the listing's `priceCoins` and the access decision's are
different fields with different rules, and the listing does not blank it. The fixtures are now
priced, and the same mutation fails six tests. This is the identical failure mode slot K reported
for its tampered-webhook case, and the identical argument for running mutations at all.

### 4.3 Gates

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **706 passing, 0 skipped, 0 failing** — 341 app (was 242), 338 server, 16 config, 11 shared |
| Build | `pnpm build` | pass — `index-BgCMKoC3.js` 277.38 kB (87.98 kB gzipped), `index-C9-CfGp4.css` 5.53 kB (1.59 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle grew 14.8 kB raw / 3.96 kB gzipped over slot H's `262.62 kB / 84.02 kB`. No `<video>`,
`<audio>`, `<iframe>` or third-party player entered the source or the artifact; `app/src/player/` is
unmodified; no lint rule was relaxed.

**Not verified against a running server.** Slot H validated its reads against `server/` on `:8099`
and against Chrome. This slot's endpoints live on `cursor/w2-work-k-6bb5` and merging it here was
out of scope, so the wire shapes are transcribed from that branch's `orderView` and asserted against
fixtures. That is a real gap and it is §7's first item.

---

## 5. Deliberately not built

- **No VIP purchase.** There is no subscription order endpoint. `bridge.createSubscription` exists
  and is called by nothing. The VIP branch is a statement, by design (U11).
- **No wallet, no balance, no recharge sheet.** PNL-02's spec puts the current balance in the panel
  and switches the primary button to "insufficient balance, top up" below the price
  (`docs/02-screen-inventory.md`). `GET /wallet` does not exist, and neither does a coin balance —
  Beans are charged by the platform per order. PNL-03 and the unlock-intent-across-recharge dance of
  journey J2 steps 6–9 are untouched.
- **No whole-drama unlock and no ad unlock.** Neither has an API; `unlockOptions` still cannot say
  `AD` (U12).
- **No player integration.** The success state links to `#/play/:episodeId`, which is still slot H's
  untouched Wave 1 placeholder. There is no locked state S6, no `403 EPISODE_LOCKED` branch in
  `classifyFailure`, and no panel opened from the player.
- **No `UNLOCK` analytics event.** `docs/02-screen-inventory.md` §4 fires it from the panel's success
  callback. `POST /events/batch` does not exist (H24).
- **No favourites and no watch progress.** Untouched, and in flight elsewhere.
- **No session handling.** The transport still sends no `Authorization` header, so every order
  creation against a real server answers `401 AUTH_REQUIRED` today. That is rendered as its own
  state with no retry, which is the honest answer — see §7.
- **No `AUTH_TOKEN_EXPIRED` interceptor**, no weak-network banner, no caching. All still H's §5.

---

## 6. On not merging

The task was explicit that an integrator is in flight, so nothing was merged.

`packages/shared/src/errors.ts` needed six codes that slot K added. They were transcribed **verbatim
and into the same positions** — `COMMON_IDEMPOTENCY_KEY_REQUIRED` and `COMMON_IDEMPOTENCY_CONFLICT`
after `COMMON_SERVICE_UNAVAILABLE`, and `UNLOCK_ALREADY_UNLOCKED`, `UNLOCK_POLICY_NOT_ALLOWED`,
`PAYMENT_ORDER_NOT_FOUND`, `PAYMENT_CHANNEL_UNAVAILABLE` after `EPISODE_ASSET_UNAVAILABLE` — so git
sees an identical addition and the two branches merge without a conflict. `errors.test.ts` asserts
no duplicates and no cross-namespace overlap, which is what would catch it if this drifts.

The wire shapes in `app/src/data/unlock-api.ts` are a transcription of slot K's `orderView`, not a
re-export of its `UnlockOrder`. That is not only about the merge: the server's order carries a
`userId`, an idempotency key and internal timestamps the client has no business holding.

Favourites and the feed were not touched.

---

## 7. For the next slots

**For whoever integrates this with slot K.** Run it against the real server before believing any of
it. Three things to check first: that `payment.tradeOrderId` is non-empty in a real `201` (the
narrower rejects the order if it is not, which will show up as a `MALFORMED` failure rather than as
a crash); that a `422` really does carry `UNLOCK_POLICY_NOT_ALLOWED` rather than a bare status; and
that the panel's `AWAITING_UNLOCK` is what a real successful payment produces end to end. Slot K's
§5 also flags that `UNLOCK_ALREADY_UNLOCKED` sends `{ episodeId, unlockPolicy, reason }` rather than
the catalogued `{ unlockId, unlockedAt }` — this client reads neither, so that divergence can be
resolved either way without touching anything here.

**For whoever lands session handling.** This is the blocker for the whole feature. An order belongs
to an account, the transport sends no `Authorization` header, and slot K answers an anonymous
creation with `401 AUTH_REQUIRED`. The panel renders that as `SIGN_IN_REQUIRED` with no retry, which
is correct and is also the only thing a viewer can currently reach. The header belongs inside
`createHttpClient` — one place that attaches it and one place that refreshes it — and both clients
pick it up for free because they share the transport.

**For whoever writes the grant (W14).** When `unlockGranted` starts coming back true, this panel's
success path lights up with no client change, and `AWAITING_UNLOCK` stops being the normal ending
and becomes what it is meant to be: the rare case where the callback is late. Worth knowing that the
poll budget is sixty seconds across seven reads, so a grant that lands after that is reported as
`PAYMENT_NOT_CONFIRMED` with a same-key retry, and the retry replays the order rather than opening
a second one.

**For whoever builds PNL-03 (recharge).** The seam is the panel's coin channel. Journey J2 steps 6–9
wants the unlock *intent* — episode id plus idempotency key — recorded locally so it survives a trip
through the recharge sheet and re-executes afterwards. `idempotencyKey` is a ref inside
`useCoinUnlock` today precisely so it lives for one attempt; persisting it is the change, and it
should carry an expiry, because `docs/12-api-contracts.md` §2.4 gives keys a 24-hour life and
nothing expires them.

**For whoever wires the player's locked state (S6).** The panel takes an `EpisodeItem` and a
`PurchaseCapabilities` and nothing else, so it can be mounted over the player as-is. The one thing
it cannot do yet is open from a `403 EPISODE_LOCKED` with the price out of `details` — that path has
no `EpisodeItem` — and slot H already identified `classifyFailure` as needing a branch on the code
rather than the status for it.

**For whoever adds the `UNLOCK` analytics event.** Fire it where `onEntitlementChanged` is called
and nowhere else: that is the one point where the server has said the episode was bought. Firing on
`AWAITING_UNLOCK` would count a purchase that has not delivered anything.

---

## 8. Known gaps in this slot's own work

- **Nothing was proven against the real endpoints.** §4.3. Every assertion runs against fixtures and
  a transcribed wire shape.
- **A viewer can still pay twice for one episode.** Slot K's §8 says orders are not deduplicated per
  episode, and the `Unlock` unique index that would be the real backstop does not exist. This client
  narrows the window — one key per attempt, no automatic `POST` retry, no retry offered after any
  outcome where money may have moved — and cannot close it. Two panel sessions for the same episode
  are two keys and two payable orders.
- **A poll loop abandoned by closing the panel is never resumed.** Reopening the panel starts a
  fresh attempt with a fresh key. There is no "you have an order in flight" banner, which is what
  SCR-09's 到账确认中 banner is for, and no local record of the open order.
- **`ORDER_LOST` dead-ends into copy and a trace id.** There is no support route, no order reference
  the viewer can copy, and no reconciliation path. It is the correct refusal to offer a second
  payment and it is not a resolution.
- **The sixty-second budget is a guess.** It comes from journey J11-8, which is about recharge
  orders, not unlock callbacks. Nobody has measured how long TikTok's `redeem.success` actually
  takes.
- **The panel is not a focus trap and has no history entry.** `Escape`, the scrim and the close
  button all work; focus is not moved into the sheet on open, not restored on close, and not
  contained while open. The IA's back rules (§6 B3) give a panel a synthesised history entry, so the
  device back gesture currently leaves the drama screen with the panel still notionally open.
- **`aria-busy` on the progress line is the only announcement of a stage change.** A screen reader
  gets the new text because the element carries `role="status"`, but the stages are not otherwise
  distinguishable and the payment sheet is the platform's.
- **No offline pre-check.** Pressing "Unlock" with no network spends a full request timeout before
  saying so. `navigator.onLine` would be a cheap improvement and is not there.
- **The success state links to a placeholder.** `#/play/:episodeId` still fabricates a descriptor,
  so the one thing a viewer wants after paying is not yet real.
- **`data-testid` attributes ship in the production bundle**, as they do everywhere else here (H's
  §5). The panel adds ten more.
