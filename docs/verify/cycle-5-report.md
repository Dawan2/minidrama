# Cycle 5 — Independent Verification Report (Wave 17)

> **Slot:** W17, independent verifier for running-count cycle C5, against
> `docs/plan/cycle-5-backlog.md` and `docs/plan/wave-protocol.md`.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w17-verify-cycle-5-72c4`, cut from `origin/main` at **`a8e1c63`**
> ("Merge cursor/w16-work-g19-72c4: a conventional commit without a tracker id is G1.9 red",
> 2026-08-27 23:54:38 +0000).
> **Mandate:** record what is true. This slot did not implement product features, did not
> modify any source file to make a check pass, did not delete, skip or weaken a test, and
> did not rewrite any origin branch. Reverse-verification mutations were applied in this
> working tree, observed, and restored with `git reset --hard` / `rm`. The only file added
> is this one. No pull request.
> **Method:** every claim is re-derived from a clean checkout with the command quoted next
> to it, per `docs/plan/wave-protocol.md` §4.1 rule 3. Where a W16 handoff asserts a result,
> the result was re-run rather than accepted — including `pnpm verify`, L1
> `check:skips` / `check:commits`, playback exits 1–2, and the PRG-002 drama Continue CTA.
> **Predecessor:** `docs/verify/cycle-4-report.md`, verdict **not passed**. Its defects
> `D-01`…`D-21` are re-tested in §7. No new defect id is opened in this cycle; D-18 and
> D-20 close, D-17 does not.
> **In-flight at start (not waited on):** `bc-17fae197` (W16 work C5 excluding G1.9;
> unmerged `origin/cursor/w16-work-c5-nog19-72c4`, QA-011 writeback) and `bc-264077b7`
> (W16 work next C5 after like-gesture; no `cursor/*` branch on origin at snapshot).
> Both **RUNNING**. Postscript §13 if they land.

Protocol arithmetic (`wave-protocol.md` §2) still makes W16–W20 protocol-C4 and W17 an
implement wave. A previous W15 already wrote `cycle-4-report.md`; this slot verifies the
running-count C5 that W16 planned. **X-21 is unadjudicated.** This file does not amend §2.

---

## 0. Verdict

**Not passed**, against the protocol-C4 exit standard in `docs/plan/wave-protocol.md` §5.1
(播放体验 is no longer 0/3, and is still not 3/3), and **not passed** as a C5-backlog close
either — even though C5-01 and C5-02 hold on this tree.

Protocol C4's three exit conditions, re-scored at `a8e1c63` rather than copied from the
C5 plan's `7ecca77` table:

| Protocol C4 exit (`wave-protocol.md` §5.1) | C5 plan (`7ecca77`) | This tree (`a8e1c63`) |
|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met** | **Still not met.** Swipe 切集, `ended` → retained `playNext`, and double-tap favourite are on `main`. 倍速 / scrub stay plugin-owned (X-26, no `playbackRate` in product source). PLY-012 token re-issue is still absent. That is not the full sheet |
| 跨端进度冲突用例通过 | **Not met** (LWW unit tests only) | **Met as the named product case.** `cross-end-conflict.test.ts` (3) plus the pre-seek heartbeat hold. A late older PUT stays 204; resume / HOME / `lastWatched` / session / history read the newer clock. Not a two-phone E2E |
| a11y 门禁上线且核心屏零 critical/serious | **Not met** | **Still not met.** No axe-core job. `QA-011` is an unmerged docs writeback (`w16-work-c5-nog19-72c4`). `QA-010` is not on `main` |

One of three. The C5 plan ranked that epic as remaining distance and told implement waves
not to open it as a new epic. W16 work siblings opened the named remainders anyway, which
is what the in-flight table at plan time already described. This slot re-scores the tree,
not the plan's P-02.

The C5 backlog (the running-count document W16 wrote) is in better shape than the protocol
exits. Scorecard in §9. Two facts decide the verdict independently of that scorecard:

1. **GitHub Actions still cannot start jobs (D-17).** CI run
   [33127930874](https://github.com/Dawan2/minidrama/actions/runs/33127930874) and L2 run
   [33127930848](https://github.com/Dawan2/minidrama/actions/runs/33127930848) on `a8e1c63`
   (2026-08-27T23:54:45Z) failed in 4–5 seconds with empty `steps`. Annotation on check-run
   `98710410553`: "The job was not started because recent account payments have failed or
   your spending limit needs to be increased." Last successful CI on `main` is still
   [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at PNL-01,
   2026-08-27T20:12:42Z. Iron rule R6 is still unverifiable from CI. Local `pnpm verify` is
   green (3,416 tests). Local green does not substitute for the gate.
2. **C5-03 / D-19 is still open.** `wave-protocol.md` §6.2 still says "no database, no
   migration, 27 seed episodes against a floor of 80, no CI L2". That sentence is false on
   `a8e1c63`. P3 owns the file. This slot does not rewrite it.

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the next plan wave must
schedule remediation as top priority and implement waves may not open a **new epic** until
re-verification passes. Conditional pass is not available: D-17 is still P1. Protocol-C5
变现闭环 is not this cycle's assignment and is not opened here.

AM-blocked items (C3-08 last step, C3-09 rate, C4-07 contract, GATE-0…GATE-8, Q-G-1…Q-G-10)
remain **open / unknown**. No EIS date, no BytePlus ingest date, no Beans rate, no
CI-restoration date, and no partner-approval date is recorded here.

---

## 1. The headline finding: C5 closed the three L1 leftovers and D-18, landed the named playback remainders, and GitHub still cannot watch any of it

All three halves matter.

C4's headline was L2-almost, D-16 closed, G2.3 not on `main`, G1.7 / G1.9 / G1.10 absent,
D-18 a client probe against a 404. On `a8e1c63`:

```
$ git rev-parse --short origin/main
a8e1c63
$ rg -n '^      - name: G1\.' .github/workflows/ci.yml
      - name: G1.8 secrets
      - name: G1.6 contract compatibility
      - name: G1.9 commit convention
      - name: G1.10 skip/empty tests
$ rg -n '^  smoke:' .github/workflows/l2.yml
  smoke:
$ rg -c '^  /' contracts/openapi.yaml
24
$ rg -n 'WALLET_TRANSACTIONS_PATH|/v1/wallet/transactions' contracts/openapi.yaml app/src/data/wallet-api.ts server/src/modules/wallet/routes.ts
# OpenAPI path, client constant, and server route agree. D-18 closed as merge.
```

G2.3 is the L2 `smoke` job (landed after the C4 report, recorded by the C5 plan). G1.10 is
`pnpm check:skips` inside `verify` and as a named L1 step. G1.9 is `pnpm check:commits`
with both Conventional Commits format and a requirement/defect id. G1.7 is a dated note
that G2.5 Trivy covers it (`docs/14-quality-gates.md` §2.1). Double-tap favourite, swipe
切集, `ended` `playNext`, PRG-001 cross-end, HOME `continue-rail`, and drama-detail
Continue are all ancestors of this SHA.

And then the observer is the same colour it has been since PNL-01:

```
$ gh api repos/Dawan2/minidrama/check-runs/98710410553/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

G1.9, G1.10, G2.3, the wallet ledger, playNext, the conflict case — none of them has a
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
UNMERGED origin/cursor/w16-work-c5-nog19-72c4
```

Three branches. C4 closed with four (remain, G2.3, after-seek, leftover ads). G2.3 and
after-seek / continue-watching are now ancestors. Remain is still not; its *substance*
(D-18) was ported at `e6b9b86` rather than fast-forwarded.

| Branch | Commits off `main` | Substance | Disposition |
|---|---:|---|---|
| `cursor/w13-work-c3-remain-72c4` | +7 | Original `GET /v1/wallet/transactions` | **Leftover.** D-18 closed by port, not by merging this tip. Do not implement a second route |
| `cursor/w14-work-c4-subseq-72c4` | +3 | Duplicate C4-08 ads | Leftover. Do not retake |
| `cursor/w16-work-c5-nog19-72c4` | +2 (`34768de`, `ac4ad43`) | QA-011 / C-12 a11y writeback | **In-flight `bc-17fae197`.** Not an ancestor of `a8e1c63` |

Cycle-5 plan (`cursor/w16-plan-cycle-5-7348`) and the C4 verify report are ancestors of
`a8e1c63`.

### 2.1 Cycle labelling is still two schemes (D-13 / X-21)

Unchanged. Protocol: C4 = W16–W20, this slot is protocol-C4's first implement wave. Running
count: W16 wrote `cycle-5-backlog.md` and this slot writes `cycle-5-report.md`. Still P3's.

---

## 3. Maturity

### 3.1 Mandatory platform capabilities (D4–D9)

Checklist rows in `docs/11-official-onboarding-checklist.md` D4–D9 remain `[ ]`. That is
correct under §8 rule 6. No product call site was added this cycle that would flip a row.

| # | Capability | C4 (`3cb724c`) | C5 (`a8e1c63`) |
|---|---|---|---|
| D4 | Silent login | mock + recovery + stubbed token exchange | **Unchanged.** Real port still refuses without a secret |
| D5 | Rewarded video ad | wired against mock; `adUnlock: false` | **Unchanged** |
| D6 | Interstitial ad | same flag | **Unchanged** |
| D7 | Beans one-off | stubbed create; recharge disabled | **Unchanged.** No rate in types |
| D8 | Subscription | probe + fail-closed card; no `#/vip` | **Unchanged.** No OpenAPI subscription path |
| D9 | Nav bar / capsule | wired, not device-run | **Unchanged** |

### 3.2 Screens and panels

| | C4 (`3cb724c`) | C5 (`a8e1c63`) |
|---|:---:|:---:|
| Numbered screens | 11 of 13 | **11 of 13** — SCR-01 overlay. Missing: SCR-10 `#/recharge`, SCR-11 `#/vip` |
| Hash routes | 11 named | **11 named** — home, browse, search, drama, play, me, history, favorites, wallet, settings, fallback. No `recharge:` / `vip:` in `routes.ts` |
| Panels | 2 of 5 | **2 of 5** — PNL-01, PNL-02. PNL-05 stays deleted from the product (VePlayer plugins, X-26) |

HOME gained `data-testid="continue-rail"`. Drama detail gained `continue-watching` /
`watch-now`. Neither is a new numbered screen.

### 3.3 Server surface and OpenAPI lockstep

```
$ rg -c '^  /' contracts/openapi.yaml
24
$ rg -c '^    (get|post|put|patch|delete):' contracts/openapi.yaml
27
```

Twenty-four paths, twenty-seven operations. Added since C4: `GET /v1/wallet/transactions`.
`server/src/contract.test.ts` still asserts **both directions**. Parity row is `live`
(`docs/12-api-parity.md`). **D-18 closed.**

Default ledger port is `createUnavailableWalletLedgerPort`: authenticated GET is **200**
empty page, not 404. Unlocks do not become `CONSUME` rows (S73). Beans / fiat keys are
dropped.

### 3.4 Persistence — still sqlite, still not T14

Seven paired migrations, unchanged. `postgres:` URLs are refused at boot. The G2.2 CLI
test "exits non-zero on a postgres URL rather than rewriting it to a file" passed inside
this slot's `pnpm verify`. Redis is not read. **C4-03 is open.** Do not mark T14 `[x]` on
sqlite. Seed floor still 80. No BytePlus ids.

### 3.5 Playback — protocol-C4 remainders, probed

| Slice | What happens on `a8e1c63` |
|---|---|
| **PLY-010 连播 / 切集** | `ended` and swipe-up call `gateAdvance` before VePlayer moves. Entitled next is `enqueueNext` + `playNext` on the retained instance. Locked next holds the final frame and opens PNL-02. Swipe-down rebuilds (`playNext` cannot go backwards). `PlayPage.test.tsx` names these |
| **PLY-010 双击点赞** | Two taps inside 280 ms / 28 px `PUT` `/v1/dramas/{dramaId}/favorite`. Single tap is not `preventDefault`'d. Swipe clears the tap window. A 401 does not flash liked. Second double-tap is the same idempotent follow |
| **PLY-010 倍速 / 拖拽** | **Not in product source.** `rg playbackRate app/src/player` → only a test that forbids inventing it. PNL-05 deleted |
| **PLY-012** | **Open.** No play-token refresh path in product source |
| **PRG-001** | Phone B writes 41 at T+10s; phone A's older 12 arriving second is 204. Resume / HOME continue / drama `lastWatched` / session / history read 41. Two viewers are not two devices. Pre-seek `timeupdate` at 0 after resume 45 is not reported |
| **PRG-002 HOME rail** | `splitHomeFeed` → `data-testid="continue-rail"`. Anonymous / empty-progress stays the mix |
| **PRG-002 drama CTA** | `dramaPrimaryCta` reads progress `lastWatched`, not catalogue `viewer.lastWatched`. Continue href is `playPath(episodeId)` with no `positionSec` on the URL. In-flight / 401 / offline → Watch now |

D-16 stays closed: product source names no `demoPlaylist` / `vid_demo_` / `DEMO_ALBUM`.
PLY-002 is still `unmeasured` (`docs/gates/ply-002.md`). **Do not fill a date.**

### 3.6 Overall maturity judgement

The project has moved from **C4's session-gated player plus seven of eight L2 jobs** to
**the same app with the named playback-UX remainders, a fail-closed wallet ledger, and
L1 at nine jobs plus a dated G1.7**. That is a category change on *player interaction*
and on *the last L1 leftovers*, which is what the C5 plan asked implement waves to pick.

What it is not: it is not the full §4.3 sheet; it is not an a11y gate; it is not
PostgreSQL; it has never run on a device; GitHub cannot currently start its own jobs.
Against the twelve-cycle map, the honest position is "protocol-C4 1/3, running-count C5
remediations mostly closed, observer still dark."

---

## 4. Increment against cycle 4

Every C4 number is from `docs/verify/cycle-4-report.md` at `3cb724c`. Every C5 number was
measured on `origin/main` at `a8e1c63`.

| Measure | C4 | C5 | Change |
|---|---:|---:|---|
| `main` commits / files | 452 / 661 | **519 / 709** | +67 / +48 |
| Unmerged `cursor/*` tips | 4 | **3** | G2.3 and continue-watching landed; QA-011 appeared |
| Test files (skip-check) | 209 | **226** | +17 (includes 2 Playwright specs) |
| Tests | 3,217 | **3,416** | **+199** |
| Source lines (ts/tsx, non-test) | 31,074 | 33,479 | +8% |
| Test lines | 40,723 | 44,396 | +9% |
| Contract paths / operations | 23 / 26 | **24 / 27** | +1 / +1 |
| CI on `main` at HEAD | jobs do not start (billing) | **jobs do not start (billing)** | D-17 unchanged |
| L1 gates present | 7 of 10 | **9 of 10 jobs + G1.7 dated as G2.5** | +G1.9, +G1.10. D-20 closed |
| L2 gates present | 7 of 8 | **8 of 8** | +G2.3 smoke (already on the C5-plan tree) |
| Screens | 11 of 13 | **11 of 13** | unchanged |
| Overlay panels | 2 of 5 | **2 of 5** | unchanged |
| Bundle JS | 353.43 kB (108.04 kB gz) | **358.15 kB (109.49 kB gz)** | `index-DjeAs2wE.js` |

Test-to-source line ratio is 1.33 (C4 was 1.31). Volume did not come from thinning the
suite. Coverage floors in `packages/quality/coverage-thresholds.json` are still diff 80 /
global line 60 / global branch 50 / core 90.

---

## 5. Evidence

### 5.1 `main` verifies clean locally at `a8e1c63`

```
$ git rev-parse HEAD
a8e1c6326acace6ebdeff2b9fce02fe1c76b8417
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0
```

`verify` = `format:check` → `lint` → `typecheck` → **`check:commits`** → **`check:skips`**
→ `test:coverage` → `check:coverage` → `build` → `check:guardrails`. First try on this
SHA, no retry.

```
commits passed (0 new commits vs origin/main, 0 prose, 0 missing-id)
skip-check passed (226 test files, 0 skips, 0 empty)
coverage global lines 94.27% (16682/17696), branches 91.16%, core lines 95.70%, diff lines 100.00% (61/61)
coverage gate passed
platform guardrails passed (artifact: /workspace/app/dist)
```

G1.6 `check:contract` and G1.8 `check:secrets` are **not** in `verify` (binaries are L1
CI installs). G2.3 `check:smoke` is **not** in `verify`. Also
`pnpm run check:licenses` → `license whitelist passed (353 packages)`.

| Package | Test files | Tests |
|---|---:|---:|
| `packages/shared` | 8 | 63 |
| `packages/config` | 3 | 45 |
| `packages/quality` | 22 | 347 |
| `server` | 98 | 1,785 |
| `app` | 93 | 1,176 |
| **Total (vitest)** | **224** | **3,416** |

0 failed, 0 skipped. Skip-check's 226 includes the two Playwright specs under
`packages/quality/e2e/specs/`. Build emits `dist/assets/index-DjeAs2wE.js`, 358.15 kB
(109.49 kB gzipped). Guardrails passed against that artifact.

Playback suites inside that run: `PlayPage.test.tsx` 32, `DramaPage.test.tsx` 37,
`drama-continue-cta.test.ts` 9, `episode-double-tap.test.ts` 5, `episode-swipe.test.ts` 3,
`advance-gate.test.ts` 5, `cross-end-conflict.test.ts` 3. All passed.

### 5.2 `main` does not verify on GitHub (D-17, unchanged)

```
$ gh run list --repo Dawan2/minidrama --branch main --limit 4
33127930848  failure  a8e1c63  L2   5s  2026-08-27T23:54:45Z
33127930874  failure  a8e1c63  CI   4s  2026-08-27T23:54:45Z
33127619878  failure  e59b124  CI   4s  2026-08-27T23:49:17Z
33127619886  failure  e59b124  L2   5s  2026-08-27T23:49:17Z
```

Job `verify` at check-run `98710410553`: `conclusion: failure`, `steps: []`, annotation
as in §1. Every L2 job on the same push (`G2.3 smoke E2E` included) is the same empty-steps
failure. Last *successful* CI on `main`: still PNL-01 at 20:12:42Z. **R6 remains
unverifiable from CI.**

### 5.3 Reverse verification of two claimed C5 gates

Performed on `a8e1c63`; mutations restored; nothing committed. These are the two C5-01
claims the handoffs asked a verifier to inject.

**G1.10 skip / empty-test (C5-01).** `app/src/routes/_w17-probe.test.ts` was written as
`it.skip('blocked', () => { expect(1).toBe(1) })`.

```
$ pnpm run check:skips
skip-check failed (1): committed skip/only/todo/empty tests are G1.10 red
  skip app/src/routes/_w17-probe.test.ts:1 it.skip('blocked', () => {
Exit status 1
```

The same file as `it('blocked', () => {})`:

```
skip-check failed (1): committed skip/only/todo/empty tests are G1.10 red
  empty app/src/routes/_w17-probe.test.ts:1 it('blocked', () => {})
Exit status 1
```

Removed; `pnpm run check:skips` → `skip-check passed (226 test files, 0 skips, 0 empty)`.
A comment that forbids skips is not this gate. **Holds.**

**G1.9 tracker id (G1.9 leftover / D-20).** An empty commit `feat: add a widget` (valid
Conventional Commits, no requirement/defect id):

```
$ git commit --allow-empty -m "feat: add a widget"
$ pnpm run check:commits
commits failed (1): new commits that are not Conventional Commits with a requirement/defect id are G1.9 red
  missing-id feat: add a widget
Exit status 1
```

`git reset --hard HEAD~1` restored `a8e1c63`. `pnpm run check:commits` →
`commits passed (0 new commits vs origin/main, 0 prose, 0 missing-id)`. History on `main`
was not rewritten. **Holds.**

The merge-message claim on `a8e1c63` itself is the same fixture the leftover slot named.
This slot reproduced it on a throwaway commit rather than trusting the handoff.

**G2.3, probed not mutated.** `pnpm run check:smoke` on this machine: Playwright CLI is
present, Chromium executable is not
(`/home/ubuntu/.cache/ms-playwright/chromium_headless_shell-1234/...`). Both P0 specs
fail in 1 ms; exit 1. That is red, which is the job's contract. It is not the committed
"binary absent" CLI fixture (those 3 tests passed inside `pnpm verify`); it is the
browser-missing path. GitHub has not executed the job (D-17).

### 5.4 The iron rules

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | 209 → 226 files, 3,217 → 3,416 tests, monotonic | **clean** |
| R3 no skipped tests | `check:skips` 0 skips / 0 empty; `rg '\.skip\(|\.only\(|it\.todo\(|test\.todo\('` over product tests is the gate, not discipline | **clean** — hits are `process.exit` false-positives and the skip-check's own needles |
| R4 no weakened standards | `eslint-disable` / `@ts-ignore` | **3 matches**, all `no-script-url` in tests naming a refused `javascript:` scheme. Same class as C4. Coverage floors not lowered |
| R5 no empty tests | G1.10 now fails an empty `it('…', () => {})` (§5.3). Sampled `PlayPage.test.tsx`, `cross-end-conflict.test.ts`, `check-skips.test.ts`, `check-commits.test.ts` | behavioural; skip/commit CLIs are exit-status; conflict case asserts 204 then 41 |
| R6 `main` releasable | local verify green; GitHub jobs do not start | **split — D-17** |

TypeScript still `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
No `continue-on-error:` **key** in either workflow (comments mention the absence; YAML
has no such key).

---

## 6. Gate enforcement

### 6.1 L1 — nine of ten jobs, G1.7 dated

`.github/workflows/ci.yml` vs `docs/14-quality-gates.md` §2. `workflow_dispatch:` is
present. Triggers: `push` `[main, cursor/**]`, `pull_request`, `workflow_dispatch`.

| Gate | C4 | C5 | Note |
|---|:---:|:---:|---|
| G1.1–G1.4 | yes | yes | format, lint, typecheck, unit tests (`test:coverage`) |
| G1.5 coverage | yes | yes | floors + ratchet. In `pnpm verify` |
| G1.6 contract compatibility | yes | yes | oasdiff. **Not** in `pnpm verify` |
| G1.7 dependency audit | no | **dated as G2.5 Trivy** | `docs/14-quality-gates.md` §2.1. No second osv-scanner / `npm audit` L1 job |
| G1.8 secrets | yes | yes | Gitleaks. **Not** in `pnpm verify` |
| G1.9 commit convention | no | **yes** | format + tracker id. Reverse-verified this slot (§5.3). In `verify` |
| G1.10 skip / empty-test | no | **yes** | Reverse-verified this slot (§5.3). In `verify` |

`ci.yml` was not folded into L2. There is no `continue-on-error`.

### 6.2 L2 — eight of eight jobs, zero GitHub-green

`.github/workflows/l2.yml` jobs: licenses (G2.8), migrate (G2.7), integration (G2.2),
artifact (G2.6), sast (G2.4 Semgrep), codeql (G2.4 CodeQL), sca (G2.5 Trivy), **smoke
(G2.3)**. `workflow_dispatch:` present. No `continue-on-error` key.

C2's third exit (L2 all green and reverse-verified): **8 of 8 jobs present. 0 of 8
reverse-verified on GitHub.** That is D-17, not a missing YAML job. The C5 plan already
said so.

### 6.3 Reverse verification (checklist V-b)

| Gate | Reverse-verified this slot? |
|---|---|
| G1.10 committed `.skip` / empty `it` | **yes** (§5.3) |
| G1.9 Conventional header with no tracker id | **yes** (§5.3) |
| G2.3 missing Chromium / failed P0 | **probed** live, exit 1; committed missing-binary fixtures inside verify; no GitHub execution |
| G1.5 under-threshold | committed tests in `coverage.test.ts` passed inside verify; floors file not mutated |
| Wallet ledger omit-not-zero / no Beans | committed tests inside verify; not a third source mutation |
| Playback playNext / lock / double-tap / Continue CTA | **probed** via the suite this slot ran |

---

## 7. Defects

Recorded, not fixed, per §4.1 rule 4.

### 7.1 Earlier defects, re-tested

| ID | C4 | C5 | Evidence |
|---|---|---|---|
| **D-01** bundle scan | Still fixed | **Still fixed** | Guardrails passed on `index-DjeAs2wE.js` |
| **D-02** cover allowlist | Wired | **Stays wired** | |
| **D-03** CI never executed | D-17 | **Stays D-17** | Jobs exist; they do not start |
| **D-04** contract fork | Lockstep | **Lockstep holds** | 24/27, bidirectional |
| **D-05** file-ownership | Paper | **Unchanged on paper** | |
| **D-06** SR-5 identifier-in-bundle | Open | **Unchanged** | Do not ban the installer call |
| **D-07** doc 12 unlock paths | Closed as wording | **Stays closed** | |
| **D-08** three gate registers | Partial | **Unchanged** | |
| **D-09** integrator unnamed | Paper closed | **Stays paper-closed** | |
| **D-10** flake class | Closed | **Stays closed** | |
| **D-11** contract parity unmeasured | Measurement closed | **Stays a table** | Wallet-transactions row now `live` |
| **D-12** unlock-grant unmerged | Closed | **Stays closed** | |
| **D-13** cycle-label drift | Open | **Open.** X-21 | |
| **D-14** `o("video",p)` residual | Open, P3 | **Open** | |
| **D-15** gate status never written back | Filing | **Stays a filing.** §6.2 still stale (**D-19**) | |
| **D-16** player never mints a session | Closed | **Stays closed.** Demo album still absent from product source | |
| **D-17** GitHub Actions will not start jobs | P1 open | **Open, unchanged.** Same annotation, SHA `a8e1c63`, still 4–5 s | |
| **D-18** wallet transactions 404 | P2 open | **Closed as merge.** Path + router + client agree. Remain branch is leftover, not a second defect | |
| **D-19** `wave-protocol.md` §6.2 stale | P2 open | **Open.** Sentence at line 235 is false on this tree | |
| **D-20** G1.7 / G1.9 / G1.10 absent | P2 open | **Closed.** G1.10 and G1.9 are jobs; G1.7 is the dated G2.5 note C5-01 allowed | |
| **D-21** PLY-002 unmeasured | P2 open | **Open.** `measurePly002EquivalentHost()` still `unmeasured` | |

No D-22. The leftover remain / ads / in-flight QA-011 branches are topology, not new
product defects.

C2 L2 exit re-scored: **8 of 8 jobs present, 0 GitHub-green.**

---

## 8. Blockers

### 8.1 Summary

Partner answers are **unknown**. None is invented. Questions remain in
`docs/gates/open-questions.md`.

| Blocker | Owner | C4 | C5 | Blocks |
|---|---|:---:|:---:|---|
| GitHub Actions billing | Account / ops | **open (D-17)** | **open (D-17)** | any use of CI as a gate on `main` |
| a11y gate (QA-010) | Engineering | not started | **not on `main`.** QA-011 writeback in flight | protocol-C4 exit 3 |
| T14 PostgreSQL | Engineering | sqlite (C4-03) | **sqlite (C4-03 open)** | named production DB |
| SCR-11 VIP contract | Business then B | blocked (C4-07) | **blocked (C4-07)** | `#/vip` |
| PLY-012 token re-issue | Engineering | open | **open** | §4.3 last playback row |
| PLY-002 host MSE/EME | Engineering + device | unmeasured (D-21) | **unmeasured (D-21)** | C3 exit 3 |
| `GATE-8` BytePlus / VePlayer | Business | `[ ]` | `[ ]` **no movement** | ingest, listing, catalogue `vid` |
| `GATE-7` EIS | Business | `[ ]` | `[ ]` **no movement** | monetised EU/US launch |
| M0 official PDF | User | `[!]` | `[!]` **no movement** | "requirements verified" |
| M1 credentials | Business | `[ ]` | `[ ]` | real login last step |
| M2 / M4 | Business | `[ ]` | `[ ]` | Beans rate, ads live ids, recharge enable |
| M3 / M5 / M6 | Business | `[ ]` | `[ ]` | listing, US, device |
| Beans conversion rate | Business | missing | **missing** | D7 pricing; SCR-10 |

**Nine business-track blockers, still zero external evidence.** Filing is not answering.
This slot did not fill a date.

### 8.2 `GATE-8` held again, as engineering

No BytePlus ingest, moderation, or listing implementation. Bundle scan still bans
`hls.js`, `videojs`, `shaka-player`, `dashjs`. Catalogue fixtures still have no `vid` /
`albumId`. **No ingest date is recorded.**

### 8.3 Beans conversion, still not an engineering close

No product rate. Wallet recharge button is `disabled`. Top-up copy still says prices have
not been set. **Q-G-7 unanswered.**

---

## 9. C5 backlog scorecard

Re-derived at `a8e1c63`. The plan at `7ecca77` is the ranked list; this is the tree after
the implement waves.

| ID | Plan at `7ecca77` | This tree (`a8e1c63`) |
|---|---|---|
| **D-17** rank 1 | Open. Cannot be code-fixed | **Open. Unchanged.** Run 33127930874, 4 s, empty steps |
| **Protocol-C4** rank 2 | 0/3, split, not opened | **1/3.** Exit 2 met as the named case. Exit 1 partial. Exit 3 unmet. Work siblings opened the named remainders |
| **G2.3** | Not remaining (YAML) | **Stays a job.** Live `check:smoke` red on missing Chromium. GitHub has not run it |
| **C4-03** rank 3 | Open. Do not fake | **Open. Not faked.** `postgres:` refused |
| **C4-07** rank 4 | Open, blocked | **Open, blocked.** No `#/vip`. No subscription path |
| **HOME continue UI** | Not remaining | **Stays landed.** `continue-rail` |
| **C5-01 / D-20** | First implement pick: G1.10, then G1.7/G1.9 | **Closed.** G1.10 reverse-verified. G1.9 format + tracker reverse-verified. G1.7 dated as G2.5 |
| **C5-02 / D-18** | Merge or drop | **Closed as merge.** 200 empty page, not 404 |
| **C5-03 / D-19** | P3 writeback | **Open.** §6.2 stale |
| **C4-05 / C4-06 / C4-08 / D-21** | Last steps gated | **Unchanged** |
| **PLY-010 swipe / playNext / double-tap** | Named remainder; do not open as epic | **On `main`.** Full sheet still not met |
| **PRG-001 remainder** | Product case missing | **Closed as the HTTP use case** |
| **PRG-002 drama CTA** | Open; not the HOME rank | **Closed.** Progress `lastWatched` → Continue |
| **QA-011 / QA-010** | Not started | **QA-011 in flight, not on `main`. QA-010 absent** |
| **PLY-012** | Open | **Open** |
| **Tier C / AM** | Unknown | **Unknown.** No date invented |

The C5 plan's first implement pick (G1.10) landed. Its integrator pick (D-18) landed. Its
rank-1 item cannot land from a branch. That is the scorecard, and it is why this is not a
pass.

---

## 10. Targets for the next cycle

This list is the verify slot's ordering, not a rewrite of `cycle-5-backlog.md`.

### Tier 0 — the observer, still

1. **Restore GitHub Actions (D-17)** so a red `main` is a test result again. Until then
   every "CI green" claim is local-only, including G1.9, G1.10, and G2.3.
2. **Do not open protocol-C5 变现闭环** while D-17 is P1 and protocol-C4 is 1/3
   (`wave-protocol.md` §4.3).

### Tier 1 — protocol-C4 remainder, and paper

3. **PLY-012** token re-issue, if a work slot picks a playback leftover. Do not invent
   倍速 / axe-core as "C6 leftover" while X-26 and QA-010 are unadjudicated / unbuilt.
4. **QA-011 then QA-010.** Merge or drop `cursor/w16-work-c5-nog19-72c4`. An axe-core job
   is protocol exit 3; reverse-verification is an injected contrast failure that turns it
   red. Do not `continue-on-error`.
5. **C5-03 / D-19:** refresh `wave-protocol.md` §6.2 (and §5.1 status columns). P3.
6. **C4-03:** Postgres as a working scheme **or** a written, dated amendment of T14.
7. **Drop or archive leftover** `w13-work-c3-remain-72c4` and `w14-work-c4-subseq-72c4`.

### Tier 2 — AM-blocked, unblocked halves only

8. **C4-05 / C3-08** stay refusing without a secret.
9. **C4-06 / C3-09** keep recharge disabled; no rate in types.
10. **C4-07** needs a contract first.
11. **PLY-002 host (D-21)** needs devices. The contract probe is not that measurement.

### Not a new epic until re-verification

变现闭环 (protocol C5), `#/vip`, live `adUnlock`, a guessed Beans rate.

---

## 11. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | C4 | C5 | Basis |
|---|---|:---:|:---:|---|
| **V-a** | Acceptance criteria reproducibly met? | Not passed | **Not passed** | C5-01 and C5-02 hold and were re-run (§5.1, §5.3, §9). Protocol C4 1/3 (§0). D-17, C5-03, C4-03, C4-07 open |
| **V-b** | Is CI actually catching things? | Split | **Split** | Locally: yes, and this slot turned two claimed gates red on purpose (§5.3). On GitHub: jobs do not start (D-17). L2 is eight YAML jobs and zero executed runs |
| **V-c** | Skipped / deleted / weakened tests or gates? | Passed | **Passed** | Zero skips, monotonic counts, no threshold cut, no `continue-on-error` key. G1.10 now *is* the skip machinery. Same three `no-script-url` tests |
| **V-d** | Documents and code consistent? | Not passed | **Not passed** | OpenAPI ↔ router lockstep holds; D-18 closed; D-07 wording stays closed. Remaining: D-19, X-21, protocol §5.1 C4 still `[ ]` / C3 still `[~]`, C5 plan evidence block still describes `7ecca77` (no swipe / dblclick) |
| **V-e** | Gate and blocker states honestly written back? | Split | **Split** | *In handoffs:* still the house's best quality (missing-id is red, skip is red, `adUnlock` false, recharge disabled, "this slice does not claim protocol-C4 exit 1 closed"). *In the register:* AM items still unknown (correct); §6.2 already stale (D-19). This report does not invent dates |

---

## 12. Closing note

C4's closing note said the cycle wired the player and built L2 minus Playwright, and that
GitHub had not executed a job since PNL-01. C5 put Playwright on `l2.yml` (already true
when the plan was written), put skip-detection and commit-convention on L1, merged the
wallet ledger so a client probe is a 200 empty page, and landed the named playback
remainders: retained `playNext`, swipe 切集, double-tap favourite, the two-device conflict
case, and drama-detail Continue. Locally, `pnpm verify` is 3,416 tests, the coverage gate
prints 94.27% / 100.00% diff, a committed `.skip` is red, and `feat: add a widget` is red.

Two things stop that from being a pass.

The first is **the observer, again.** GitHub has not executed a job on `main` since
PNL-01. Every new gate this cycle claims — G1.9, G1.10, G2.3 on HEAD — is YAML plus local
fixtures. That is the same colour as a silent regression.

The second is **the map.** Protocol C4 is 1/3, not 3/3. Running-count C5 did the
remediation the C5 plan ranked as buildable, except the paper writeback P3 owns and except
the billing outage nobody in engineering can close from a branch.

The pattern worth carrying is the one the G1.9 leftover and G1.10 slots already practise:
the close is a *refusal* (a Conventional header without an id is red, a skip is red, an
empty ledger is not a guessed `CONSUME`) and the test that bites is the mutation that
would look like a feature. This slot's reverse-verification was that shape twice. D-17 is
the same shape in the other direction — a workflow that looks like a gate.

---

## 13. Postscript — in-flight at snapshot

Everything above through §12 was measured against `origin/main` at **`a8e1c63`**
(2026-08-27T23:54:38Z). `pnpm verify` ran in this slot on that SHA (3,416 tests, exit 0).
Two agents were RUNNING at snapshot; neither had landed when this section was written.

| Agent | Name | Origin branch at snapshot | State when this section was written |
|---|---|---|---|
| `bc-17fae197` | W16 work C5 excluding G1.9 | `origin/cursor/w16-work-c5-nog19-72c4` (`34768de` / `ac4ad43`) | **RUNNING, not on `main`.** QA-011 / C-12 a11y writeback. Explicitly not QA-010 axe-core. `docs/14-test-plan.md` / `docs/14-quality-gates.md` on that tip are not this tree |
| `bc-264077b7` | W16 work next C5 after like-gesture | none visible on origin | **RUNNING, no `cursor/*` branch.** Handoff on the nog19 tip names it as PLY-012 token re-issue. This slot did not guess its files |

**Neither landing, if it happens after this file is pushed, changes the §0 verdict by
itself.**

- QA-011 is a document adoption (a11y as a listing blocker). It is not protocol-C4 exit 3.
  An axe-core job would be. Do not back-write a pass if only the writeback merges.
- PLY-012 is one remaining §4.3 row. It would not complete the interaction sheet (倍速 /
  scrub / X-26 still sit there) and it would not restore GitHub Actions.
- D-17, C5-03 / D-19, C4-03, C4-07, AM items: unchanged unless the tree itself changes.
  No AM date appeared while this report was written.

`origin/cursor/w13-work-c3-remain-72c4` and leftover `cursor/w14-work-c4-subseq-72c4` are
still not ancestors of `main`.

The verdict in §0 stands: running-count C5 does not pass, on D-17 and on protocol-C4
exits (now 1/3). The C5 backlog's buildable remediations (C5-01, C5-02) do pass, the
named playback remainders are on `main`, and the AM-blocked half is still unknown.

Snapshot SHA for §§0–12: **`a8e1c6326acace6ebdeff2b9fce02fe1c76b8417`**.
