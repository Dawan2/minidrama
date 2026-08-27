# Cycle 3 — Backlog

> **Slot:** W11, plan slot.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w11-plan-cycle-3-93ab`, cut from `main` at `2b66323` ("Write up the C3
> integration, including the merge git got wrong").
> **Inputs:** `docs/handoff/w9-integrate-c3.md` (what C3 landed), `docs/verify/cycle-1-report.md`
> (the standing defect and blocker register), `docs/plan/cycle-2-backlog.md` (the predecessor this
> continues), and `main` itself — every claim below was re-derived against the tree at `2b66323`
> rather than read out of a handoff.
> **Predecessor:** `docs/plan/cycle-2-backlog.md`. Where a task here carries a C2 identifier, it is
> the *same* task, not a new one: `docs/plan/wave-protocol.md` §7 says an unfinished task keeps its
> original ID and its original acceptance criteria.
> **This slot implemented nothing.** No source file, no test, no gate, no contract was touched. The
> only files added are this one and `docs/handoff/w11-plan.md`. No pull request.

---

## 0. How to read this, and one naming warning

### 0.1 The document is a gap list, not a wave assignment

Everything below is **remaining distance to the listing bar**, measured against `main` as it stands
after C3. Each task carries an owner slot, its dependencies, the evidence that it is still open —
a command and its result, so the next verifier re-runs rather than believes — acceptance criteria
that are commands rather than opinions, and, where it touches a gate, a reverse-verification step.

The reverse-verification column is not ceremony. It exists because of the two most useful findings
in this cycle's evidence, and both are of the same kind: `docs/verify/cycle-1-report.md` §7.1 found
a guardrail that was documented as the strongest in the set and did not fire, and §2.2 of this
document records a second guardrail that was *scheduled to be added in C2, was reported as
addressed, and does not exist on `main`*. A gate is worth exactly the failing fixture that proves it
fires.

### 0.2 The cycle numbering in this repository has drifted, and this document does not fix it

`docs/plan/wave-protocol.md` §2 defines cycles by wave arithmetic: C*k* spans waves 5*k*−4 … 5*k*,
so C2 is W6–W10 and C3 is W11–W15. The documents on `main` do not follow that arithmetic.
`docs/handoff/w9-integrate-c3.md` calls itself "the integration slot (cycle C3)" while W9 falls
inside C2 by the formula, and `docs/plan/cycle-2-backlog.md` was written at W6, which the formula
agrees is C2's plan wave.

So two numbering schemes are live: the protocol's arithmetic, and a running count of
integrate-and-plan rounds. This document is named for the second, because that is what the slot was
asked for and what the sibling files already use. **It is not adjudicated here**, because
`docs/plan/wave-protocol.md` is slot P3's file and §3.4 forbids writing another slot's file. It is
registered as conflict `X-21` in §6, with a recommendation.

### 0.3 Ordering

| Tier | Contents | Gated on |
|---|---|---|
| **Tier A** | Engineering with **no external dependency**. Everything here is buildable today | Nothing |
| **Tier B** | Engineering whose last step needs a credential, a device or a price | M1, M2, M4 |
| **Tier C** | Governance and the business track | Nothing engineering can do |

Tier A is ordered by cost-of-delay rather than by size. Tier B tasks are written so their unblocked
portion is deliverable and their blocked portion is named, per the rule
`docs/plan/cycle-2-backlog.md` closed with — a task gated on a device is not an excuse to build
none of it.

---

## 1. What C3 actually closed

Stated first so this backlog reads as a continuation rather than a restatement. Verified against
`2b66323`, not against the handoffs that claim it.

| C2 task | Claim | Verified state on `main` |
|---|---|---|
| **T0-0** assemble and land on `main` | done | **Closed.** `main` holds the product: 4 packages, 20 routed operations, `pnpm test` green — 2,137 tests across 114 files (`server` 1,314/53, `app` 727/54, `shared` 51/4, `config` 45/3), matching `docs/handoff/w9-integrate-c3.md` §1 exactly |
| **T0-1** CI on `cursor/**` | done | **Closed, with one omission.** `.github/workflows/ci.yml` triggers on `push: [main, 'cursor/**']` and `pull_request`. The `workflow_dispatch:` trigger the task specified is **absent**, so a red run still needs an empty commit to re-run. Folded into `C3-11` |
| **T0-2** repair the bundle scan | done | **Closed for D-01, still open for D-06.** `app/tools/bundle-scan.test.ts` carries 42 tests and the scan is shape-keyed. But acceptance item 2 — `setValidateVideoReplaceElement` as a banned identifier — was **not delivered**: `rg setValidateVideoReplaceElement` over `app/`, `server/` and `packages/` returns nothing. Every hit in the repository is prose. See `C3-09` |
| **T0-3** wire `TikTokBridge` into product code | partial | **Open.** One product call site exists — `app/src/routes/DramaPage.tsx:66`, `bridge.canIUse('createSubscription')` — and it is a capability *probe*, not a capability *use*. D9 has none. See `C3-08` |
| **T0-4** wallet and unlock surface | partial | **Open.** PNL-02 landed (`app/src/unlock/UnlockPanel.tsx`). PNL-01, SCR-09, SCR-10/PNL-03 and SCR-11 did not. See `C3-04` |
| **T1-1** G1.5 coverage | not started | **Open.** No coverage tooling anywhere: `rg coverage` over the four `package.json` files returns nothing. See `C3-11` |
| **T1-2** one contract document | done | **Closed for reconciliation, open for parity.** `contracts/openapi.yaml` is one document with 17 paths / 20 operations and `server/src/contract.test.ts` asserts both directions. Parity against `docs/12-api-contracts.md`'s 40 endpoints is still unmeasured, and D-07 (doc 12 contradicts itself on unlock paths) is unfixed. See `C3-11` |
| **T1-4** one gate register | not started | **Open, and now cheap.** All three registers are on one tree for the first time. See `C3-03` |
| **T2-1** wire the cover allowlist | not started | **Open.** `checkCoverUrl` still has no caller outside `packages/`; `app/src/components/CoverImage.tsx:56` passes `src` straight to `<img>`. D-02 unchanged. See `C3-10` |
| **T2-2** / **T2-3** persistence and seed scale | not started | **Open.** Eight in-memory stores, no database, and the seed catalogue is 8 dramas / ~27 episodes against the ≥ 2 dramas / ≥ 80 episodes `docs/00-wave-plan.md` W7 requires. See `C3-06` |
| **T2-4** remaining screens | partial | **Open.** SCR-08 favourites landed and is end-to-end. SCR-01, SCR-03 and SCR-12 did not |

Three things became true in C3 that were not true before, and they are what the tasks below build
on: requests carry a session, the favourites screen reads a real paged endpoint, and a verified
payment grants the episode.

**Three defects from the C1 report are verified still open at `2b66323`: D-02, D-06 and D-07.** Two
of them were scheduled in C2 and one of those two was inside a task reported as complete. That is
the pattern §0.1 asks the reverse-verification column to break.

---

## Tier A — buildable today, nothing external required

### C3-01 — Silent re-login: a session that expires mid-session never comes back

| | |
|---|---|
| **Owner** | One work slot A |
| **Depends on** | Nothing. Every part is on `main` |
| **Files** | `app/src/data/transports.ts`, `app/src/main.tsx`, and the surfaces that call `session.signIn` |
| **Closes** | The gap `docs/handoff/w7-work-auth-header.md` left when it wired `onCredentialRefused` |

**Why.** C3 built every piece of a re-login and connected none of them to each other.

`createSilentLogin` in `app/src/session/silent-login.ts` is already a single-flight function, and
its own comment names the second caller it was built for:

```
Boot is one caller; a `401`-driven re-login is the next.
```

That caller does not exist. `app/src/data/transports.ts` wires the `401` path to exactly one thing:

```ts
onCredentialRefused: () => {
  options.session.clear();
},
```

So the current behaviour of an expired session is: the token is dropped, correctly and for good
reasons, and **nothing ever asks for another one** unless the viewer finds a `SignInPrompt` and taps
it. `app/src/auth/SignInPrompt.tsx` is the only consumer of `session.signIn` in the product, and it
renders on the profile screen and under a `401`-failed list. A viewer whose session expires while
the unlock panel is open gets a refusal and no route back.

The half that is right, and must not be undone: the token is dropped *before* the `204` shortcut in
`app/src/data/http.ts`, which is the ordering `docs/handoff/w9-integrate-c3.md` §3.1 composed
deliberately and has a test for. Re-login is additive to that, never a replacement.

**The design constraint that makes this hard, and the reason it is its own task.** The obvious
implementation is a refresh-and-replay interceptor, and `app/src/data/http.ts` explicitly refuses to
be one:

```
Not a refresh-and-replay interceptor (IA §8.2). Replaying a `POST` after a refresh is a second
write, and the only `POST` here opens a payment — see rule 4.
```

That refusal is correct and stays. What is missing is not a replay; it is a **re-acquisition**: on a
refused credential, drop the token *and* start one silent login, so the *next* thing the viewer does
is authenticated. The failed request still fails, and the surface still renders its `401` state.
Single-flight is what keeps this safe — the `authCode` is single-use, and two concurrent re-logins
spend two codes and report the second as "the platform rejected you".

**The trap to write a test for.** A re-login triggered by a `401` can loop: the new token is refused,
which triggers another re-login, which is refused. `createSilentLogin` de-duplicates *concurrent*
attempts and not *sequential* ones. This needs a bound — one re-login per refusal, and no re-login
triggered by a request that was itself made to establish a session.

**Acceptance.**

1. A `401` on a request that carried a token drops the token **and** starts at most one silent
   login. The refused request still returns its failure to its caller unchanged.
2. A test asserts that two requests refused concurrently produce **one** `bridge.login()` call.
3. A test asserts the sequential case terminates: a re-login whose own exchange is refused does not
   start another.
4. No `POST` is replayed, automatically, ever. The existing rule-4 tests still pass.
5. `pnpm verify` green.

---

### C3-02 — The paging tests: nine siblings of the flake, one of which is being fixed

| | |
|---|---|
| **Owner** | One work slot A |
| **Depends on** | `cursor/w9-homepage-flake-c44e` landing first, so the pattern it establishes is the one applied |
| **Files** | `app/src/routes/HomePage.test.tsx`, `HistoryPage.test.tsx`, `FavoritesPage.test.tsx`, `DramaPage.test.tsx` |
| **Do not** | Rewrite `cursor/w9-homepage-flake-c44e`. It is a live sibling slot's work |

**Why.** `docs/handoff/w9-integrate-c3.md` §4 records that
`HomePage.test.tsx > feed paging > keeps the loaded cards when the next page fails` failed once
during the C3 integration, on a merge that touched only the server, the contract and
`packages/shared` — then passed on three consecutive re-runs and every later full verify. It is a
flake in a timing-dependent test, and until it is fixed a red `pnpm verify` on `main` may mean
nothing at all, which is the one property an integration gate cannot afford.

`cursor/w9-homepage-flake-c44e` fixes it, and the fix is the right one. It replaces the
`findBy`/`waitFor` pair with `act`, and its comment states the general principle exactly:

> each async utility is a one-second wall-clock budget that a worker descheduled under parallel load
> can spend without doing any work. `act` returns when React has run out of work rather than when a
> timer says so.

**That reasoning is not specific to the test it fixes.** The structure it describes — a click that
depends on one async round, then a second async wait for the append — is shared by nine other tests:

```
$ rg -n 'fireEvent\.click\(await screen\.findByTestId' app/src
```

| File | Paging tests with the two-budget shape | Fixed by the in-flight branch |
|---|:---:|:---:|
| `app/src/routes/HomePage.test.tsx` | 3 (lines 199, 218, 234) | 1 (line 234) |
| `app/src/routes/HistoryPage.test.tsx` | 3 (lines 229, 248, 270) | 0 |
| `app/src/routes/FavoritesPage.test.tsx` | 3 (lines 314, 336, 356) | 0 |
| `app/src/routes/DramaPage.test.tsx` | 1 (line 247) | 0 |
| **Total** | **10** | **1** |

The wider class is larger still — 23 call sites match the query above once the sign-in, retry and
unlock-confirm interactions are counted — but the ten paging tests are the exact structural twins,
because they are the ones where the click's target only exists after a first server round.

**Two of the ten are worse than the one that flaked.** `HistoryPage.test.tsx:270` and
`FavoritesPage.test.tsx:356` assert a `401` on a *later* page. Those are the tests that protect the
mid-scroll session-expiry behaviour `C3-01` is about to change, so they are the ones whose flake
would be most likely to be dismissed as "that test is flaky" during exactly the change that needed
them.

**Do not treat this as a global search-and-replace.** `act` is right here because the assertion
needs two rounds of a stub to land. A single-round `findBy` is not the same shape and does not need
converting; converting it anyway would trade a readable idiom for a mechanical one across a file
that mostly does not need it.

**Acceptance.**

1. The nine remaining two-round paging tests are converted to the pattern
   `cursor/w9-homepage-flake-c44e` establishes, each with the reasoning stated once per file rather
   than copied ten times.
2. No assertion is weakened, removed or made conditional. The test count does not fall — iron rule
   R2, `docs/14-quality-gates.md` §0.
3. `pnpm test` on `app` is green, and green on **twenty consecutive runs of the four affected
   files**. A flake fix whose evidence is one green run is not evidence.

**Reverse verification (required).** For at least one converted test, confirm it still fails when
the behaviour it asserts is broken — invert the append, or make the second page succeed where it
should fail — and record the failure output. `act` returning when React is idle is exactly the kind
of change that can turn an assertion into a no-op, and a test that cannot fail is worse than a
flaky one.

---

### C3-03 — Adopt `GATE-7` and `GATE-8` into one register, and fire the escalation the protocol schedules

| | |
|---|---|
| **Owner** | Plan slot P3 (owns `docs/plan/wave-protocol.md` §6) with P1 (owns `docs/plan/w1-conflict-register.md`) |
| **Depends on** | Nothing. All three registers have been on one tree since C2 |
| **Closes** | **D-08**. Carries C2's **T1-4** forward unchanged |
| **Existing task IDs** | `GOV-005` (register `GATE-7`) and `GOV-008` (register `GATE-8`), both already specified in `docs/plan/w2-ready-queue.md` §5 with acceptance criteria. This task is their write-back, not a re-specification |

**Why it is now cheap, and why it is still not done.** `docs/verify/cycle-1-report.md` §8.2 recorded
three gate registers on three unmerged branches with two numbering schemes. The merge fixed the
branches and not the registers. On `main` today:

| Source | Scheme | Contents |
|---|---|---|
| `docs/plan/wave-protocol.md` §6 | M0–M6 | Seven business milestones. **Contains no `GATE-7` and no `GATE-8`** |
| `docs/plan/w1-conflict-register.md` §7 | GATE-0…GATE-7 | Proposes `GATE-7` (EIS) |
| `docs/plan/media-plane-decision.md` §7 | GATE-8 | Proposes `GATE-8`, explicitly "proposed, not applied" |

The two most consequential external dependencies in the project are formally in no authoritative
register. This is now a document edit rather than a negotiation, which is the whole reason it was
scheduled for after the merge.

**And the escalation fires.** `docs/plan/wave-protocol.md` §6, gate discipline rule 3: a gate with
no movement across two consecutive cycles must be escalated in the cycle report to a risk entry with
an alternative. `docs/verify/cycle-1-report.md` §8.1 said this in as many words — *"C1 is one cycle,
so the clock starts now, and C2 closing with the same table is the escalation trigger."*

Three cycles have now closed and **every business gate is still `[ ]`**, with M0 still `[!]`. No plan
wave has written back a gate status with evidence since W1. The escalation is not a warning to be
issued; it is a consequence that has already been scheduled, and this task is where it is recorded.

**The alternatives that must be priced, not merely named.**

| Gate | Alternative if it does not move |
|---|---|
| **`GATE-7` (EIS)** | Document a first launch that **excludes the EU and the US**. This removes EIS and USDS TPRM from the critical path entirely and is the cheapest release condition available. It is a product decision (B-4), and it is cheaper to take now than after a submission slips on a 15–30 US-business-day review with unpublished criteria |
| **`GATE-8` (BytePlus / VePlayer)** | Price **MP-B**. `docs/plan/media-plane-decision.md` §7 records the property that makes this urgent: `GATE-8` is the only gate whose *unfavourable* resolution **creates** work rather than merely unblocking it. "Still open" therefore means something different here than for M1–M6, and pricing MP-B during a launch slip is the expensive way to do it |
| **M0 (official requirements PDF)** | Nothing. Five cycles of work now rest on public sources S1–S15 and a zero-rework assumption nobody has been able to test. There is no alternative to obtaining it; there is only the growing cost of not having it |

**Acceptance.**

1. One authoritative register, in `docs/plan/wave-protocol.md` §6, reconciling the M-scheme and the
   GATE-scheme. `GATE-7` and `GATE-8` each carry all four required elements: what it blocks, what it
   explicitly does **not** block, its release condition, and its status.
2. The other two documents reference that register rather than restating it. Every existing citation
   of `GATE-7` or `GATE-8` still resolves.
3. The escalation is recorded as a risk entry per gate, each with the alternative above and the cost
   of taking it late.
4. `docs/plan/wave-protocol.md` §9 gains a change-record row. §8 rule 7 forbids silent rewriting.

---

### C3-04 — The wallet surface: SCR-09, PNL-01, and the two screens that stay blocked

| | |
|---|---|
| **Owner** | One work slot A |
| **Depends on** | Nothing for PNL-01 and SCR-09's structure. SCR-10/PNL-03 and SCR-11 are gated — see below |
| **Addresses** | `docs/02-screen-inventory.md` SCR-09/10/11, PNL-01/03. Carries C2's **T0-4** forward |

**Why.** C3 delivered PNL-02, the unlock panel, and it is real: `app/src/unlock/unlock-offer.ts`
reads the offer from the *action* rather than from the presence of a price — which is the trap that
would otherwise sell access to an `UNAVAILABLE` episode carrying a stale price of 60 — and
`UnlockPanel.tsx` renders it. That is one of five overlay panels. The other four do not exist, and
neither does any wallet route:

```
$ rg -n 'wallet|balance|recharge' app/src --glob '!**/*.test.*'
```

Every hit is a comment explaining why the screen is *not* built. `app/src/routes/routes.ts` declares
eight routes and none of them is `#/wallet`, `#/recharge` or `#/vip`.

