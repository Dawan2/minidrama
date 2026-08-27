# Cycle 4 — Independent Verification Report (Wave 15)

> **Slot:** W15, independent verifier for running-count cycle C4, against
> `docs/plan/cycle-4-backlog.md` and `docs/plan/wave-protocol.md`.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w15-verify-cycle-4-72c4`, cut from `origin/main` at **`3cb724c`**
> ("Merge cursor/w14-work-c4-post-g18-72c4: L1 G1.6 runs oasdiff, and a deleted path is red").
> **Mandate:** record what is true. This slot did not implement product features, did not modify
> any source file to make a check pass, did not delete, skip or weaken a test, and did not
> rewrite any origin branch. Reverse-verification mutations were applied in this working tree,
> observed, and restored with `git checkout` / `rm`. The only file added is this one. No pull
> request.
> **Method:** every claim is re-derived from a clean checkout with the command quoted next to it,
> per `docs/plan/wave-protocol.md` §4.1 rule 3. Where a W14 handoff asserts a result, the result
> was re-run rather than accepted — including `pnpm verify`, playback session+lock+resume,
> fail-closed wallet/VIP, and two claimed gates (G1.6 thinning, wallet omit-not-zero).
> **Predecessor:** `docs/verify/cycle-3-report.md`, verdict **not passed**. Its defects `D-01`…
> `D-19` are individually re-tested in §7. New defects continue the numbering at `D-20`.
> **In-flight at start (not waited on):** G2.3 Playwright `bc-9578758f` (branch
> `origin/cursor/w14-work-g23-72c4`, `84e2fe7`) and after-seek C4 `bc-f27bbed5` (branch
> `origin/cursor/w14-work-c4-after-seek-72c4`, `85d0bc9`, continue-watching feed). Both
> **RUNNING** and **not** ancestors of `3cb724c`. Postscript §13 if they land.

Protocol arithmetic (`wave-protocol.md` §2) still makes W15 the C3 verify wave. A previous W15
already wrote `docs/verify/cycle-3-report.md`. This slot verifies the running-count C4 that W14
planned. **X-21 is unadjudicated.** This file does not amend §2.

---

## 0. Verdict

**Not passed**, against the protocol-C4 exit standard in `docs/plan/wave-protocol.md` §5.1
(播放体验 was never this cycle's assignment), and **not passed** as a C4-backlog close either —
even though this is the cycle that paid C2's L2 bill and closed C3's D-16.

Protocol C4's stated theme is 播放体验: player gestures / progress / speed / 切集 / 连播,
continue-watching, a11y baseline. Its three exit conditions:

| Protocol C4 exit (`wave-protocol.md` §5.1) | Status | Why |
|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met** | W14 P-02 correctly refused to open this epic. Gestures, PNL-05 quality/speed, and a11y are off the C4 backlog. 连播/切集 exist as **session gates**, not as the interaction sheet |
| 跨端进度冲突用例通过 | **Not met** | Heartbeats and session `resumePositionSec` → VePlayer `startTime` are on `main`. Cross-end conflict cases are not. Continue-watching is on the unmerged after-seek branch (§2, §13) |
| a11y 门禁上线且核心屏零 critical/serious | **Not met** | Not scheduled. Not started |

Zero of three. That is honesty about the protocol map, not a surprise: `docs/plan/cycle-4-backlog.md`
§0.1 / §4 said protocol C4 stays off the list until an independent verify wave says C2/C3 exits
are met or names them as P2 carry-forward. C3 is still `[!]` (`docs/verify/cycle-3-report.md`).
C2 is still `[!]`. This slot does not open the epic either.

The C4 backlog (the running-count document W14 wrote) is in better shape than the protocol exits.
Scorecard in §9. Two facts decide the verdict independently of that scorecard:

1. **GitHub Actions still cannot start jobs (D-17).** Every `main` run at `3cb724c` failed in 5–6
   seconds with empty steps: billing / spending limit. Last successful CI on `main` is still
   run [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at `2aea931`
   (PNL-01), 2026-08-27T20:12:42Z. Iron rule R6 is still unverifiable from CI. Local `pnpm verify`
   is green (3,217 tests). Local green does not substitute for the gate.
2. **C4-02's last named slice is not on `main`.** L2 now has G2.8, G2.7, G2.2, G2.6, G2.4 Semgrep,
   G2.4 CodeQL, and G2.5 Trivy. G2.3 smoke E2E is a pushed branch (`84e2fe7`) and a running agent
   (`bc-9578758f`). It is not a job in `.github/workflows/l2.yml` on this SHA. C2's third exit is
   therefore **7 of 8 jobs present, 0 of 8 reverse-verified on GitHub**.

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the next plan wave must
schedule remediation as top priority and implement waves may not open a **new epic** until
re-verification passes. Protocol-C4 播放体验 stays closed. D-17 is still not on the C4 backlog
and should remain first.

AM-blocked items (C3-08 last step, C3-09 rate, C4-07 contract, GATE-0…GATE-8, Q-G-1…Q-G-9)
remain **open / unknown**. No EIS date, no BytePlus ingest date, no Beans rate, and no
partner-approval date is recorded here.

---

## 1. The headline finding: C4 built the L2 C2 skipped, wired the player C3 left as a comment, and GitHub still cannot watch either

All three halves matter.

C3's headline was that the cycle built C2's sqlite foundations and left `POST /v1/playback/sessions`
as a comment in `PlayPage`. That player gap is closed on this tree:

```
$ git rev-parse --short origin/main
3cb724c
$ rg -n 'playbackApi.createSession|gateAdvance' app/src/routes --glob '!**/*.test.*'
app/src/routes/PlayPage.tsx:83:    () => playbackApi.createSession(episodeId),
app/src/routes/PlayPage.tsx:137:    const gate = await gateAdvance(playbackApi, target.id);
$ rg -n 'demoPlaylist|vid_demo_|DEMO_ALBUM' app/src --glob '!**/*.test.*'
# no matches in product source
```

Deep link mints a session for the route id. 连播 and locked 切集 call `gateAdvance` *before*
VePlayer moves; a 403 keeps the current player and opens PNL-02. Resume is
`descriptor.resumePositionSec` → VePlayer `startTime`; catalog `durationSec` is not a seek
target; a 403 never constructs the player. C3's second exit, as engineering, holds. **D-16 closed.**

C2's third exit was L2. At C3 verify, L2 was G2.8 only. On `3cb724c`:

```
$ rg -n '^  [a-z].*:$' .github/workflows/l2.yml
  licenses:     # G2.8
  migrate:      # G2.7
  integration:  # G2.2
  artifact:     # G2.6
  sast:         # G2.4 Semgrep
  codeql:       # G2.4 CodeQL
  sca:          # G2.5 Trivy
