# Handoff — Wave 2, Work Slot F: the episode access decision

> **Branch:** `cursor/w2-work-f-d409`, cut from `cursor/w2-work-e-1aaa` (`cc943a0`).
> **Scope:** the entitlement decision — one pure function that answers "may this viewer play this
> episode, and if not, what would change that", plus the HTTP wrapper around it. Two known domain
> defects are closed by construction: a subscription lapse must not revoke separately paid access
> (**DM-3**), and the drama-level free window must be measured on the episode's position within the
> drama rather than within its season (**DM-1**).
> **Not in scope:** the catalogue and feed read paths, the unlock/wallet write path, session storage,
> the data layer, and the playback endpoint's own enforcement. `app/`, every lint rule and
> `app/tools/` guardrail file are untouched. No media URL is produced anywhere. No test is skipped.
> No pull request was opened.

---

## 1. The two defects, and what each one costs

Both are ordering and arithmetic mistakes rather than missing features, which is why they are cheap
to make, invisible in review, and expensive in production.

### 1.1 DM-1 — the free window was measured on the per-season episode number

`Drama.freeEpisodes` is a **drama-level** policy: "the first N episodes of this drama are free"
(`docs/12-domain-model.md` §3.1). `Episode.episodeNumber` is a **per-season** ordinal that restarts
at 1 in every season (§3.2). §3.4 rule 2 compared the two directly:

```
episodeNumber ≤ drama.freeEpisodes  →  free
```

For the single-season dramas that dominate the catalogue those two readings agree, which is exactly
what makes this survive testing. For a two-season drama with `freeEpisodes: 5` they do not: season 2
episode 1 is episode **11** of the drama, and the per-season reading gives away the first five
episodes of every season — five paid episodes per extra season, silently, with no error anywhere.
The free window is now measured on `globalEpisodeNumber` and there is no fallback: an episode whose
drama-wide position is missing or nonsensical is treated as paid, because "cannot tell" is not
"free". `docs/12-domain-model.md` §3.4 has been corrected so the next implementer does not re-derive
the original rule from the model.

### 1.2 DM-3 — the subscription was consulted before the purchase

Nothing in the ladder is wrong when a subscription is live: VIP grants access and so does a purchase,
so playability is the same either way. The damage is in the attribution, and it surfaces at the
moment the subscription ends.

If VIP is checked first, an episode a viewer **bought with coins** is reported as "playable because
VIP" and the purchase is never looked at. Everything downstream inherits that answer: a cached
`viewerAccess` view, an unlock endpoint that declines to charge (and therefore declines to record
anything) because the episode is "already accessible", an `Unlock(method=VIP)` receipt standing in
for a purchase that was never written. The day the subscription lapses, the same episode comes back
as `NEED_UNLOCK` and the viewer is asked to pay twice for content they own. That is a refund-grade
bug and a support queue, not a display glitch.

Two rules close it, and both are needed:

1. **Durable unlocks are consulted before VIP.** An active subscriber's purchased episode reports
   `UNLOCKED`/`unlockedBy: COIN`, so the purchase is visible to every caller while the subscription
   is still live — which is when the decision to write or keep a receipt gets made.
2. **A `VIP`-method unlock row is a viewing receipt, not a purchase.** §6.1 allows one to be written
   when a subscriber views a paid episode and §12 open question 3 asked what it should mean. It means
   nothing on its own: counting it would convert one month of VIP into permanent access to
   everything watched during it. That open question is now answered in the model document.

---

## 2. What was delivered