`app/src/routes/ProfilePage.tsx` states the standard the wallet screens must meet, and it is the
right one:

> a viewer who has recharged and sees [an invented balance] will not believe the next number either.

**Scope, in dependency order.**

| Screen | Status | Note |
|---|---|---|
| **PNL-01** episode picker | **Unblocked. Start here** | Needs `GET /v1/dramas/{dramaId}/episodes`, which is on `main` and already paged by `DramaPage`. No monetisation dependency at all, and it is the panel a viewer touches most |
| **SCR-09** wallet | **Structurally unblocked, factually empty** | There is no `GET /v1/wallet` and no ledger on any branch. Build the screen and its state set — including the empty ledger, which `docs/02-screen-inventory.md` marks as a required state and not an edge case — against a defined contract. **Do not invent the endpoint in the client** |
| **SCR-10 / PNL-03** recharge | **Blocked on price** | The purchase flow's UI is buildable; the `pay()` call is `C3-05` and the amounts are `C3-07` |
| **SCR-11** VIP | **Blocked on a contract** | No server-side subscription surface exists anywhere. `contracts/openapi.yaml` has 17 paths and none is a subscription. Define the contract or defer the screen — do not invent the endpoint in the client |

**The pricing constraint, restated because it has not changed and it is not an engineering problem.**
`server/src/modules/unlock/trade-order-port.ts` carries `priceCoins` and performs no conversion,
deliberately:

