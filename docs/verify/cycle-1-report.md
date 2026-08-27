# Cycle 1 — Independent Verification Report (Wave 5)

> **Slot:** W5, independent verifier for cycle C1 (waves W1–W4).
> **Date:** 2026-08-27.
> **Branch:** `cursor/w5-verify-cycle-1-7ed1`, cut from `cursor/w4-work-p-53de` (`169e07c`) so that the
> document cross-references in this report resolve.
> **Mandate:** record what is true. This slot did not implement product features, did not modify any
> source file to make a check pass, did not delete or weaken a test, and did not rewrite any origin
> branch. The only file added is this one. No pull request was opened.
> **Method:** every claim below was re-derived from a clean checkout with the commands quoted next to
> it, per `docs/plan/wave-protocol.md` §4.1 rule 3. Where a handoff document asserts a result, the
> result was re-run rather than accepted.

---

## 0. Verdict

**Not passed**, against the C1 exit standard in `docs/plan/wave-protocol.md` §5.1.

That standard has three conditions. None is met:

| C1 exit condition | Status | Why |
|---|---|---|
| Contract lint zero errors **and** endpoint-by-endpoint parity with `docs/12-api-contracts.md` | **Not met** | The OpenAPI document has forked into five mutually incompatible versions on five branches. The largest holds 9 of the 40 endpoints doc 12 declares (§5.3) |
| CI L1's ten gates reverse-verified, all going red | **Not met** | CI has never executed once, on any branch (§6.2). Four of the ten L1 gates exist at all (§6.3). One gate that does exist is fail-open and was proven so (§7, D-01) |
| Conflict ledger closed or deferred in writing | **Not met** | The ledger itself is on an unmerged branch, and the gate register it depends on exists in three incompatible forms (§8.2) |

This verdict is about **cycle integration and gating**, not about slot craftsmanship. The per-slot work
is, with the exceptions in §7, unusually careful: fail-closed by default, densely tested, and honest
in its own handoff documents about what it did not do. The failure is one level up — sixteen branches
of good work are not assembled, not gated by CI, and in seven cases cannot be merged without manual
adjudication.

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the C2 plan wave must schedule
remediation as top priority and implement waves may not open a new epic until re-verification passes.
Re-verification belongs to this slot.

---

## 1. The headline finding: `main` is empty

This is the single most consequential fact in the cycle and it is not stated in any handoff document.

```
$ git rev-list --count origin/main
1
$ git ls-tree -r --name-only origin/main
README.md
```

`origin/main` is one commit (`fc1333f`, "Initial commit") containing one file. **No wave has delivered
anything to the trunk.** Every artifact of C1 — 51 commits of code, 70 documents, 713 tests — exists
only on feature branches.

Two consequences follow, and both are load-bearing for the rest of this report.

**Iron rule R6 cannot be evaluated.** `docs/14-quality-gates.md` §0 R6 requires that `main` be
releasable at all times. A `main` that holds a README is trivially green and entirely meaningless. The
rule is not being violated so much as it is not yet applicable, and the discipline it is supposed to
create — that integration pain is felt immediately, in small increments — has been deferred in full to
whoever merges first.

**CI is wired to a branch nothing lands on.** `.github/workflows/ci.yml` triggers on
`push: branches: [main]` and on `pull_request`. The wave protocol
(`docs/plan/wave-protocol.md` §8 rule 3) forbids opening pull requests. Nothing is pushed to `main`.
The intersection of those three facts is that **the pipeline has never run** (§6.2).

---

## 2. Repository topology

Thirty-one `cursor/*` branches exist. They do not form the flat "one branch per slot off `main`"
structure the protocol describes; they form a chain with sixteen branches hanging off it at eight
different points.

### 2.1 The de-facto trunk

`cursor/w4-work-p-53de` (`169e07c`) is 51 commits ahead of `main` and is the tip of a linear chain
that absorbed twelve slot branches:

```
w1-work-a / w1-work-b / w1-work-d  →  w1-plan-p1 / w1-plan-p2 / w1-plan-p3
   →  w1-architecture  →  w1-repo-skeleton  →  w2-work-c  →  w2-work-e
   →  w2-work-f  →  w2-work-i  →  w2-work-k  →  w3-work-n  →  w4-work-p
```

Throughout this report "the trunk" means this branch. It is the only assembled artifact in the
repository and the only one on which a whole-system claim can be made. It is **not** `main`, and no
document in the repository identifies it as the integration branch.

### 2.2 Sixteen branches are outside the chain

```
$ git merge-base --is-ancestor <branch> origin/cursor/w4-work-p-53de
```

Sixteen branches fail that test, carrying **57 unique commits** that are in no assembled artifact:

| Branch | Commits off trunk | Files changed | Substance |
|---|---:|---:|---|
| `w2-plan-p3-477e` | 31 | 27 | Wave protocol, X-19 playback endpoint adjudication, gate table |
| `w2-plan-p2-media-plane-d4a6` | 23 | 23 | Media-plane decision, `GATE-8`, standing rules `SR-1`…`SR-9` |
| `w2-work-a-71b2` | 23 | 22 | VePlayer descriptor contract, player state machine (docs only) |
| `w2-work-b-1a8e` | 20 | 21 | Official research absorption (docs only) |
| `w3-work-m-9b99` | 18 | 84 | Catalogue + feed server, client data layer, history and profile UI |
| `w2-plan-p1-0453` | 16 | 15 | Conflict register, backlog, `GATE-7` (EIS) |
| `w3-work-o-1f19` | 13 | 73 | Search endpoint and client search surface |
| `w2-work-h-5c79` | 11 | 63 | Catalogue server module, feed and drama-detail UI |
| `w2-work-j-acf5` | 8 | 28 | Keyword search and per-viewer favourites |
| `w2-work-d-0d0f` | 7 | 26 | Catalogue, keyset pagination, recommendation feed |
| `w1-product-ia-9cd1` | 5 | 5 | Product IA, compliance, acceptance criteria |
| `w2-work-g-d191` | 4 | 15 | Watch-progress endpoints |
| `w1-technical-design-docs-8a32` | 4 | 4 | Technical design set |
| `w1-plan-p3-e16a` | 3 | 3 | Original wave protocol / DoD |
| `w1-research-official-bb4f` | 2 | 5 | Official source research, gap register |
| `w3-work-l-8551` | 2 | 17 | Session-to-user binding store |

The client application a reviewer would judge the product by — the feed, drama detail, search, watch
history, profile — is **entirely** in this table. The trunk's client is three routes and a player
surface (§4.2).

---

## 3. Maturity: the Minis app against the listing bar

### 3.1 Mandatory platform capabilities (`docs/11-official-onboarding-checklist.md` §5, D4–D9)

The checklist marks D4–D9 as required for submission, and E4 requires all six integrated. Verified by
inspection of the trunk plus every unmerged branch:

| # | Capability | Bridge shape | Server side | Product code calls it | Status |
|---|---|:---:|:---:|:---:|---|
| D4 | Silent login (`TTMinis.login` + `POST /v2/oauth/token/`) | yes | endpoint exists, port refuses | **no** | **Not integrated.** `createUnavailableIdentityPort` refuses every exchange, so no session can be issued. Correct fail-closed posture; not a working login |
| D5 | Rewarded video ad | yes | none | **no** | **Not started.** No ad unit, no reward ledger, no `isEnded` server check |
| D6 | Interstitial ad | yes | none | **no** | **Not started** |
| D7 | Beans one-off payment | yes | order endpoint exists, port refuses | **no** | **Not integrated.** `createUnavailableTradeOrderPort` refuses; no coin→Beans rate exists (§8.5) |
| D8 | Subscription | yes | **none** | **no** | **Not started.** No server-side subscription surface on any branch |
| D9 | Navigation bar and capsule avoidance | yes | n/a | **no** | **Not started.** No screen reads `getMenuButtonRect` or sets a bar colour |

Verified with:

```
$ rg -n "getMenuButtonRect|setNavigationBarColor|showRewardedAd|showInterstitialAd|createSubscription" \
     app/src --glob '!src/platform/**' --glob '!**/*.test.*'
```

Every hit is inside `app/src/platform/` — the interface, the real bridge, the mock. **No product code
consumes any platform capability.** `TikTokBridge` is a complete, well-shaped, capability-probing,
timeout-bounded adapter that nothing calls and no device has ever run.

**D4–D9: zero of six integrated.** The listing bar for E4 is not approached.

### 3.2 Screens

`docs/02-screen-inventory.md` §1 defines 13 screens (SCR-01…SCR-13), 5 overlay panels (PNL-01…PNL-05)
and 6 global components (CMP-01…CMP-06).

| Where | Screens implemented | Which |
|---|:---:|---|
| Trunk | **3 of 13** | SCR-02 home (skeleton), SCR-05 player, SCR-13 fallback |
| + `w3-work-m` | 6 of 13 | adds SCR-04 drama detail, SCR-06 profile, SCR-07 history |
| + `w3-work-o` | 5 of 13 | adds SCR-04 drama detail, plus a search surface |
| Union, if merged | **7 of 13** | missing SCR-01 splash, SCR-03 browse, SCR-08 favourites, SCR-09 wallet, SCR-10 recharge, SCR-11 VIP, SCR-12 settings |

**Panels implemented: 0 of 5.** The episode-picker, unlock and recharge panels are the interaction
core of a mini-drama app and none exists. There is no wallet, no recharge, no VIP, no unlock UI — the
entire monetisation surface is absent from the client on every branch.