| File | Contents |
|---|---|
| `server/src/modules/entitlement/access.ts` | New. `decideEpisodeAccess(facts) → verdict`. Pure: no I/O, no clock, no session lookup, no dependency on Fastify. Holds every access rule in the system |
| `server/src/modules/entitlement/facts-port.ts` | New. `EntitlementFactsPort` — where the drama, season, episode and viewer facts come from — and `createUnavailableEntitlementFactsPort`, the fail-closed default |
| `server/src/modules/entitlement/viewer-resolver.ts` | New. Establishes who is asking. Three outcomes, not two: anonymous, a viewer, or a refusal. `createUnresolvedViewerResolver` is the fail-closed default |
| `server/src/modules/entitlement/fixtures.ts` | New. A two-season fixture drama and four fixture viewers, including **`usr_fx_vip_expired`**. Test and development data only; never a default |
| `server/src/modules/entitlement/routes.ts` | New. `POST /v1/entitlement/episode-access`: read the id, establish the viewer, gather facts, translate one verdict into one response. Contains no access rule of its own |
| `server/src/modules/entitlement/*.test.ts` | New, **105 tests** — 53 on the decision, 31 on the endpoint, 12 on viewer resolution, 9 on the fixture world |
| `server/src/app.ts` | Registers the module. Both new dependencies default to refusing, and are injectable exactly like the existing webhook and identity ports |
| `contracts/openapi.yaml` | The new operation, its four failure statuses, and the `ViewerAccess` schema. The existing contract test now dispatches it against the real app |
| `docs/12-domain-model.md` | §3.4 rule 2 corrected to `globalEpisodeNumber` with the reasoning recorded; the DM-3 ordering added; §12 open question 3 marked decided |

### 2.1 The decision ladder

Evaluated in this order, and the order is the design:

| # | Step | Verdict | Why here |
|---|---|---|---|
| 1 | Drama, season or episode not `PUBLISHED` | `UNAVAILABLE` | Visibility precedes commerce. An unlock is not a licence to play content we have taken down (§3.1). A draft anywhere outranks a withdrawal, so unpublished content is reported absent rather than "exists, but taken down" |
| 2 | `unlockPolicy = FREE`, or inside the drama-wide free window | `FREE` | Costs the viewer nothing to be right about. **DM-1 lives here** |
| 3 | A durable unlock for this episode: `COIN`, `AD` or `GRANT`, unexpired | `UNLOCKED` | **DM-3 lives here.** Ahead of VIP so a lapse cannot revoke a purchase, and so a live subscriber's paid episode still reports the purchase that paid for it |
| 4 | VIP active by server time, and the policy is not `COIN` | `VIP` | `COIN` episodes are outside the bundle (§3.4). A `VIP`-method unlock row never reaches this step — it grants nothing |
| 5 | `unlockPolicy = VIP_ONLY` | `NEED_VIP` | Nothing to sell; the option is a subscription |
| 6 | Coin price is not a positive integer | `UNAVAILABLE` | Validated at the one point where a price is about to be quoted. `0` coins for a paid episode is a price the unlock endpoint would happily charge. Checking it this late means a pricing mistake cannot hide the episode from viewers who already have access |
| 7 | Otherwise | `NEED_UNLOCK` | Carries `priceCoins` and the options that would fix it |

Subscription state is derived from **both** stored fields against server time (§4.1): `active` must be
set *and* the expiry must be in the future. A flag that outlived its expiry is a lapse that no job
has noticed yet, and a future expiry with `active: false` is a cancelled or refunded subscription
that must not be resurrected by a leftover date. A missing expiry grants nothing — no lifetime tier
is modelled, so a null is a gap, not a product.

### 2.2 The endpoint

`POST /v1/entitlement/episode-access`, body `{ "episodeId": "ep_..." }`, `Authorization` optional.

```json
{
  "episodeId": "ep_fx_s2e03",
  "viewerAccess": { "playable": true, "reason": "UNLOCKED", "unlockedBy": "COIN" },
  "unlockOptions": [],
  "priceCoins": null
}
```

A **commercial denial answers `200`** with `playable: false`. This endpoint reports state; it is not
an attempt to play, and the client needs the state to render an unlock panel — refusing to describe
it would force the client to infer playability from an error, which is the inference
`docs/12-api-contracts.md` §3.3 forbids. Enforcement stays where the attempt is: playback answers
`403 EPISODE_LOCKED` for the same episode. Content with no viewer-facing state uses the error
envelope instead:

| Situation | Status | Code |
|---|---|---|
| Unknown episode, or anything `DRAFT` in the chain | 404 | `CONTENT_NOT_FOUND` |
| Anything `OFFLINE` in the chain | 410 | `CONTENT_OFFLINE` |
| Credential unreadable, or naming a user we do not have | 401 | `AUTH_REQUIRED` |
| No data layer, unresolvable session, or an unusable price | 503 | `COMMON_SERVICE_UNAVAILABLE` |

