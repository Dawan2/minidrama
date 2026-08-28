# Cycle 7 — Independent Verification Report (Wave 21)

> **Slot:** W21, independent verifier for running-count cycle C7, against
> `docs/plan/cycle-7-backlog.md` and `docs/plan/wave-protocol.md`.
> **Date:** 2026-08-28.
> **Agent:** `bc-d04fddba-f649-5572-86f6-2406a1ab1e19`.
> **Branch:** `cursor/v21-cycle-7-verify-72c4`, cut from `origin/main` at **`30921f4`**
> ("docs(handoff): note wallet absorb on the W21 QA-010 SCR-12 remainder",
> 2026-08-28 01:49:49 +0000).
> **Mandate:** record what is true. This slot did not implement product features, did not
> modify any source file to make a check pass, did not delete, skip or weaken a test, and
> did not rewrite any origin branch. Reverse-verification mutations were applied in this
> working tree, observed, and restored with `mv` / `rm`. The only file added is this one.
> No pull request.
> **Method:** every claim is re-derived from a clean checkout with the command quoted next
> to it, per `docs/plan/wave-protocol.md` §4.1 rule 3. Where a W20/W21 handoff asserts a
> result, the result was re-run rather than accepted — including `pnpm verify`,
> `check:a11y` (history / search / wallet / settings stems plus contrast), `check:audit`,
> and the playback suites inside that run. Local `pnpm verify` is **not** a substitute
> for D-17 GitHub Actions.
> **Predecessor:** `docs/verify/cycle-6-report.md`, verdict **not passed**. Its defects
> `D-01`…`D-21` are re-tested in §7. No new defect id is opened in this cycle; D-17 does
> not close.
> **In-flight at start (not waited on):** `bc-9a564c5e` (W21 leftover C7 work). **RUNNING**
> when this slot started. Branch later visible as `origin/cursor/w21-c7-leftover-72c4`
> (`1faa1ad`, G2.3 unlock-panel P0 spec). Not an ancestor of `30921f4`. Postscript §13
> if it lands.

Protocol arithmetic (`wave-protocol.md` §2) still makes W16–W20 protocol-C4 and W21 the
first implement wave of protocol-C5. The running count this repository uses called W20
"C7 plan" and this slot C7's verify wave. **X-21 is unadjudicated.** This file does not
amend §2. Protocol-C5 变现闭环 is **not** this cycle's assignment and is not opened here.

---

## 0. Verdict

**Not passed**, against the protocol-C4 exit standard in `docs/plan/wave-protocol.md` §5.1
(播放体验 is no longer 1/3-with-SCR-13-only, and is still not 3/3), and **not passed** as
a C7-backlog close either — even though rank 3's implemented-hash-screen remainder
(history, search, wallet, settings, plus the already-landed drama / play / profile /
favorites stems), CN-10 start/switch timeout, and tap-pause on the retained VePlayer all
hold on this tree.

Protocol C4's three exit conditions, re-scored at `30921f4` rather than copied from the
C7 plan's `25a96b4` / `c46bbf5` table:

| Protocol C4 exit (`wave-protocol.md` §5.1) | C7 plan (`25a96b4`) | This tree (`30921f4`) |
|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met as 全过.** Named remainders on `main` (swipe / `playNext` / double-tap / kept plugins / stall / PLY-012 / PLY-011 / CN-10). 倍速 / scrub plugin-owned. Tap pause VePlayer-owned and in flight at first draft, then landed | **Still not met as 全过.** Same named remainders, plus tap-pause on the retained VePlayer (`e0e7d28` / `e0765ab`; `closeVideoClick: false`; product source does not `preventDefault` a single tap). 倍速 / scrub still plugin-owned (X-26). No client `playbackRate`. No 0.75 constant. D9 stays `[ ]` until a device. The tap-pause handoff itself does not claim this exit closed |
| 跨端进度冲突用例通过 | **Met as the named product case.** `cross-end-conflict.test.ts` (3) | **Stays met as that case.** Not a two-phone E2E. Do not retake |
| a11y 门禁上线且核心屏零 critical/serious | **Not met as S-A1.** Three committed fixtures at plan cut; remainder after SCR-03 in flight | **Still not met as S-A1 on every SCR/PNL.** The L1 job is on `main` (`check:a11y`, **11** required stems, host=jsdom not TikTok WebView). Dated notes in `docs/14-quality-gates.md` §2.1 and `docs/14-test-plan.md` §6.4 still say this does **not** close protocol-C4 exit 3. Remaining remainder: panels. SCR-10 / SCR-11 are not product routes |

One of three. The C7 plan ranked that epic as remaining distance and told implement
waves not to open it as a new epic, not to invent `playbackRate`, and not to start twins
of drama or play. W20/W21 work siblings opened the named QA-010 remainder screens and
the tap-pause half anyway. This slot re-scores the tree, not the plan's P-02.

The C7 backlog (the running-count document W20 wrote) moved. Scorecard in §9. Two facts
decide the verdict independently of that scorecard:

