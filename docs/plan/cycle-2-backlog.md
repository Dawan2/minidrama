# Cycle 2 — Backlog

> **Slot:** W6, plan slot (cycle C2, architecture / scheme).
> **Date:** 2026-08-27.
> **Branch:** `cursor/w6-plan-cycle-2-963c`.
> **Input:** `docs/verify/cycle-1-report.md` §9, verdict **not passed**.
> **Companion:** `docs/plan/cycle-2-integration.md` owns the merge. This document owns everything
> that is not the merge.
> **Standing:** `docs/plan/wave-protocol.md` §4.3 — a "not passed" verdict means C2 schedules
> remediation as top priority and implement waves may not open a new epic until re-verification
> passes. Tier 0 below **is** that remediation. Nothing in Tier 2 or Tier 3 is a new epic.

---

## 0. How to read this

Every task carries an owner slot, its dependencies, acceptance criteria that are commands rather
than opinions, and — where it adds or repairs a gate — a **reverse-verification** step. That last
column exists because of the single most useful finding in the C1 report: `app/tools/bundle-scan.ts`
was documented as "the strongest rule in the set", passed every run, and did not work. A gate is
worth exactly the failing fixture that proves it fires.

Tiers are ordered and the ordering is real. **Tier 0 gates Tier 1; nothing in Tier 2 may start while
a Tier 0 task is open.** Tier 3 is the business track and runs in parallel from now, because it is
the longest chain in the project and four waves have not moved it.

| Tier | Contents | Blocking |
|---|---|---|
| **Tier 0** | Integration, CI reach, the fail-open guardrail, the unwired bridge, the missing monetisation UI | Everything |
| **Tier 1** | The remaining C1 exit conditions | Cycle close |
| **Tier 2** | Product substance once integration holds | Listing |
| **Tier 3** | Business track — starts now, blocks C7–C12 | Submission |

---

## Tier 0

Five tasks. **T0-0** is the merge and is specified elsewhere; it is listed so the dependency graph is
complete.

### T0-0 — Assemble the cycle and land it on `main`

| | |
|---|---|
| **Owner** | W7 work slot A, sole assignment |
| **Spec** | `docs/plan/cycle-2-integration.md` |
| **Closes** | D-03 (partly), D-04, D-09; first instalment on D-05 |
| **Blocks** | T0-1, T0-2, T0-3, T0-4, and all of Tier 1 and Tier 2 |

Five branches, four adjudications, one fast-forward, no pull request. See the companion document.

---

### T0-1 — Make CI run on feature branches

| | |
|---|---|
| **Owner** | W7 work slot B |
| **Depends on** | T0-0 step 8 (`main` must exist as something CI can run against) |
| **Closes** | D-03 |
| **Files** | `.github/workflows/ci.yml` |

**Why.** CI has never executed, on any branch, in the history of this project
(`docs/verify/cycle-1-report.md` §6.2: `gh run list` → no output). The trigger is
`push: branches: [main]` plus `pull_request`; the protocol forbids pull requests and nothing has
ever been pushed to `main`. Every "gates pass" claim in all 29 handoff documents is a local run on
its own author's machine.

**The change.** Extend the push trigger to the branches work actually happens on:

```yaml
on:
  push:
    branches: [main, 'cursor/**']
  pull_request:
  workflow_dispatch:
```

`pull_request:` is retained deliberately. It never fires under the current protocol (§8 rule 3), it
costs nothing, and it is the correct configuration if the protocol is ever amended.
`workflow_dispatch:` is added so a red run can be re-run without an empty commit. The existing
`concurrency` block is already keyed on `github.ref` with `cancel-in-progress`, which is the right
setting once dozens of branches are live — no change needed there.

**The subtlety that will otherwise be discovered the hard way.** For a `push` event, GitHub uses the
workflow file **as it exists on the branch being pushed**. So this change gates every branch cut
*after* it lands, and gates none of the five C1 tips, whose trees predate it. Those five are gated
instead by the integration branch's own CI runs as each is merged (T0-0 steps 2–6), which is the
correct place for them anyway. **Do not rebase or rewrite the C1 branches to give them CI** —
`docs/plan/wave-protocol.md` §8 rule 4 and the report's own method both depend on origin branches
being immutable.

**Acceptance.**

1. `gh run list --branch main` shows at least one run, conclusion `success`.
2. `gh run list` shows at least one run on a `cursor/**` branch.
3. The run executes all ten steps of the existing job, including `check:guardrails` and the
   generated-file diff.