# G2.3 still absent — comment on line 11: "G2.3 is still absent."
```

And then the observer:

```
$ gh api repos/Dawan2/minidrama/check-runs/98700011100/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

CI run [33124735291](https://github.com/Dawan2/minidrama/actions/runs/33124735291) on `3cb724c`
(CI, 2026-08-27T23:01:12Z) and [33124735246](https://github.com/Dawan2/minidrama/actions/runs/33124735246)
(L2, same push) are 5–6 second billing failures with empty `steps`. G1.6, G1.8, CodeQL, Trivy,
Semgrep, G2.7 — none of them has a GitHub-executed reverse-verification on this trunk. The jobs
exist as YAML. The runner will not start.

---

## 2. Repository topology

```
$ for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/cursor); do
    git merge-base --is-ancestor "$b" origin/main || echo "UNMERGED $b"
  done
UNMERGED origin/cursor/w13-work-c3-remain-72c4
UNMERGED origin/cursor/w14-work-c4-after-seek-72c4
UNMERGED origin/cursor/w14-work-c4-subseq-72c4
UNMERGED origin/cursor/w14-work-g23-72c4
```

Four branches. C3 closed with one (`w13-work-c3-remain-72c4`, D-18). C4 adds three:

| Branch | Commits off `main` | Substance | Disposition |
|---|---:|---|---|
| `cursor/w13-work-c3-remain-72c4` | +7 | `GET /v1/wallet/transactions`, fail-closed empty ledger | **D-18, still.** Integrator. This slot does not merge it |
| `cursor/w14-work-g23-72c4` | +1 (`84e2fe7`) | L2 G2.3 Playwright smoke; missing binary is red | **In-flight `bc-9578758f`.** Not an ancestor of `3cb724c` |
| `cursor/w14-work-c4-after-seek-72c4` | +1 (`85d0bc9`) | Home feed continue-watching from the heartbeat table | **In-flight `bc-f27bbed5`.** Not an ancestor of `3cb724c` |
| `cursor/w14-work-c4-subseq-72c4` | +3 | Duplicate C4-08 ads that a sibling already landed | Leftover, not in-flight. Do not retake |

Cycle-4 plan (`cursor/w14-plan-cycle-4-2e9b`) and the C3 verify report are ancestors of `3cb724c`.

### 2.1 Cycle labelling is still two schemes (D-13 / X-21)

Unchanged. Protocol: C3 = W11–W15, C4 = W16–W20, this slot is protocol-C3's verify wave — and a
prior W15 already used that slot to write `cycle-3-report.md`. Running count: W14 wrote
`cycle-4-backlog.md` and this slot writes `cycle-4-report.md`. Still P3's.

---

## 3. Maturity

### 3.1 Mandatory platform capabilities (D4–D9)

```
$ rg -n "getMenuButtonRect|setNavigationBarColor|showRewardedAd|showInterstitialAd|createSubscription" \
     app/src --glob '!src/platform/**' --glob '!**/*.test.*'
$ rg -n "\.login\(|\.pay\(" app/src --glob '!src/platform/**' --glob '!**/*.test.*'
```

Checklist rows in `docs/11-official-onboarding-checklist.md` D4–D9 remain `[ ]`. That is correct
under §8 rule 6.

| # | Capability | C3 | C4 (`3cb724c`) | Evidence |
|---|---|:---:|:---:|---|
| D4 | Silent login | mock + recovery | **mock + recovery + stubbed token exchange (C4-05)** | `createTiktokIdentityPort` still `PROVIDER_UNCONFIGURED` / `PROVIDER_UNAVAILABLE` when the secret is missing. No synthesised `open_id`. Checklist `[ ]` until a device |
| D5 | Rewarded video ad | not started | **wired against the mock; live flag off (C4-08)** | `app/src/ads/rewarded-unlock.ts` calls `showRewardedAd`. `GET /v1/config` `adUnlock: false`. Server `isEnded` is not a grant. No Portal unit id |
| D6 | Interstitial ad | not started | **wired against the mock; live flag off (C4-08)** | `app/src/ads/interstitial.ts`. Same flag. Checklist `[ ]` |
| D7 | Beans one-off | client wired, server refuses | **stubbed `trade_order/create` (C4-06); default port still refuses** | `createTiktokTradeOrderPort` exists; `buildApp` still defaults to `createUnavailableTradeOrderPort()`. No rate in types. Recharge control disabled |
| D8 | Subscription | probe + fail-closed VIP card | **unchanged + `GET /v1/users/me` identity (no vip field)** | `createSubscription` still a probe. Profile Subscribe disabled. No `#/vip`. No OpenAPI subscription path |
| D9 | Nav bar / capsule | wired, not device-run | **unchanged** | `Chrome.tsx`. Checklist `[ ]` |

D5/D6 now have product call sites. They are not `[x]`. GATE-4 has not named a unit id.

### 3.2 Screens and panels

| | C3 (`1a6c5d6`) | C4 (`3cb724c`) |
|---|:---:|:---:|
| Numbered screens | 10 of 13 | **11 of 13** — SCR-01 splash is an overlay (`SplashScreen`), not a hash route. Missing: SCR-10 `#/recharge`, SCR-11 `#/vip` |
| Hash routes | 11 named | **11 named** — home, browse, search, drama, play, me, history, favorites, wallet, settings, fallback. No `recharge:` / `vip:` in `routes.ts` |
| Panels | 2 of 5 | **2 of 5** — PNL-01, PNL-02. PNL-03 blocked. PNL-04/05 off this cycle |

SCR-01 does not mention comments, ads, legal URLs, or Beans. `GET /v1/config` is conservative:
`comments: false`, `adUnlock: false`, heartbeat 10 s.

### 3.3 Server surface and OpenAPI lockstep

```
$ rg -c '^  /' contracts/openapi.yaml
23
$ rg -c '^    (get|post|put|patch|delete):' contracts/openapi.yaml
26
```

Twenty-three paths, twenty-six operations. Added since C3: `GET /v1/config`, `GET /v1/users/me`,
`POST /v1/unlock/ad-sessions`, `POST /v1/unlock/ad-grants`. `server/src/contract.test.ts` still
asserts **both directions**.

`GET /v1/wallet/transactions` is **not** in the live document. The client still probes
`WALLET_TRANSACTIONS_PATH = '/v1/wallet/transactions'` (`app/src/data/wallet-api.ts`, gitignored
as `data/`; present in the tree via `git show`). **D-18 stands.**

Doc 12 no longer names two unlock path shapes (D-07 closed as wording). Parity is now a committed
table (`docs/12-api-parity.md`) — D-11's *measurement* is done; the design-only gap is not closed,
and C4-01 said not to close it this cycle.

G1.6 baseline: `contracts/oasdiff-baseline.yaml`. Additive paths do not require updating it.

### 3.4 Persistence — still sqlite, still not T14

Seven paired migrations, unchanged. Search is still `createCatalogDramaDirectory` over `0007`.
`postgres:` URLs are refused at boot (`database-url.ts`); the G2.2 CLI test
"exits non-zero on a postgres URL rather than rewriting it to a file" is in the suite this slot
ran. Redis is not read. **C4-03 is open.** Do not mark T14 `[x]` on sqlite.

Seed floor still 80. No BytePlus ids.

### 3.5 Playback — C3's second exit, now met as engineering

| Entry | What happens on `3cb724c` |
|---|---|
| **深链** | `PlayPage` `useResource(() => playbackApi.createSession(episodeId))`. 201 → one-descriptor playlist. 403 `EPISODE_LOCKED` / VIP / anonymous paid → `UnlockPanel`, `MockVePlayer.instances` empty |
| **连播** | `player-next` is a button. `gateAdvance` POSTs a session for the *next* catalogue id *before* navigate. Lock keeps the current route and player (`AC-PL-5`) |
| **切集** | Playable picker cells still `replace`-navigate (D-16 route session). Commercially locked cells are attempt buttons → `gateAdvance`. `UNAVAILABLE` / `PURCHASE_BLOCKED` stay marks |
| **Resume** | `resumePositionSec: 45` → `startTime: 45`. `0` or omitted → `0`. Catalog `durationSec: 90` is not the start. 403 never reaches the constructor |

`PlayPage.test.tsx` (22 tests) and `advance-gate.test.ts` (5) passed inside `pnpm verify`. Product
source names no `demoPlaylist` / `vid_demo_` / `DEMO_ALBUM_ID`.

PLY-002 (C3's third exit) is a fail-closed **contract probe** that always returns `unmeasured`.
`docs/gates/ply-002.md` says so. Host MSE/EME is still unknown. Not a pass. **Do not fill a date.**

### 3.6 Overall maturity judgement

The project has moved from **C3's assembled mock app with sqlite and a demo-album player** to
**the same app with a session-gated player, resume seek, L1 coverage + secrets + contract-diff,
and L2 at seven of eight jobs**. That is a category change on the *gates*, which is what C2 asked
for, and a close of C3's own enforcement point.

What it is not: it is not Playwright smoke on `main`; it is not PostgreSQL; it is not G1.7 / G1.9 /
G1.10; it has never run on a device; GitHub cannot currently start its own jobs. Against the
twelve-cycle map, the honest position is "C2 L2 almost, C3 playback-enforcement now wired, protocol
C4 unopened, observer still dark."

---

## 4. Increment against cycle 3

Every C3 number is from `docs/verify/cycle-3-report.md` at `1a6c5d6`. Every C4 number was measured
on `origin/main` at `3cb724c`.

| Measure | C3 | C4 | Change |
|---|---:|---:|---|
| `main` commits / files | 343 / 538 | **452 / 661** | +109 / +123 |
| Unmerged `cursor/*` tips | 1 | **4** | D-18 plus in-flight G2.3, after-seek, leftover ads |
| Test files | 166 | **209** | +43 |
| Tests | 2,695 | **3,217** | **+522** |
| Source lines (ts/tsx, non-test) | 23,333 | 31,074 | +33% |
| Test lines | 31,580 | 40,723 | +29% |
| Contract paths / operations | 19 / 22 | **23 / 26** | +4 / +4 |
| CI on `main` at HEAD | jobs do not start (billing) | **jobs do not start (billing)** | D-17 unchanged |
| L1 gates present | 4 of 10 | **7 of 10** | +G1.5, +G1.6, +G1.8. Missing G1.7, G1.9, G1.10 |
| L2 gates present | 1 of 8 (G2.8) | **7 of 8** | +G2.7, G2.2, G2.6, G2.4×2, G2.5. Missing G2.3 |
| Migrations | 7 pairs | **7 pairs** | unchanged |
| Seed listed episodes | ≥ 80 | **≥ 80** | unchanged |
| Screens | 10 of 13 | **11 of 13** | +SCR-01 splash overlay |
| Overlay panels | 2 of 5 | **2 of 5** | unchanged |
| D4–D9 with a product call site | 3 of 6 (D4, D7, D9) | **6 of 6** | +D5, +D6; D8 still probe+card |
| Bundle JS | 337.44 kB (102.92 kB gz) | **353.43 kB (108.04 kB gz)** | `index-DMmaAoAe.js` |

Test-to-source line ratio is 1.31 (C3 was 1.35). Volume did not come from thinning the suite.

Quality package tests 37 → 250: that is G1.5 / G1.6 / G1.8 / G2.4 / G2.5 fixtures, not product
features.

---

## 5. Evidence

### 5.1 `main` verifies clean locally at `3cb724c`

```
$ git rev-parse HEAD
3cb724cde1e9fb1200734166ef5ab198a0967b11
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0
```

`verify` = `format:check` → `lint` → `typecheck` → `test:coverage` → `check:coverage` → `build` →
`check:guardrails`. First try on this SHA, no retry. G1.6 `check:contract` and G1.8
`check:secrets` are **not** in `verify` (binaries are L1 CI installs). Also
`pnpm run check:licenses` → `license whitelist passed (350 packages)`.

| Package | Test files | Tests |
|---|---:|---:|
| `packages/shared` | 8 | 61 |
| `packages/config` | 3 | 45 |
| `packages/quality` | 15 | 250 |
| `server` | 94 | 1,740 |
| `app` | 89 | 1,121 |
| **Total** | **209** | **3,217** |

0 failed, 0 skipped. Coverage gate:

```
coverage global lines 94.06% (15256/16219), branches 91.57%, core lines 95.50%, diff lines 98.61% (213/216)
coverage gate passed
```

Floors in `packages/quality/coverage-thresholds.json`: diff 80, global line 60, global branch 50,
core 90. Live numbers are above. Thresholds were not lowered.

Build emits `dist/assets/index-DMmaAoAe.js`, 353.43 kB (108.04 kB gzipped). Guardrails passed
against that artifact.

### 5.2 `main` does not verify on GitHub (D-17, unchanged)

```
$ gh run list --repo Dawan2/minidrama --branch main --limit 4
33124735246  failure  3cb724c  L2   5s  2026-08-27T23:01:12Z
33124735291  failure  3cb724c  CI   6s  2026-08-27T23:01:12Z
33124446792  failure  795baaf  L2   5s  2026-08-27T22:56:37Z
33124446684  failure  795baaf  CI   6s  2026-08-27T22:56:36Z
```

Job `verify` at check-run `98700011100`: `conclusion: failure`, `steps: []`, annotation as in §1.
Last *successful* CI on `main`: still PNL-01 at 20:12:42Z. Everything this cycle added — G1.5,
G1.6, G1.8, G2.2–G2.7 except G2.3, D-16, resume, ads, splash, coverage — has a 4–6 second
billing failure, not a test result. **R6 remains unverifiable from CI.**

### 5.3 Reverse verification of two claimed gates

Performed on `3cb724c`; mutations restored; nothing committed.

**Wallet fail-closed (C3-04 / C4-06 leak).** `toWalletView` on `UNAVAILABLE` was changed to
`{ coinBalance: 0, bonusBalance: 0, totalBalance: 0 }`.

```
FAIL  src/modules/wallet/view.test.ts > toWalletView > omits every balance field when the platform named nothing
AssertionError: expected { coinBalance: +0, …(2) } to deeply equal {}

FAIL  src/modules/wallet/routes.test.ts > GET /v1/wallet — signed in, no platform figure
      > answers 200 with the balance fields omitted, which is not zero
```

2 failed / 23 passed in those files. An invented zero is exactly the number M16 forbade. **Holds.**
Restored with `git checkout -- server/src/modules/wallet/view.ts`.

**G1.6 oasdiff (C4 leftover / T23).** A thinning `.oasdiff.yaml` (`ignore: all`) was written at
the repo root. `pnpm run check:contract`:

```
oasdiff config must not override the default checks; thinning ignore files is G1.6 red
  /workspace/.oasdiff.yaml
Exit status 1
```

The gate fails *before* the binary runs, which is the fail-open this job exists to close. **Holds.**
File removed; tree clean.

The committed CLI fixture for a deleted path also passed inside `pnpm verify`
(`packages/quality/src/cli/check-contract.test.ts`: "exits non-zero when oasdiff reports a deleted
path", fake binary, `api-path-removed-without-deprecation GET /v1/wallet`). This slot did not
install a live oasdiff binary; G1.6 is not on the local `verify` path by design.

**Playback (probed, not a third mutation).** `PlayPage.test.tsx` 22/22 inside verify, including
"asks the server for a session of the route episode, not a demo album", "starts VePlayer at the
session resume, not at catalog duration", "sessions the next catalogue episode on 连播, and a lock
there does not play demo content". A 403 VIP deep link asserts `MockVePlayer.instances` length 0.

**VIP fail-closed (probed).** `ProfilePage.test.tsx`: VIP card `data-status=unavailable`, no
`#/vip` `<a>`, Subscribe disabled, no Beans / `$`. `GET /v1/users/me` has no `vip` field.

### 5.4 The iron rules

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | 166 → 209 files, 2,695 → 3,217 tests, monotonic | **clean** |
| R3 no skipped tests | `rg '\.skip\(|\.only\(|it\.todo\(|test\.todo\('` over `app server packages` `*.{ts,tsx,js}` | **clean** — zero matches |
| R4 no weakened standards | `eslint-disable` / `@ts-ignore` | **3 matches**, all `no-script-url` in tests naming a refused `javascript:` scheme. Same class as C3. Coverage floors not lowered |
| R5 no empty tests | sampled `check-contract.test.ts`, `view.test.ts`, `PlayPage.test.tsx`, `ply-002-probe.test.ts` | behavioural; G1.6 CLI is exit-status; wallet omit-not-zero; player asserts no VePlayer on 403 |
| R6 `main` releasable | local verify green; GitHub jobs do not start | **split — D-17** |

TypeScript still `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No
`continue-on-error:` key in either workflow (comments mention the absence; YAML has no such key).

---

## 6. Gate enforcement

### 6.1 L1 — seven of ten

`.github/workflows/ci.yml` vs `docs/14-quality-gates.md` §2. `workflow_dispatch:` is present
(C4-01). Triggers: `push` `[main, cursor/**]`, `pull_request`, `workflow_dispatch`.

| Gate | C3 | C4 | Note |
|---|:---:|:---:|---|
| G1.1–G1.4 | yes | yes | format, lint, typecheck, unit tests (now `test:coverage`) |
| G1.5 coverage | no | **yes** | floors + ratchet; reverse fixtures in `coverage.test.ts`. In `pnpm verify` |
| G1.6 contract compatibility | no | **yes** | oasdiff breaking, `--fail-on ERR`. Reverse-verified this slot (§5.3). **Not** in `pnpm verify` |
| G1.7 dependency audit | no | **no** | Hand-offs say it overlaps G2.5 Trivy; no osv-scanner / `npm audit` L1 job |
| G1.8 secrets | no | **yes** | Gitleaks 8.30.1 dir scan. Committed CLI: planted key / missing binary is red. **Not** in `pnpm verify` |
| G1.9 commit convention | no | **no** | prose subjects remain |
| G1.10 skip / empty-test detection | no | **no** | clean by discipline, unenforced by machinery |
| Platform guardrails | extra | extra | reverse-verified at C3; suite still in verify |
| Generated `minis.config.json` | extra | extra | regenerate-and-diff |

`ci.yml` was not folded into L2. G1.6 and G1.8 install their binaries in the L1 job, then run
`pnpm run check:contract` / `check:secrets`. There is no `continue-on-error`.

### 6.2 L2 — seven of eight

`.github/workflows/l2.yml` jobs: licenses (G2.8), migrate (G2.7), integration (G2.2), artifact
(G2.6), sast (G2.4 Semgrep 1.128.1), codeql (G2.4 CodeQL bundle 2.26.2), sca (G2.5 Trivy 0.74.0).
`workflow_dispatch:` present. No `continue-on-error`. Comment: "G2.3 is still absent."

G2.1 is the L1 re-run (`ci.yml` on `main`). G2.3 is the in-flight branch in §2.

Local: `check:licenses` green (350 packages). `check:migrate` / `check:integration` /
`check:artifact` / `check:sast` / `check:codeql` / `check:sca` were **not** all re-executed as
live binaries in this slot; their CLI missing-binary / fixture suites ran inside `pnpm verify`
(quality 250 tests includes those). GitHub has executed none of them on this SHA (D-17).

### 6.3 Reverse verification (checklist V-b)

| Gate | Reverse-verified this slot? |
|---|---|
| Wallet omit-not-zero | **yes** (§5.3) |
| G1.6 thinning ignore file | **yes** (§5.3) |
| G1.6 deleted-path CLI fixture | **yes**, via committed test inside verify |
| Playback session / lock / resume | **probed** via the suite this slot ran; no third source mutation |
| G1.5 under-threshold fixture | committed tests in `coverage.test.ts` (19) passed inside verify; this slot did not independently lower the live floors file |
| G1.8 planted key | committed CLI fixtures; live Gitleaks binary not installed here |
| G2.4 / G2.5 / G2.7 | committed missing-binary / fixture tests; no GitHub execution |
| G2.3 | **no job on this SHA** |

---

## 7. Defects

Recorded, not fixed, per §4.1 rule 4.

### 7.1 Cycle 1's nine defects, re-tested

| ID | C3 | C4 | Evidence |
|---|---|---|---|
| **D-01** bundle scan fail-open | Still fixed | **Still fixed** | Guardrails passed on `index-DMmaAoAe.js`. No new native-`<video>` injection this slot |
| **D-02** cover allowlist | Wired | **Stays wired** | `CoverImage` + server `views.ts` |
| **D-03** CI never executed | Regressed as D-17 | **Stays D-17** | Jobs exist; they do not start |
| **D-04** contract forked | Lockstep holds | **Lockstep holds** | 23/26, bidirectional. G1.6 adds compatibility-diff against a baseline |
| **D-05** file-ownership | Paper | **Unchanged on paper** | T1-5 |
| **D-06** SR-5 | Installer closed; identifier-in-bundle open | **Unchanged** | Do not ban the installer call |
| **D-07** doc 12 unlock paths | Open | **Closed as wording** | Both sites `{episodeId}` / `{dramaId}`. Live write remains `POST /v1/unlock/coin-orders` (parity row, not a second route) |
| **D-08** three gate registers | Partial | **Unchanged** | §6.1 authoritative. Pointers from P1/P2 files still missing |
| **D-09** integrator unnamed | Paper closed | **Stays paper-closed** | `main` is named. D-17 is a different problem |

### 7.2 Cycle 2's six new defects, re-tested

| ID | C3 | C4 |
|---|---|---|
| **D-10** flake class | Closed as a test defect | **Stays closed.** Not re-run under CPU saturation this slot |
| **D-11** contract parity unmeasured | Open | **Measurement closed.** `docs/12-api-parity.md` exists. Design-only rows remain; C4-01 said not to build them |
| **D-12** unlock-grant unmerged | Closed in C2 postscript | **Stays closed** |
| **D-13** cycle-label drift | Open | **Open.** X-21. This file is named cycle-4 by the running count |
| **D-14** `o("video",p)` residual | Open, P3 | **Open.** Not re-probed as a new injection |
| **D-15** gate status never written back | Closed as filing | **Stays a filing.** AM items still unknown. §6.2 of the writeback is still stale (**D-19**) |

C2 exit conditions re-scored (not a C2 pass):

| C2 exit | C3 tree | This tree |
|---|---|---|
| Migrations forward + rollback | Met in tests on sqlite | **Met in tests, and G2.7 is an L2 job.** Not GitHub-executed (D-17) |
| Seed ≥2 / ≥80 | Met | **Met** |
| L2 all green and reverse-verified | 1 of 8 | **7 of 8 jobs present. G2.3 absent on `main`. Zero GitHub-green L2 runs this cycle** |
| traceId end to end | Met | **Met** |

### 7.3 Cycle 3's four new defects, re-tested

| ID | C3 | C4 |
|---|---|---|
| **D-16** player never calls `POST /v1/playback/sessions` | P1 open | **Closed as engineering.** Three entries mint or are refused. Demo album gone from product source. Suite asserts it |
| **D-17** GitHub Actions will not start jobs | P1 open | **Open, unchanged.** Same annotation, newer SHA, still 5–6 s |
| **D-18** `GET /v1/wallet/transactions` client probe vs 404 | P2 open | **Open.** Path still absent from OpenAPI and server routes. Client still names `WALLET_TRANSACTIONS_PATH` |
| **D-19** `wave-protocol.md` §6.2 stale ("no database, 27 episodes, no CI L2") | P2 open | **Open.** Writeback SHA `a6c04d3` was not refreshed. That sentence is false on `3cb724c` |

### 7.4 New defects

| ID | Sev | Defect | Evidence |
|---|:---:|---|---|
| **D-20** | P2 | **G1.7, G1.9, and G1.10 are still absent after a cycle that added G1.5/G1.6/G1.8 and almost all of L2.** Skip/empty-test detection remains discipline-only. Commit subjects remain prose. G1.7 was explicitly deferred as overlapping G2.5 | §6.1, `ci.yml` |
| **D-21** | P2 | **Protocol C3's third exit is still unmet, and the honest PLY-002 probe does not change that.** `measurePly002EquivalentHost()` returns `unmeasured`. No Android WebView, no WKWebView, no date | `docs/gates/ply-002.md`, C3 exit 3 |

W14's C3-10 "banned in the bundle scan" overclaim from the C3 report is unchanged and is not a
product defect. G2.3 on a branch that is not `main` is C4-02 remainder, not a silent skip.

---

## 8. Blockers

### 8.1 Summary

Partner answers are **unknown**. None is invented. Questions remain in
`docs/gates/open-questions.md`. Q-G-10 (PLY-002 host) was added in C4; it is also unknown.

| Blocker | Owner | C3 | C4 | Blocks |
|---|---|:---:|:---:|---|
| GitHub Actions billing | Account / ops | **open (D-17)** | **open (D-17)** | any use of CI as a gate on `main` |
| G2.3 smoke E2E | Engineering | open | **branch exists, not on `main`** | C2 L2 exit; mock-login E2E as a *job* |
| T14 PostgreSQL | Engineering | sqlite slice | **sqlite slice (C4-03 open)** | named production DB |
| G1.7 / G1.9 / G1.10 | Engineering | open | **open (D-20)** | L1 completeness |
| `GET /v1/wallet/transactions` | Integrator | D-18 | **D-18** | lockstep vs client probe |
| Client playback session wiring | Engineering | D-16 | **closed** | — |
| PLY-002 host MSE/EME | Engineering + device | unmet | **unmeasured (D-21)** | C3 exit 3 |
| `GATE-8` BytePlus / VePlayer | Business | `[ ]` | `[ ]` **no movement** | ingest, listing, catalogue `vid` |
| `GATE-7` EIS | Business | `[ ]` | `[ ]` **no movement** | monetised EU/US launch |
| M0 official PDF | User | `[!]` | `[!]` **no movement** | "requirements verified". `find` over `*.pdf` in this workspace (excluding `node_modules`) is empty |
| M1 credentials | Business | `[ ]` | `[ ]` | real login last step (C4-05 / C3-08) |
| M2 / M4 | Business | `[ ]` | `[ ]` | Beans rate (C4-06), ads live ids, recharge enable |
| M3 / M5 / M6 | Business | `[ ]` | `[ ]` | listing, US, device |
| Beans conversion rate | Business | missing | **missing** | D7 pricing; SCR-10 |
| SCR-11 VIP contract | Business then B | blocked | **blocked (C4-07)** | `#/vip` |

**Nine business-track blockers, still zero external evidence.** Filing is not answering. This slot
did not fill a date.

### 8.2 `GATE-8` held again, as engineering

No BytePlus ingest, moderation, or listing implementation. Bundle scan still bans `hls.js`,
`videojs`, `shaka-player`, `dashjs`. Fail-closed replace installer is not a GATE-8 release.
Catalogue fixtures still have no `vid` / `albumId`. **No ingest date is recorded.**

### 8.3 Real login, still the last step

C4-05 landed the stubbed `POST /v2/oauth/token/` exchange. `createTiktokIdentityPort` still
returns `PROVIDER_UNCONFIGURED` without a secret. Mock login still requires
`yes-i-am-a-non-production-test-deployment`. D4 stays `[ ]`.

### 8.4 Beans conversion, still not an engineering close

No product rate. `token_amount` on the stubbed trade-order create is an observed integer field,
not `priceCoins` multiplied. Wallet recharge copy still says prices have not been set. The Top up
button is `disabled`. **Q-G-7 unanswered.**

---

## 9. C4 backlog scorecard

Re-derived at `3cb724c`. W14's table at `5598aba` is the plan; this is the tree after the
implement waves.

| ID | Verdict | Evidence |
|---|---|---|
| **C4-01** G1.5 + L1 `workflow_dispatch:` + D-07/D-11 table | **Closed** | Coverage floors + ratchet; `workflow_dispatch:` on `ci.yml`; doc 12 one unlock shape; `docs/12-api-parity.md`. `pnpm verify` green. Test count did not fall |
| **C4-02** L2 G2.7 first, then slices | **Split.** G2.7, G2.2, G2.6, G2.4 Semgrep, G2.4 CodeQL, G2.5 Trivy **on `main` as jobs.** G2.3 **not** | `l2.yml`. In-flight `bc-9578758f`. `ci.yml` not weakened |
| **C4-03** T14 / T16 / T15 | **Open. Not faked.** | `postgres:` refused. No Drizzle swap. No Redis client. IDs kept |
| **C4-04** SCR-01 / `GET /config` | **Closed as contract + overlay** | `GET /v1/config` live; conservative flags; splash is not a hash route and invents no URLs |
| **C4-05** = C3-08 real login | **Unblocked half closed; last step gated** | Stubbed token exchange. Real port still refuses. D4 `[ ]` |
| **C4-06** = C3-09 + SCR-10 | **Unblocked half closed; rate unknown; recharge stays disabled** | Stubbed `trade_order/create`. Reverse-verified omit-not-zero. No `#/recharge`. Acceptance item 4 holds |
| **C4-07** SCR-11 / D8 | **Open, blocked.** No subscription path | Profile card is the honest stand-in. Do not invent `/v1/subscriptions` |
| **C4-08** D5 / D6 ads | **Unblocked half closed; live channel off** | Call sites + server `isEnded`. `adUnlock` false. D5/D6 stay `[ ]` |

Tier C / AM items: **unknown.** GATE-0…GATE-8, Q-G-1…Q-G-9: no movement.

D-16 was missing from this backlog at plan time. It closed anyway, as C3 remediation, which is
the right §4.3 reading.

---

## 10. Targets for the next cycle

This list is the verify slot's ordering, not a rewrite of `cycle-4-backlog.md`.

### Tier 0 — the observer, and the last L2 job

1. **Restore GitHub Actions (D-17)** so a red `main` is a test result again. Until then every
   "CI green" claim is local-only, including G1.6 and Gitleaks.
2. **Land or deliberately defer G2.3 (`bc-9578758f` / `cursor/w14-work-g23-72c4`).** C4-02's
   remaining slice. Missing binary must stay red. Do not fold into L1. Do not `continue-on-error`.
3. **Merge or deliberately defer `cursor/w13-work-c3-remain-72c4` (D-18)** and
   `cursor/w14-work-c4-after-seek-72c4` (continue-watching) / leftover `c4-subseq`. Lockstep wants
   the transactions route and the document together, or the client to stop calling a 404.

### Tier 1 — still right, still unblocked or defer-with-ID

4. **C4-03:** Postgres as a working scheme **or** a written, dated amendment of T14. Do not
   rewrite `postgres://` to a file.
5. **D-20 / G1.7 / G1.9 / G1.10** as L1 slices. G1.7 may be "osv-scanner, or document that G2.5
   is the SCA". Skip detection is the gate that would notice a future `.skip`.
6. **Refresh `wave-protocol.md` §6.2 (D-19)** and §5.1 status columns (C3 `[~]` is stale; C4
   running-count vs protocol-C4). Status writeback, not a silent rewrite of §2 (X-21 stays P3).

### Tier 2 — AM-blocked, unblocked halves only

7. **C4-05 / C3-08** stay refusing without a secret.
8. **C4-06 / C3-09** keep recharge disabled; no rate in types.
9. **C4-07** needs a contract first.
10. **PLY-002 host (D-21)** needs devices. The contract probe is not that measurement.

### Not a new epic until re-verification

Playback gestures, PNL-05, a11y baseline: protocol-C4. W14 P-02 is still correct while C2 L2 is
7/8 without GitHub signal and C3 exit 3 is unmeasured.

---

## 11. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | C1 | C2 | C3 | C4 | Basis |
|---|---|:---:|:---:|:---:|:---:|---|
| **V-a** | Acceptance criteria reproducibly met? | Not passed | Not passed | Not passed | **Not passed** | C4-01/04/05-half/06-half/08-half hold and were re-run (§5.1, §9). Protocol C4 exits 0/3 (§0). C4-02 G2.3 not on `main`. C4-03/C4-07 open |
| **V-b** | Is CI actually catching things? | Not passed | Partial | Split | **Split** | Locally: yes, and this slot turned two claimed gates red on purpose (§5.3). On GitHub: jobs do not start (D-17). L2 is seven YAML jobs and zero executed runs |
| **V-c** | Skipped / deleted / weakened tests or gates? | Passed | Passed | Passed | **Passed** | Zero skips, monotonic counts, no threshold cut, no `continue-on-error` key. Same three `no-script-url` tests |
| **V-d** | Documents and code consistent? | Not passed | Not passed | Not passed | **Not passed** | OpenAPI ↔ router lockstep holds; D-07 wording closed; parity table exists. Remaining: D-18, D-19, X-21, protocol §5.1 C3 still `[~]`, G2.3 comment vs in-flight branch |
| **V-e** | Gate and blocker states honestly written back? | Passed | Split | Split | **Split** | *In handoffs:* still the house's best quality (wallet omit-not-zero, recharge disabled, `adUnlock` false, PLY-002 "not a pass", G2.3 "in flight"). *In the register:* AM items still unknown (correct); §6.2 already stale (D-19). This report does not invent dates |

---

## 12. Closing note

C3's closing note said the cycle built the data layer and left the player as a fixture album, and
that GitHub had not executed a job since PNL-01. C4 wired the player: three entries mint
`POST /v1/playback/sessions`, a lock does not destroy the current frame, resume is the session
field and not catalog duration. It also built the L2 C2 asked for, minus Playwright, and put
coverage, Gitleaks, and oasdiff on L1. Locally, `pnpm verify` is 3,217 tests, the coverage gate
prints 94.06% / 98.61% diff, and a thinning `.oasdiff.yaml` is red without needing the binary.

Two things stop that from being a pass.

The first is **the observer, again.** GitHub has not executed a job on `main` since PNL-01. Every
new gate this cycle claims — G1.6, G1.8, CodeQL, Trivy, Semgrep, migrate, artifact — is YAML plus
local fixtures. That is the same colour as a silent regression.

The second is **the map.** Protocol C4 was not this cycle, correctly. Running-count C4 did the
remediation C3's verdict required, except the one job that would let anyone believe a mock-login
E2E without running it on a laptop, and except the billing outage nobody in engineering can close
from a branch.

The pattern worth carrying is the one the G1.6 and wallet slots already practise: the close is a
*refusal* (thinning file is red, omitted balance is not zero, 403 is not a descriptor) and the
test that bites is the mutation that would look like a feature. This slot's reverse-verification
was that shape twice. D-17 is the same shape in the other direction — a workflow that looks like
a gate.

---

## 13. Postscript — in-flight at write time

Everything above through §12 was measured against `origin/main` at **`3cb724c`**
(2026-08-27T23:01:09Z). `pnpm verify` ran in this slot after that snapshot. Two agents were
RUNNING when the snapshot was taken and when this section was written; neither is an ancestor of
`3cb724c`.

| Agent | Branch on origin | Tip | Status when this file was written |
|---|---|---|---|
| `bc-9578758f` W14 work L2 G2.3 | `cursor/w14-work-g23-72c4` | `84e2fe7` Add the L2 G2.3 smoke job: Playwright P0, and a missing binary is red | **RUNNING, not on `main`.** Diff includes `l2.yml`, `packages/quality/src/smoke.ts`, Playwright specs `login-home` / `browse-play` |
| `bc-f27bbed5` W14 work next C4 after seek | `cursor/w14-work-c4-after-seek-72c4` | `85d0bc9` Lead the home feed with continue-watching from the heartbeat table | **RUNNING, not on `main`.** Diff is server discovery/progress plus `docs/handoff/w14-c4-after-seek.md` |

**Neither landing, if it happens after this file, changes the §0 verdict on its own.**

- **G2.3** would close the C4-02 remainder and the "no Playwright" half of C3's first exit. It
  would not execute on GitHub while D-17 holds. It would not open protocol-C4 播放体验.
- **Continue-watching** is protocol-C4-adjacent product, not an a11y gate and not a cross-end
  conflict suite. It would not close protocol C4's three exits.

If a later integrator merges either onto `main`, re-score C4-02 / the feed row against that SHA.
This report's snapshot SHA is **`3cb724c`**.

`origin/cursor/w13-work-c3-remain-72c4` is still not an ancestor of `main`.
`origin/cursor/w14-work-c4-subseq-72c4` is a leftover ads duplicate; do not retake.

AM items did not move. No date appeared.

The verdict in §0 stands: running-count C4 does not pass, on D-17 and on protocol-C4 exits (the
latter correctly unscheduled). The C4 backlog's buildable half mostly does, G2.3 is the named
remainder, and the AM-blocked half is still unknown.