1. **GitHub Actions still cannot start jobs (D-17).** CI run
   [33134060910](https://github.com/Dawan2/minidrama/actions/runs/33134060910) and L2 run
   [33134060930](https://github.com/Dawan2/minidrama/actions/runs/33134060930) on `30921f4`
   (2026-08-28T01:50:06Z) failed in 4–6 seconds with empty `steps`. Annotation on check-run
   `98729968598`: "The job was not started because recent account payments have failed or
   your spending limit needs to be increased." Last successful CI on `main` is still
   [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at PNL-01,
   2026-08-27T20:12:42Z. Iron rule R6 is still unverifiable from CI. Local `pnpm verify`
   is green (3,605 tests). **Local green does not substitute for the gate.**
2. **C5-03 / D-19 is still open.** `wave-protocol.md` §6.2 still says "no database, no
   migration, 27 seed episodes against a floor of 80, no CI L2". That sentence is false on
   `30921f4`. P3 owns the file. This slot does not rewrite it.

Per `docs/plan/wave-protocol.md` §4.3, a "not passed" verdict means the next plan wave
must schedule remediation as top priority and implement waves may not open a **new
epic** until re-verification passes. Conditional pass is not available: D-17 is still
P1. Protocol-C5 变现闭环 is not this cycle's assignment and is not opened here.

AM-blocked items (C3-08 last step, C3-09 rate, C4-07 contract, GATE-0…GATE-8,
Q-G-1…Q-G-10) remain **open / unknown**. No EIS date, no BytePlus ingest date, no Beans
rate, no CI-restoration date, no partner-approval date, and no AM name is recorded here.

---

## 1. The headline finding: C7 landed the remaining implemented-hash a11y stems and tap-pause, and GitHub still cannot watch any of it

All three halves matter.

C6's headline was named playback-UX remainders plus two new L1 jobs, observer dark. On
`30921f4` the tree also has:

```
$ git rev-parse --short origin/main
30921f4
$ ls packages/quality/a11y/screens/
scr-02-home.html  scr-03-browse.html  scr-04-drama.html  scr-05-play.html
scr-06-profile.html  scr-07-history.html  scr-08-favorites.html
scr-09-wallet.html  scr-12-settings.html  scr-13-fallback.html  scr-search.html
$ rg -n "REQUIRED_SCREEN_STEMS" -A 12 packages/quality/src/a11y.ts | head -20
export const REQUIRED_SCREEN_STEMS = [
  'scr-02-home', 'scr-03-browse', 'scr-04-drama', 'scr-05-play',
  'scr-06-profile', 'scr-07-history', 'scr-08-favorites', 'scr-09-wallet',
  'scr-search', 'scr-12-settings', 'scr-13-fallback',
] as const;
$ rg -n 'playbackRate' app/src/player --glob '!*.test.*'
# (empty — no product caller)
$ rg -n 'VEPLAYER_CLOSE_VIDEO_CLICK' app/src/player/veplayer-plugins.ts
export const VEPLAYER_CLOSE_VIDEO_CLICK = false;
$ rg -n 'START_TIMEOUT_MS' app/src/player/player-start.ts
export const START_TIMEOUT_MS = 15_000;
```

QA-010 is `pnpm check:a11y` inside `verify` and as a named L1 step. Eleven committed
fixtures. Deleting history, search, wallet, or settings is red (§5.3). Host is jsdom,
not TikTok WebView. Dated notes still refuse protocol-C4 exit 3. Tap-pause is
VePlayer-owned on the retained instance (`closeVideoClick: false`); product source does
not `preventDefault` a single tap and does not draw a competing control. CN-10 is an
ancestor (`956f04c`). INF-004 S-C3 echo-only is an ancestor (`dea3066`).

And then the observer is the same colour it has been since PNL-01:

```
$ gh api repos/Dawan2/minidrama/check-runs/98729968598/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

QA-010's eleven stems, INF-004, tap-pause, CN-10, the kept plugins — none of them has a
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
UNMERGED origin/cursor/w21-c7-leftover-72c4
```

Two leftover tips from earlier cycles stay unmerged (remain / leftover ads). C7 plan
(`cursor/w20-plan-cycle-7-badf`), C6 report (`cursor/w19-verify-cycle-6-72c4`), QA-010
stems through settings, tap-pause, and CN-10 are ancestors of `30921f4`. A leftover C7
work branch appeared while this report was being written. §13.

| Branch | Commits off `main` at snapshot | Substance | Disposition |
|---|---:|---|---|
| `cursor/w13-work-c3-remain-72c4` | leftover | Original `GET /v1/wallet/transactions` | **Leftover.** D-18 closed by port. Do not implement a second route |
| `cursor/w14-work-c4-subseq-72c4` | leftover | Duplicate C4-08 ads | Leftover. Do not retake |
| `cursor/w21-c7-leftover-72c4` | +1 (`1faa1ad`) after snapshot | G2.3 unlock-panel P0 spec next to login-home | **In-flight `bc-9a564c5e`.** Not an ancestor of `30921f4`. Do not retake G2.3 YAML |

### 2.1 Cycle labelling is still two schemes (D-13 / X-21)

Unchanged. Protocol: C4 = W16–W20, this slot is protocol-C5's first implement wave.
Running count: W20 wrote `cycle-7-backlog.md` and this slot writes `cycle-7-report.md`.
Still P3's.

---

## 3. Maturity

### 3.1 Mandatory platform capabilities (D4–D9)

Checklist rows in `docs/11-official-onboarding-checklist.md` D4–D9 remain `[ ]`. That is
correct under §8 rule 6. No product call site was added this cycle that would flip a row.

| # | Capability | C6 (`eff5eb2`) | C7 (`30921f4`) |
|---|---|---|---|
| D4 | Silent login | mock + recovery + stubbed token exchange | **Unchanged.** Real port still refuses without a secret (`PROVIDER_UNCONFIGURED` / `PROVIDER_UNAVAILABLE`) |
| D5 | Rewarded video ad | wired against mock; `adUnlock: false` | **Unchanged** |
| D6 | Interstitial ad | same flag | **Unchanged** |
| D7 | Beans one-off | stubbed create; recharge disabled | **Unchanged.** No rate in types. Wallet Top up stays `disabled` |
| D8 | Subscription | probe + fail-closed card; no `#/vip` | **Unchanged.** No OpenAPI subscription path. No `vip:` in `routes.ts` |
| D9 | Nav bar / capsule | wired, not device-run | **Unchanged** |

### 3.2 Screens and panels

| | C6 (`eff5eb2`) | C7 (`30921f4`) |
|---|:---:|:---:|
| Numbered screens | 11 of 13 | **11 of 13** — SCR-01 overlay. Missing: SCR-10 `#/recharge`, SCR-11 `#/vip` |
| Hash routes | 11 named | **11 named** — home, browse, search, drama, play, me, history, favorites, wallet, settings, fallback. No `recharge:` / `vip:` in `routes.ts` |
| QA-010 fixtures | 1 (SCR-13) at C6 report snapshot; 3 at C7 plan | **11 required stems** — every implemented numbered hash screen plus search plus fallback |
| Panels | 2 of 5 | **2 of 5** — PNL-01, PNL-02. PNL-05 stays deleted from the product (VePlayer plugins, X-26). **No panel fixtures.** That is why exit 3 is still not S-A1 |

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

| Slice | What happens on `30921f4` |
|---|---|
| **PLY-010 连播 / 切集 / 双击点赞** | On `main` (C5). Do not retake |
| **PLY-010 倍速** | **Kept plugin.** `VEPLAYER_IGNORED_PLUGINS` does not list `playbackrate`. No product `playbackRate`. No competing panel. X-26 unadjudicated. Do not pick 0.75 |
| **PLY-010 进度条拖拽** | **Kept plugin + seek inference.** Progress not in `ignores`. Horizontal drag is not 切集 |
| **PLY-010 单击暂停/继续** | **On `main` this cycle** (`e0e7d28` / `e0765ab`). MockVePlayer toggles `pause()` / `play()` on the retained instance when `closeVideoClick` is false. Product source does not `preventDefault` a single tap and does not call `pause()` itself. Dataset `veplayerTapPause=kept`. Not a competing control. Does **not** close exit 1 |
| **S7 stall / retry** | On `main` (C6). Do not retake `player-stall.ts` |
| **CN-10 start/switch timeout** | **On `main`** (`956f04c` / `player-start.ts`). 15 s without skipping. Ancestor of the C7 plan. Do not retake |
| **PLY-012** | **On `main`** (`aa8a9e8` / `player-fatal.ts`). Do not retake |
| **PLY-011 S6 lock chrome** | **On `main`** (`533433f` / `locked-chrome.tsx`). Do not retake |
| **PRG-001 / PRG-002** | Stay closed as the named cases. Do not retake |

D-16 stays closed: product source names no `demoPlaylist` / `vid_demo_` / `DEMO_ALBUM`.
PLY-002 is still `unmeasured` (`docs/gates/ply-002.md`). **Do not fill a date.**

### 3.6 Overall maturity judgement

The project has moved from **C6's plugin-owned 倍速 / scrub, S7 stall, smallest
SCR-13 axe job, and INF-004 S-C1, observer dark** to **the same app with every
implemented numbered hash screen required by QA-010, tap-pause on the retained
VePlayer, CN-10 timeout, and INF-004 S-C3 echo-only**. That is a category change on
*a11y coverage of implemented screens* and on *one named sheet row* (单击暂停/继续),
which is what C7 implement waves actually picked.

What it is not: it is not the full §4.3 sheet; it is not S-A1 on every SCR/PNL; it is
not PostgreSQL; it has never run on a device; GitHub cannot currently start its own
jobs. Against the twelve-cycle map, the honest position is "protocol-C4 1/3,
running-count C7 remediations mostly closed except paper, billing, Postgres, VIP, and
panels, observer still dark."

---

## 4. Increment against cycle 6

Every C6 number is from `docs/verify/cycle-6-report.md` at `eff5eb2` (postscript trunk
`9b563b0`). Every C7 number was measured on `origin/main` at `30921f4`.

| Measure | C6 | C7 | Change |
|---|---:|---:|---|
| `main` commits / files | 560 / 738 | **649 / 770** | +89 / +32 |
| Unmerged `cursor/*` tips | 2 | **3** | leftover C7 G2.3 spec appeared during this slot |
| Test files (skip-check) | 235 | **238** | +3 (includes 2 Playwright specs) |
| Tests | 3,542 | **3,605** | **+63** |
| Source lines (ts/tsx, non-test) | 34,997 | 35,416 | +1% |
| Test lines | 46,274 | 48,009 | +4% |
| Contract paths / operations | 24 / 27 | **24 / 27** | unchanged |
| CI on `main` at HEAD | jobs do not start (billing) | **jobs do not start (billing)** | D-17 unchanged |
| L1 gates present | 9 of 10 + G1.7 dated + QA-010 + INF-004 | **same** | S-C3 echo-only is now inside the existing audit job |
| L2 gates present | 8 of 8 | **8 of 8** | unchanged |
| Screens | 11 of 13 | **11 of 13** | unchanged product routes; **11 a11y fixtures** vs 1 |
| Overlay panels | 2 of 5 | **2 of 5** | unchanged |
| Bundle JS | 363.77 kB (111.39 kB gz) | **367.05 kB (112.17 kB gz)** | `index-DGRevdWg.js` (CN-10's client; a11y fixtures did not edit product UI) |

Test-to-source line ratio is 1.36 (C6 was 1.32). Volume did not come from thinning the
suite. Coverage floors in `packages/quality/coverage-thresholds.json` are still diff 80 /
global line 60 / global branch 50 / core 90.

`pnpm verify` still includes `check:audit` and `check:a11y` between `check:skips` and
`test:coverage`. C6's verify script already did.

---

## 5. Evidence

### 5.1 `main` verifies clean locally at `30921f4`

```
$ git rev-parse HEAD
30921f4f5a30209f30d8de54523a9cd264f93afe
$ pnpm install --frozen-lockfile && pnpm run verify
… exit 0
```

`verify` = `format:check` → `lint` → `typecheck` → `check:commits` → `check:skips` →
`check:audit` → `check:a11y` → `test:coverage` → `check:coverage` → `build` →
`check:guardrails`. First try on this SHA, no retry.

```
commits passed (0 new commits vs origin/main, 0 prose, 0 missing-id)
skip-check passed (238 test files, 0 skips, 0 empty)
audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)
a11y passed (11 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)
coverage global lines 94.37% (17893/18961), branches 90.89%, core lines 95.70%, diff lines 100.00% (0/0)
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
| `packages/quality` | 27 | 455 |
| `server` | 98 | 1,785 |
| `app` | 100 | 1,257 |
| **Total (vitest)** | **236** | **3,605** |

0 failed, 0 skipped. Skip-check's 238 includes the two Playwright specs under
`packages/quality/e2e/specs/`. Build emits `dist/assets/index-DGRevdWg.js`, 367.05 kB
(112.17 kB gzipped). Guardrails passed against that artifact.

Playback suites inside that run: `PlayPage.test.tsx` 42, `PlayerSurface.test.tsx` 30,
`player-stall.test.ts` 12, `player-start.test.ts` 9, `player-fatal.test.ts` 9,
`veplayer-plugins.test.ts` 8, `episode-double-tap.test.ts` 5, `episode-swipe.test.ts` 4,
`mock-veplayer.test.ts` 4, `cross-end-conflict.test.ts` 3. All passed.

A11y scan inside that run: eleven committed fixtures. jsdom prints
`HTMLCanvasElement's getContext()` not implemented; `color-contrast` is not disabled;
the equivalent checker on declared CSS colors is the reverse path in §5.3.

### 5.2 `main` does not verify on GitHub (D-17, unchanged)

```
$ gh run list --repo Dawan2/minidrama --branch main --limit 4
33134060930  failure  30921f4  L2   6s  2026-08-28T01:50:06Z
33134060910  failure  30921f4  CI   4s  2026-08-28T01:50:06Z
33133679789  failure  4aef051  CI   5s  2026-08-28T01:42:33Z
33133679782  failure  4aef051  L2   5s  2026-08-28T01:42:33Z
```

Job `verify` at check-run `98729968598`: `conclusion: failure`, `steps: []`, annotation
as in §1. Every L2 job on the same push (`G2.3 smoke E2E` included) is the same
empty-steps failure. Last *successful* CI on `main`: still PNL-01 at 20:12:42Z. **R6
remains unverifiable from CI.** Local `pnpm verify` is not that observer.

### 5.3 Reverse verification of claimed C7 gates

Performed on `30921f4`; mutations restored; nothing committed. These are the C7 claims
the recent handoffs asked a verifier to inject: history / search / wallet / settings
stems, SCR-07, and QA-010 contrast.

**SCR-07 history missing stem (`docs/handoff/w20-c7-second.md`).**
`packages/quality/a11y/screens/scr-07-history.html` was moved aside.

```
$ pnpm run check:a11y
required implemented-screen fixture missing: scr-07-history (host=jsdom, not TikTok WebView)
Exit status 1
```

Restored.

**Search missing stem (`docs/handoff/w20-a11y-search.md`).** Same mutation on
`scr-search.html`:

```
required implemented-screen fixture missing: scr-search (host=jsdom, not TikTok WebView)
Exit status 1
```

**Wallet missing stem (`docs/handoff/w20-a11y-wallet.md`).** Same mutation on
`scr-09-wallet.html`:

```
required implemented-screen fixture missing: scr-09-wallet (host=jsdom, not TikTok WebView)
Exit status 1
```

**Settings missing stem (`docs/handoff/w21-a11y-settings.md`).** Same mutation on
`scr-12-settings.html`:

```
required implemented-screen fixture missing: scr-12-settings (host=jsdom, not TikTok WebView)
Exit status 1
```

**QA-010 contrast (protocol-C4 exit 3 remainder).**
`packages/quality/a11y/screens/_c7-probe.html` was written as white-on-white
(`p { color: #ffffff; background: #ffffff; }`), with all eleven required stems still
present.

```
$ pnpm run check:a11y
a11y failed (1): axe-core critical/serious or contrast < 4.5:1 are QA-010 red (host=jsdom, not TikTok WebView)
  contrast packages/quality/a11y/screens/_c7-probe.html color-contrast p 1.00:1 < 4.5:1
Exit status 1
```

Removed; `pnpm run check:a11y` →
`a11y passed (11 screens, 0 critical, 0 serious, host=jsdom, not TikTok WebView)`.
A comment that names WCAG is not this gate. **Holds as the eleven-screen scan.** It does
not prove S-A1 on panels, and it is not TikTok WebView.

**INF-004 S-C1 / S-C3 (landed before / during C7 plan).**
`.github/workflows/_c7-probe.yml` was written with `continue-on-error: true` (also
echo-only). `.github/workflows/_c7-echo.yml` was written as `run: echo "G1.9 passed"`.

```
$ pnpm run check:audit
audit failed (2): continue-on-error / if: false / swallowed exits / echo-only steps are INF-004 red
  echo-only .github/workflows/_c7-probe.yml:7 - run: echo hi
  continue-on-error .github/workflows/_c7-probe.yml:8 continue-on-error: true
Exit status 1

$ pnpm run check:audit
audit failed (1): continue-on-error / if: false / swallowed exits / echo-only steps are INF-004 red
  echo-only .github/workflows/_c7-echo.yml:7 - run: echo "G1.9 passed"
Exit status 1
```

Removed; `pnpm run check:audit` →
`audit passed (2 workflows, 0 continue-on-error, 0 if: false, 0 swallowed exits, 0 echo-only)`.
Committed workflows have no `continue-on-error:` **key**. **Holds.**

**Playback, probed not mutated.** `rg playbackRate app/src/player` over non-test files
is empty. Constructor `ignores` does not list `progress` or `playbackrate`.
`VEPLAYER_CLOSE_VIDEO_CLICK` is `false`. `PlayerSurface` does not `preventDefault` a
single tap. `player-start.ts` still times out at 15 s. Those suites passed inside
`pnpm verify` (§5.1).

**G2.3, probed not mutated.** `pnpm run check:smoke` on this machine after `verify`
built `app/dist`: Playwright CLI is present, Chromium executable is not
(`/home/ubuntu/.cache/ms-playwright/chromium_headless_shell-1234/...`). Both P0 specs
fail in 1 ms; exit 1. That is red, which is the job's contract. GitHub has not executed
the job (D-17). The in-flight leftover unique commit `1faa1ad` is a third P0 spec, not
a Chromium install.

### 5.4 The iron rules

| Rule | Check | Result |
|---|---|---|
| R2 no deleted tests | 235 → 238 files, 3,542 → 3,605 tests, monotonic | **clean** |
| R3 no skipped tests | `check:skips` 0 skips / 0 empty; `rg '\.skip\(|\.only\(|it\.todo\(|test\.todo\('` over product tests is empty | **clean** |
| R4 no weakened standards | `eslint-disable` / `@ts-ignore` | **3 matches**, all `no-script-url` in tests naming a refused `javascript:` scheme. Same class as C5/C6. Coverage floors not lowered |
| R5 no empty tests | G1.10 still in `verify`; skip-check 0 empty. Sampled playback / a11y / audit suites this slot ran | behavioural; a11y and audit CLIs are exit-status |
| R6 `main` releasable | local verify green; GitHub jobs do not start | **split — D-17** |

TypeScript still `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
No `continue-on-error:` **key** in either workflow (comments mention the absence; YAML
has no such key). INF-004 still *is* the machinery that would catch one, including
echo-only.

---

## 6. Gate enforcement

### 6.1 L1 — nine of ten numbered jobs, G1.7 dated, plus QA-010 and INF-004

`.github/workflows/ci.yml` vs `docs/14-quality-gates.md` §2. `workflow_dispatch:` is
present. Triggers: `push` `[main, cursor/**]`, `pull_request`, `workflow_dispatch`.

| Gate | C6 | C7 | Note |
|---|:---:|:---:|---|
| G1.1–G1.4 | yes | yes | format, lint, typecheck, unit tests (`test:coverage`) |
| G1.5 coverage | yes | yes | floors + ratchet. In `pnpm verify` |
| G1.6 contract compatibility | yes | yes | oasdiff. **Not** in `pnpm verify` |
| G1.7 dependency audit | dated as G2.5 Trivy | **stays dated as G2.5** | No second osv-scanner / `npm audit` L1 job |
| G1.8 secrets | yes | yes | Gitleaks. **Not** in `pnpm verify` |
| G1.9 commit convention | yes | yes | format + tracker id. In `verify` |
| G1.10 skip / empty-test | yes | yes | In `verify` |
| QA-010 a11y | yes (SCR-13) | **yes (11 stems)** | Reverse-verified this slot (§5.3). In `verify`. Not S-A1 |
| INF-004 CI self-audit | yes (S-C1) | **yes (S-C1 + S-C3)** | Reverse-verified this slot (§5.3). In `verify`. S-C4 stays further |

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
| QA-010 missing `scr-07-history` | **yes** (§5.3) |
| QA-010 missing `scr-search` | **yes** (§5.3) |
| QA-010 missing `scr-09-wallet` | **yes** (§5.3) |
| QA-010 missing `scr-12-settings` | **yes** (§5.3) |
| INF-004 `continue-on-error: true` | **yes** (§5.3) |
| INF-004 echo-only `run` | **yes** (§5.3) |
| G2.3 missing Chromium / failed P0 | **probed** live, exit 1; no GitHub execution |
| G1.9 / G1.10 | not re-injected; C5 already did; CLIs still in `verify` and passed clean |
| Playback kept-plugin / tap-pause / stall / CN-10 / re-issue | **probed** via the suite this slot ran |

---

## 7. Defects

Recorded, not fixed, per §4.1 rule 4.

### 7.1 Earlier defects, re-tested

| ID | C6 | C7 | Evidence |
|---|---|---|---|
| **D-01** bundle scan | Still fixed | **Still fixed** | Guardrails passed on `index-DGRevdWg.js` |
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
| **D-17** GitHub Actions will not start jobs | P1 open | **Open, unchanged.** Same annotation, SHA `30921f4`, still 4 s | |
| **D-18** wallet transactions 404 | Closed as merge | **Stays closed.** Path + router + client agree | |
| **D-19** `wave-protocol.md` §6.2 stale | P2 open | **Open.** Sentence at line 235 is false on this tree | |
| **D-20** G1.7 / G1.9 / G1.10 absent | Closed | **Stays closed** | |
| **D-21** PLY-002 unmeasured | P2 open | **Open.** `measurePly002EquivalentHost()` still `unmeasured` | |

No D-22. The leftover remain / ads / in-flight G2.3-spec branches are topology, not new
product defects.

C2 L2 exit re-scored: **8 of 8 jobs present, 0 GitHub-green.**

---

## 8. Blockers

### 8.1 Summary

Partner answers are **unknown**. None is invented. Questions remain in
`docs/gates/open-questions.md`.

| Blocker | Owner | C6 | C7 | Blocks |
|---|---|:---:|:---:|---|
| GitHub Actions billing | Account / ops | **open (D-17)** | **open (D-17)** | any use of CI as a gate on `main` |
| a11y gate (QA-010) | Engineering | smallest job on `main` (SCR-13) | **11 implemented-hash stems on `main`.** Panels remain. Protocol exit 3 unmet | protocol-C4 exit 3 / S-A1 |
| T14 PostgreSQL | Engineering | sqlite (C4-03) | **sqlite (C4-03 open)** | named production DB |
| SCR-11 VIP contract | Business then B | blocked (C4-07) | **blocked (C4-07)** | `#/vip` |
| PLY-012 token re-issue | Engineering | closed as merge | **stays closed** | — |
| Tap-pause (单击暂停/继续) | Engineering | VePlayer-owned, mock did not toggle | **closed as merge** (`e0765ab`). Sheet still not 全过 | — |
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
have not been set. Wallet a11y fixture keeps that honest chrome. **Q-G-7 unanswered.**

### 8.4 Real TikTok login, still not `[x]`

`createTiktokIdentityPort` still refuses every real code (`PROVIDER_UNCONFIGURED` /
`PROVIDER_UNAVAILABLE`). Silent re-login on `401` is on `main`. Gated on GATE-1 +
GATE-6. **Not `[x]`.**

---

## 9. C7 backlog scorecard

Re-derived at `30921f4`. The plan at `4d81ce0` / `c965b15` is the ranked list; this is
the tree after the implement waves.

| ID | Plan at `25a96b4` / `c46bbf5` | This tree (`30921f4`) |
|---|---|---|
| **D-17** rank 1 | Open. Cannot be code-fixed | **Open. Unchanged.** Run 33134060910, 4 s, empty steps |
| **Protocol-C4** rank 2 | 1/3. Sheet not full. Do not invent `playbackRate`. CN-10 on `main` | **1/3.** Exit 2 stays met. Exit 1: tap-pause **kept** on the retained VePlayer; 倍速 / scrub still plugin-owned; sheet still not 全过; no client `playbackRate`. Exit 3: job online as **11 stems**, still not S-A1 |
| **QA-010** rank 3 | Remainder after SCR-03 in flight (drama + play) | **Closed as the implemented-hash remainder.** Unique stems: SCR-04 `11f4e63`, SCR-05 `a7b00f2`, SCR-06 `3fd393d`, SCR-07 `d1db09b`, SCR-08 `4908961`, search `86e4c80`, SCR-09 `9f31604`, SCR-12 `a7ffea3`. Remainder: **panels**. Not protocol exit 3 |
| **PLY-012** | Closed as merge | **Stays closed.** Do not retake `player-fatal.ts` |
| **C4-03** rank 4 | Open. Do not fake | **Open. Not faked.** `postgres:` refused |
| **C4-07** rank 5 | Open, blocked | **Open, blocked.** No `#/vip`. No subscription path |
| **INF-004 S-C1** | On `main` | **Stays on `main`.** Do not retake |
| **INF-004 S-C3** | On `main` (`dea3066`) | **Stays on `main`.** Reverse-verified this slot. S-C4 stays further |
| **S7 stall** | On `main` | **Stays on `main`.** Do not retake |
| **PLY-010 倍速 / scrub** | On `main` as plugin-owned keep | **Stays on `main`.** X-26 unadjudicated |
| **PLY-010 tap-pause** | In flight at later absorb (`bc-ecde45cf`) | **On `main`** (`e0e7d28` / `e0765ab`). VePlayer-owned. Do not retake |
| **PLY-011 S6 lock chrome** | On `main` | **Stays on `main`.** Do not retake |
| **CN-10 start/switch timeout** | On `main` (`956f04c`) | **Stays on `main`.** Do not retake `player-start.ts` |
| **HOME continue / PRG-001 / PRG-002 / C5-01 / C5-02 / QA-011 / G2.3 YAML** | Not remaining | **Stay not remaining** as YAML / named cases. An in-flight third P0 spec is §13, not a G2.3 retake |
| **C5-03 / D-19** | P3 writeback | **Open.** §6.2 stale |
| **C4-05 / C4-06 / C4-08 / D-21** | Last steps gated | **Unchanged** |
| **Tier C / AM** | Unknown | **Unknown.** No date invented |

The C7 plan's rank-1 item cannot land from a branch. Rank 3's *implemented hash screens*
landed. Rank 2's sheet is closer (tap-pause included) and still not 全过. That is the
scorecard, and it is why this is not a pass.

---

## 10. Targets for the next cycle

This list is the verify slot's ordering, not a rewrite of `cycle-7-backlog.md`.

### Tier 0 — the observer, still

1. **Restore GitHub Actions (D-17)** so a red `main` is a test result again. Until then
   every "CI green" claim is local-only, including QA-010, INF-004, and G2.3.
2. **Do not open protocol-C5 变现闭环** while D-17 is P1 and protocol-C4 is 1/3
   (`wave-protocol.md` §4.3).

### Tier 1 — protocol-C4 remainder, and paper

3. **QA-010 remainder:** axe-core (or the equivalent contrast checker) on remaining
   **panels** (PNL-01 / PNL-02). Do not retake the eleven hash stems. Do not
   `continue-on-error`. Do not claim TikTok WebView. Do not scan `#/recharge` or `#/vip`.
4. **X-26:** P1/P2 adjudicate 0.75 vs inventory before any client constant. The kept
   plugin is not that write. Do not pick 0.75. Do not retake tap-pause.
5. **C5-03 / D-19:** refresh `wave-protocol.md` §6.2 (and §5.1 status columns). P3.
6. **C4-03:** Postgres as a working scheme **or** a written, dated amendment of T14.
7. **Drop or archive leftover** `w13-work-c3-remain-72c4` and `w14-work-c4-subseq-72c4`.
   Leave `bc-9a564c5e` / `w21-c7-leftover-72c4` until that agent is idle. Do not start a
   twin unlock-panel spec.

### Tier 2 — AM-blocked, unblocked halves only

8. **C4-05 / C3-08** stay refusing without a secret.
9. **C4-06 / C3-09** keep recharge disabled; no rate in types.
10. **C4-07** needs a contract first.
11. **PLY-002 host (D-21)** needs devices. The contract probe is not that measurement.

### Not a new epic until re-verification

变现闭环 (protocol C5), `#/vip`, live `adUnlock`, a guessed Beans rate, a client
`playbackRate` ladder, a twin of any landed QA-010 stem, a second S6, a G2.3 YAML
retake.

---

## 11. Checklist verdicts (`docs/plan/wave-protocol.md` §4.2)

| # | Question | C6 | C7 | Basis |
|---|---|:---:|:---:|---|
| **V-a** | Acceptance criteria reproducibly met? | Not passed | **Not passed** | Rank 3's eleven stems, INF-004 S-C3, tap-pause, and CN-10 hold and were re-run (§5.1, §5.3, §9). Protocol C4 1/3 (§0). D-17, C5-03, C4-03, C4-07 open |
| **V-b** | Is CI actually catching things? | Split | **Split** | Locally: yes, and this slot turned six claimed gates red on purpose (§5.3). On GitHub: jobs do not start (D-17). L2 is eight YAML jobs and zero executed runs |
| **V-c** | Skipped / deleted / weakened tests or gates? | Passed | **Passed** | Zero skips, monotonic counts, no threshold cut, no `continue-on-error` key. INF-004 now also bites echo-only. Same three `no-script-url` tests |
| **V-d** | Documents and code consistent? | Not passed | **Not passed** | OpenAPI ↔ router lockstep holds; D-18 stays closed. Remaining: D-19, X-21, protocol §5.1 C4 still `[ ]` / C3 still `[~]`, C7 plan evidence block still describes three fixtures |
| **V-e** | Gate and blocker states honestly written back? | Split | **Split** | *In handoffs:* still the house's best quality (each a11y slice "not protocol exit 3", tap-pause "does not claim exit 1 closed", `adUnlock` false, recharge disabled). *In the register:* AM items still unknown (correct); §6.2 already stale (D-19). This report does not invent dates |

---

## 12. Closing note

C6's closing note said the cycle put axe-core on L1 as the smallest SCR-13 scan, put a
`continue-on-error` self-audit on L1, kept the VePlayer progress and `playbackrate`
plugins, and added S7 stall chrome — and that GitHub had not executed a job since
PNL-01. C7 required every implemented numbered hash screen next to that fallback
(history, search, wallet, settings, plus drama / play / profile / favorites), wired
single-tap pause/resume on the retained VePlayer without a competing control, and kept
CN-10 / S-C3 as ancestors of the plan. Locally, `pnpm verify` is 3,605 tests, the
coverage gate prints 94.37% / 100.00% diff, deleting `scr-07-history.html` is red,
white-on-white is red, and `continue-on-error: true` is still red.

Two things stop that from being a pass.

The first is **the observer, again.** GitHub has not executed a job on `main` since
PNL-01. Every new stem this cycle claims — history, search, wallet, settings, tap-pause
on HEAD — is YAML plus local fixtures. That is the same colour as a silent regression.
Local `pnpm verify` is not D-17.

The second is **the map.** Protocol C4 is 1/3, not 3/3. Running-count C7 did the
remediation the C7 plan ranked as buildable once drama and play left flight, plus the
named tap-pause half the plan told implement waves not to open as an epic, except the
paper writeback P3 owns and except the billing outage nobody in engineering can close
from a branch.

The pattern worth carrying is the one the QA-010 slots already practise: the close is a
*refusal* (missing `scr-07-history` is red, white-on-white is red, `continue-on-error:
true` is red, a client `playbackRate` is red) and the test that bites is the mutation
that would look like a feature. This slot's reverse-verification was that shape six
times. D-17 is the same shape in the other direction — a workflow that looks like a
gate.

---

## 13. Postscript — what moved while this report was being written

Everything above through §12 was measured against `origin/main` at **`30921f4`**
(2026-08-28T01:49:49Z). `pnpm verify` ran in this slot on that SHA (3,605 tests,
exit 0). One agent was RUNNING at snapshot. It landed before this file merged to
`main`.

| Agent | Branch | Tip at snapshot | State when this section was written |
|---|---|---|---|
| `bc-9a564c5e` W21 leftover C7 work | none at first fetch; later `origin/cursor/w21-c7-leftover-72c4` | — | **Landed.** `origin/main` **`29fa598`** (2026-08-28T01:58:16Z): "docs(handoff): record the W21 C7 leftover E-20 analog remainder (G2.3)". Unique product `1faa1ad` `ci(g2.3): require the unlock-panel P0 spec next to login-home (E-20)` (`unlock-panel.spec.ts`). Agent left the unmerged set |

**Leftover G2.3 spec landing does not change the §0 verdict.** Re-derived against
`29fa598`, not the handoff:

- G2.3 already had a `smoke` job in `l2.yml` and two P0 specs. A third required
  stem (`unlock-panel.spec.ts`, locked row → PNL-02) is additional Playwright P0,
  not a missing YAML job, not D-17, not protocol-C4 exit 1, and not S-A1. The
  leftover handoff itself leaves D-17 / C4-03 / C4-07 / GATE-7 / GATE-8 / Beans /
  real TikTok login untouched.
- QA-010 `REQUIRED_SCREEN_STEMS` is still the eleven hash fixtures. Deleting
  history / search / wallet / settings is still red on this tip.
- Protocol-C4 exit 1 stays **Not met as 全过**. Exit 3 stays **Not met as S-A1**.
  Scorecard row "G2.3 YAML not remaining" should now also read "G2.3 unlock-panel
  P0 spec on `main`". That still is not GitHub-green.
- D-17 is unchanged on the new tip. CI run
  [33134482350](https://github.com/Dawan2/minidrama/actions/runs/33134482350) and L2
  run [33134482366](https://github.com/Dawan2/minidrama/actions/runs/33134482366) on
  `29fa598` (2026-08-28T01:58:26Z) are 5–7 second billing failures with empty
  `steps`. Annotation on check-run `98731273903` is the same spending-limit
  sentence.
- Unmerged `cursor/*` vs `29fa598`: remain, leftover ads. The leftover C7 branch
  is an ancestor. **Do not retake** `unlock-panel.spec.ts`.

C5-03 / D-19, C4-03, C4-07, AM items: unchanged. No AM date appeared.

The verdict in §0 stands: running-count C7 does not pass, on D-17 and on protocol-C4
exits (1/3 at `30921f4`; still 1/3 after the G2.3 P0 spec). The C7 backlog's
buildable remediations (QA-010 implemented hash screens, tap-pause, already-landed
CN-10 / S-C3) do pass locally, a third G2.3 P0 spec is now on `main` rather than
an open leftover, the named playback remainders are on `main`, and the AM-blocked
half is still unknown.

Snapshot SHA for §§0–12: **`30921f4f5a30209f30d8de54523a9cd264f93afe`**. Trunk after
the leftover G2.3 merge: **`29fa598397fd23535aaace87f9e049cc231e2547`**.
