# Cycle 3 — Independent Verification Report (Wave 15)

> **Slot:** W15, independent verifier for cycle C3 (waves W11–W15), per `docs/plan/wave-protocol.md`
> §4 — verification waves are `5k`, so W5 verified C1, W10 verified C2, and W15 verifies C3.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w15-verify-cycle-3-72c4`, cut from `origin/main` and advanced onto `main`'s
> tip so every cross-reference in this report resolves against the tree it describes.
> **Mandate:** record what is true. This slot did not implement product features, did not modify any
> source file to make a check pass, did not delete, skip or weaken a test, and did not rewrite any
> origin branch. Reverse-verification mutations were applied in this working tree, observed, and
> restored with `git checkout`. The only file added is this one. No pull request.
> **Method:** every claim is re-derived from a clean checkout with the command quoted next to it, per
> `docs/plan/wave-protocol.md` §4.1 rule 3. Where a handoff or the W14 plan asserts a result, the
> result was re-run rather than accepted — including wallet fail-closed, VePlayer replace, the
> source-rule identifier ban, and a reachable native `<video>`.
> **Predecessor:** `docs/verify/cycle-2-report.md`, verdict **not passed**. Its defects `D-01`…`D-15`
> are individually re-tested in §7.1–§7.2; new defects continue the numbering at `D-16`.
> **In-flight at start (not waited on):** cycle-4 plan `bc-f66ea104`, client remainder `bc-05cba7a1`.
> Both landed while this report was being written. Postscript §13.

---

## 0. Verdict

**Not passed**, against the C3 exit standard in `docs/plan/wave-protocol.md` §5.1, and **not passed**
as a C3-backlog close either — even though this is the largest engineering increment the project has
produced in a single cycle, and even though most of the *buildable* C3-backlog items now hold on
`main`.

C3's stated theme is 读路径闭环 (Mock): auth closure, catalogue / detail / episodes, playback token
and `viewerAccess` enforcement, player skeleton. Its three exit conditions:

| C3 exit condition | Status | Why |
|---|---|---|
| Mock 登录 E2E 通过 | **Partially met** | The mock path is real and honest: `createMockIdentityPort` behind `testLoginEnabled`, silent re-login on `401` (`C3-01`), identity + recovery suites green. There is still no Playwright / G2.3 smoke, and D4 stays `[ ]` until a device (§3.1, §8.3) |
| 锁定集在连播/深链/切集三入口均被**服务端**拦截 | **Not met** | The server gate exists and is tested (`POST /v1/playback/sessions` → `403 EPISODE_LOCKED`, 48 route tests). **No product client calls it.** `PlayPage` still plays a six-item `ep_demo_*` / `vid_demo_*` album. Deep link, next-episode, and picker navigation never mint a session. A locked catalogue episode is playable on the demo player. **D-16** |
| 等价 WebView 宿主的 MSE/EME 探测结论回写 | **Not met** | `docs/plan/backlog.md` `PLY-002` is still `[ ]`. Public-source MSE notes from C1 research are not a C3 equivalent-WebView probe. `PLY-003` remains gated on M1 |

Zero of three fully met; one partial.

The C3 backlog (`docs/plan/cycle-3-backlog.md`, the running-count document W11 wrote) is in better
shape than the protocol exits: **C3-01, C3-02, C3-05 (wired), C3-06 (sqlite + seed), C3-07** close
on this tree; **C3-03** closed as a filing; **C3-04** split (PNL-01 + SCR-09 in, SCR-10/11 still
blocked); **C3-08 / C3-09** correctly still open (AM-blocked, no dates invented); **C3-10** closed
for CoverImage and for a fail-closed *installer*, not for the letter of "banned identifier in the
bundle scan"; **C3-11** still open. Scorecard in §9.

Two facts decide the verdict independently of the backlog scorecard:

1. **The C3 theme's own enforcement point is unwired on the client (D-16).** A cycle whose exit is
   "locked episodes intercepted at three entries" cannot pass while the player plays a fixture
   album and never asks the server.
2. **GitHub Actions cannot start jobs on this account (D-17).** Every `main` run since ~20:12 UTC
   failed in 4 seconds with empty steps: billing / spending limit. Local `pnpm verify` is green
   (2,695 tests). Iron rule R6 is currently unverifiable from CI, which is a different anti-signal
   from C2's flake (D-10, now closed).

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the next plan wave must schedule
remediation as top priority and implement waves may not open a **new epic** until re-verification
passes. W14 already wrote `docs/plan/cycle-4-backlog.md` during this slot; it **did not** open
protocol-C4 播放体验 (its P-02), which is the right reading of §4.3. D-16 is not on that list and
should be.

AM-blocked items (C3-08, C3-09, GATE-7, GATE-8, M0–M6) remain **open / unknown**. No EIS date, no
BytePlus ingest date, no Beans rate, and no partner-approval date is recorded here.

---

## 1. The headline finding: C3 built the foundations C2 skipped, and left its own gate unwired

Both halves matter.

C2's headline was that the cycle delivered C3's read-path while C2's data layer, L2, and seed floor
sat at zero, and that `main` was red on a flake. That engineering debt is largely paid:

```
$ git rev-parse --short origin/main
1a6c5d6
$ ls server/migrations | wc -l
14          # 0001–0007, each with .up.sql and .down.sql
$ rg SEED_LISTED_EPISODE_FLOOR server/src/modules/catalog/fixtures.ts
export const SEED_LISTED_EPISODE_FLOOR = 80
$ ls .github/workflows/
ci.yml  l2.yml
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0 — 2,695 tests across 166 files
```

Search reads the sqlite catalogue (`createCatalogDramaDirectory(catalogStore)` over `0007`), not a
second table. Unset `DATABASE_URL` stays in-memory; `postgres://` is refused at boot. That is C2's
first two exits, plus the start of the third, delivered in C3.