**No response from this module contains a media identifier** — no URL, no `vid`, no
`playAuthToken`, no quality ladder. Entitlement decides whether playback may be *requested*;
playback issues the descriptor (correction A4, `docs/architecture/system-overview.md` §1.1). A test
asserts the absence against the raw response body rather than the parsed object, so a field added
later cannot smuggle one in.

### 2.3 Reverse verification

Each rule was removed on a scratch copy and the suite re-run, per `SR-1`'s reverse-verification
column. A rule nothing fails for is a rule that is not being enforced.

| Defect reintroduced | Failing tests | Naming |
|---|---|---|
| Free window measured on `episodeNumber` | **9** | `does not reopen the window at the start of a later season`, `does not reopen the window at the start of season 2`, `opens an early episode whose per-season number is past the window`, + 6 endpoint cases |
| VIP consulted before durable unlocks | **2** | `reports a purchased episode as unlocked, not as VIP, while the subscription is live`, `keeps a purchase playable across the exact moment of expiry` |
| `VIP` added to the durable methods | **2** | `does not treat a VIP viewing receipt as a purchase once the subscription lapses`, and its endpoint counterpart |
| VIP taken from the stored flag alone | **5** | `treats a lapsed subscription as no subscription however the flag reads`, `ends the subscription at the expiry instant rather than after it`, `does not read a missing expiry as a lifetime subscription`, + 2 |

The second row deserves a note, because it is the one that fails least loudly. With VIP checked
first, *playability* after a lapse is still correct — the ladder reaches the unlock row once VIP
stops matching. What breaks is the **attribution** while the subscription is live: access is credited
to VIP, and every consumer of that verdict, including whatever decides to write or keep a receipt,
inherits the belief that no purchase is involved. Rows 2 and 3 together are what make the lapse
harmless; neither is sufficient alone, which is why both are pinned by tests.

### 2.4 The fixtures

The data layer is W7 work, so the endpoint has nothing real to read. `fixtures.ts` supplies a world
shaped to make both defects reproducible rather than hypothetical:

- **`drm_fx_revenge`** has `freeEpisodes: 5` and two published seasons of ten, so `episodeNumber` and
  `globalEpisodeNumber` disagree for everything past season 1. `ep_fx_s2e01` is episode 1 of its
  season and episode 11 of the drama — the two readings give opposite answers. A draft season, a
  draft episode, a withdrawn episode, a coin-only episode, an unpriced episode and a withdrawn drama
  cover the availability and pricing edges.
- **`usr_fx_vip_expired`** is the fixture this slot is built around. Its stored `vip.active` is still
  `true` while its expiry has passed — the state a subscription actually sits in between lapsing and
  whatever job notices — so a decision that trusts the flag passes and one that checks server time
  fails. It holds two rows that look alike and must not behave alike: coins paid for `ep_fx_s2e03`,
  and a `VIP` viewing receipt for `ep_fx_s2e05`. One survives the lapse; the other does not.
- **`usr_fx_vip_active`**, **`usr_fx_newcomer`** and **`usr_fx_lapsed_grant`** (an expired
  limited-time grant, the reserved case in §6.1) provide the contrasts.

`fixtures.test.ts` asserts the world still has these properties, so a fixture edit cannot leave the
DM-1 and DM-3 tests passing for the wrong reason.

### 2.5 Verification