> The platform charges Beans, and what a coin is worth in Beans is a pricing decision that does not
> exist yet — so this port carries the number we do have and no conversion.

So every wallet and unlock surface displays **coins**, and no screen may display a fiat or Beans
amount until `C3-07` produces an observed rate. A placeholder rate in the client is worse than no
rate: it is a commercial decision made by a front-end developer, and it will be believed.

**Acceptance.**

1. PNL-01 renders against the real episodes endpoint, not a fixture, and is reachable from the
   player and dismissable.
2. Every screen implements the full state set `docs/02-screen-inventory.md` requires of it. A screen
   with only its happy path is not done.
3. No fiat or Beans amount appears in any client string, and no client string quotes a balance the
   client cannot read.
4. No endpoint is invented client-side. A screen blocked on a contract is deferred with the contract
   named, not stubbed.

---

### C3-05 — D9: navigation bar colour and capsule avoidance

| | |
|---|---|
| **Owner** | One work slot A |
| **Depends on** | Nothing. This is the one mandatory platform capability with no external dependency |
| **Addresses** | `docs/11-official-onboarding-checklist.md` D9. Carries C2's **T0-3a** forward unchanged |

**Why it is still first and still not done.** `docs/plan/cycle-2-backlog.md` T0-3a said "do this
first" and "T0-3a is the one to insist on". It was not done. The probe is unchanged since the C1
report:

```
$ rg -n "getMenuButtonRect|setNavigationBarColor|showRewardedAd|showInterstitialAd|createSubscription" \
     app/src --glob '!src/platform/**' --glob '!**/*.test.*'
```

One product hit now exists — `app/src/routes/DramaPage.tsx:66`, `bridge.canIUse('createSubscription')`
— and it is a capability *probe* feeding the unlock offer, not a capability *use*. `getMenuButtonRect`
and `setNavigationBarColor` have no product caller at all.

The argument for doing it first has strengthened, not weakened: it costs more with every screen
added, and C3 added one (SCR-08) while `C3-04` proposes up to four more. A capsule overlapping a
control is what a reviewer sees in the first ten seconds.

**Architectural constraint, unchanged and not negotiable.** `app/src` contains no reference to
`window.TTMinis` outside `app/src/platform/`, enforced by a source rule, and that rule stays. Wiring
means exposing the existing `PlatformBridge` through a provider that screens consume. If a screen
needs a capability the interface does not expose, the interface grows and the conformance suite
grows with it.

**Acceptance.**

1. Every screen reserves the capsule area, driven by `getMenuButtonRect`, and sets a navigation bar
   colour consistent with `docs/02-*`.
2. Every new call site handles the `canIUse` → false path. A capability probe that is ignored is a
   crash on an older TikTok client.
3. No new reference to `window.TTMinis` outside `app/src/platform/`; the source rule still passes.
4. The bridge conformance suite still passes against both the real and the mock implementation.