And then the player:

```
$ rg -n 'playback/sessions' app --glob '!**/*.test.*'
app/src/routes/PlayPage.tsx:21: * that switching exists at all. `POST /v1/playback/sessions` replaces it
```

One hit, a comment. `DEMO_ALBUM_ID = 'album_demo_0001'`, six `vid_demo_*` rows, `useMemo(demoPlaylist)`.
Picker cells navigate to `#/play/:episodeId` with real catalogue ids; the retained instance still
plays the demo album. The entitlement decision the cycle exists to enforce is a server route the
client does not call.

---

## 2. Repository topology

C2 closed with one unmerged branch (D-12, later closed in that report's postscript). C3 closes with
one again:

```
$ for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/cursor); do
    git merge-base --is-ancestor "$b" origin/main || echo "UNMERGED $b"
  done
UNMERGED origin/cursor/w13-work-c3-remain-72c4
```

**One branch, seven commits**, +1,170 / −31 across 18 files. It adds `GET /v1/wallet/transactions`
as a fail-closed empty ledger. The client has called that path since the wallet UI slot; on `main`
the not-found handler answers `404` and the screen treats that as unavailable. Honest, and not the
served empty page the remain branch wrote. Recorded as **D-18**. Not merged here — §8 rule 3, and
this is a verify slot.

Cycle-4 plan (`cursor/w14-plan-cycle-4-2e9b`) and client remainder
(`cursor/w13-work-client-remain-72c4`) are ancestors of `1a6c5d6`.

### 2.1 Cycle labelling is still two schemes (D-13 / X-21)

Unchanged. Protocol arithmetic: C3 = W11–W15, this slot is the C3 verify wave. Running count: W9
called itself C3, W11 wrote `cycle-3-backlog.md`, W14 wrote `cycle-4-backlog.md` during C3's third
implement wave. W14 registered X-21 again and did not amend §2. Still P3's.

---

## 3. Maturity

### 3.1 Mandatory platform capabilities (D4–D9)

```
$ rg -n "getMenuButtonRect|setNavigationBarColor|showRewardedAd|showInterstitialAd|createSubscription" \
     app/src --glob '!src/platform/**' --glob '!**/*.test.*'
$ rg -n "\.login\(|\.pay\(" app/src --glob '!src/platform/**' --glob '!**/*.test.*'
```

| # | Capability | C2 | C3 | Evidence |
|---|---|:---:|:---:|---|
| D4 | Silent login | mock-integrated | **mock-integrated + mid-visit recovery** | Boot + `session-recovery.ts` on `401`. Real port still refuses. Checklist `[ ]` until a device |
| D5 | Rewarded video ad | not started | **not started** | no product caller |
| D6 | Interstitial ad | not started | **not started** | no product caller |
| D7 | Beans one-off | client wired, server refuses | **unchanged** | `bridge.pay` exists; trade-order port still `createUnavailableTradeOrderPort()`. No rate |
| D8 | Subscription | probe only | **probe + fail-closed VIP card** | `canIUse('createSubscription')` still a probe. SCR-06 card states status cannot be read; Subscribe is disabled; no `#/vip` |
| D9 | Nav bar / capsule | not started | **wired, not device-run** | `app/src/chrome/Chrome.tsx` is the only product call site. Missing rect → 96px, never `0`. Checklist `[ ]` (honesty, §8 rule 6) |

**D9 is no longer the cheapest unblocked item that nobody started.** It is wired. D4's client half
moved from "boot only" to "boot + refused-token recovery". D5/D6/D7/D8 last steps are still
AM-blocked.

### 3.2 Screens and panels

| | C2 | C3 (`1a6c5d6`) |
|---|:---:|:---:|
| Screens | 8 of 13 | **10 of 13** — home, browse, search, drama, play, me, history, favorites, wallet, settings, fallback. Missing: SCR-01 splash, SCR-10 recharge, SCR-11 VIP |
| Panels | 1 of 5 | **2 of 5** — PNL-02 unlock, PNL-01 episode picker |

SCR-06 now has a fail-closed VIP *card* (not SCR-11). SCR-10 remains a disabled control on the
wallet screen. `#/recharge` and `#/vip` still do not exist.

`app/src/routes/routes.ts` declares eleven named routes (home, browse, search, drama, play, me,
history, favorites, wallet, settings, fallback).

### 3.3 Server surface and OpenAPI lockstep

```
$ rg -c '^  /' contracts/openapi.yaml
19
$ rg -c '^    (get|post|put|patch|delete):' contracts/openapi.yaml
22
```

Nineteen paths, twenty-two operations. Added since C2: `GET /v1/wallet`,
`GET /v1/progress/dramas/{dramaId}`. `server/src/contract.test.ts` still asserts **both directions**:
documented ⇒ routed (not 404/405), routed ⇒ documented. Sample path parameters fail the suite if a
new templated path has none.

`GET /v1/wallet/transactions` is **not** in the live document. The client probes it. **D-18.**

Doc 12 still contradicts itself on unlock paths (D-07) and still declares ~40 endpoints against 22
operations (D-11). Unmeasured as a table.

### 3.4 Persistence — C2's first exit, now met on sqlite

Seven paired migrations, one shared sqlite file when `DATABASE_URL=sqlite:<path>`:

| # | Migration | Store |
|---|---|---|
| 0001 | `unlocks` | receipts a bounce must not wipe |
| 0002 | `sessions` | bearer still identifies the viewer |
| 0003 | `webhook_events` | redelivery still a duplicate |
| 0004 | `unlock_orders` | in-flight payment still matches |
| 0005 | `watch_progress` | completed mark survives |
| 0006 | `favorites` | heart survives |
| 0007 | `catalog` | storefront does not revert to seed |

Search is `createCatalogDramaDirectory` over that catalogue, not `0008`. Restart tests exist per
store (`durable-*.test.ts`) and each refuses a `postgres://` URL. `migrate.test.ts` applies all
seven up, rolls back, and asserts `INSERT` then fails with `no such table`.

Unset `DATABASE_URL` still selects every `createInMemory*` implementation — eight in-memory modules
remain, as the default for tests. That is configuration, not a silent file write.

**Not T14.** PostgreSQL is still the named production target and is still refused. Redis is not
read. G2.7 (migrations as a CI *job*) is not in `l2.yml`.

Seed: `SEED_LISTED_EPISODE_FLOOR = 80`, `SEED_PUBLISHED_DRAMA_FLOOR = 2`. Sweet Trap is the 80-episode
volume drama (`paidRun(1, 80, 50)`). Delisted / unpublished / offline-season / free-window fixtures
are preserved. No BytePlus ids. Floor is met.

### 3.5 Overall maturity judgement

The project has moved from **C2's "C3 content on C1 foundations"** to **an assembled mock
application with a durable sqlite slice, a second CI workflow, and most listing-bar screens**. That
is a category change on the data layer, which is what C2 asked for.

What it is not: it is not a player that asks the server for a session; it is not PostgreSQL; it is
not L2 beyond G2.8; it has no coverage gate; it has never run on a device; GitHub cannot currently
start its own jobs. Against the twelve-cycle map, the honest position is "C3's read-path and C2's
sqlite foundations, with C3's playback-enforcement exit still a comment."

---

## 4. Increment against cycle 2

Every C2 number is from `docs/verify/cycle-2-report.md` at `67cac3b` / postscript `34ff263`. Every
C3 number was measured on `origin/main` at `1a6c5d6`.

| Measure | C2 | C3 | Change |
|---|---:|---:|---|
| `main` commits / files | 197 / 383 | **343 / 538** | +146 / +155 |
| Unmerged `cursor/*` tips | 1 (then 0) | **1** | D-18 |
| Test files | 114 | **166** | +52 |
| Tests | 2,137 | **2,695** | **+558** |
| Source lines (ts/tsx, non-test) | 17,910 | 23,333 | +30% |
| Test lines | 24,166 | 31,580 | +31% |
| Contract paths / operations | 17 / 20 | **19 / 22** | +2 / +2 |
| CI on `main` at HEAD | red (flake) | **jobs do not start (billing)** | different R6 failure |
| L1 gates present | 4 of 10 | **4 of 10** | G1.5 still absent |
| L2 gates present | 0 of 8 | **1 of 8** (G2.8) | first L2 job |
| Migrations | 0 | **7 pairs, reversible in tests** | C2 exit 1 |
| Seed listed episodes | 27 | **≥ 80** (floor asserted) | C2 exit 2 |
| Screens | 8 of 13 | **10 of 13** | +browse, +wallet, +settings |
| Overlay panels | 1 of 5 | **2 of 5** | +PNL-01 |
| D4–D9 with a product call site | 2 of 6 | **3 of 6** (D4, D7, D9) | +D9 |
| C1 P1 defects still open | 2 | **0 as originally scoped** | D-05 remains paper |

Test-to-source line ratio is 1.35, the same as C2. Volume did not come from thinning the suite.

---

## 5. Evidence

### 5.1 `main` verifies clean locally at `1a6c5d6`

```
$ git rev-parse HEAD
1a6c5d699d4ff8a698f7cc0cf649a79687a0b048
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0
```

`verify` = `format:check` → `lint` → `typecheck` → `test` → `build` → `check:guardrails`. First try
on this SHA, no retry. Also `pnpm run check:licenses` → `license whitelist passed (312 packages)`.

| Package | Test files | Tests |
|---|---:|---:|
| `packages/shared` | 6 | 55 |
| `packages/config` | 3 | 45 |
| `packages/quality` | 2 | 37 |
| `server` | 80 | 1,594 |
| `app` | 75 | 964 |
| **Total** | **166** | **2,695** |

0 failed, 0 skipped. Build emits `dist/assets/index-CFYsMFzN.js`, 337.44 kB (102.92 kB gzipped).
Matches the client-remainder handoff's headline counts.

First local run in this slot was against `5598aba` (2,691 tests, app 960); `1a6c5d6` added the four
VIP-card tests. Same gate sequence, same exit 0.

### 5.2 `main` does not verify on GitHub (D-17)

```
$ gh api repos/Dawan2/minidrama/actions/runs/33116028119/jobs
# job "verify", conclusion failure, steps: [], duration 4s
$ gh api repos/Dawan2/minidrama/check-runs/98670789473/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

Last *successful* CI on `main`: run [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165)
at `2aea931` (PNL-01 merge), 2026-08-27T20:12:42Z, 2m44s. Everything after that — durable stores,
D9, browse, settings, search, VIP card, cycle-4 docs — has a 4-second billing failure, not a test
result. Local green does not substitute for the gate. R6 is currently unverifiable from CI.

This is not D-10. D-10 was a real test that failed under load. D-17 is the runner refusing to start.

### 5.3 Reverse verification of claimed C3 fixes

Performed on `1a6c5d6` / `5598aba` (same product files for these paths); mutations restored;
nothing committed.

**Wallet fail-closed (C3-04 / C3-09 leak).** `toWalletView` on `UNAVAILABLE` was changed to
`{ coinBalance: 0, bonusBalance: 0, totalBalance: 0 }`.

```
FAIL  src/modules/wallet/view.test.ts > toWalletView > omits every balance field when the platform named nothing
AssertionError: expected { coinBalance: +0, …(2) } to deeply equal {}

FAIL  src/modules/wallet/routes.test.ts > GET /v1/wallet — signed in, no platform figure
      > answers 200 with the balance fields omitted, which is not zero
```

2 failed / 23 passed in those files. An invented zero is exactly the number M16 forbade. **Holds.**

**VePlayer replace (C3-10 / SR-5 installer).** `refuseVideoReplace` was changed to `return _videoEl`.

```
FAIL  refuseVideoReplace > refuses to customize for replaceReason "native-html-video"
AssertionError: expected { nodeName: 'VIDEO', tagName: 'VIDEO' } to be null
```

9 of 19 tests failed, including "the installed callback still returns null when the SDK later
invokes it". A callback that kept native video on screen would have passed every other suite.
**Holds.**

**Identifier ban outside the installer.** `PlayerSurface.tsx` gained
`void (globalThis as { setValidateVideoReplaceElement?: unknown }).setValidateVideoReplaceElement`.

```
FAIL  tools/source-rules.test.ts > accepts the source tree that ships in this repository
rule: "setValidateVideoReplaceElement may only be installed from src/platform/video-replace.ts"
file: src/player/PlayerSurface.tsx
```

**Holds** for source-rules. It does **not** hold as a bundle-scan identifier ban: `bundle-scan.ts`
has no such pattern, and `bundle-scan.test.ts` explicitly leaves
`n.setValidateVideoReplaceElement(function(e,r){return null})` alone. W14's line "banned in
source-rules **and bundle-scan**" is false on the second half. The VePlayer handoff said so on
purpose. Recorded with C3-10 in §9, not as a regression of the installer.

**Native `<video>` (D-01 successor, still the strongest gate).** A valid
`<video src="hostile.mp4" />` was inserted as the first child of `FallbackPage`'s `<main>`:

| Probe | Result |
|---|---|
| ESLint | **fails**, `no-restricted-syntax`, "Native media and frame elements are prohibited" |
| `import-hygiene.test.ts` | **fails**, names `FallbackPage.tsx` |
| `vite build` | succeeds (the compiler does not care) |
| `pnpm check:guardrails` | **fails**, exit 1: `bundle dist/assets/index-Dh1QOjVX.js  no <video> element` quoting `f.jsx("video",{src:"hostile.mp4"})` |

The shipped-chunk form is the React 19 automatic runtime C1's scan missed. It is caught. Restored;
clean rebuild re-emitted `index-CFYsMFzN.js`. **Holds.**

### 5.4 The iron rules

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | 114 → 166 files, 2,137 → 2,695 tests, monotonic | **clean** |
| R3 no skipped tests | `rg '\.skip\(|\.only\(|it\.todo\(|test\.todo\('` over `app server packages` (excluding the `process.exit` false-positive on `xit(`) | **clean** |
| R4 no weakened standards | `eslint-disable` / `@ts-ignore` | **3 matches**, all `no-script-url` in tests naming a refused `javascript:` scheme (`covers.test.ts`, `catalog/routes.test.ts`, `CoverImage.test.tsx`). C2 had 2; CoverImage added the third for the same reason. Not a weakening |
| R5 no empty tests | sampled `video-replace.test.ts`, `wallet/view.test.ts`, `contract.test.ts`, `migrate.test.ts`, `capsule-inset.test.ts` | behavioural; contract is bidirectional; migrate asserts reverse-insert |
| R6 `main` releasable | local verify green; GitHub jobs do not start | **split — D-17** |

TypeScript still `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No
`continue-on-error` in either workflow.

---

## 6. Gate enforcement

### 6.1 L1 — four of ten, still, plus the extras

`.github/workflows/ci.yml` vs `docs/14-quality-gates.md` §2:

| Gate | C2 | C3 | Note |
|---|:---:|:---:|---|
| G1.1–G1.4 | yes | yes | format, lint, typecheck, unit tests |
| G1.5 coverage | no | **no** | `rg coverage` over workspace `package.json` → no scripts. C3-11 / C4-01 |
| G1.6–G1.10 | no | **no** | unchanged |
| Platform guardrails | extra | extra | reverse-verified this slot (§5.3) |
| Generated `minis.config.json` | extra | extra | still a regenerate-and-diff step |
| `workflow_dispatch:` | no | **no on L1** | present on L2 only |

`ci.yml` is still the L1 sequence. It was not folded into L2.

### 6.2 L2 — one of eight

`.github/workflows/l2.yml` exists. Job `licenses` (G2.8). `workflow_dispatch:` present. No
`continue-on-error`. Reverse-verified by the package's own CLI fixtures (GPL store → exit 1;
missing store → exit 1). Live install: 312 packages, green locally.

Absent as jobs: G2.2 integration, G2.3 smoke E2E, G2.4 SAST, G2.5 SCA, G2.6 artifact budget,
G2.7 migrations. G2.7 is now *cheap* — the runner and the reverse-insert tests exist — and is
not a CI job. C4-02 names it.

### 6.3 Reverse verification (checklist V-b)

| Gate | Reverse-verified this slot? |
|---|---|
| Platform guardrails / native `<video>` | **yes** (§5.3) |
| VePlayer fail-closed replace | **yes** (§5.3) |
| Source-rule identifier scope | **yes** (§5.3) |
| Wallet omit-not-zero | **yes** (§5.3) |
| G2.8 licenses | **yes**, via committed CLI fixtures; live scan green |
| G1.1–G1.3 | no new injection |
| G2.7 | tests exist; no CI job to inject against |

---

## 7. Defects

Recorded, not fixed, per §4.1 rule 4.

### 7.1 Cycle 1's nine defects, re-tested

| ID | C1→C2 | C3 | Evidence |
|---|:---:|---|---|
| **D-01** bundle scan fail-open | Fixed | **Still fixed** | Independent `<video>` in `FallbackPage` failed lint, import-hygiene, and `check:guardrails` on the shipped `jsx("video",…)` form (§5.3) |
| **D-02** cover allowlist no caller | Fixed (server `views.ts`) | **Also wired at `<img>`** | `CoverImage.tsx:49` `checkCoverUrl(src)`. Product call site exists. C3-10 acceptance 2–3 |
| **D-03** CI never executed | Fixed | **Regressed as D-17** | Pipeline exists and used to run; it currently cannot start jobs |
| **D-04** contract forked | Fixed as a fork | **Lockstep holds** | 19/22, bidirectional `contract.test.ts`. Parity with doc 12 remains D-11 |
| **D-05** file-ownership | Partial | **Unchanged on paper** | Slot count is protocol-shaped; A/B/C path boundaries still not restored or amended (T1-5) |
| **D-06** SR-5 unenforced | Open | **Installer closed; identifier-in-bundle still open** | `video-replace.ts` + source-rules. Bundle scan does not ban the identifier (§5.3, §9 C3-10) |
| **D-07** doc 12 unlock paths | Open | **Open, unchanged** | Line 46 `{id}` vs lines 214/229 `{episodeId}` / `{dramaId}` |
| **D-08** three gate registers | Open | **Partially closed** | `wave-protocol.md` §6.1 is authoritative. Conflict register and media-plane decision still propose rather than point (C3-03 remainder) |
| **D-09** integrator unnamed | Paper open | **Paper closed** | §8 rule 3 names `main`. D-17 is a different problem |

### 7.2 Cycle 2's six new defects, re-tested

| ID | C2 | C3 |
|---|---|---|
| **D-10** flake class / red `main` | P1 open | **Closed as a test defect.** `renderSettled` / `settle` in `app/src/testing/render.tsx`; paging tests converted. This slot did not re-run CPU saturation; the structural twins C3-02 named are on `act`. `main` is dark for a different reason (D-17) |
| **D-11** contract parity unmeasured | P2 open | **Open.** 19/22 vs doc 12's ~40. No parity table. C4-01 |
| **D-12** unlock-grant branch unmerged | Closed in C2 postscript | **Stays closed** |
| **D-13** cycle-label drift | P2 open | **Open.** X-21. W14 recorded it, did not amend §2 |
| **D-14** `o("video",p)` residual | P3 open | **Open.** Our build still emits literal props objects. Not re-probed as a new injection this slot |
| **D-15** gate status never written back | P3, escalation fired | **Closed as a filing** (W13). The *gates* have not moved. §6.2 of that writeback is already stale (**D-19**) |

C2 exit conditions re-scored (not a C2 pass — that remains W10's verdict plus this delta):

| C2 exit | W10 | This tree |
|---|---|---|
| Migrations forward + rollback | Not met | **Met in tests** on sqlite. Not a G2.7 job |
| Seed ≥2 dramas / ≥80 episodes | 8 / 27 | **Met** (floor 80, longest-run test) |
| L2 all green and reverse-verified | Not met | **1 of 8** (G2.8), reverse-verified |
| traceId end to end | Met | **Met**, plus request-id JSON logs and redact |

### 7.3 New defects

| ID | Sev | Defect | Evidence |
|---|:---:|---|---|
| **D-16** | **P1** | **The player never calls `POST /v1/playback/sessions`.** Deep link, next-episode, and picker switch play a demo album. C3's second exit is unmet. Server intercept is real and unreached | §1, `PlayPage.tsx` `demoPlaylist()`, `rg playback/sessions app` → comment only |
| **D-17** | **P1** | **GitHub Actions will not start jobs.** Billing / spending-limit annotation; empty `steps`; 4s failure on every `main` and `cursor/**` run after `2aea931`. Local verify cannot be corroborated | §5.2 |
| **D-18** | P2 | **`GET /v1/wallet/transactions` is a client probe against a 404.** Server route + OpenAPI live on unmerged `cursor/w13-work-c3-remain-72c4`. Lockstep holds on `main` only because the path is absent from both sides of `contract.test.ts` | §2, `wallet-api.ts` `WALLET_TRANSACTIONS_PATH` |
| **D-19** | P2 | **`wave-protocol.md` §6.2 still says "no database, 27 seed episodes, no CI L2"** (writeback at `a6c04d3`). That sentence is false on `1a6c5d6`. The register froze again inside the same calendar day | §6.2 of that file vs §3.4 here |

W14's C3-10 "closed, banned in the bundle scan" is a plan-slot overclaim, not a product defect. The
installer is the intended design. Do not "fix" it by failing the build for naming the method that
keeps replacement fail-closed.

---

## 8. Blockers

### 8.1 Summary

Partner answers are **unknown**. None is invented. Questions remain in `docs/gates/open-questions.md`.

| Blocker | Owner | C2 | C3 | Blocks |
|---|---|:---:|:---:|---|
| Client playback session wiring | Engineering | n/a | **open, new (D-16)** | C3 exit 2; any claim that locked episodes cannot play |
| GitHub Actions billing | Account / ops | n/a | **open, new (D-17)** | any use of CI as a gate on `main` |
| G1.5 / L1 `workflow_dispatch:` / D-07 | Engineering | open | **open (C3-11)** | measured coverage; re-run without empty commit; doc 12 |
| L2 G2.2–G2.7 | Engineering | open | **G2.8 only** | C2 L2 exit |
| T14 PostgreSQL | Engineering | open | sqlite slice only | named production DB |
| `GATE-8` BytePlus / VePlayer | Business | `[ ]` | `[ ]` **no movement** | ingest, listing, catalogue `vid` |
| `GATE-7` EIS | Business | `[ ]` | `[ ]` **no movement** | monetised EU/US launch |
| M0 official PDF | User | `[!]` | `[!]` **no movement** | "requirements verified" |
| M1 credentials | Business | `[ ]` | `[ ]` | real login last step (C3-08) |
| M2 / M4 | Business | `[ ]` | `[ ]` | Beans rate (C3-09), ads, recharge |
| M3 / M5 / M6 | Business | `[ ]` | `[ ]` | listing, US, device |
| Beans conversion rate | Business | missing | **missing** | D7 pricing; SCR-10 |

**Nine business-track blockers, four cycles, zero external evidence.** W13 filed the questions and
the rule-3 alternatives. Filing is not answering. This slot did not fill a date.

### 8.2 `GATE-8` held again, as engineering

No BytePlus ingest, moderation, or listing implementation. Bundle scan still bans `hls.js`,
`videojs`, `shaka-player`, `dashjs`. Native `<video>` still fails the build (§5.3). The fail-closed
replace installer is **not** a GATE-8 release (`wave-protocol.md` §6 discipline rule 4). Catalogue
fixtures still have no `vid` / `albumId`. **No ingest date is recorded.**

### 8.3 Real login, still the last step

`createTiktokIdentityPort` still returns `PROVIDER_UNCONFIGURED` or `PROVIDER_UNAVAILABLE`. Mock
login still requires the sentence `yes-i-am-a-non-production-test-deployment` and a
`test`/`development` `NODE_ENV`. Silent re-login does not synthesise an `open_id`. D4 stays `[ ]`.

### 8.4 Beans conversion, still not an engineering close

```
$ rg -n 'beansPerCoin|coinToBeans|BEANS_RATE|beansRate' app/src server/src packages --glob '!**/*.test.*'
packages/shared/src/wallet.ts:43–46   # rejected keys on the type, not a rate
```

No product rate. `trade-order-port.ts` still carries `priceCoins` only. Wallet recharge copy still
says prices have not been set. **Q-G-7 unanswered.**

---

## 9. C3 backlog scorecard

Re-derived at `1a6c5d6`. W14's table at `5598aba` is the same on these rows except the VIP card,
which does not close SCR-11.

| ID | Verdict | Evidence |
|---|---|---|
| **C3-01** silent re-login | **Closed** | `session-recovery.ts`; transports drop **and** re-acquire; no POST replay; budget not refilled by login success. Suites: `session-recovery.test.ts` 18, `transports.test.ts` 13 |
| **C3-02** paging tests | **Closed** | `renderSettled` / `settle`. Remaining `findByTestId` clicks are one-round (sign-in, retry, unlock-confirm), which C3-02 said to leave |
| **C3-03** gate register + escalation | **Closed as filing** | §6.1 has GATE-7 / GATE-8 with four elements; §6.4 escalations exist; Q-G-1…Q-G-9 unknown. Pointers from P1/P2 files still missing. Gates themselves `[ ]` |
| **C3-04** wallet surface | **Split** | PNL-01 and SCR-09 + `GET /v1/wallet` on `main`. Reverse-verified omit-not-zero. SCR-10 disabled. SCR-11 no contract. SCR-06 VIP card is a statement, not the screen. Transactions: D-18 |
| **C3-05** D9 | **Closed as engineering** | `Chrome.tsx` + `capsule-inset.ts`. Missing rect is fallback 96, never 0. Device `[ ]` |
| **C3-06** durable stores + seed | **Closed for the named sqlite slice and the floor** | 0001–0007; search over 0007; seed ≥80; restart tests; postgres refused. T14/T15/T16 and G2.7-as-job remain |
| **C3-07** favourites projection | **Closed** | `items[].drama: DramaSummary \| null`; client types re-export shared; `favoritedAt` widened on purpose |
| **C3-08** real login | **Open, AM-blocked** | Last HTTP exchange. No synthesised `open_id` |
| **C3-09** Beans rate | **Open, AM-blocked** | No rate in types. Reverse-verified that an invented zero fails |
| **C3-10** SR-5 + covers | **Closed for CoverImage and the installer; not for bundle-scan identifier ban** | §5.3. Do not ban the installer call |
| **C3-11** G1.5, `workflow_dispatch:`, D-07 | **Open** | C4-01 |

Protocol C3 exits: §0.

---

## 10. Targets for cycle 4

W14 already wrote `docs/plan/cycle-4-backlog.md` and correctly refused to open protocol-C4 播放体验.
This list is the verify slot's ordering, not a rewrite of that file. **D-16 is missing there.**

### Tier 0 — C3's own gate, and the gate that observes every other gate

1. **Wire `PlayPage` to `POST /v1/playback/sessions`.** Close D-16. Deep link, next-episode, and
   picker switch must mint (or be refused) per episode. The demo album must not play a catalogue
   id. Locked → `EPISODE_LOCKED` at all three entries, server-side. This is C3's unmet exit, not a
   new epic.
2. **Restore GitHub Actions (D-17)** so a red `main` is a test result again. Billing / spending
   limit. Until then every "CI green" claim is local-only.
3. **Merge or deliberately defer `cursor/w13-work-c3-remain-72c4` (D-18).** The client already
   probes the path. Lockstep wants the route and the document together, or the client to stop
   calling a path the server does not serve.

### Tier 1 — what W14 already scheduled, still right

4. **C4-01 / C3-11:** G1.5, L1 `workflow_dispatch:`, D-07 + a parity table (not a 20-endpoint build).
5. **C4-02:** G2.7 migrate job first (up / down / up), then other L2 slices. Do not fold into L1.
6. **Refresh `wave-protocol.md` §6.2 (D-19)** so "no database / 27 episodes / no L2" cannot be
   quoted as current. Status writeback, not a silent rewrite of §2.

### Tier 2 — AM-blocked, unblocked halves only

7. **C3-08 / C4-05** stubbed token exchange; no synthesised `open_id`; D4 stays `[ ]`.
8. **C3-09 / C4-06** keep the refusing port; keep recharge disabled; no rate in types.
9. **C4-07 SCR-11** needs a contract first. The profile card is the honest stand-in.
10. **C4-04 SCR-01** needs `GET /config` in OpenAPI, or doc 12 must stop promising it.

### Not a C4 epic until re-verification

Playback gestures, PNL-05, a11y baseline: protocol-C4. W14 P-02 is correct while D-16 is open.

---

## 11. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | C1 | C2 | C3 | Basis |
|---|---|:---:|:---:|:---:|---|
| **V-a** | Acceptance criteria reproducibly met? | Not passed | Not passed | **Not passed** | Per-slot C3-01/02/05/06/07 hold and were re-run (§5.1, §9). Cycle-level C3 exits 0 full / 1 partial / 2 unmet (§0). D-16 |
| **V-b** | Is CI actually catching things? | Not passed | Partial | **Split** | Locally: yes, and this slot turned four claimed gates red on purpose (§5.3). On GitHub: jobs do not start (D-17). L2 is G2.8 only |
| **V-c** | Skipped / deleted / weakened tests or gates? | Passed | Passed | **Passed** | Zero skips, monotonic counts, no threshold cut, no `continue-on-error`. Third `no-script-url` in a test, same class as C2 |
| **V-d** | Documents and code consistent? | Not passed | Not passed | **Not passed** | OpenAPI ↔ router lockstep holds. Remaining: D-07, D-11, D-16 (PlayPage comment claims the endpoint "replaces" a demo it still is), D-18, D-19, W14 C3-10 bundle-scan overclaim, X-21 |
| **V-e** | Gate and blocker states honestly written back? | Passed | Split | **Split** | *In handoffs:* still the house's best quality (wallet omit-not-zero, VePlayer "not a bundle ban", VIP "not `#/vip`", W14 "no new epic"). *In the register:* W13 filed; AM items still unknown (correct); §6.2 already stale (D-19). This report does not invent dates |

---

## 12. Closing note

C2's closing note said the cycle built C3 and skipped the data layer, and that the flake had
disarmed the gate. C3 built the data layer: seven reversible migrations, a seed that pages, G2.8,
silent re-login, D9 chrome, a fail-closed wallet, a fail-closed VIP card, PNL-01 against the real
list, browse, settings, search over the same sqlite catalogue. Locally, `pnpm verify` is 2,695
tests and the native-`<video>` guardrail still fails a real component in the shipped chunk.

Two things stop that from being a pass.

The first is **C3's own assignment.** A playback-token cycle whose player never mints a token has
not closed. The server will intercept a locked episode. The three client entries never ask.

The second is **the observer.** GitHub has not executed a job on `main` since PNL-01. Local green
is not a substitute, and it is how a billing outage and a silent test regression become the same
colour.

The pattern worth carrying is the one the wallet, VePlayer, and VIP-card slots already practise:
the close is a *refusal* (omit the figure, return `null`, disable Subscribe) and the test that
bites is the mutation that would look like a feature. This slot's reverse-verification all four
times was that shape. D-16 is the same shape in the other direction — a placeholder that looks
like playback.

---

## 13. Postscript — what moved while this report was being written

Everything above through §12 was first measured against `origin/main` at **`5598aba`** (search
directory over catalogue `0007`, SCR-12 settings already on `main`), then the tree was
fast-forwarded and the counts in §4–§5 re-run at **`1a6c5d6`**.

| Time (UTC, approx.) | `main` | Effect on this report |
|---|---|---|
| 20:59 | `5598aba` — search sqlite merge record | First snapshot. `pnpm verify` 2,691 tests |
| 21:04–21:05 | `dd11cf2` / `1a6c5d6` — W14 cycle-4 backlog + W13 VIP card | In-flight `bc-f66ea104` and `bc-05cba7a1` landed. App tests 960 → 964. Total **2,695**. Second `pnpm verify` exit 0 |

**Neither landing changes the verdict.**

- **Cycle-4 backlog** (`docs/plan/cycle-4-backlog.md`) is a gap list, not protocol-C4 播放体验.
  W14 P-02 is the correct §4.3 reading. It does not schedule D-16. C3-10 is marked closed including
  a bundle-scan identifier ban that is not in `bundle-scan.ts` — noted in §7.3, not silently
  rewritten in W14's file.
- **SCR-06 VIP card** is fail-closed: no `#/vip`, no "not subscribed", Subscribe disabled. It does
  not close SCR-11 or C3-04's gated remainder. D8 stays a probe plus a statement.
- **D-16, D-17, D-18, D-19, C3-08, C3-09, GATE-7, GATE-8** are unchanged. No AM date appeared.

`origin/cursor/w13-work-c3-remain-72c4` is still not an ancestor of `main`.

The verdict in §0 stands: C3 does not pass, on the C3 exits and on D-16. The C3 backlog's
buildable half mostly does, and the AM-blocked half is still unknown.
