# Cycle 6 — Independent Verification Report (Wave 19)

> **Slot:** W19, independent verifier for running-count cycle C6, against
> `docs/plan/cycle-6-backlog.md` and `docs/plan/wave-protocol.md`.
> **Date:** 2026-08-28.
> **Branch:** `cursor/w19-verify-cycle-6-72c4`, cut from `origin/main` at **`eff5eb2`**
> ("docs(handoff): record the W18 X-26 倍速 verify (PLY-010)",
> 2026-08-28 00:33:25 +0000).
> **Mandate:** record what is true. This slot did not implement product features, did not
> modify any source file to make a check pass, did not delete, skip or weaken a test, and
> did not rewrite any origin branch. Reverse-verification mutations were applied in this
> working tree, observed, and restored with `rm`. The only file added is this one. No pull
> request.
> **Method:** every claim is re-derived from a clean checkout with the command quoted next
> to it, per `docs/plan/wave-protocol.md` §4.1 rule 3. Where a W18 handoff asserts a result,
> the result was re-run rather than accepted — including `pnpm verify`, `check:a11y`,
> `check:audit`, and the playback plugin / stall / re-issue suites inside that run.
> **Predecessor:** `docs/verify/cycle-5-report.md`, verdict **not passed**. Its defects
> `D-01`…`D-21` are re-tested in §7. No new defect id is opened in this cycle; D-17 does
> not close.
> **In-flight at start (not waited on):** `bc-2c841f7a` (W18 work leftover C6 item) and
> `bc-119dafb6` (W18 work following C6 item). Both **RUNNING** when this slot started.
> Postscript §13 if they land.

Protocol arithmetic (`wave-protocol.md` §2) still makes W16–W20 protocol-C4 and W19 a
verify wave of that cycle. The running count this repository uses called W18 "C6 plan"
and this slot C6's verify wave. **X-21 is unadjudicated.** This file does not amend §2.

---

## 0. Verdict

**Not passed**, against the protocol-C4 exit standard in `docs/plan/wave-protocol.md` §5.1
(播放体验 is no longer 1/3-with-QA-010-absent, and is still not 3/3), and **not passed**
as a C6-backlog close either — even though rank 3's smallest axe-core job, plugin-owned
倍速 / scrub, S7 stall retry, INF-004 S-C1, and the already-landed PLY-012 all hold on
this tree.

Protocol C4's three exit conditions, re-scored at `eff5eb2` rather than copied from the
C6 plan's `aa8a9e8` table:

| Protocol C4 exit (`wave-protocol.md` §5.1) | C6 plan (`aa8a9e8`) | This tree (`eff5eb2`) |
|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met.** Swipe / `playNext` / double-tap / PLY-012 on `main`. 倍速 / scrub plugin-owned and not kept. Stall chrome absent | **Still not met as 全过.** Named remainders now include kept progress + `playbackrate` plugins (X-26 still unadjudicated; no client `playbackRate`, no 0.75 constant), S7 stall indicator then retry, and PLY-012. Tap pause stays VePlayer-owned. D9 stays `[ ]` until a device. The 倍速 handoff itself does not claim this exit closed |
| 跨端进度冲突用例通过 | **Met as the named product case.** `cross-end-conflict.test.ts` (3) | **Stays met as that case.** Not a two-phone E2E. Do not retake |
| a11y 门禁上线且核心屏零 critical/serious | **Not met.** QA-010 in flight (`bc-b0108787`). No axe-core job | **Still not met as S-A1 on every SCR/PNL.** The smallest L1 job is on `main` (`check:a11y`, SCR-13 fixture only, host=jsdom not TikTok WebView). Dated notes in `docs/14-quality-gates.md` §2.1 and `docs/14-test-plan.md` §6.4 say this slice does **not** close protocol-C4 exit 3. Remaining implemented screens are not scanned |

One of three. The C6 plan ranked that epic as remaining distance and told implement
waves not to open it as a new epic, not to invent `playbackRate`, and not to start a
twin QA-010. W18 work siblings opened the named remainders anyway (plugin-owned keep,
stall chrome, the smallest axe job, S-C1 audit). This slot re-scores the tree, not the
plan's P-02.

The C6 backlog (the running-count document W18 wrote) moved. Scorecard in §9. Two facts
decide the verdict independently of that scorecard:

1. **GitHub Actions still cannot start jobs (D-17).** CI run
   [33130107976](https://github.com/Dawan2/minidrama/actions/runs/33130107976) and L2 run
   [33130107964](https://github.com/Dawan2/minidrama/actions/runs/33130107964) on `eff5eb2`
   (2026-08-28T00:33:39Z) failed in 4 seconds with empty `steps`. Annotation on check-run
   `98717386809`: "The job was not started because recent account payments have failed or
   your spending limit needs to be increased." Last successful CI on `main` is still
   [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at PNL-01,
   2026-08-27T20:12:42Z. Iron rule R6 is still unverifiable from CI. Local `pnpm verify`
   is green (3,542 tests). Local green does not substitute for the gate.
2. **C5-03 / D-19 is still open.** `wave-protocol.md` §6.2 still says "no database, no
   migration, 27 seed episodes against a floor of 80, no CI L2". That sentence is false on
   `eff5eb2`. P3 owns the file. This slot does not rewrite it.

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the next plan wave
must schedule remediation as top priority and implement waves may not open a **new
epic** until re-verification passes. Conditional pass is not available: D-17 is still
P1. Protocol-C5 变现闭环 is not this cycle's assignment and is not opened here.

AM-blocked items (C3-08 last step, C3-09 rate, C4-07 contract, GATE-0…GATE-8,
Q-G-1…Q-G-10) remain **open / unknown**. No EIS date, no BytePlus ingest date, no Beans
rate, no CI-restoration date, no partner-approval date, and no AM name is recorded here.

---

## 1. The headline finding: C6 landed the named playback remainders and two new L1 jobs, and GitHub still cannot watch any of it

All three halves matter.

C5's headline was named playback-UX remainders plus L1 leftovers, observer dark. On
`eff5eb2` the tree also has:

```
$ git rev-parse --short origin/main
eff5eb2
$ rg -n 'name: QA-010|name: INF-004|check:a11y|check:audit' .github/workflows/ci.yml
      - name: INF-004 CI self-audit
        run: pnpm run check:audit
      - name: QA-010 a11y
        run: pnpm run check:a11y
$ rg -n 'playbackRate' app/src/player --glob '!*.test.*'
# (empty — no product caller)
$ rg -n "VEPLAYER_IGNORED_PLUGINS" -A 10 app/src/player/veplayer-plugins.ts
export const VEPLAYER_IGNORED_PLUGINS = [
  'moreButtonPlugin', 'enter', 'fullscreen', 'volume', 'play',
  'pip', 'replay', 'sdkDefinitionPlugin',
] as const;
# progress and playbackrate are kept by omission
$ rg -n 'createStallWatchdog' app/src/player/PlayerSurface.tsx
import { createStallWatchdog } from './player-stall';
$ rg -n 'planFatalReissue' app/src/player/player-fatal.ts
export function planFatalReissue(completedAttempts: number): FatalReissuePlan {
```

QA-010 is `pnpm check:a11y` inside `verify` and as a named L1 step. INF-004 is
`pnpm check:audit` the same way. 倍速 is the kept VePlayer `playbackrate` plugin, not a
client ladder. Scrub is the kept progress plugin plus seek inference. Stall is S7
chrome (indicator 1.5 s, retry 8 s) without changing definition. PLY-012 silent
re-issue is an ancestor (`aa8a9e8`).

And then the observer is the same colour it has been since PNL-01:

```
$ gh api repos/Dawan2/minidrama/check-runs/98717386809/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

QA-010, INF-004, the kept plugins, stall retry, PLY-012 — none of them has a
GitHub-executed reverse-verification on this trunk. The jobs exist as YAML. The runner
will not start.

---

## 2. Repository topology

```
$ for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/cursor); do
    git merge-base --is-ancestor "$b" origin/main || echo "UNMERGED $b"
  done
UNMERGED origin/cursor/w13-work-c3-remain-72c4
UNMERGED origin/cursor/w14-work-c4-subseq-72c4
```

Two leftover tips at snapshot (the C5 report's nog19 / QA-011 branch is now an
ancestor). QA-010 (`cursor/w16-work-qa010-72c4`), stall (`w18-work-interaction-72c4`),
scrub (`w18-work-x26-72c4`), INF-004 (`w18-work-c6-next-72c4`), 倍速
(`w18-work-x26-other-72c4`), and the C6 plan (`w18-plan-cycle-6-c656`) are ancestors of
`eff5eb2`.

| Branch | Commits off `main` at snapshot | Substance | Disposition |
|---|---:|---|---|
| `cursor/w13-work-c3-remain-72c4` | leftover | Original `GET /v1/wallet/transactions` | **Leftover.** D-18 closed by port. Do not implement a second route |
| `cursor/w14-work-c4-subseq-72c4` | leftover | Duplicate C4-08 ads | Leftover. Do not retake |

A twin PLY-011 branch appeared while this report was being written. §13.

### 2.1 Cycle labelling is still two schemes (D-13 / X-21)

Unchanged. Protocol: C4 = W16–W20, this slot is protocol-C4's verify wave. Running
count: W18 wrote `cycle-6-backlog.md` and this slot writes `cycle-6-report.md`. Still
P3's.

---

## 3. Maturity

### 3.1 Mandatory platform capabilities (D4–D9)

Checklist rows in `docs/11-official-onboarding-checklist.md` D4–D9 remain `[ ]`. That is
correct under §8 rule 6. No product call site was added this cycle that would flip a row.

| # | Capability | C5 (`a8e1c63`) | C6 (`eff5eb2`) |
|---|---|---|---|
| D4 | Silent login | mock + recovery + stubbed token exchange | **Unchanged.** Real port still refuses without a secret |
| D5 | Rewarded video ad | wired against mock; `adUnlock: false` | **Unchanged** |
| D6 | Interstitial ad | same flag | **Unchanged** |
| D7 | Beans one-off | stubbed create; recharge disabled | **Unchanged.** No rate in types |
| D8 | Subscription | probe + fail-closed card; no `#/vip` | **Unchanged.** No OpenAPI subscription path |
| D9 | Nav bar / capsule | wired, not device-run | **Unchanged** |

### 3.2 Screens and panels

| | C5 (`a8e1c63`) | C6 (`eff5eb2`) |
|---|:---:|:---:|
| Numbered screens | 11 of 13 | **11 of 13** — SCR-01 overlay. Missing: SCR-10 `#/recharge`, SCR-11 `#/vip` |
| Hash routes | 11 named | **11 named** — home, browse, search, drama, play, me, history, favorites, wallet, settings, fallback. No `recharge:` / `vip:` in `routes.ts` |
| Panels | 2 of 5 | **2 of 5** — PNL-01, PNL-02. PNL-05 stays deleted from the product (VePlayer plugins, X-26) |

### 3.3 Server surface and OpenAPI lockstep

```
$ rg -c '^  /' contracts/openapi.yaml
24
$ rg -c '^    (get|post|put|patch|delete):' contracts/openapi.yaml
27
```

Twenty-four paths, twenty-seven operations. Unchanged since C5. Path + router + client
still agree on `GET /v1/wallet/transactions`. **D-18 stays closed.**

### 3.4 Persistence — still sqlite, still not T14

Seven paired migrations (`0001`…`0007`, up and down). `postgres:` URLs are refused at
boot (`database-url.ts` returns `unwired`, does not rewrite to a file). No `drizzle` in
workspace `package.json` files. Redis is not read. Seed floor still 80 listed episodes
(`SEED_LISTED_EPISODE_FLOOR`). No BytePlus ids. **C4-03 is open.** Do not mark T14 `[x]`
on sqlite.

### 3.5 Playback — protocol-C4 remainders, probed

| Slice | What happens on `eff5eb2` |
|---|---|
| **PLY-010 连播 / 切集 / 双击点赞** | On `main` (C5). Do not retake |
| **PLY-010 倍速** | **Kept plugin.** `VEPLAYER_IGNORED_PLUGINS` does not list `playbackrate`. No product `playbackRate`. No competing panel. X-26 (scope 0.75 vs inventory 1.0/1.25/1.5/2.0) is **not** closed by a client constant. Unique commit `925f1e9` |
| **PLY-010 进度条拖拽** | **Kept plugin + seek inference.** Progress not in `ignores`. Horizontal drag is not 切集. A `timeupdate` discontinuity flushes progress. Unique commit `acbdcf9` |
| **S7 stall / retry** | Watchdog while `playing`: spinner at 1.5 s, retry at 8 s, last frame stays, retry remints the route episode. Definition is not changed. Unique commit `00ec1d3` |
| **PLY-012** | **On `main`** (`aa8a9e8` / `player-fatal.ts`). VePlayer `error` re-mints once on the retained instance. Failed mint overlays retry copy. Do not retake |
| **PRG-001 / PRG-002** | Stay closed as the named cases. Do not retake |

D-16 stays closed: product source names no `demoPlaylist` / `vid_demo_` / `DEMO_ALBUM`.
PLY-002 is still `unmeasured` (`docs/gates/ply-002.md`). **Do not fill a date.**

### 3.6 Overall maturity judgement

The project has moved from **C5's named gesture remainders plus L1 leftovers, observer
dark** to **the same app with plugin-owned 倍速 / scrub kept, S7 stall chrome, a
smallest axe-core L1 job on SCR-13, and an INF-004 workflow self-audit**. That is a
category change on *player chrome* and on *two more L1 jobs*, which is what C6
implement waves actually picked.

What it is not: it is not the full §4.3 sheet; it is not S-A1 on every implemented
screen; it is not PostgreSQL; it has never run on a device; GitHub cannot currently
start its own jobs. Against the twelve-cycle map, the honest position is
"protocol-C4 1/3, running-count C6 remediations mostly closed except paper and billing,
observer still dark."

---

## 4. Increment against cycle 5

Every C5 number is from `docs/verify/cycle-5-report.md` at `a8e1c63`. Every C6 number
was measured on `origin/main` at `eff5eb2`.

| Measure | C5 | C6 | Change |
|---|---:|---:|---|
| `main` commits / files | 519 / 709 | **560 / 738** | +41 / +29 |
| Unmerged `cursor/*` tips | 3 | **2** | QA-011 / nog19 landed; remain + leftover ads stay |
| Test files (skip-check) | 226 | **235** | +9 (includes 2 Playwright specs) |
| Tests | 3,416 | **3,542** | **+126** |
| Source lines (ts/tsx, non-test) | 33,479 | 34,997 | +5% |
| Test lines | 44,396 | 46,274 | +4% |
| Contract paths / operations | 24 / 27 | **24 / 27** | unchanged |
| CI on `main` at HEAD | jobs do not start (billing) | **jobs do not start (billing)** | D-17 unchanged |
| L1 gates present | 9 of 10 jobs + G1.7 dated as G2.5 | **same 9 of 10 + G1.7 dated, plus QA-010 and INF-004 as extra L1 steps** | +axe-core job, +S-C1 audit |
| L2 gates present | 8 of 8 | **8 of 8** | unchanged |
| Screens | 11 of 13 | **11 of 13** | unchanged |
| Overlay panels | 2 of 5 | **2 of 5** | unchanged |
| Bundle JS | 358.15 kB (109.49 kB gz) | **363.77 kB (111.39 kB gz)** | `index-ByK_fUdY.js` |

Test-to-source line ratio is 1.32 (C5 was 1.33). Volume did not come from thinning the
suite. Coverage floors in `packages/quality/coverage-thresholds.json` are still diff 80 /
global line 60 / global branch 50 / core 90.

`pnpm verify` now includes `check:audit` and `check:a11y` between `check:skips` and
`test:coverage`. C5's verify script did not.

---

## 5. Evidence

### 5.1 `main` verifies clean locally at `eff5eb2`

```
$ git rev-parse HEAD
eff5eb27bca7b6d62b52791d9edf5280c4fead16
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0
```

`verify` = `format:check` → `lint` → `typecheck` → `check:commits` → `check:skips` →
**`check:audit`** → **`check:a11y`** → `test:coverage` → `check:coverage` → `build` →
`check:guardrails`. First try on this SHA, no retry.

```
commits passed (0 new commits vs origin/main, 0 prose, 0 missing-id)
skip-check passed (235 test files, 0 skips, 0 empty)
audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits)
a11y passed (1 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)
coverage global lines 94.35% (17617/18672), branches 90.96%, core lines 95.70%, diff lines 100.00% (0/0)
coverage gate passed
platform guardrails passed (artifact: /workspace/app/dist)
```

G1.6 `check:contract` and G1.8 `check:secrets` are **not** in `verify` (binaries are L1
CI installs). G2.3 `check:smoke` is **not** in `verify`. Also
`pnpm run check:licenses` → `license whitelist passed (354 packages)`.

| Package | Test files | Tests |
|---|---:|---:|
| `packages/shared` | 8 | 63 |
| `packages/config` | 3 | 45 |
| `packages/quality` | 27 | 419 |
| `server` | 98 | 1,785 |
| `app` | 97 | 1,230 |
| **Total (vitest)** | **233** | **3,542** |

0 failed, 0 skipped. Skip-check's 235 includes the two Playwright specs under
`packages/quality/e2e/specs/`. Build emits `dist/assets/index-ByK_fUdY.js`, 363.77 kB
(111.39 kB gzipped). Guardrails passed against that artifact.

Playback suites inside that run: `PlayPage.test.tsx` 39, `PlayerSurface.test.tsx` 25,
`player-stall.test.ts` 12, `player-fatal.test.ts` 9, `veplayer-plugins.test.ts` 7,
`episode-double-tap.test.ts` 5, `episode-swipe.test.ts` 4,
`cross-end-conflict.test.ts` 3, `drama-continue-cta.test.ts` 9. All passed.

A11y scan inside that run: one committed fixture,
`packages/quality/a11y/screens/scr-13-fallback.html`. jsdom prints
`HTMLCanvasElement's getContext()` not implemented; `color-contrast` is not disabled;
the equivalent checker on declared CSS colors is the reverse path in §5.3.

### 5.2 `main` does not verify on GitHub (D-17, unchanged)

```
$ gh run list --repo Dawan2/minidrama --branch main --limit 4
33130107976  failure  eff5eb2  CI   4s  2026-08-28T00:33:39Z
33130107964  failure  eff5eb2  L2   4s  2026-08-28T00:33:39Z
33129932238  failure  5544125  CI   6s  2026-08-28T00:30:21Z
33129932252  failure  5544125  L2   5s  2026-08-28T00:30:21Z
```

Job `verify` at check-run `98717386809`: `conclusion: failure`, `steps: []`, annotation
as in §1. Every L2 job on the same push (`G2.3 smoke E2E` included) is the same
empty-steps failure. Last *successful* CI on `main`: still PNL-01 at 20:12:42Z. **R6
remains unverifiable from CI.**

### 5.3 Reverse verification of two claimed C6 gates

Performed on `eff5eb2`; mutations restored; nothing committed. These are the two C6
L1 claims the handoffs asked a verifier to inject.

**QA-010 contrast (rank 3 / protocol-C4 exit 3 remainder).**
`packages/quality/a11y/screens/_w19-probe.html` was written as white-on-white
(`p { color: #ffffff; background: #ffffff; }`), with `scr-13-fallback.html` still
present.

```
$ pnpm run check:a11y
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast packages/quality/a11y/screens/_w19-probe.html color-contrast p 1.00:1 < 4.5:1
Exit status 1
```

Removed; `pnpm run check:a11y` →
`a11y passed (1 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)`.
A comment that names WCAG is not this gate. **Holds as the smallest scan.** It does
not prove S-A1 on HOME / play / me.

**INF-004 S-C1 continue-on-error (not a C6 ranked remainder; landed while C6 ran).**
`.github/workflows/_w19-probe.yml` was written with `continue-on-error: true`.

```
$ pnpm run check:audit
audit failed (1): continue-on-error / if: false / swallowed exits are INF-004 red
  continue-on-error .github/workflows/_w19-probe.yml:6 continue-on-error: true
Exit status 1
```

Removed; `pnpm run check:audit` →
`audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits)`.
A comment that forbids `continue-on-error` is not this gate. Committed workflows have
no `continue-on-error:` **key**. **Holds.**

**Playback, probed not mutated.** `rg playbackRate app/src/player` over non-test files
is empty. Constructor `ignores` does not list `progress` or `playbackrate`.
`PlayerSurface` mounts `createStallWatchdog` and a `data-testid="player-stall-retry"`
control. `player-fatal.ts` still plans one silent re-issue. Those suites passed inside
`pnpm verify` (§5.1). Listing `playbackrate` in `ignores` is the mutation the 倍速
handoff already named; this slot did not repeat it.

**G2.3, probed not mutated.** `pnpm run check:smoke` on this machine: Playwright CLI is
present, Chromium executable is not
(`/home/ubuntu/.cache/ms-playwright/chromium_headless_shell-1234/...`). Both P0 specs
fail in 1 ms; exit 1. That is red, which is the job's contract. GitHub has not executed
the job (D-17).

### 5.4 The iron rules

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | 226 → 235 files, 3,416 → 3,542 tests, monotonic | **clean** |
| R3 no skipped tests | `check:skips` 0 skips / 0 empty; `rg '\.skip\(|\.only\(|it\.todo\(|test\.todo\('` over product tests is empty | **clean** |
| R4 no weakened standards | `eslint-disable` / `@ts-ignore` | **3 matches**, all `no-script-url` in tests naming a refused `javascript:` scheme. Same class as C5. Coverage floors not lowered |
| R5 no empty tests | G1.10 still fails an empty `it('…', () => {})` (C5 §5.3). Sampled playback / a11y / audit suites this slot ran | behavioural; a11y and audit CLIs are exit-status |
| R6 `main` releasable | local verify green; GitHub jobs do not start | **split — D-17** |

TypeScript still `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
No `continue-on-error:` **key** in either workflow (comments mention the absence; YAML
has no such key). INF-004 now *is* the machinery that would catch one.

---

## 6. Gate enforcement

### 6.1 L1 — nine of ten numbered jobs, G1.7 dated, plus QA-010 and INF-004

`.github/workflows/ci.yml` vs `docs/14-quality-gates.md` §2. `workflow_dispatch:` is
present. Triggers: `push` `[main, cursor/**]`, `pull_request`, `workflow_dispatch`.

| Gate | C5 | C6 | Note |
|---|:---:|:---:|---|
| G1.1–G1.4 | yes | yes | format, lint, typecheck, unit tests (`test:coverage`) |
| G1.5 coverage | yes | yes | floors + ratchet. In `pnpm verify` |
| G1.6 contract compatibility | yes | yes | oasdiff. **Not** in `pnpm verify` |
| G1.7 dependency audit | dated as G2.5 Trivy | **stays dated as G2.5** | No second osv-scanner / `npm audit` L1 job |
| G1.8 secrets | yes | yes | Gitleaks. **Not** in `pnpm verify` |
| G1.9 commit convention | yes | yes | format + tracker id. In `verify` |
| G1.10 skip / empty-test | yes | yes | In `verify` |
| QA-010 a11y | no | **yes** | Reverse-verified this slot (§5.3). In `verify`. SCR-13 only |
| INF-004 CI self-audit | no | **yes** | Reverse-verified this slot (§5.3). In `verify` |

`ci.yml` was not folded into L2. There is no `continue-on-error` key.

### 6.2 L2 — eight of eight jobs, zero GitHub-green

`.github/workflows/l2.yml` jobs: licenses (G2.8), migrate (G2.7), integration (G2.2),
artifact (G2.6), sast (G2.4 Semgrep), codeql (G2.4 CodeQL), sca (G2.5 Trivy), **smoke
(G2.3)**. `workflow_dispatch:` present. No `continue-on-error` key.

C2's third exit (L2 all green and reverse-verified): **8 of 8 jobs present. 0 of 8
reverse-verified on GitHub.** That is D-17, not a missing YAML job.

### 6.3 Reverse verification (checklist V-b)

| Gate | Reverse-verified this slot? |
|---|---|
| QA-010 injected contrast `< 4.5:1` | **yes** (§5.3) |
| INF-004 `continue-on-error: true` | **yes** (§5.3) |
| G2.3 missing Chromium / failed P0 | **probed** live, exit 1; no GitHub execution |
| G1.9 / G1.10 | not re-injected; C5 already did; CLIs still in `verify` and passed clean |
| Playback kept-plugin / stall / re-issue | **probed** via the suite this slot ran |

---

## 7. Defects

Recorded, not fixed, per §4.1 rule 4.

### 7.1 Earlier defects, re-tested

| ID | C5 | C6 | Evidence |
|---|---|---|---|
| **D-01** bundle scan | Still fixed | **Still fixed** | Guardrails passed on `index-ByK_fUdY.js` |
| **D-02** cover allowlist | Wired | **Stays wired** | |
| **D-03** CI never executed | D-17 | **Stays D-17** | Jobs exist; they do not start |
| **D-04** contract fork | Lockstep | **Lockstep holds** | 24/27, bidirectional |
| **D-05** file-ownership | Paper | **Unchanged on paper** | |
| **D-06** SR-5 identifier-in-bundle | Open | **Unchanged** | Do not ban the installer call |
| **D-07** doc 12 unlock paths | Closed as wording | **Stays closed** | |
| **D-08** three gate registers | Partial | **Unchanged** | |
| **D-09** integrator unnamed | Paper closed | **Stays paper-closed** | |
| **D-10** flake class | Closed | **Stays closed** | |
| **D-11** contract parity unmeasured | Measurement closed | **Stays a table** | |
| **D-12** unlock-grant unmerged | Closed | **Stays closed** | |
| **D-13** cycle-label drift | Open | **Open.** X-21 | |
| **D-14** `o("video",p)` residual | Open, P3 | **Open** | |
| **D-15** gate status never written back | Filing | **Stays a filing.** §6.2 still stale (**D-19**) | |
| **D-16** player never mints a session | Closed | **Stays closed.** Demo album still absent from product source | |
| **D-17** GitHub Actions will not start jobs | P1 open | **Open, unchanged.** Same annotation, SHA `eff5eb2`, still 4 s | |
| **D-18** wallet transactions 404 | Closed as merge | **Stays closed.** Path + router + client agree | |
| **D-19** `wave-protocol.md` §6.2 stale | P2 open | **Open.** Sentence at line 235 is false on this tree | |
| **D-20** G1.7 / G1.9 / G1.10 absent | Closed | **Stays closed** | |
| **D-21** PLY-002 unmeasured | P2 open | **Open.** `measurePly002EquivalentHost()` still `unmeasured` | |

No D-22. The leftover remain / ads / in-flight leftover-PLY-011 branches are topology,
not new product defects.

C2 L2 exit re-scored: **8 of 8 jobs present, 0 GitHub-green.**

---

## 8. Blockers

### 8.1 Summary

Partner answers are **unknown**. None is invented. Questions remain in
`docs/gates/open-questions.md`.

| Blocker | Owner | C5 | C6 | Blocks |
|---|---|:---:|:---:|---|
| GitHub Actions billing | Account / ops | **open (D-17)** | **open (D-17)** | any use of CI as a gate on `main` |
| a11y gate (QA-010) | Engineering | not on `main` | **smallest job on `main` (SCR-13).** Remaining implemented screens open. Protocol exit 3 unmet | protocol-C4 exit 3 / S-A1 |
| T14 PostgreSQL | Engineering | sqlite (C4-03) | **sqlite (C4-03 open)** | named production DB |
| SCR-11 VIP contract | Business then B | blocked (C4-07) | **blocked (C4-07)** | `#/vip` |
| PLY-012 token re-issue | Engineering | open | **closed as merge** (`aa8a9e8`) | — |
| PLY-002 host MSE/EME | Engineering + device | unmeasured (D-21) | **unmeasured (D-21)** | C3 exit 3 |
| `GATE-8` BytePlus / VePlayer | Business | `[ ]` | `[ ]` **no movement** | ingest, listing, catalogue `vid` |
| `GATE-7` EIS | Business | `[ ]` | `[ ]` **no movement** | monetised EU/US launch |
| M0 official PDF | User | `[!]` | `[!]` **no movement** | "requirements verified" |
| M1 credentials | Business | `[ ]` | `[ ]` | real login last step |
| M2 / M4 | Business | `[ ]` | `[ ]` | Beans rate, ads live ids, recharge enable |
| M3 / M5 / M6 | Business | `[ ]` | `[ ]` | listing, US, device |
| Beans conversion rate | Business | missing | **missing** | D7 pricing; SCR-10 |

**Nine business-track blockers, still zero external evidence.** Filing is not answering.
This slot did not fill a date. AM is **unknown**.

### 8.2 `GATE-8` held again, as engineering

No BytePlus ingest, moderation, or listing implementation. Bundle scan still bans
`hls.js`, `videojs`, `shaka-player`, `dashjs`. Catalogue fixtures still have no `vid` /
`albumId`. **No ingest date is recorded.**

### 8.3 Beans conversion, still not an engineering close

No product rate. Wallet recharge button is `disabled`. Top-up copy still says prices
have not been set. **Q-G-7 unanswered.**

---

## 9. C6 backlog scorecard

Re-derived at `eff5eb2`. The plan at `aa8a9e8` / `68d2747` is the ranked list; this is
the tree after the implement waves.

| ID | Plan at `aa8a9e8` | This tree (`eff5eb2`) |
|---|---|---|
| **D-17** rank 1 | Open. Cannot be code-fixed | **Open. Unchanged.** Run 33130107976, 4 s, empty steps |
| **Protocol-C4** rank 2 | 1/3. Sheet not full. Do not invent `playbackRate` | **1/3.** Exit 2 stays met. Exit 1: plugin-owned 倍速 / scrub **kept**, stall chrome on `main`; sheet still not 全过; no client `playbackRate`. Exit 3: job online as SCR-13 only |
| **QA-010** rank 3 | In flight (`bc-b0108787`) | **Closed as the smallest L1 job** (`a68a964` / `3e8bdb2`). Remainder: other implemented screens. Not protocol exit 3 |
| **PLY-012** | Closed as merge (`aa8a9e8`) | **Stays closed.** Do not retake `player-fatal.ts` |
| **C4-03** rank 4 | Open. Do not fake | **Open. Not faked.** `postgres:` refused |
| **C4-07** rank 5 | Open, blocked | **Open, blocked.** No `#/vip`. No subscription path |
| **INF-004 S-C1** | Not a ranked remainder | **On `main`** (`f40fe36`). Reverse-verified this slot. S-C3 / S-C4 left as further slices |
| **S7 stall** | Not named as a rank | **On `main`** (`00ec1d3`). Indicator then retry. Do not retake `player-stall.ts` |
| **PLY-010 倍速 / scrub** | Do not pick as leftover; X-26 | **On `main` as plugin-owned keep** (`acbdcf9`, `925f1e9` / `eff5eb2`). X-26 unadjudicated. Do not invent a client ladder |
| **HOME continue / PRG-001 / PRG-002 / C5-01 / C5-02 / QA-011 / G2.3** | Not remaining | **Stay not remaining** |
| **C5-03 / D-19** | P3 writeback | **Open.** §6.2 stale |
| **C4-05 / C4-06 / C4-08 / D-21** | Last steps gated | **Unchanged** |
| **Tier C / AM** | Unknown | **Unknown.** No date invented |

The C6 plan's rank-1 item cannot land from a branch. Rank 3's *job* landed. Rank 2's
sheet is closer and still not 全过. That is the scorecard, and it is why this is not a
pass.

---

## 10. Targets for the next cycle

This list is the verify slot's ordering, not a rewrite of `cycle-6-backlog.md`.

### Tier 0 — the observer, still

1. **Restore GitHub Actions (D-17)** so a red `main` is a test result again. Until then
   every "CI green" claim is local-only, including QA-010, INF-004, and G2.3.
2. **Do not open protocol-C5 变现闭环** while D-17 is P1 and protocol-C4 is 1/3
   (`wave-protocol.md` §4.3).

### Tier 1 — protocol-C4 remainder, and paper

3. **QA-010 remainder:** axe-core (or the equivalent contrast checker) on the other
   implemented screens. Do not retake SCR-13. Do not `continue-on-error`. Do not claim
   TikTok WebView.
4. **X-26:** P1/P2 adjudicate 0.75 vs inventory before any client constant. The kept
   plugin is not that write. Do not pick 0.75.
5. **C5-03 / D-19:** refresh `wave-protocol.md` §6.2 (and §5.1 status columns). P3.
6. **C4-03:** Postgres as a working scheme **or** a written, dated amendment of T14.
7. **Drop or archive leftover** `w13-work-c3-remain-72c4` and `w14-work-c4-subseq-72c4`.
   A twin PLY-011 leftover is §13's problem, not a second S6.

### Tier 2 — AM-blocked, unblocked halves only

8. **C4-05 / C3-08** stay refusing without a secret.
9. **C4-06 / C3-09** keep recharge disabled; no rate in types.
10. **C4-07** needs a contract first.
11. **PLY-002 host (D-21)** needs devices. The contract probe is not that measurement.

### Not a new epic until re-verification

变现闭环 (protocol C5), `#/vip`, live `adUnlock`, a guessed Beans rate, a client
`playbackRate` ladder.

---

## 11. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | C5 | C6 | Basis |
|---|---|:---:|:---:|---|
| **V-a** | Acceptance criteria reproducibly met? | Not passed | **Not passed** | Rank 3's smallest job, INF-004, kept 倍速 / scrub, stall, and PLY-012 hold and were re-run (§5.1, §5.3, §9). Protocol C4 1/3 (§0). D-17, C5-03, C4-03, C4-07 open |
| **V-b** | Is CI actually catching things? | Split | **Split** | Locally: yes, and this slot turned two claimed gates red on purpose (§5.3). On GitHub: jobs do not start (D-17). L2 is eight YAML jobs and zero executed runs |
| **V-c** | Skipped / deleted / weakened tests or gates? | Passed | **Passed** | Zero skips, monotonic counts, no threshold cut, no `continue-on-error` key. INF-004 now *is* the bypass machinery. Same three `no-script-url` tests |
| **V-d** | Documents and code consistent? | Not passed | **Not passed** | OpenAPI ↔ router lockstep holds; D-18 stays closed. Remaining: D-19, X-21, protocol §5.1 C4 still `[ ]` / C3 still `[~]`, C6 plan evidence block still describes `aa8a9e8` (no axe job, 倍速 not kept) |
| **V-e** | Gate and blocker states honestly written back? | Split | **Split** | *In handoffs:* still the house's best quality (QA-010 "not protocol exit 3", 倍速 "does not claim exit 1 closed", `adUnlock` false, recharge disabled). *In the register:* AM items still unknown (correct); §6.2 already stale (D-19). This report does not invent dates |

---

## 12. Closing note

C5's closing note said the cycle landed the named playback remainders and the last L1
leftovers, and that GitHub had not executed a job since PNL-01. C6 put axe-core on L1
as the smallest SCR-13 scan, put a `continue-on-error` self-audit on L1, kept the
VePlayer progress and `playbackrate` plugins instead of inventing client controls, and
added S7 stall chrome that retries without changing definition. Locally, `pnpm verify`
is 3,542 tests, the coverage gate prints 94.35% / 100.00% diff, a white-on-white
fixture is red, and `continue-on-error: true` is red.

Two things stop that from being a pass.

The first is **the observer, again.** GitHub has not executed a job on `main` since
PNL-01. Every new gate this cycle claims — QA-010, INF-004, the kept plugins on HEAD —
is YAML plus local fixtures. That is the same colour as a silent regression.

The second is **the map.** Protocol C4 is 1/3, not 3/3. Running-count C6 did the
remediation the C6 plan ranked as buildable once QA-010 left flight, plus several
named sheet halves the plan told implement waves not to open as an epic, except the
paper writeback P3 owns and except the billing outage nobody in engineering can close
from a branch.

The pattern worth carrying is the one the QA-010 and INF-004 slots already practise:
the close is a *refusal* (white-on-white is red, `continue-on-error: true` is red, a
client `playbackRate` is red) and the test that bites is the mutation that would look
like a feature. This slot's reverse-verification was that shape twice. D-17 is the
same shape in the other direction — a workflow that looks like a gate.

---

## 13. Postscript — what moved while this report was being written

Everything above through §12 was measured against `origin/main` at **`eff5eb2`**
(2026-08-28T00:33:25Z). `pnpm verify` ran in this slot on that SHA (3,542 tests,
exit 0). Two agents were RUNNING at snapshot. One landed before this file merged to
`main`.

| Agent | Branch | Tip at snapshot | State when this section was written |
|---|---|---|---|
| `bc-119dafb6` W18 work following C6 item | none at snapshot; later `origin/cursor/w18-work-c6-follow-72c4` | — | **Landed.** `origin/main` **`9b563b0`** (2026-08-28T00:37:38Z): "docs(handoff): record the W18 PLY-011 S6 locked chrome". Unique product `533433f` `feat(ply-011): show cover and lock chrome on S6 locked play` (`locked-chrome.tsx`). Agent left the RUNNING set |
| `bc-2c841f7a` W18 work leftover C6 item | none at snapshot; later `origin/cursor/w18-work-c6-left-72c4` (`af1b7ff`) | — | **Still RUNNING, not on `main`.** Unique commit `feat(ply-011): show cover and lock chrome on a locked play deep link`. Twin files (`LockedCover.tsx` / `player-lock.ts`), not an ancestor of `9b563b0` |

**PLY-011 landing does not change the §0 verdict.** Re-derived against `9b563b0`, not
the handoff:

- S6 locked play now paints cover + lock mark under PNL-02 and does not construct
  VePlayer (`locked-chrome.tsx`). That is another named sheet remainder (付费墙拦截页
  chrome), not 倍速, not a11y-on-every-screen, not D-17.
- Protocol-C4 exit 1 therefore stays **Not met as 全过**. Exit 3 stays **Not met as
  S-A1**. Scorecard row "stall / 倍速 / scrub on `main`" should now also read
  "PLY-011 S6 lock chrome on `main`".
- D-17 is unchanged on the new tip. CI run
  [33130332354](https://github.com/Dawan2/minidrama/actions/runs/33130332354) and L2
  run [33130332370](https://github.com/Dawan2/minidrama/actions/runs/33130332370) on
  `9b563b0` (2026-08-28T00:37:54Z) are 4–5 second billing failures with empty `steps`.
  Annotation on check-run `98718097301` is the same spending-limit sentence.
- Unmerged `cursor/*` vs `9b563b0`: remain, leftover ads, leftover PLY-011 twin
  (`w18-work-c6-left-72c4`). The follow branch is an ancestor. **Do not merge the
  leftover twin** — that would be a second S6.

**`bc-2c841f7a` has not landed.** A second S6 implementation under different filenames
is the defect if it merges. This slot does not wait on it and does not retake
`PlayPage.tsx`.

A later agent `bc-1a5a2455` (W18 work next C6 after lock chrome) started after
snapshot. Not waited on.

C5-03 / D-19, C4-03, C4-07, AM items: unchanged. No AM date appeared.

The verdict in §0 stands: running-count C6 does not pass, on D-17 and on protocol-C4
exits (1/3 at `eff5eb2`; still 1/3 after PLY-011). The C6 backlog's buildable
remediations (QA-010 smallest job, INF-004, kept 倍速 / scrub, stall) do pass, PLY-011
is now a lock-chrome write on `main` rather than an open named remainder, the named
playback remainders are on `main`, and the AM-blocked half is still unknown.

Snapshot SHA for §§0–12: **`eff5eb27bca7b6d62b52791d9edf5280c4fead16`**. Trunk after
the PLY-011 merge: **`9b563b0b795d91d28995df6214ba279134f1debf`**.