**Honesty constraint.** `docs/plan/wave-protocol.md` §8 rule 6: a mock result may not be declared a
real integration. D9 stays `[ ]` in the checklist until it has run on a device. What this delivers is
"wired and exercisable", and the handoff must say exactly that.

---

### C3-06 — Durable stores, and the seed scale that makes them measurable

| | |
|---|---|
| **Owner** | One work slot B |
| **Depends on** | Nothing technical. It is the largest task here and should not be split across slots |
| **Addresses** | Carries C2's **T2-2** and **T2-3** forward |

**Why.** Nothing in this product survives a restart. Eight stores are in memory, and
`server/src/app.ts` wires every one of them:

```
$ rg -n '^export function createInMemory|^export function createSeed' server/src --glob '!*.test.ts'
```

| Store | Module | What is lost on restart |
|---|---|---|
| `createInMemorySessionStore` | `identity` | Every session. Every signed-in viewer is signed out |
| `createInMemoryUnlockStore` | `unlock` | **Every purchased episode.** A viewer who paid owns nothing |
| `createInMemoryUnlockOrderStore` | `unlock` | Every pending order, so an in-flight payment can never be matched to one |
| `createInMemoryWebhookEventStore` | `platform-tiktok` | The replay window, so a redelivered callback is no longer detectably a replay |
| `createInMemoryFavoritesStore` | `search` | Every favourite |
| `createInMemoryWatchProgressStore` | `progress` | Every watch position and the whole history screen |
| `createInMemoryCatalogStore` | `catalog` | The catalogue reverts to the seed |
| `createSeedDramaDirectory` | `search` | The search directory reverts to the seed |

**These are not all the same severity, and the payment three should land first.** A lost watch
position is a viewer resuming a few seconds early — `server/src/app.ts` says exactly that, and it is
right. A lost session is recoverable the moment `C3-01` lands, because a silent re-login is what
recovers it. The three that are different are the payment stores:

- **the unlock store** — a viewer who paid real money through TikTok Beans, which the platform
  actually charged, and who now owns nothing;
- **the order store** — an in-flight payment whose callback arrives and can be matched to no order,
  so the money is taken and the episode is never granted;
- **the webhook event store** — replay protection switched off *silently*. The code still checks
  every callback against the replay window; the window is empty, so every redelivery is new.

**The work is unusually well specified already, which is why this is a scheduling task rather than a
design one.** Three modules carry their exact durable form in comments written by the slots that
built the in-memory version:

- `server/src/modules/search/favorites.ts` gives the table, the primary key, the
  `INSERT … ON CONFLICT DO NOTHING` that makes `add` idempotent, the keyset predicate and the index;
- `docs/handoff/w8-work-favorites-list.md` §5 gives the list query verbatim, with the index
  `(user_id, created_at DESC)` and one caveat the in-memory store cannot reproduce: `created_at` has
  millisecond resolution in memory and microsecond resolution in Postgres, so the tie case the
  cursor's drama-id tiebreak exists for becomes rarer there and **not absent**;
- every store interface is already `async`, so the durable implementation drops in behind it without
  touching a caller.

**Seed scale is part of this task and not a follow-up.** `docs/00-wave-plan.md` W7 requires ≥ 2
dramas and ≥ 80 episodes. `server/src/modules/catalog/fixtures.ts` has 8 dramas whose largest is
`totalEpisodes: 7` — roughly 27 episodes in total. Pagination, feed ranking, keyset boundaries and
the favourites resolve fan-out cannot be judged at that size: a page size of 20 against a 27-episode
catalogue never produces a second page, which means the cursor code is exercised only by unit tests
and never by the system.

**Acceptance.**

1. Migrations run forward **and** roll back, both exercised in CI, per the C2 exit standard in
   `docs/plan/wave-protocol.md` §5.1.
2. Seed data at ≥ 2 dramas and ≥ 80 episodes, and the existing fixture *properties* preserved —
   the delisted drama, the unpublished drama, the offline season that hides its episodes but keeps
   their numbers, and the drama-wide free window. Those are what the access tests are about, and a
   bigger seed that loses them is a smaller test suite.
3. Every store's existing test suite passes unchanged against the durable implementation. The suites
   are the specification; the in-memory implementations are one implementation of it.
4. A restart test for the three severe stores: an unlock granted, a process restart, the episode
   still playable.

---

### C3-07 — Favourites rows carry ids, not dramas: the `DramaSummary` projection

| | |
|---|---|
| **Owner** | One work slot B, with a one-line follow-up in slot A |
| **Depends on** | Nothing. Both halves are on `main` for the first time |
| **Existing IDs** | `W8-a`, `W8-b`, `W8-c` from `docs/handoff/w8-work-favorites-list.md` §5. `W8-a` is **already answered** — see below |

**Why.** `GET /v1/users/me/favorites` answers `{ dramaId, favoritedAt }` rows. That was the right
call when it shipped: `DramaSummary` is a catalogue view object, and a partial copy of it in the
search module is how two shapes of one drama start disagreeing about `totalEpisodes`
(decision S60). But the catalogue is now on the same tree, so the reason has expired and the cost
has not.

The cost is an N+1 the client is currently absorbing.
`app/src/favorites/favorite-collection.ts` resolves each row through the catalogue's own drama read,
four in flight, twenty rows per page:

```
FAVORITES_PAGE_LIMIT = 20
FAVORITE_RESOLVE_CONCURRENCY = 4
```

So one page of the favourites screen is **one list read plus twenty drama reads**, in five serial
batches, inside a WebView that holds about six connections per host. The client's own comment is
explicit that this disappears in one line the day the projection lands.

**The change, in the words of the slot that specified it.** In the list handler, after
`favorites.list(...)`:

```ts
const summaries = await store.getDramaSummaries(page.rows.map((row) => row.dramaId));
```