`w3-work-m` and `w3-work-o` ship **different, conflicting route tables**: `m` declares `me` and
`history` and omits `search`; `o` declares `search` and omits `me` and `history`. Neither is a
superset. Merging them is a manual reconciliation, not a fast-forward.

### 3.3 Overall maturity judgement

The project is at **architecture-and-contract maturity, pre-integration**. Against the twelve-cycle
map in `docs/plan/wave-protocol.md` §5.1, the delivered substance sits inside C1 ("scheme baseline
freeze") and reaches into C2/C3 on the server read path — but the C1 exit gate itself is not passed,
because the exit gate is about assembly and enforcement rather than about volume.

Distance to the listing bar, stated as work rather than time: the whole of C2 through C12 remains,
plus the C1 remediation in §9. Nothing in this cycle is submittable, and nothing in this cycle claims
to be.

---

## 4. What the cycle actually built

### 4.1 Server (trunk)

Seven routed endpoints, six modules, all in-memory, no database:

| Module | Surface | Notable property |
|---|---|---|
| `health` | `GET /health` | unversioned, outside the `/v1` surface (see X-20, §8.2) |
| `identity` | `POST /v1/auth/login` | client secret server-side only; port refuses until real exchange lands |
| `entitlement` | `POST /v1/entitlement/episode-access` | pure decision function; purchases outrank subscriptions |
| `playback` | `POST /v1/playback/sessions` | media resolved behind a port a denial cannot reach |
| `unlock` | `POST /v1/unlock/coin-orders`, `GET .../{orderId}` | order is an intent; only a verified payment advances it |
| `platform-tiktok` | `POST /v1/payments/callbacks/tiktok` | fail-closed signature verification, raw bytes preserved, replay window |

The consistent design is a **port with a refusing default**: `PlatformIdentityPort`,
`PlaybackMediaPort`, `PlatformTradeOrderPort` and `EntitlementFactsPort` all answer "unavailable"
rather than inventing a value. A deployment with no platform credentials returns 502/503 and grants
nothing. This is the right posture and it is consistently applied.

### 4.2 Client (trunk)

Three routes (`/home`, `/play/:episodeId`, `/fallback`), a `PlatformBridge` interface with a
conformance suite run against both the real and mock implementations, a VePlayer-only player façade,
and an i18n module with `en` and `ar` locales. `app/src` contains no reference to `TTMinis` outside
`app/src/platform/`, enforced by a source-tree rule.

### 4.3 Contract and shared packages

`contracts/openapi.yaml` (7 paths on trunk), `@minidrama/shared` (error catalogue, `Result`, playback
and image-URL types), `@minidrama/config` (trusted-domain registry, `minis.config.json` generator,
cover-host allowlist).

### 4.4 Documentation

**70 documents** across all branches (36 on the trunk), including **29 slot handoffs**. The handoff
documents are genuinely high quality: they record decisions with reversal costs, list what was
deliberately *not* built, and register their own known gaps. `docs/handoff/w4-work-p.md` §4 goes
further and reports reverse verification — each rule reintroduced as a defect, with the count of tests
that then fail. That practice is worth keeping and generalising.

---

## 5. Evidence

### 5.1 The trunk verifies clean

Clean checkout, dependencies installed from the committed lockfile:

```
$ git rev-parse HEAD
169e07c1ba2201d705b92e053bd97b33e28ff67d
$ pnpm install --frozen-lockfile && pnpm run verify
```

`verify` = `format:check` → `lint` → `typecheck` → `test` → `build` → `check:guardrails`. **Exit 0.**

| Package | Test files | Tests |
|---|---:|---:|
| `packages/shared` | 3 | 48 |
| `packages/config` | 3 | 45 |
| `server` | 22 | 511 |
| `app` | 13 | 109 |
| **Total** | **41** | **713** |

0 failed, 0 skipped. Build emits `dist/assets/index-B_KnFxaH.js`, 242.80 kB (78.07 kB gzipped),
matching the hash `docs/handoff/w4-work-p.md` §4.1 reports. Roughly 6,019 lines of source against
6,814 lines of test.

### 5.2 Every unmerged code branch also verifies clean

Each checked out into its own worktree, installed from its own lockfile, `pnpm run verify` run in full:

| Branch | Result | shared | config | server | app |
|---|:---:|---:|---:|---:|---:|
| `w2-work-g-d191` | pass | 8 | 16 | 251 | 109 |
| `w2-work-j-acf5` | pass | 8 | 16 | 396 | 109 |
| `w3-work-l-8551` | pass | 8 | 16 | 407 | 109 |
| `w2-work-d-0d0f` | pass | 11 | 16 | 338 | 92 |
| `w2-work-h-5c79` | pass | 11 | 16 | 338 | 242 |
| `w3-work-o-1f19` | pass | 11 | 16 | 338 | 306 |
| `w3-work-m-9b99` | pass | 11 | 16 | 338 | 317 |

`w2-work-a-71b2` and `w2-work-b-1a8e` are documentation-only and predate the skeleton; they carry no
`verify` script, which is correct for their content.

**No slot shipped a red branch.** Slot-level discipline is real. The verification cost is that these
numbers do not compose: seven of these branches cannot be merged into the trunk without manual
conflict resolution (§5.4), so no combination of them has ever been tested together.

### 5.3 The contract has forked five ways

```
$ git show <branch>:contracts/openapi.yaml | grep -E '^  /'
```

| Branch | Paths | Endpoints unique to it |
|---|:---:|---|
| trunk | 7 | `/v1/entitlement/episode-access`, `/v1/unlock/coin-orders`, `/v1/unlock/coin-orders/{orderId}` |
| `w3-work-m` | 9 | `/v1/dramas`, `/v1/dramas/{dramaId}`, `/v1/dramas/{dramaId}/episodes`, `/v1/episodes/{episodeId}`, `/v1/recommendations/feed` |
| `w2-work-j` | 7 | `/v1/search`, `/v1/dramas/{dramaId}/favorite`, `/v1/progress/episodes/{episodeId}` |
| `w2-work-g` | 5 | `/v1/progress/episodes/{episodeId}` |
| `w3-work-l` | 5 | — |

Each branch forked the contract at its own fork point and grew it independently. `w3-work-m` has the
catalogue but **lost** entitlement and unlock; `w2-work-j` has search and favourites but neither
catalogue nor entitlement nor unlock. The union is 15 distinct paths; no single artifact holds more
than 9.

Against `docs/12-api-contracts.md`, which declares **40 endpoints**, the best branch covers 9 and the
union covers 15. The C1 exit condition "endpoint-by-endpoint parity with doc 12, no omissions" is far
from met, and the endpoints that do exist are largely *renamed* rather than transcribed — doc 12 says
`POST /episodes/{episodeId}/playback-token`, the server serves `POST /v1/playback/sessions`. That
divergence is knowingly registered as X-19 and X-20 on `w2-plan-p3-477e`, which is itself unmerged.

Doc 12 additionally contradicts itself: it declares both `POST /dramas/{dramaId}/unlock` and
`POST /dramas/{id}/unlock`, and both `POST /episodes/{episodeId}/unlock` and
`POST /episodes/{id}/unlock` (D-07).

### 5.4 Merge state

```
$ git merge-tree --write-tree --name-only origin/cursor/w4-work-p-53de origin/cursor/<branch>
```

Seven of the nine code branches conflict with the trunk:

| Branch | Conflicted files |
|---|---|
| `w2-work-d` | `packages/shared/src/index.ts`, `server/src/app.ts`, `server/src/contract.test.ts` |
| `w2-work-h` | same three |
| `w3-work-m` | same three |
| `w3-work-o` | same three |
| `w2-work-g` | `contracts/openapi.yaml`, `packages/shared/src/errors.ts`, `server/src/app.ts` |
| `w2-work-j` | those three plus `packages/shared/src/index.ts` |
| `w3-work-l` | `server/src/app.ts`, `server/src/config.ts` |

They also conflict **with each other** — nine conflicting pairs among
`w2-work-g`, `w2-work-j`, `w3-work-l`, `w3-work-m`, `w3-work-o`. All documentation and planning
branches merge cleanly.

`server/src/app.ts` is the universal hotspot: it appears in all seven, because it is the composition
root where every slot registers its routes and wires its ports.

**Root cause.** `docs/plan/wave-protocol.md` §3.1 makes file ownership a hard constraint and assigns
`server/`, `contracts/`, `packages/` to exactly one slot (**B**), with three work slots per wave. The
cycle instead ran sixteen sequentially lettered work slots `a`…`p` across W2–W4, of which at least
eleven wrote to slot B's exclusive paths. The rule designed to prevent precisely this outcome was not
applied, and the outcome it was designed to prevent is what happened. This is a process defect
(D-05), not a coding defect.

---

## 6. Gate enforcement

### 6.1 The iron rules hold

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | test counts monotonically increase along the chain; no handoff records a deletion | **clean** |
| R3 no skipped tests | `rg '\.skip\(|\.only\(|xit\(|xdescribe\(|it\.todo\('` across all 31 branches | **clean** — every hit is `process.exit(1)`, a false positive |
| R4 no weakened standards | `rg 'eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error'` across all 31 branches | **clean** — zero occurrences repository-wide |
| R5 no empty tests | sampled `image-url.test.ts`, `webhook-signature.test.ts`, `access.test.ts` | assertions are behavioural and specific |

TypeScript runs `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. This is a
genuinely clean record and it deserves to be said plainly: **nothing in this cycle was made green by
lowering a standard.**

### 6.2 CI has never run

```
$ gh run list --limit 20      # no output
$ gh pr list --state all      # no output
```

Zero workflow runs. Zero pull requests. Every "gates pass" claim in every handoff document is a
**local** run on the author's own machine, unreproduced by any independent system. The three-gate
pipeline is committed, well-written, and inert.

The reverse-verification requirement of checklist item **V-b** — "for each gate added this cycle,
inject a violation and confirm the pipeline goes red" — cannot be satisfied by a pipeline that has
never gone green.

### 6.3 Four of ten L1 gates exist

`.github/workflows/ci.yml` against `docs/14-quality-gates.md` §2:

| Gate | Present | Note |
|---|:---:|---|
| G1.1 format | yes | `prettier --check` |
| G1.2 lint | yes | `eslint`, plus custom platform rules |
| G1.3 typecheck | yes | `tsc --noEmit`, strict |
| G1.4 unit tests | yes | full suite, not `--onlyChanged` |
| G1.5 coverage + diff coverage | **no** | no coverage tooling configured at all; §3.1's 80% diff / 60% global / 90% core thresholds are unmeasured |
| G1.6 contract compatibility | **no** | no OpenAPI breaking-change check |
| G1.7 dependency audit | **no** | |
| G1.8 secrets scan | **no** | |
| G1.9 commit convention | **no** | commit style is in fact inconsistent: W1 used `docs(w1a):` Conventional Commits, W2 onward uses prose subjects |
| G1.10 skip / empty-test detection | **no** | currently clean by discipline, unenforced by machinery |

Two extra checks beyond the standard are present and worth keeping: platform guardrails against the
built artifact, and a regenerate-and-diff check on `app/minis.config.json`.

L2 (integration, smoke E2E, SAST, SCA, artifact budget, migration check, licence audit) and L3 are
entirely absent, which is schedule-appropriate — but so is G1.5, which is not.

---

## 7. Defects

Recorded, not fixed, per `docs/plan/wave-protocol.md` §4.1 rule 4.

| ID | Sev | Defect | Evidence |
|---|:---:|---|---|
| **D-01** | **P1** | **The bundle scan is fail-open for the elements it exists to ban.** `app/tools/bundle-scan.ts` only matches the `createElement("video", …)` call form, but the project builds React 19 with the automatic JSX runtime, which emits `jsx("video", …)` and never `createElement`. A reachable `<video>` therefore ships and the gate passes | §7.1 |
| **D-02** | **P2** | **The cover-URL allowlist has no caller, and the component that renders covers does not use it.** `checkCoverUrl` / `checkImageUrl` (69 tests) are invoked from nothing but their own tests. `CoverImage.tsx` on `w3-work-m` and `w3-work-o` passes `src` straight to `<img src>`. The two live on branches that conflict, so merging them will not wire them together by accident | `rg checkCoverUrl` finds only definitions, tests and prose; `git show origin/cursor/w3-work-m-9b99:app/src/components/CoverImage.tsx` |
| **D-03** | **P1** | **CI has never executed.** Trigger is `push: branches: [main]` + `pull_request`; the protocol forbids PRs and nothing reaches `main` | §6.2 |
| **D-04** | **P1** | **The contract has forked into five incompatible versions**, none a superset | §5.3 |
| **D-05** | **P1** | **The file-ownership rule was not applied.** Sixteen work slots ran where the protocol defines three per wave; at least eleven wrote to slot B's exclusive paths, producing seven trunk conflicts and nine pairwise conflicts | §5.4 |
| **D-06** | **P2** | **`SR-5` is specified but unenforced.** `docs/plan/media-plane-decision.md` §5.1 requires `setValidateVideoReplaceElement` to be a banned identifier whose presence fails the build. The string appears nowhere in `app/`, `server/` or `packages/` — including in the rule that is supposed to ban it | `rg setValidateVideoReplaceElement` → no matches |
| **D-07** | **P3** | **`docs/12-api-contracts.md` contradicts itself on unlock paths**, declaring both `{dramaId}`/`{id}` and both `{episodeId}`/`{id}` forms | §5.3 |
| **D-08** | **P2** | **The gate register exists in three incompatible forms** across three unmerged branches, with two numbering schemes | §8.2 |
| **D-09** | **P3** | **`main` is not identified as anything.** No document names the integration branch, states that `main` is empty, or defines who merges. `docs/plan/wave-protocol.md` §8 rule 3 says merging is the integrator's job without saying who that is or where they merge to | §1 |

### 7.1 D-01 in detail — reverse verification of the media-element guardrail

The trunk's own documentation calls the bundle scan "the strongest rule in the set (it sees what a
dependency contributed, which lint cannot)". `SR-1` requires that a fixture containing each banned
form be committed **and the build asserted to fail on it**. That assertion does not hold.

Performed in a throwaway worktree at `169e07c`; nothing was committed, and the worktree was removed.

Baseline: `pnpm check:guardrails` passes.

A `<video>` was added in a component and routed so it is genuinely reachable:

```tsx
export function Probe() {
  return <video src="https://cdn.example.invalid/rvprobe-marker.m3u8" controls />;
}
```

After `vite build`, the shipped chunk contains:

```
Rt.jsx("video",{src:"https://cdn.example.invalid/rvprobe-marker.m3u8",controls:!0})
```

Results:

| Layer | Verdict |
|---|---|
| `pnpm lint` (AST rule) | **caught** — correctly fails |
| `pnpm check:guardrails` (bundle scan) | **passed** — "platform guardrails passed" |

The identical result holds for `<iframe>`: marker present in the shipped bundle, guardrails pass.

Two further observations from the same probe. First, `bundle-scan.ts` lists only `video` and `iframe`
among the five elements `html-integrity.ts` forbids — `audio`, `object` and `embed` have no
bundle-layer rule at all. Second, the layer that does work is the lint AST rule, which by construction
cannot see into `node_modules`; the layer that was supposed to cover that blind spot is the one that
is fail-open. So the concrete unguarded scenario is exactly the stated rationale for the check: **a
dependency contributing a native media element would ship undetected**, and on TikTok Minis that is a
listing-blocking defect discovered during platform code scanning rather than in CI.

This is not a hypothetical severity. `SR-1` calls the no-native-media rule unconditional in both
resolutions of `GATE-8`; it is the rule the media-plane decision rests on.

**Fix direction (not applied):** match the emitted form (`jsx`/`jsxs`/`jsxDEV` with a quoted tag) in
addition to `createElement`, extend the element list to all five, and commit a fixture per banned form
that the suite asserts the scan rejects — the `SR-1` requirement that "a guardrail with no failing
fixture is unverified" is what would have caught this.

---

## 8. Blockers

### 8.1 Summary

| Blocker | Owner | Status | Blocks |
|---|---|:---:|---|
| Merge of sixteen branches | Integrator (undefined) | **open, worsening** | Everything. The only blocker fully inside the team's control |
| `GATE-8` BytePlus / VePlayer pilot | Business | `[ ]` not started | Descriptor payload at `CTR-009`; any real ingest, moderation or listing implementation |
| `GATE-7` EIS compliance review | Business | `[ ]` not started | Monetised EU/US launch. 15–30 US business days after submission, criteria unpublished |
| M0 official requirements PDF | User | `[!]` **blocking** | Any "requirements verified" terminal claim; pre-submission compliance sign-off |
| M1 account / org / credential triple | Business | `[ ]` | All real integration (C7) |
| M2 business verification | Business | `[ ]` | Monetisation (C8), submission |
| M3 industry qualification | Business | `[ ]` | Basic-information approval (C12) |
| M4 monetisation enablement | Business | `[ ]` | Beans, subscription, ads (C8) |
| M5 US launch approval + TPRM | Business | `[ ]` | US release |
| M6 partner / POC channel | Business | `[ ]` | On-device integration (C9); resolution of the webhook-signature question |
| Real TikTok login | Engineering, gated on M1 | not integrated | D4; every authenticated journey |
| Beans conversion rate | Business | **does not exist** | D7; all coin pricing |

**Nine of twelve blockers are business-track and none has moved.** `docs/00-wave-plan.md` §2 names the
business track as the longest chain in the project and says it must start earliest. Four waves in, no
milestone has left `[ ]`. Gate discipline rule 3 (`docs/plan/wave-protocol.md` §6) requires that a gate
with no movement for two consecutive cycles be escalated to a risk entry with an alternative; C1 is
one cycle, so the clock starts now, and C2 closing with the same table is the escalation trigger.

### 8.2 The gate register is itself fragmented (D-08)

Three documents, three branches, two numbering schemes, no agreement:

| Source | Scheme | Contents |
|---|---|---|
| `docs/00-wave-plan.md` §2 (trunk) | M1–M6 | six business milestones, no M0 |
| `docs/plan/wave-protocol.md` §6 (`w2-plan-p3-477e`) | M0–M6 | adds M0 (missing PDF), marked `[!]`. **Contains no `GATE-7` and no `GATE-8`** |
| `docs/plan/w1-conflict-register.md` §7 (`w2-plan-p1-0453`) | GATE-0…GATE-7, with GATE-3 unused | proposes `GATE-7` (EIS) |
| `docs/plan/media-plane-decision.md` §7 (`w2-plan-p2-media-plane-d4a6`) | GATE-8 | proposes `GATE-8`, explicitly "proposed, not applied" |

`GATE-7` and `GATE-8` are registered in the four-element form the project requires, by the slots that
own the analysis — but neither has been adopted into the authoritative table, because the authoritative
table lives on a third branch that was never merged with the other two. The two most consequential
external dependencies in the project are, formally, in no register.

### 8.3 `GATE-8` — BytePlus / VePlayer media plane

The question, per `docs/plan/media-plane-decision.md` §7: may this organisation use the platform media
plane at launch — pilot membership, whether `/v2/sg/shortdrama/*` accepts our `client_key`, whether the
`<video>` replacement behaviour is live and how it is scoped, and the switchover terms.

**Release condition:** a written answer from the account manager or the platform establishing either
pilot membership with a date, or non-membership with switchover terms. A device probe narrows it but
does not release it.

**Verified as correctly scoped.** The gate's "explicitly does not block" column claims the whole of
C1, and this slot checked that claim against what was built: nothing in the 51 trunk commits or the 57
off-trunk commits implements BytePlus ingest, moderation submission or listing. The standing default
`D-MP-1` (build MP-C: VePlayer-only client, no own-media path) is respected — the client contains no
native media element and no third-party player, and `app/tools/bundle-scan.ts` bans `hls.js`,
`videojs`, `shaka-player` and `dashjs`. The gate held during C1.

The distinguishing property recorded by P2 is worth carrying forward: `GATE-8` is the only gate whose
**unfavourable** resolution *creates* work rather than merely unblocking it. "Still open" is therefore
a materially different state here than for M1–M6, and the alternative (MP-B) should be priced before
it is needed rather than during a launch slip.

### 8.4 `GATE-7` — EIS

From 2026-08-08, all IAA and IAP Minis launching in the US or EU must pass the External Information
Sharing compliance review: **15–30 US business days** after submission, criteria unpublished, starting
from an account-manager questionnaire. IAA additionally draws a TPRM questionnaire; US launch draws a
separate USDS TPRM review.

Two properties make this the most schedule-dangerous item in the register. It is **long-lead and
opaque** — it cannot be compressed by engineering effort and its criteria cannot be read in advance.
And it is **upstream of contract signing, which is upstream of all of C8**. It also interacts with
`DM-6` (undefined analytics retention window and per-user deletion SLA), because retention is exactly
what an information-sharing review asks about, and with `X-03` (a privacy baseline hard-coded to PIPL
while the launch set excludes mainland China).

The launch-region decision (B-4) is still open and now determines whether EIS and USDS apply at all.
Documenting a first launch that excludes the EU and US is a legitimate release condition for this gate
and is currently the cheapest way to remove it from the critical path.

### 8.5 Beans conversion

`server/src/modules/unlock/trade-order-port.ts` carries `priceCoins` and performs **no conversion**,
deliberately:

> The platform charges Beans, and what a coin is worth in Beans is a pricing decision that does not
> exist yet — so this port carries the number we do have and no conversion.

This is the correct call: a rate invented in a type definition would bury a commercial decision in
code. But it must be recorded as what it is — **a missing business input, not a deferred engineering
task**. Every coin price in the domain model is currently unpriceable in the currency the platform
actually charges. The dependency chain is M2 + M4 → trade-order API access → observed Beans amounts →
rate → coin pricing → the entire unlock economy.

### 8.6 Real TikTok login

`POST /v1/auth/login` validates its input, refuses unsupported providers, distinguishes a rejected code
(401) from a provider fault (502), never logs the code, and keeps the client secret server-side. It
then calls a port that always refuses, so **no session has ever been issued**. The `open_id`-keyed user
record the domain model specifies does not exist; `w3-work-l-8551` adds an in-memory session-to-user
binding and is unmerged and conflicting.

Blocked on M1 for credentials and on M6 for a device. `docs/11-official-onboarding-checklist.md` D4
notes that platform code scanning specifically looks for a login implementation, so this is both a
functional and a listing dependency.

---

## 9. Targets for cycle 2

Ordered. The first item is a precondition for measuring anything else, and it is the only blocker
entirely within the team's control.

### Tier 0 — integration (must precede all new feature work)

1. **Name the integration branch and land it on `main`.** Decide whether `main` receives the trunk or
   whether a long-lived integration branch is adopted, write it into `docs/plan/wave-protocol.md` §8,
   and name the integrator. Closes D-09. Until `main` holds the product, R6 is decorative and CI is
   unreachable.
2. **Merge the sixteen off-trunk branches.** Suggested order, cheapest first: the four clean
   documentation branches (`w1-product-ia`, `w1-research-official`, `w1-technical-design-docs`,
   `w1-plan-p3-e16a`), then the three clean planning branches (`w2-plan-p1`, `w2-plan-p2`,
   `w2-plan-p3`), then the two clean documentation work slots (`w2-work-a`, `w2-work-b`), then the
   conflicting code branches in dependency order `w2-work-d` → `w2-work-h` → `w3-work-m` /
   `w3-work-o` → `w2-work-g` → `w2-work-j` → `w3-work-l`. Expect manual reconciliation in
   `server/src/app.ts`, `contracts/openapi.yaml`, `packages/shared/src/index.ts` and the two route
   tables. Closes D-04. Re-run `verify` after each merge, not at the end.
3. **Make CI run.** Add `push:` on the integration branch and on `cursor/**` so a slot branch is gated
   before it is merged rather than after. Closes D-03. Without this, step 2's result is unverified by
   anything but a human.
4. **Restore the file-ownership rule.** Three work slots per wave with the A/B/C boundaries
   `docs/plan/wave-protocol.md` §3.1 already defines, or an explicit written amendment if sixteen
   parallel slots is the intended model — in which case the conflict-resolution protocol has to be
   designed rather than discovered. Closes D-05.

### Tier 1 — close the C1 exit conditions

5. **Fix the bundle scan (D-01)** and commit a failing fixture per banned form, per `SR-1`. Extend to
   all five elements. Add the `SR-5` banned identifier (D-06).
6. **Reconcile the contract to one document** and reverse-verify the L1 gates that exist, per V-b.
7. **Add G1.5 coverage** with the §3.1 thresholds and the ratchet. It is the only missing L1 gate that
   is purely local work, and every cycle it is absent is a cycle whose coverage claim is unmeasured.
8. **Adopt `GATE-7` and `GATE-8` into one authoritative register (D-08)**, reconciling the M-scheme
   and the GATE-scheme into one.

### Tier 2 — product, once integration holds

9. Wire the cover allowlist into the catalogue read path and into `CoverImage` (D-02).
10. Persistence: the domain model's tables and migrations, and seed data at the scale
    `docs/00-wave-plan.md` W7 requires (≥2 dramas, ≥80 episodes). Everything today is in-memory.
11. The missing monetisation client surface: wallet, recharge, unlock panel, episode picker — 0 of 5
    panels exist and they are the interaction core of the product.
12. Capsule avoidance and navigation-bar colour (D9), which every screen owes and no screen has.

### Tier 3 — business track, starting immediately and in parallel

13. **Establish the account-manager relationship.** It is the single release condition for `GATE-8`
    and the entry point for `GATE-7`, and it gates M1, M4 and M6 behind it.
14. **Open the EIS conversation and decide the launch region set (B-4).** Excluding the EU and US from
    the first launch is a legitimate way to release `GATE-7` and is currently the cheapest.
15. **Obtain the official requirements PDF (M0).** Four waves have now been built against public web
    sources S1–S15 with a zero-rework assumption that nobody has been able to test.
16. **Get a Beans amount observed against a real trade order**, so coin pricing can exist.

---

## 10. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | Verdict | Basis |
|---|---|:---:|---|
| **V-a** | Is every task's acceptance criterion reproducibly met? | **Not passed** | Per-slot criteria are met on their own branches (§5.2); the cycle-level C1 criteria are not (§0). No assembled artifact exists to evaluate the cycle against |
| **V-b** | Is CI actually catching things? | **Not passed** | CI has never run (§6.2). Of the gates that exist, one was reverse-verified by this slot and is fail-open (§7.1) |
| **V-c** | Are there skipped, deleted or weakened tests or gates? | **Passed** | Zero skips, zero suppressions, zero threshold reductions across all 31 branches (§6.1). The cleanest area of the cycle |
| **V-d** | Are documents and code consistent; do cross-references resolve? | **Not passed** | Contract-to-doc divergence (§5.3), doc 12 self-contradiction (D-07), three incompatible gate registers (D-08), a documented guardrail that does not hold (D-01), a specified guardrail that does not exist (D-06) |
| **V-e** | Are gate and blocker states honestly written back? | **Passed** | This is the cycle's strongest result. Every gate is `[ ]` or `[!]` and none is dressed up. Handoffs carry explicit "deliberately not built" and "known gaps in this slot's own work" sections. `docs/handoff/w4-work-p.md` §5 and §8 register the unknown image host, the unproven device behaviour and the absence of a caller without being asked. No slot claimed a real integration on the strength of a mock |

---

## 11. Closing note

Two things are true at once and both should be carried into C2.

The engineering discipline in this cycle is high. Fail-closed ports throughout, no suppressions
anywhere, more test lines than source lines, reverse verification practised voluntarily by at least one
slot, and handoff documents that argue against their own work. The `V-c` and `V-e` results are earned.

And none of it is assembled, none of it is gated by anything but its author, and the one guardrail this
slot independently probed turned out not to hold. Sixteen branches of careful work that has never been
compiled together is not sixteen branches of progress until it is merged — and each additional parallel
slot raises the cost of the merge that has not happened yet. The C2 plan wave should treat §9 Tier 0 as
the whole of its first implement wave, and should resist opening a new epic until `main` holds the
product and CI has gone green on it at least once.