**Reverse verification (required).** Cut a scratch branch, commit a single deliberate violation of
each of the four L1 gates that exist — one commit each: a formatting error, a lint error, a type
error, a failing assertion — and confirm CI goes **red for that specific step** each time. Then
delete the scratch branch. Record the four run URLs in the handoff. This is checklist item **V-b**,
which C1 could not satisfy because the pipeline had never gone green; T0-1 is what makes it
satisfiable, so it must satisfy it.

---

### T0-2 — Repair the bundle scan: it does not see the form React actually emits

| | |
|---|---|
| **Owner** | W7 work slot C |
| **Depends on** | T0-0 (so the fix lands once, on the assembled tree, not on a branch that then conflicts) |
| **Closes** | D-01 (P1), D-06 (P2) |
| **Files** | `app/tools/bundle-scan.ts`, `app/tools/bundle-scan.test.ts`, fixtures |

**Why.** This is the highest-severity defect in the cycle and it is a *silent* one. `bundle-scan.ts`
bans native media elements in the built artifact — the layer that exists specifically to catch what
a dependency contributed, which lint cannot see. Its rules are:

```ts
{ rule: 'no iframe element',       pattern: /createElement\s*\(\s*(['"`])iframe\1/ },
{ rule: 'no native video element', pattern: /createElement\s*\(\s*(['"`])video\1/ },
```

The project builds React 19 with the **automatic JSX runtime**, which never emits `createElement`.
It emits `jsx` / `jsxs` / `jsxDEV`. W5 put a reachable `<video>` in a component, built it, and found
this in the shipped chunk:

```
Rt.jsx("video",{src:"https://cdn.example.invalid/rvprobe-marker.m3u8",controls:!0})
```

`pnpm check:guardrails` printed *"platform guardrails passed"*. The identical result holds for
`<iframe>`. On TikTok Minis a native media element is a listing-blocking finding discovered during
platform code scanning — that is, discovered by the reviewer rather than by us.

**Three defects, not one.**

1. **Wrong call form.** Only `createElement` is matched; the build emits `jsx`.
2. **Incomplete element list.** `app/tools/html-integrity.ts` forbids five elements —
   `video`, `audio`, `iframe`, `object`, `embed` — and the bundle layer covers two.
3. **`SR-5` is specified and absent (D-06).** `docs/plan/media-plane-decision.md` §5.1 requires
   `setValidateVideoReplaceElement` to be a banned identifier that fails the build. The string
   appears nowhere in `app/`, `server/` or `packages/`, including in the rule meant to ban it.

**The change.** Do not add a `jsx(` rule beside the `createElement(` rule. That fixes the observed
symptom and leaves the class of defect open: a bundler that renames the imported binding emits
`n("video",{…})`, and a rule keyed on the function's name misses it again. Key the rule on the
**shape of the call** instead — a quoted tag as the first argument, a props object as the second —
which is what every JSX runtime emits regardless of what the callee got minified to:

```ts
const MEDIA_ELEMENTS = ['video', 'audio', 'iframe', 'object', 'embed'] as const;
// Matches createElement("video", {…}), jsx("video", {…}), jsxs/jsxDEV, and the minified
// forms where the callee has been renamed but the tag literal and the props object survive.
pattern: new RegExp(`\\(\\s*(['"\`])${el}\\1\\s*,\\s*\\{`)
```

Keep the existing `createElement` rules as well. They are narrower, they cost nothing, and an
overlapping guardrail is not a redundant one.

**Expect false positives and decide about them deliberately.** The shape-keyed rule fires on any
call whose first argument is the literal `"video"` and whose second is an object — an i18n lookup or
a capability probe could match. If one appears, the fix is to change the call site, not to weaken
the pattern. `docs/14-quality-gates.md` §0 permits thresholds to move in one direction only, and
that applies to a regex as much as to a number.

**Acceptance.**

1. A committed fixture for **each** of the five elements × **each** banned call form, and a unit
   test asserting `scanBundleText` returns a violation for every one. This is `SR-1`: *"a guardrail
   with no failing fixture is unverified."*
2. `setValidateVideoReplaceElement` is a banned identifier in the source rules **and** in the bundle
   scan, with its own fixture.
3. `pnpm run verify` green on the assembled tree.

**Reverse verification (required).** Repeat W5's probe end to end, not just at the unit level: add a
reachable `<video>` to a real component in a throwaway worktree, run `pnpm build && pnpm
check:guardrails`, and confirm it now **fails**. Repeat for `<iframe>`. Remove the worktree. Quote
the failing output in the handoff. A unit test on `scanBundleText` proves the regex; only the build
proves the gate.

---

### T0-3 — Wire `TikTokBridge` into product code

| | |
|---|---|
| **Owner** | W8, one slot |
| **Depends on** | T0-0. `m`'s `app/src/auth/session-context.tsx` and `SignInPrompt.tsx` arrive with the merge and are half of D4's client side |
| **Addresses** | `docs/11-official-onboarding-checklist.md` D4–D9, all six "not integrated" |
| **Files** | `app/src/platform/` (unchanged interface), a new provider, plus call sites in screens |

**Why.** `PlatformBridge` is a complete, capability-probing, timeout-bounded adapter with a
conformance suite run against both the real and mock implementations — and **no product code calls
any of it.** Every reference to a platform capability in `app/src` is inside `app/src/platform/`
itself:

```
$ rg -n "getMenuButtonRect|setNavigationBarColor|showRewardedAd|showInterstitialAd|createSubscription" \
     app/src --glob '!src/platform/**' --glob '!**/*.test.*'      # every hit is inside platform/
```

`docs/11-official-onboarding-checklist.md` E4 requires all six integrated for submission, and D4
notes that platform code scanning looks specifically for a login implementation. Zero of six are
integrated. The adapter has never run on a device.

**Order the sub-tasks by what is actually blocked, because most of this is not.**

| Sub-task | Capability | External dependency | Verdict |
|---|---|---|---|
| **T0-3a** | **D9 — navigation bar colour, capsule avoidance** (`setNavigationBarColor`, `getMenuButtonRect`) | **none** | **Do this first.** Every screen owes it, no screen has it, and it needs no credential, no ad unit and no device to build against the mock |
| **T0-3b** | D4 — silent login (`login()` → `POST /v1/auth/login`) | M1 for real credentials | **Wire it now.** `l`'s gated `test-login` port (integration A3) makes the whole flow exercisable end-to-end without credentials. Only the final code exchange is blocked |
| **T0-3c** | D5, D6 — rewarded and interstitial ads | M4 for ad unit ids | **Build the call sites and the server-side reward check.** `isEnded` must be verified server-side before any reward is granted; that logic is unblocked and is where the fraud risk lives |
| **T0-3d** | D7, D8 — Beans payment, subscription | M2 + M4; and D8 has **no server surface on any branch** | **Server surface for D8 only.** Do not build a payment UI that prices in a currency that does not exist yet (§Tier 3, T3-4) |

**T0-3a is the one to insist on.** It is the only mandatory platform capability with no external
dependency whatsoever, it affects every screen so its cost rises with every screen added, and a
capsule overlapping a control is the kind of finding a reviewer sees in the first ten seconds.

**Architectural constraint (do not relax).** `app/src` contains no reference to `window.TTMinis`
outside `app/src/platform/`, enforced by a source-tree rule, and that rule stays. Wiring means
exposing the existing `PlatformBridge` through a React provider that screens consume — it does not
mean screens reaching for the SDK. If a screen needs a capability the interface does not expose, the
interface grows and the conformance suite grows with it.

**Acceptance.**

1. `rg` for the five capability names outside `app/src/platform/` returns **product call sites**,
   not zero.
2. No new reference to `window.TTMinis` outside `app/src/platform/`; the source rule still passes.
3. Every new call site handles the `canIUse` → false path, because a capability probe that is
   ignored is a crash on an older host.
4. The bridge conformance suite still passes against both implementations.

**Honesty constraint.** `docs/plan/wave-protocol.md` §8 rule 6: **a mock result may not be declared
a real integration.** D4–D9 stay `[ ]` in the checklist until they have run on a device, no matter
how complete the mock path is. What T0-3 delivers is "wired and exercisable", and the handoff must
say exactly that.

---

### T0-4 — Build the wallet and unlock surface

| | |
|---|---|
| **Owner** | W8, one slot (a different one from T0-3 — these touch disjoint screens) |
| **Depends on** | T0-0, and specifically on integration **A6** preserving `unlockRoutes` and `entitlementRoutes` |
| **Addresses** | `docs/02-screen-inventory.md` SCR-09/10/11, PNL-01/02/03 |

**Why.** Zero of five overlay panels exist, on any branch. The episode picker, the unlock panel and
the recharge panel are the interaction core of a mini-drama app — the entire monetisation surface is
absent from the client everywhere. Meanwhile the *server* already serves
`POST /v1/entitlement/episode-access`, `POST /v1/unlock/coin-orders` and
`GET /v1/unlock/coin-orders/{orderId}`, with a purchases-outrank-subscriptions decision function and
an order model where only a verified payment advances state. **The back end of the unlock economy
exists and nothing in the product can reach it.**

**Scope, in dependency order.**

| Screen | What it is | Notes |
|---|---|---|
| **PNL-01** episode picker | Player overlay | No monetisation dependency. Needs `GET /v1/dramas/{dramaId}/episodes`, which arrives with the merge. Start here |
| **PNL-02** unlock panel | Player overlay, auto-opens on locked state | Triggered by `viewerAccess.playable = false` or `403 EPISODE_LOCKED` / `EPISODE_VIP_REQUIRED`, rendering `details` as the price (`docs/02-information-architecture.md` §8.3). The server side of this is the part that already works |
| **SCR-09** wallet | Balance, transaction list | Empty-ledger state is a required state, not an edge case |
| **SCR-10** / **PNL-03** recharge | Purchase flow, payment polling | UI only; the actual `pay()` call is T0-3d and is gated |
| **SCR-11** VIP | Subscription | **Blocked**: no server-side subscription surface exists on any branch (D8). Build the screen against a defined contract or defer it — do not invent the endpoint in the client |

**The pricing constraint, which is not an engineering problem.** `trade-order-port.ts` carries
`priceCoins` and performs no conversion, deliberately and correctly: the platform charges Beans, and
what a coin is worth in Beans is a commercial decision that **does not exist**. So the wallet and
unlock UI display **coins**, and no screen may display a fiat or Beans amount until T3-4 produces an
observed rate. A placeholder rate in the client is worse than no rate: it is a commercial decision
made by a front-end developer, and it will be believed.

**Acceptance.**

1. PNL-01 and PNL-02 render against the real `entitlement` and `unlock` endpoints, not fixtures.
2. Every screen implements the state set `docs/02-screen-inventory.md` requires of it — including
   empty, error and the payment-polling state; a screen with only its happy path is not done.
3. No fiat or Beans amount appears in any client string.
4. Panels are reachable from the player and dismissable, and the locked-episode deep-link journey
   (J4) lands in the S6 locked state with PNL-02 open.

---

## Tier 1 — close the remaining C1 exit conditions

Gated on Tier 0. These are what turn the C1 verdict from "not passed" into a re-verifiable state.

| ID | Task | Notes |
|---|---|---|
| **T1-1** | **Add G1.5 coverage** with the `docs/14-quality-gates.md` §3.1 thresholds (80% diff, 60% global, 90% core) and the ratchet | The only missing L1 gate that is purely local work. No coverage tooling is configured at all today, so every coverage claim in the project is unmeasured |
| **T1-2** | **Reconcile the contract to one document** and measure parity against `docs/12-api-contracts.md`'s 40 endpoints | Integration A5 produces the single document; T1-2 measures the gap and writes it down. Fix **D-07** (doc 12 contradicts itself on unlock paths) here |
| **T1-3** | **Reverse-verify every L1 gate that exists**, per checklist **V-b** | T0-1 and T0-2 each carry their own; T1-3 is the sweep that covers the rest and records the evidence in one place |
| **T1-4** | **Adopt `GATE-7` and `GATE-8` into one authoritative register** (**D-08**) | Three registers, three branches, two numbering schemes. After the merge they are on one tree for the first time, so this becomes a document edit rather than a negotiation. Reconcile the M-scheme and the GATE-scheme |
| **T1-5** | **Restore or amend the file-ownership rule** (**D-05**) | Either three work slots per wave with the §3.1 A/B/C boundaries, or a written amendment saying sixteen parallel slots is intended — in which case the conflict-resolution protocol has to be *designed* rather than discovered, which is what C1 did. `docs/plan/cycle-2-integration.md` §4.3 applies it to W7 as a first instalment |
| **T1-6** | **Re-verification of C1** | Belongs to the W5 slot per `docs/plan/wave-protocol.md` §4.3. Cannot start until T0-0 through T0-2 are closed |

---

## Tier 2 — product substance

Gated on Tier 0. Ordered by what the listing bar needs.

| ID | Task | Notes |
|---|---|---|
| **T2-1** | **Wire the cover allowlist into the catalogue read path and `CoverImage`** (**D-02**) | `checkCoverUrl` / `checkImageUrl` have 69 tests and no caller; `CoverImage.tsx` passes `src` straight to `<img>`. The two halves arrive on branches that conflict, so **merging does not connect them** — this needs doing by hand. May be delivered by the catalogue-cover slot if it lands (integration §6) |
| **T2-2** | **Persistence** — the domain model's tables and migrations | Everything on every branch is in-memory. Nothing survives a restart |
| **T2-3** | **Seed data at W7 scale** — ≥ 2 dramas, ≥ 80 episodes per `docs/00-wave-plan.md` | Needed before any pagination, feed-ranking or history behaviour can be judged at a realistic size |
| **T2-4** | **The remaining screens** — SCR-01 splash, SCR-03 browse, SCR-08 favourites, SCR-12 settings | The merge brings the client to 7 of 13; T0-4 adds the monetisation screens; this closes the set |
| **T2-5** | **Search end-to-end check** | `r` ships a search client and `j` ships the search server, and they were never compiled together. After integration step 6, verify the round trip actually works rather than assuming the merge made it so |

---

## Tier 3 — business track, starting now

Nine of twelve blockers are business-track and **none has moved in four waves**
(`docs/verify/cycle-1-report.md` §8.1). `docs/plan/wave-protocol.md` §6 gate discipline rule 3
escalates any gate with no movement across two consecutive cycles to a risk entry with an
alternative. C1 was the first cycle. **If C2 closes with this table unchanged, that escalation
fires** — it is not a warning, it is a scheduled consequence, and the alternatives should be priced
before it does.

| ID | Task | Unblocks |
|---|---|---|
| **T3-1** | **Establish the account-manager relationship** | The single release condition for `GATE-8`, the entry point for `GATE-7`, and upstream of M1, M4 and M6. Everything else in this tier queues behind it |
| **T3-2** | **Open the EIS conversation and decide the launch region set (B-4)** | `GATE-7`: 15–30 US business days, criteria unpublished, upstream of contract signing which is upstream of all of C8. Documenting a first launch that **excludes the EU and US** is a legitimate release condition and is currently the cheapest way off the critical path |
| **T3-3** | **Obtain the official requirements PDF (M0)** | Four waves have been built against public web sources S1–S15 on a zero-rework assumption nobody has been able to test. Blocks every "requirements verified" claim |
| **T3-4** | **Observe a Beans amount against a real trade order** | The coin→Beans rate does not exist. Until it does, every coin price in the domain model is unpriceable in the currency the platform actually charges, and T0-4 cannot display a real price |
| **T3-5** | **Price the `GATE-8` alternative (MP-B) before it is needed** | `GATE-8` is the only gate whose *unfavourable* resolution creates work rather than merely unblocking it, so "still open" means something different here than for M1–M6. Pricing MP-B during a launch slip is the expensive way to do it |

---

## Dependency graph

```
T0-0 (merge, land on main)
 ├── T0-1 (CI on cursor/**)  ──┐
 ├── T0-2 (bundle scan)      ──┤
 ├── T0-3 (bridge wiring)      │   ├── T0-3a D9 capsule ← no external dependency, do first
 │    └── T0-3b/c/d          ──┼───┤   gated on M1 / M4 (T3-1)
 └── T0-4 (wallet + unlock)  ──┘   └── prices gated on T3-4
                                │
                         Tier 1 ┴── T1-6 re-verification of C1  ← the cycle's exit
                                │
                         Tier 2 ── T2-1 … T2-5

Tier 3 runs in parallel from now and gates T0-3b/c/d, T0-4's pricing, and all of C7–C12.
```

---

## What is deliberately not in this backlog

- **A new epic.** `docs/plan/wave-protocol.md` §4.3 forbids one until C1 re-verification passes.
  Everything above is remediation, closing an exit condition, or product work that C1 declared and
  did not deliver.
- **Endpoint parity with doc 12's 40 endpoints.** The best branch covers 9 and the union 15. T1-2
  *measures* the gap and records it; closing it is C3 work and pretending otherwise would put an
  unschedulable item in a cycle that already failed on over-commitment.
- **Anything gated on a device.** No slot has had one. Tasks are written so their unblocked portion
  is deliverable and their blocked portion is named, rather than being deferred whole.
- **Rewriting or rebasing C1 branches.** They are the evidence base for the W5 report and for T1-6.
  They stay as they are.