Then `FavoriteListItem` gains `drama: DramaSummary` and `items[].drama` appears in the response.

**Three sub-questions, and only two are open.**

| # | Question | Status |
|---|---|---|
| `W8-a` | What a delisted or deleted drama renders as on SCR-08 | **Answered.** `docs/handoff/w8-work-favorites-consume.md` F34: the row keeps its place, its `data-row-resolved="false"` and its un-follow button. Mutation-tested — the filter fails 4 tests. **Keep `FavoriteEntry.drama` nullable.** The unresolvable row does not disappear when the projection lands, it only becomes rarer |
| `W8-b` | One batched query or N | **Open, and it is the point.** `WHERE drama_id = ANY($1)`. Doing it per row moves the N+1 from the client to the server, which is not a fix |
| `W8-c` | Whether `DramaDetail.viewer.favorited` is filled from the same store | **Open.** One line in a catalogue handler, and the other half of `J-b` |

**A second, smaller reconciliation belongs with this and should not be deferred again.** The
favourites types now exist twice on one tree, which is the exact duplication S60 refused:

| Type | `packages/shared/src/discovery.ts` | `app/src/data/favorites-api.ts` |
|---|---|---|
| `FavoriteState` | canonical | a field-for-field copy |
| `FavoriteListItem` | `favoritedAt: string` | `favoritedAt: string \| null` |
| `FavoriteList` | `{ items, pageInfo }` | `Page<FavoriteListItem>` |

Both client copies carry comments saying they exist only because the shared package did not have
them on that branch, and naming the integrator's move as deleting them. That is registered as `G-C1`
in `docs/handoff/w8-work-favorites-consume.md` §6. The one field that is **not** a straight swap is
`favoritedAt`: the client widened it to `| null` on purpose, because it reads the field tolerantly
and rejecting a page over a field that drives no decision would cost the viewer their whole list for
nothing. Whichever direction that is resolved in, it must be a decision rather than a merge artefact.

**Acceptance.**

1. `items[].drama` is present, and it is the catalogue's `DramaSummary` rather than a copy of part
   of one.
2. The lookup is **one** query per page. A test asserts the query count does not scale with the page
   size.
3. `FavoriteEntry.drama` stays nullable and `FavoriteRow`'s unresolved branch and its 5 tests still
   pass. The delisted-favourite row is still visible and still un-followable.
4. The duplicated client types are deleted in favour of the shared ones, with the `favoritedAt`
   nullability resolved explicitly and the reasoning recorded.
5. `contracts/openapi.yaml` and `server/src/contract.test.ts` move with it, both directions.

---

## Tier B — engineering whose last step is gated

### C3-08 — Real TikTok login

| | |
|---|---|
| **Owner** | One work slot B, plus slot A for the client half |
| **Gated on** | **M1** for credentials, **M6** for a device |
| **Unblocked portion** | Everything except the HTTP exchange itself |

**Why the gate is narrower than it looks.** The whole path exists and every piece of it is honest.
`app/src/session/silent-login.ts` runs bridge code → server exchange → store, with seven named
outcomes and no fallback identity. `app/src/session/session-store.ts` holds the token in memory only
and cannot mint one. `POST /v1/auth/login` validates its input, never logs the code, and keeps the
client secret server-side. `server/src/modules/identity/session-store.ts` both issues and resolves
sessions, so a session that is issued is a session that works.

Exactly one function refuses, `createTiktokIdentityPort` in
`server/src/modules/platform-tiktok/identity-port.ts`, and it refuses on purpose:

> A stub that returned a synthesised `open_id` would issue real sessions to arbitrary strings — a
> working authentication bypass sitting behind a passing test suite.

That is correct and it must not be "fixed" by anyone without credentials. It already distinguishes
`PROVIDER_UNCONFIGURED` from `PROVIDER_UNAVAILABLE`, so an operator can tell "this deployment has no
secret" from "the exchange is not built".

**What is deliverable before M1.** The `POST /v2/oauth/token/` exchange itself — request shaping,
the timeout, the error mapping onto the three existing `IdentityExchangeFailure` values, the rule
that access and refresh tokens never leave the adapter — is writable and testable against a stubbed
HTTP client today. Only the final live call needs a credential. And `config.testLoginEnabled`
already provides an end-to-end path without one: `createMockIdentityPort` accepts `mock:<userId>`
codes, is gated behind configuration, and logs a loud warning when enabled.

**Acceptance.**

1. The exchange is implemented against a stubbed transport with the failure mapping fully tested,
   including the case where the platform answers `200` with a body that has no `open_id`.
2. No synthesised `open_id` on any path. The fail-closed test stays.
3. The client secret does not appear in a log, an error message or a response body — asserted, not
   asserted-in-prose.
4. D4 stays `[ ]` until it has run on a device against a real credential. `docs/plan/wave-protocol.md`
   §6 discipline rule 2.

---

### C3-09 — Beans: the conversion rate does not exist, and it is not an engineering task

| | |
|---|---|
| **Owner** | Business (**T3-4**), with one work slot B behind it |
| **Gated on** | **M2** and **M4** → trade-order API access → an observed Beans amount |
| **Blocks** | D7, all coin pricing, `C3-04`'s SCR-10/PNL-03 |

**Why this is in the backlog even though no engineer can close it.** Every coin price in the domain
model is currently unpriceable in the currency the platform actually charges. The dependency chain
is long and entirely external: M2 + M4 → trade-order API access → an observed Beans amount against a
real order → a rate → coin pricing → the unlock economy.

`server/src/modules/unlock/trade-order-port.ts` is the correct posture and should not change:
`priceCoins`, no conversion, and a refusing default so a deployment that cannot create a real trade
order answers `503` rather than inventing an identifier no callback will carry. It is recorded here
as what it is — **a missing business input, not a deferred engineering task** — so that it cannot be
closed by someone writing a plausible number into a type definition.