Every gate was run on this branch.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **401 passing, 0 skipped, 0 failing** — 268 server (was 162), 109 app, 16 config, 8 shared |
| Build | `pnpm build` | pass — `assets/index-*.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The server gained 106 tests: the module's 105, plus one in `contract.test.ts`, which enumerates the
OpenAPI document and now dispatches the new operation against the real app. The client bundle is
unchanged — nothing in this slot is reachable from `app/src`.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w2-work-e.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S28 | **The decision is a pure function of explicit facts; a port gathers them** | Access rules are the highest-consequence branching in the product and they need to be exhaustively testable, which they are not while they are interleaved with a query, a clock and a session lookup. 53 of the tests are a table of facts and a verdict, with no app, no HTTP and no fixture world involved. It also means the same verdict is available to playback, to the episode list and to the unlock endpoint without any of them re-deriving it | None; the split is the module boundary |
| S29 | **Durable unlocks are consulted before VIP, and a `VIP`-method row grants nothing** | §1.2 above. Answers §12 open question 3 in the direction that cannot lose a viewer money: a subscription grants access while it runs, a purchase grants access permanently, and a receipt written during a subscription is evidence of a view rather than of a sale | Swapping two blocks — which is why two tests exist specifically to fail when they are swapped |
| S30 | **The free window is measured on `globalEpisodeNumber`, with no fallback to the per-season number** | §1.1 above. The fallback is the defect: it is available, it is usually equal, and it is wrong exactly where money is involved. An unusable drama-wide position denies rather than guessing | One expression, and the model document now says which one |
| S31 | **VIP requires the stored flag *and* a server-time expiry in the future** | Either field alone is a way to get this wrong in a different direction: the flag alone honours a lapsed subscription, the date alone resurrects a cancelled or refunded one. §4.1 already says server time decides; this makes it structural rather than aspirational. A missing expiry is a gap in the data, not a lifetime tier | One condition |
| S32 | **A commercial denial answers `200`; unavailability uses the error envelope** | The client must render an unlock panel from the state, and §3.3 forbids it from inferring the state itself. An error is the wrong shape for "here is the price": it invites retry logic and error toasts around a conversion opportunity. Content that is unpublished or withdrawn has no state a viewer can act on, so it stays an error | The status mapping is one table |
| S33 | **Both dependencies default to refusing, and a presented-but-unresolvable session is a `503`, not anonymous** | The same posture as `createUnavailableIdentityPort`. A deployment with no data layer that guesses is wrong in one of two expensive directions — everything free, or paying viewers own nothing. And a session we cannot resolve, answered as anonymous, is the quietest possible failure: a paying subscriber is told they own nothing, with a `200` and nothing in the logs | Injecting a real port, which is the intended path |
| S34 | **A draft anywhere in the chain is `404`, not `410`** | `410` confirms that content exists and was taken down. For a draft that is a disclosure about unreleased content, and the request cannot tell the difference anyway | One comparison |
| S35 | **The coin price is validated where it is quoted, and an unusable price is `503`** | A paid episode with `priceCoins: 0` must not be quoted as free — the unlock endpoint would charge nothing and hand the episode over. Validating at the quote rather than at the top means the same misconfiguration does not also hide the episode from viewers who already own it, which would turn a pricing typo into an outage for paying users | One condition |
| S36 | **`modules/playback` was not rewired to call this module** | The playback file's comment already names this module as its Wave 2 replacement, and the wiring is a small change — but with the facts port defaulting to "refuse", it would turn playback's existing stub tests into denials and change an endpoint another in-flight slot may be holding. The decision function is ready and the integration is one call; doing it in the slot that owns playback keeps the diff honest | The wiring is additive |
| S37 | **No response in this module carries a media identifier, and a test asserts it against the raw body** | Correction A4 splits commercial authorization from delivery. A decision endpoint that also returned something playable would be a second source of media references, outside the audited playback path. Asserting on the raw body rather than named fields means a field added later is caught | None |

---

## 4. Deliberately not built

Listed so it is not re-scoped as an omission:

- **No catalogue, feed, episode-list or drama-detail endpoint.** Those slots were still landing, and
  nothing under `server/src/modules/{catalog,feed}` exists or was created here. The only shared server
  file touched is `app.ts`, where the change is a registration block and two optional dependency
  fields.
- **No playback change.** `modules/playback/routes.ts` is byte-identical to the base, including its
  stub `isEntitled`. See S36.
- **No unlock, wallet or order write path.** This slot decides whether an episode is accessible; it
  never grants, charges or records anything. There is no write in the module.
- **No session storage.** The viewer resolver is an interface with a fail-closed default, not an
  implementation. Sessions remain opaque tokens with nothing behind them (`modules/identity`).
- **No `app/` change, no lint rule, no `app/tools/` file.** The guardrail suite delivered by slot E,
  including `app/tools/eslint-guardrails.test.ts`, is untouched, and `pnpm check:guardrails` still
  passes against the real bundle. The client bundle is byte-identical.
- **No media element, media URL or player reference anywhere,** including in fixtures. The fixture
  episodes carry no `videoAssets`, no `assetKey` and no URL of any kind.
- **No skipped, deleted or modified test.** The 105 new tests are five new files; every pre-existing
  test still runs. `contract.test.ts` gained a case only because it enumerates the OpenAPI document.

---

## 5. For the next slots

**For whoever owns the catalogue read path.** `globalEpisodeNumber` is a field this module requires
and the catalogue must produce: the count of episodes in all earlier seasons of the drama plus the
per-season number. It is not in `docs/12-domain-model.md` §3.3 as a stored column, so it is either
persisted alongside `episodeNumber` or derived in the query — but it must be derived **once**, in the
catalogue, and not per caller. Two callers deriving it differently is DM-1 again with more steps. Do
not pass `episodeNumber` into the access facts as a substitute; the field exists in
`EpisodeFacts` for display, and the tests assert it is never read for access.

**For whoever wires playback (S36).** Replace `isEntitled` with `decideEpisodeAccess` and map the
verdict: `playable: true` issues the descriptor; `NEED_UNLOCK` and `NEED_VIP` are `403
EPISODE_LOCKED` / `403 EPISODE_VIP_REQUIRED` with `unlockOptions` and `priceCoins` in the details;
`UNAVAILABLE` uses the same 404/410 mapping as `routes.ts`. One case belongs to playback rather than
here: `docs/12-api-contracts.md` §4.4 says an **anonymous** viewer requesting a paid episode gets
`401 AUTH_REQUIRED`. This module answers that as `NEED_UNLOCK` on purpose, because for a browse view
that is the truth; playback is an attempt, so it turns "not playable and no session" into the 401.

**For whoever lands the data layer (W7).** Implement `EntitlementFactsPort` over the real tables and
inject it in `buildApp`. The query needs one episode row, its season, its drama's `freeEpisodes`, the
viewer's VIP fields, and **only that viewer's unlock rows for that episode** — the facts interface is
deliberately narrow so it maps to one indexed read rather than to a fan-out. Keep the failure
distinctions: `EPISODE_NOT_FOUND` and `VIEWER_NOT_FOUND` are facts about the request,
`FACTS_UNAVAILABLE` is a fault of ours, and only the last should page anyone. `fixtures.ts` doubles
as the specification for a seed set worth reproducing.

**For whoever lands the unlock write path (W14).** The invariant this module depends on is that a
purchase always leaves a durable row. Do not skip writing an `Unlock` because the viewer is currently
VIP and "already has access" — that is precisely how a lapse becomes a revocation. If you record a
view by a subscriber, record it with `method: VIP`, which this module treats as a receipt and never
as an entitlement.

**For whoever owns session storage.** Replace `createUnresolvedViewerResolver` with the real one.
Keep the three-outcome shape: anonymous, a viewer, or a refusal. Collapsing "cannot resolve" into
"anonymous" reintroduces the silent downgrade that `viewer-resolver.test.ts` exists to prevent.

---

## 6. Known gaps in this slot's own work

- **The endpoint refuses on any real deployment.** With no data layer, the default facts port
  answers `FACTS_UNAVAILABLE` and every request is a `503`. That is deliberate (S33) and tested, but
  it means the wrapper's happy paths are proven against fixtures, not against a database.
- **The free window is the only drama-level policy modelled.** Batch and full-drama unlocks
  (§6.1, contract §4.5) will produce many unlock rows; nothing here is wrong about that, but the
  facts interface takes one episode at a time, so a "which of these 80 episodes can I play" view
  will want a batch shape rather than 80 calls. The pure function is already the right granularity to
  build that on; the port is not.
- **`globalEpisodeNumber` has no producer yet.** This slot defines it, requires it and tests it, but
  until the catalogue computes it the field only exists in fixtures. If the catalogue lands it as a
  per-season number under a different name, the types will not catch it — both are `number`.
- **VIP is a single boolean-and-date pair.** Tiers, trials, region-scoped subscriptions and grace
  periods are not modelled. A grace period in particular is a product decision that would change
  `isVipActive`, and it is better added there than bolted onto callers.
- **Nothing enforces that other modules use this function.** The contract test proves the endpoint
  exists; nothing prevents a future module from writing its own `if (episode.priceCoins > 0)`. The
  guard that would help is the same kind slot E built for the bundle — a check that no access
  decision is made outside this module — and it was out of scope here.
- **The decision does not consider the platform's own gates.** Moderation state, online version and
  client authorization are enforced independently by TikTok and can still refuse an episode this
  module approves (correction A4). This answers the commercial question only, and the comments in
  `routes.ts` say so, but no test can assert it from here.