**What is deliverable before the gate.** The `POST /v2/minis/trade_order/create/` call behind the
existing port interface, against a stubbed transport, with the platform-side amount as a field the
request grows rather than a rate the code invents. The moment an amount is observed, that field is
populated from a configured rate and nothing else moves.

**Acceptance.**

1. No coin→Beans rate appears in any type definition, constant or default. This is the whole point.
2. The port's refusing default stays, and the `503` path stays tested.
3. When the rate exists it enters through configuration, with the observation that produced it cited
   in the commit.

---

## Tier C — carried defects, verified still open

Three C1 defects and one C2 acceptance item survived C3. They are grouped because each is small, and
listed because "small and still open after three cycles" is the shape of a defect that never closes.

### C3-10 — `SR-5` and the cover allowlist (**D-06**, **D-02**)

| | |
|---|---|
| **Owner** | Work slot C (`SR-5`), work slot A (covers) |
| **Depends on** | Nothing |

**`SR-5` (D-06) was inside a C2 task reported as complete.** `docs/plan/media-plane-decision.md` §5.1
requires `setValidateVideoReplaceElement` to be a banned identifier whose presence fails the build.
`docs/plan/cycle-2-backlog.md` T0-2 made it acceptance item 2. It is not there:

```
$ rg setValidateVideoReplaceElement app/ server/ packages/     # no matches
```

Every occurrence in the repository is prose — the C1 report, the media-plane decision, the C2
backlog, three research documents. **Including the rule that is supposed to ban it.** The rest of
T0-2 landed well (`bundle-scan.test.ts` carries 42 tests and the scan is shape-keyed rather than
name-keyed), which is what makes this worth stating plainly: a task can be 90% delivered, reported
as done, and leave the one item that was a *guardrail* undone.

**The cover allowlist (D-02) has never had a caller.** `checkCoverUrl` and `checkImageUrl` carry 69
tests (`docs/verify/cycle-1-report.md` D-02) and are invoked from nothing but their own tests and
each other.
`app/src/components/CoverImage.tsx:56` passes `src` straight to `<img src>`. The C1 report predicted
that merging the two halves would not connect them, because they were on branches that conflicted —
and that prediction held: they are on one tree now and still not connected.

**Acceptance.**

1. `setValidateVideoReplaceElement` is a banned identifier in the source rules **and** in the bundle
   scan, each with its own committed fixture that the suite asserts is rejected. `SR-1`: a guardrail
   with no failing fixture is unverified.
2. `CoverImage` renders through `checkCoverUrl`, and a cover from an untrusted host renders the
   refusal state rather than the image.
3. `rg checkCoverUrl app/src` returns a product call site.

**Reverse verification (required).** For `SR-5`, add the banned identifier to a real component in a
throwaway worktree, run `pnpm build && pnpm check:guardrails`, confirm it fails, and quote the
output. A unit test proves the regex; only the build proves the gate.

### C3-11 — The gate machinery C2 specified and did not finish

| | |
|---|---|
| **Owner** | Work slot C |
| **Depends on** | Nothing |
| **Carries forward** | C2's **T1-1**, the omitted half of **T0-1**, and **D-07** from **T1-2** |

| Item | State on `main` |
|---|---|
| **G1.5 coverage** | Absent. `rg coverage` over all four `package.json` files returns nothing, so every coverage claim in the project is still unmeasured. It remains the only missing L1 gate that is purely local work, and it has now been unmeasured for three cycles |
| **`workflow_dispatch:`** | Absent from `.github/workflows/ci.yml`. Specified in T0-1 so a red run can be re-run without an empty commit. One line |
| **Contract parity (D-07)** | `contracts/openapi.yaml` serves 20 operations across 17 paths; `docs/12-api-contracts.md` declares 40 endpoints. The gap is unmeasured, and doc 12 still contradicts itself on unlock paths — declaring both `{dramaId}`/`{id}` and both `{episodeId}`/`{id}` forms |

**Acceptance.** G1.5 with the `docs/14-quality-gates.md` §3.1 thresholds (80% diff, 60% global, 90%
core) and the ratchet; `workflow_dispatch:` added; a parity table measured endpoint by endpoint and
D-07 fixed in doc 12. Thresholds move in one direction only — §0 iron rules.

---

## 2. Evidence

Every claim above was re-derived at `2b66323` in a clean checkout. The commands are quoted next to
the claims they support; these are the two that establish the baseline.

### 2.1 `main` is green

```
$ git rev-parse --short HEAD
2b66323
$ pnpm install --frozen-lockfile && pnpm run test
```

| Package | Test files | Tests | Failed | Skipped |
|---|---:|---:|---:|---:|
| `packages/shared` | 4 | 51 | 0 | 0 |
| `packages/config` | 3 | 45 | 0 | 0 |
| `server` | 53 | 1,314 | 0 | 0 |
| `app` | 54 | 727 | 0 | 0 |
| **Total** | **114** | **2,137** | **0** | **0** |

Matches `docs/handoff/w9-integrate-c3.md` §1 exactly. No test in this run flaked, which is not
evidence that `C3-02` is unnecessary — a flake that reproduces once in a full-cycle integration does
not reproduce on demand, which is the whole difficulty.

### 2.2 The three carried defects

```
$ rg setValidateVideoReplaceElement app/ server/ packages/          # no matches            → D-06 open
$ rg -n 'checkCoverUrl' app/src --glob '!**/*.test.*'               # no matches            → D-02 open
$ grep -nE '^  /' contracts/openapi.yaml | wc -l                    # 17 paths, 20 ops      → D-07 unmeasured
```

---

## 3. Dependency graph

```
Tier A — nothing external
  C3-02 (paging tests)  ← after cursor/w9-homepage-flake-c44e lands. Do first: it is what
  │                       makes every later red build mean something
  ├── C3-05 (D9 capsule) ── independent, and cheapest now than at any later point
  ├── C3-01 (silent re-login) ─┐
  ├── C3-07 (favourites projection) ─┼── both touch surfaces C3-04 then builds on
  ├── C3-06 (durable stores + seed) ─┘   largest single task; do not split across slots
  ├── C3-04 (wallet surface) ── PNL-01 and SCR-09 now; SCR-10/11 gated
  ├── C3-03 (gate register + escalation) ── plan slots, parallel to all of the above
  └── C3-10 / C3-11 (carried defects, gate machinery)

Tier B — gated
  C3-08 (real login)     ← M1 credentials, M6 device.   Unblocked: the exchange behind a stub
  C3-09 (Beans rate)     ← M2 + M4 → an observed amount. Unblocked: the call behind a stub

Tier C — business, and it has not moved in three cycles
  GATE-7 / GATE-8 / M0–M6 → C3-03 records the escalation and prices the alternatives
```

---

## 4. What is deliberately not in this backlog

- **Anything on an in-flight branch.** The W10 verification report and
  `cursor/w9-homepage-flake-c44e` belong to live sibling slots. `C3-02` depends on the second and
  does not touch it; nothing here rewrites either. `docs/plan/wave-protocol.md` §8 rule 4.
- **A new epic.** Every item above is a gap C1 or C2 declared and did not close, or the direct
  consequence of something C3 landed. `docs/plan/wave-protocol.md` §4.3 forbids opening a new epic
  until re-verification passes, and re-verification is W10's, in flight.
- **Endpoint parity with doc 12's 40 endpoints as a deliverable.** `C3-11` *measures* the gap.
  Closing it is later work, and scheduling an unmeasured 20-endpoint gap into a cycle is how C1
  failed on over-commitment.
- **Adjudicating the cycle-numbering drift.** Registered as `X-21` in §6 for the slot that owns the
  file.
- **Rewriting C1 branches.** They are the evidence base for the W5 report and for W10's
  re-verification. They stay as they are.

---

## 5. The listing bar, stated as distance

Against `docs/11-official-onboarding-checklist.md` E4, which requires all six mandatory platform
capabilities integrated for submission:

| # | Capability | Server | Client call site | Blocked on |
|---|---|:---:|:---:|---|
| D4 | Silent login | endpoint exists, port refuses | **wired** | M1 credential, M6 device (`C3-08`) |
| D5 | Rewarded video ad | none | none | M4 ad unit ids |
| D6 | Interstitial ad | none | none | M4 ad unit ids |
| D7 | Beans one-off payment | order endpoint exists, port refuses | none | M2 + M4, and a rate (`C3-09`) |
| D8 | Subscription | **none** | probe only | a contract, then M2 + M4 |
| D9 | Navigation bar and capsule | n/a | **none** | **nothing** (`C3-05`) |

C3 moved D4's client half from absent to wired, which is real progress and is the first movement in
this table since it was first drawn. **D9 remains the only row blocked on nothing at all**, and it
has been the only such row for two cycles.

Screens: **7 of 13**. `app/src/routes/routes.ts` declares eight routes, of which seven map to a
numbered screen — SCR-02 home, SCR-04 drama, SCR-05 player, SCR-06 profile, SCR-07 history, SCR-08
favourites, SCR-13 fallback — and the eighth, `#/search`, is a surface the inventory does not number
(`docs/02-screen-inventory.md` §1 gives SCR-03 the route `#/browse`, which does not exist). Missing:
SCR-01 splash, SCR-03 browse, SCR-09 wallet, SCR-10 recharge, SCR-11 VIP, SCR-12 settings.

Panels: **1 of 5** (PNL-02 unlock).

---

## 6. Conflict register

Per `docs/plan/wave-protocol.md` §3.4 — found, not fixed, because the files belong to other slots.

| # | Conflict | Owner | Recommendation |
|---|---|---|---|
| **X-21** | **Two live cycle-numbering schemes.** `docs/plan/wave-protocol.md` §2 defines C*k* = waves 5*k*−4 … 5*k*, making W9 part of C2 and W11 the start of C3. `docs/handoff/w9-integrate-c3.md` calls W9 "cycle C3", and this document is named for the same running count. Both schemes are in use and neither is wrong on its own terms | **P3** (`docs/plan/wave-protocol.md`) | Adopt the running count as the operative one and amend §2 to match, rather than renaming five documents to match the arithmetic. The arithmetic assumed one integration per five waves and the project is integrating more often, which is the better behaviour. Record it in §9 rather than editing §2 silently — §8 rule 7 |
| **X-22** | **`GATE-7` and `GATE-8` are in no authoritative register**, three cycles after both were specified in full | **P3** with **P1** | `C3-03`. The task IDs already exist: `GOV-005`, `GOV-008` |
| **X-23** | **The favourites types exist twice on one tree**, with one deliberate field divergence (`favoritedAt` nullability) | **B**, with **A** | `C3-07` acceptance item 4. Registered as `G-C1` by the slot that created the copies, which named deleting them as the integrator's move |

---

## 7. Change record

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W11 · plan | First version. Re-derived the C2 backlog's status against `main` at `2b66323` and found T0-0, T0-1, T1-2 closed, T0-2 closed for D-01 and open for D-06, and T0-3, T0-4, T1-1, T1-4, T2-1, T2-2, T2-3 open. Registered eleven tasks in three tiers. Recorded that `docs/plan/wave-protocol.md` §6's gate-discipline escalation has now fired — three cycles, zero business-gate movement — and priced the alternative for each gate. Registered conflicts X-21 (cycle-numbering drift), X-22 (unregistered gates) and X-23 (duplicated favourites types). Implemented nothing |
