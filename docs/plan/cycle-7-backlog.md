# Cycle 7 — Backlog

> **Slot:** W20, plan slot.
> **Date:** 2026-08-28.
> **Branch:** `cursor/w20-plan-cycle-7-badf`, cut from `origin/main` at **`e6926f2`**
> ("Merge cursor/w19-verify-cycle-6-72c4: C6 does not pass; D-17 still billing-red").
> Merged forward onto **`c46bbf5`** (leftover C6 INF-004 S-C3, after-lock QA-010
> SCR-02, then W20 QA-010 SCR-03 landed while this slot wrote).
> The cut tip *is* the C6 report merge. Unique report commit `bd04816`. Snapshot in the
> report's §§0–12 is `eff5eb2`; postscript trunk `9b563b0` (PLY-011 S6 lock chrome) is an
> ancestor of this SHA.
> **Inputs:** `docs/verify/cycle-6-report.md` at **`e6926f2`** (W19 independent verify; not
> passed; D-17 still billing-red; protocol-C4 still 1/3), `docs/plan/cycle-6-backlog.md`
> (the predecessor this continues), `docs/plan/wave-protocol.md` §4.3 / §5.1 / §7,
> `docs/gates/open-questions.md`, and `main` itself — every claim below was re-derived
> against `c46bbf5` rather than copied from a handoff. PLY-011 landed on `main` **after**
> the report's §0–§12 snapshot (`9b563b0`); the report's own §13 already recorded that.
> Leftover C6 `bc-2c841f7a` and after-lock `bc-1a5a2455` were RUNNING at first draft and
> are ancestors of `c46bbf5` before this file merges. W20 next-a11y `bc-25aea5c1` landed
> SCR-03 the same way.
> **Predecessor:** `docs/plan/cycle-6-backlog.md`. Unfinished tasks keep their original IDs
> and acceptance criteria (`docs/plan/wave-protocol.md` §7).
> **This slot implemented nothing.** No source file, no test, no gate, no contract was
> touched. The only files added are this one and `docs/handoff/w20-plan.md`. `origin/main`
> was absorbed after leftover C6 and after-lock landed; those product files are not this
> slot's. No pull request.

---

## 0. How to read this

### 0.1 A gap list after a not-passed cycle, not a new epic

`docs/verify/cycle-6-report.md` verdict: **not passed** — against protocol-C4 exits
(**still 1/3**) and as a C6-backlog close (D-17 still P1; C5-03 / D-19 still open).
`docs/plan/wave-protocol.md` §4.3: the next plan wave must schedule remediation as top
priority; implement waves may not open a **new epic** until re-verification passes.

Protocol C5 (W21–W25, 变现闭环) is therefore **not scheduled**. Protocol C4 (W16–W20,
播放体验) is **ranked as remaining distance**. It is not a fresh epic. W16 P-02 refused to
open it; W18 P-02 refused again; W18 work siblings opened named remainders anyway; W19
re-scored the tree at 1/3, including after PLY-011. This slot does not open it a third
time, and does not open 变现闭环 to fill the wave.

### 0.2 Cycle numbering is still two schemes (X-21, unadjudicated)

`docs/plan/wave-protocol.md` §2 still makes C4 = W16–W20, so this slot is protocol-C4's
**verify wave**. The running count this repository uses called W18 "C6 plan", W19 "C6
verify", and this slot C7's plan wave. **Not adjudicated here.** P3 owns §2. Registered
again in §6.

`docs/00-wave-plan.md` still labels W20 「阶段验收」. That is the fifty-wave theme map, not
this running-count plan. Stage-acceptance E2E is not opened here.

### 0.3 Ordering

| Rank | Item | What a work slot may do |
|---|---|---|
| **1** | **D-17** GitHub Actions billing | **Nothing in code.** Account / ops. Cannot be closed from a branch |
| **2** | **Protocol-C4 交互验收单** still 1/3 | Do not open as an implement epic. Named remainders already on `main` (§1.2). 倍速 / scrub stay X-26. Do not invent `playbackRate`. Do not retake landed chrome. Leave in-flight `bc-7fbe0bc1` (remaining C4 playback) |
| **3** | **QA-010 remainder** after SCR-03 | Further implemented screens. SCR-13 / SCR-02 / SCR-03 are already on `main`. Do not retake. Do not start a twin of the landed stems |
| **—** | **INF-004 S-C3** echo-only | **Not remaining.** Landed at `51ab72f` / `dea3066` (`bc-2c841f7a`). Was in flight at first draft. S-C4 stays a further slice |
| **4** | **C4-03** T14 / T16 / T15 | Still open. **Do not fake.** May defer with IDs kept |
| **5** | **C4-07** SCR-11 / D8 | Still blocked. No subscription contract. Do not invent `/v1/subscriptions` or `#/vip` |

Partner answers are **unknown**. None is invented. The questions stay in
`docs/gates/open-questions.md`.

### 0.4 In-flight and leftover work this slot does not touch

| Who | State at write time | Rule |
|---|---|---|
| `bc-2c841f7a` (W18 work leftover C6 item) | **Idle. Landed.** Was RUNNING at first draft. Unique commit `dea3066` `feat(INF-004): fail CI self-audit on echo-only workflow steps` is an ancestor of `51ab72f`. The C6 report §13 warned this agent was a twin PLY-011 (`af1b7ff`). **Re-derived:** that SHA is not in this clone; leftover reset onto `9b563b0` and shipped S-C3 | Do not retake `packages/quality/src/audit.ts`. Do not merge leftover as a second S6. S-C4 is a further slice, not this tip |
| `bc-1a5a2455` (W18 work next C6 after lock chrome) | **Idle. Landed.** Was RUNNING at first draft (after the C6-report lock). Unique commit `35fa8e8` `ci(qa-010): require the SCR-02 home fixture next to SCR-13` is an ancestor of `51ab72f` | Do not retake `scr-02-home.html` / `a11y.ts`. Dated notes say SCR-02 still does **not** close protocol-C4 exit 3 |
| `bc-25aea5c1` (W20 work next a11y screen) | **Idle. Landed.** Unique commit `b557c29` `ci(qa-010): require the SCR-03 browse fixture next to home and fallback` is an ancestor of `c46bbf5` | Do not retake `scr-03-browse.html`. Dated notes still do **not** close protocol-C4 exit 3 |
| `bc-7fbe0bc1` (W20 work remaining C4 playback) | **RUNNING.** No `cursor/*` branch visible on origin yet | Do not guess its files. Do not invent `playbackRate`. Do not retake landed chrome |
| `origin/cursor/w13-work-c3-remain-72c4` | **Not an ancestor of `main`.** Original `GET /v1/wallet/transactions`. **D-18 closed by port** | Do not implement a second transactions route. Drop or archive |
| `origin/cursor/w14-work-c4-subseq-72c4` | Leftover duplicate C4-08 ads. A sibling already landed | Do not retake |
| `origin/cursor/w18-work-c6-follow-72c4` | **Ancestor.** Landed PLY-011 at `9b563b0` / `533433f` | Do not retake `locked-chrome.tsx` / `PlayPage.tsx` |
| `origin/cursor/w18-work-c6-left-72c4` | **Ancestor.** Landed INF-004 S-C3 | Do not retake |
| `origin/cursor/w18-work-c6-after-lock-72c4` | **Ancestor.** Landed QA-010 SCR-02 | Do not retake |
| `origin/cursor/w20-work-a11y-next-72c4` | **Ancestor.** Landed QA-010 SCR-03 | Do not retake |

---

## 1. What the C6 report said, and what `main` is now

Verified at `c46bbf5`. The report file is an ancestor (`e6926f2` merge / `bd04816`
unique). Where §§0–12 talk about `eff5eb2` and §13 talks about `9b563b0`, HEAD is that
report plus PLY-011 plus leftover C6 S-C3 plus after-lock SCR-02 plus W20 SCR-03. Where a
handoff disagrees, the tree wins.

### 1.1 Protocol-C4 exits — still 1/3

Re-derived. Same three rows as `docs/verify/cycle-6-report.md` §0, including the PLY-011
postscript.

| Protocol C4 exit (`wave-protocol.md` §5.1) | C6 plan (`aa8a9e8`) | C6 report (`eff5eb2` / `9b563b0`) | This tree (`c46bbf5`) |
|---|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met.** Swipe / `playNext` / double-tap / PLY-012 on `main`. 倍速 / scrub plugin-owned and not kept. Stall chrome absent | **Still not met as 全过.** Kept progress + `playbackrate` plugins; S7 stall; PLY-012; PLY-011 S6 lock chrome on the postscript tip. Tap pause VePlayer-owned. D9 stays `[ ]` until a device | **Still not met as 全过.** Same as the postscript. Named remainders on `main`. Sheet is not 全过. 倍速 / scrub still plugin-owned (X-26). No client `playbackRate`. No 0.75 constant. Remaining C4 playback is in flight (`bc-7fbe0bc1`) |
| 跨端进度冲突用例通过 | **Met as the named product case.** `cross-end-conflict.test.ts` (3) | **Stays met as that case.** Not a two-phone E2E | **Stays met as that case.** Do not retake |
| a11y 门禁上线且核心屏零 critical/serious | **Not met.** QA-010 in flight. No axe-core job | **Still not met as S-A1 on every SCR/PNL.** Smallest L1 job on `main` (`check:a11y`, SCR-13 fixture only, host=jsdom). Dated notes say this slice does **not** close exit 3 | **Still not met as S-A1.** Three committed fixtures: `scr-13-fallback.html`, `scr-02-home.html`, `scr-03-browse.html`. Dated notes say this still does not close exit 3 |

One of three. Unchanged by the report landing on `main`. Rank 2 is exit 1. Rank 3 is the
exit-3 remainder (other screens). Exit 2 is not remaining.

### 1.2 C6 backlog scorecard, re-scored on this tree

W19 scored this table at `eff5eb2` and amended PLY-011 in §13. The rows that moved since
the C6 *plan* (`aa8a9e8`) are the implement closes; D-17 did not.

| ID | C6 plan (`aa8a9e8`) | C6 report (`eff5eb2` / §13) | This tree (`c46bbf5`) |
|---|---|---|---|
| **D-17** rank 1 | Open. Cannot be code-fixed | **Open. Unchanged** | **Open. Unchanged.** CI run [33131307979](https://github.com/Dawan2/minidrama/actions/runs/33131307979) on `c46bbf5` (2026-08-28T00:56:41Z): 4s, empty `steps`. Annotation on check-run `98721228200`: spending-limit / failed payments. Last successful CI on `main` is still [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at PNL-01, 2026-08-27T20:12:42Z |
| **Protocol-C4** rank 2 | 1/3. Sheet not full. Do not invent `playbackRate` | **1/3.** Exit 2 stays met. Exit 1: plugin-owned 倍速 / scrub kept, stall, PLY-011 on postscript. Exit 3: job online as SCR-13 only | **1/3.** Same exits. PLY-011 is an ancestor. Sheet still not 全过. Remaining C4 playback in flight (`bc-7fbe0bc1`) |
| **QA-010** rank 3 | In flight (`bc-b0108787`) | **Closed as the smallest L1 job** (`a68a964` / `3e8bdb2`). Remainder: other implemented screens | **Smallest job + SCR-02 + SCR-03 on `main`.** Remainder: other implemented screens. Rank 3 is that remainder, not a retake of the three landed stems |
| **PLY-012** | Closed as merge (`aa8a9e8`) | **Stays closed** | **Stays closed.** Do not retake `player-fatal.ts` |
| **C4-03** | Open. Do not fake | **Open. Not faked** | **Open. Not faked.** `postgres:` refused. No Drizzle. Redis only in refuse tests. Rank 4 here because the two in-flight C6 remainders landed |
| **C4-07** | Open, blocked | **Open, blocked** | **Open, blocked.** No `#/vip`. No OpenAPI subscription path. Rank 5 here |
| **INF-004 S-C1** | Not a ranked remainder | **On `main`** (`f40fe36`). Reverse-verified. S-C3 / S-C4 left as further slices | **S-C1 on `main`.** Do not retake |
| **INF-004 S-C3** | Not named | Named as further slice | **On `main`** (`dea3066` / leftover C6 `bc-2c841f7a`). Was in flight at first draft. S-C4 stays further. Do not retake `audit.ts` |
| **S7 stall** | Not named as a rank | **On `main`** (`00ec1d3`) | **On `main`.** Do not retake `player-stall.ts` |
| **PLY-010 倍速 / scrub** | Do not pick as leftover; X-26 | **On `main` as plugin-owned keep** (`acbdcf9`, `925f1e9`) | **On `main`.** X-26 unadjudicated. Do not invent a client ladder |
| **PLY-011 S6 lock chrome** | Not named (follow agent started during C6) | **On `main` at `9b563b0`** (`533433f` / `locked-chrome.tsx`) | **On `main`.** Do not retake |
| **HOME continue / PRG-001 / PRG-002 / C5-01 / C5-02 / QA-011 / G2.3** | Not remaining | **Stay not remaining** | **Stay not remaining** |
| **C5-03 / D-19** | P3 writeback | **Open.** §6.2 stale | **Open.** Line 235 of `wave-protocol.md` is still false on this tree |
| **C4-05 / C4-06 / C4-08 / D-21** | Last steps gated | Unchanged | **Unchanged** |
| **Tier C / AM** | Unknown | Unknown. No date invented | **Unknown.** No date invented |

The C6 plan's rank-1 item cannot land from a branch. Rank 3's *job* and *SCR-02 / SCR-03
stems* landed; the *further-screen remainder* is still open. Rank 2's sheet is closer
(PLY-011 included) and still not 全过. INF-004 S-C3 landed while this slot wrote. That is
the scorecard, and it is why C7 is still remediation rather than a new epic.

### 1.3 Defects the C6 report left, re-tested here

| ID | Sev | State at `c46bbf5` |
|---|:---:|---|
| **D-17** | P1 | **Open, unchanged.** Same billing annotation, now on this SHA. Local `pnpm verify` cannot corroborate R6 |
| **D-18** | P2 | **Stays closed.** OpenAPI 24 paths / 27 operations. Path + router + client agree. Remain branch leftover |
| **D-19** | P2 | **Open.** `wave-protocol.md` §6.2 still stale. P3 owns that file. This slot does not rewrite it |
| **D-20** | P2 | **Stays closed.** G1.9 and G1.10 are L1 steps and are inside `pnpm verify`. G1.7 is the dated G2.5 note |
| **D-21** | P2 | **Open.** `measurePly002EquivalentHost()` still `unmeasured`. No device |
| **D-16** | P1 | **Stays closed.** Player still mints `POST /v1/playback/sessions`. No `demoPlaylist` / `vid_demo_` in product source |
| **D-13** | — | **Open.** X-21 |

C2's third exit (L2 all green and reverse-verified): **8 of 8 jobs present. 0 of 8
reverse-verified on GitHub.** That is D-17, not a missing YAML job.

---

## Ranked remaining work

### Rank 1 — D-17: GitHub Actions billing (cannot be code-fixed)

| | |
|---|---|
| **Owner** | Account / ops. **Not** a work slot |
| **Existing ID** | **D-17** |
| **Depends on** | A payment or a raised spending limit. Nothing in this repository |

Every `main` push since PNL-01 fails in 4–7 seconds with empty steps. On this SHA:

```
$ gh run list --repo Dawan2/minidrama --branch main --limit 2
33131307979  failure  c46bbf5  CI   4s  2026-08-28T00:56:41Z
33131307971  failure  c46bbf5  L2   5s  2026-08-28T00:56:41Z

$ gh api repos/Dawan2/minidrama/check-runs/98721228200/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

G1.6, G1.8, G1.9, G1.10, G2.3, QA-010, INF-004, CodeQL, Trivy, Semgrep, migrate,
artifact — all of them are YAML plus local fixtures until a runner starts.

**What this is not.** A workflow bug. There is no `continue-on-error:` key. Adding a
skip, a path filter, or a fake green job would be R1–R5, not a close.

**Acceptance.** A `main` CI run whose `steps` are not empty and whose conclusion is a
test result (pass or fail). Quote the run id. Engineering cannot produce that from a
branch.

**Implement waves must not pick this.** There is no patch. Rank it first so nobody
pretends a local `pnpm verify` is R6.

---

### Rank 2 — Protocol-C4 交互验收单, still 1/3

| | |
|---|---|
| **Owner** | This plan wave names the remainder. Implement waves do **not** start 倍速 / scrub while X-26 is unadjudicated, and do **not** retake swipe / playNext / double-tap / stall / PLY-012 / PLY-011 / kept plugins |
| **Carries forward** | `PLY-010` (sheet, not the landed slices), `PLY-011` (landed chrome, not the exit), X-26 |
| **Gated on** | Re-verification of running-count C6 / C2 L2 observer, or an explicit P3 amendment of §4.3. Neither has happened. a11y remainder is rank 3 (further screens after SCR-03) |

`docs/01-product-scope.md` §4.3 is the sheet. PLY-010's acceptance is that sheet, item by
item. W16 and W18 landed named remainders. That is not a close. W19 said so. This tree
agrees.

| §4.3 row | State at `c46bbf5` |
|---|---|
| 竖屏全屏 / session-gated player | On `main`. D-16 stays closed |
| 单击暂停/继续 | **VePlayer-owned** (`AC-PL-6`). Product source does not `preventDefault` a single tap. Do not add a competing pause |
| 双击点赞 | **On `main`** (`episode-double-tap.ts`). Do not retake |
| 进度条拖拽与预览 | **Kept plugin + seek inference.** Progress not in `VEPLAYER_IGNORED_PLUGINS`. No product `playbackRate` ladder. X-26 |
| 倍速 0.75/1/1.25/1.5/2 | **Kept plugin.** `playbackrate` not in `ignores`. `rg playbackRate app/src/player` over non-test files is empty. Inventory PNL-05 names 1.0/1.25/1.5/2.0. **Do not pick 0.75** |
| 上下滑切集 | **On `main`** (`episode-swipe.ts`). Do not retake |
| 自动连播，遇付费墙停 | **On `main`.** `ended` → `gateAdvance` → retained `playNext` or PNL-02. Do not retake |
| 付费墙拦截页 | PNL-02 on `main`. **S6 cover + lock chrome on `main`** (`locked-chrome.tsx`). Ads call sites exist with `adUnlock: false`. Recharge stays disabled. Last steps are C4-06 / C4-08, not a new panel. Do not retake the chrome |
| 播放令牌过期静默换发 | **On `main`** (`aa8a9e8` / `player-fatal.ts`). Do not retake |
| 导航栏 / 安全区 | Wired (D9). Checklist stays `[ ]` until a device. §8 rule 6 |

S7 stall indicator then retry is on `main` (`player-stall.ts`). It is not a §4.3 row; do
not retake it either.

**Do not pick 倍速 or scrub as "C7 leftover".** That was already forbidden as a C5 leftover
and as a C6 leftover. X-26 is P1/P2. A client constant for 0.75 would be the defect.

**Acceptance for this rank (the plan-wave close, not the epic).** The sheet is named
against `c46bbf5`, the landed halves (including PLY-011) are not retaken, and implement
waves are told not to invent `playbackRate`. A PR that lands 倍速 as "C7 leftover" fails
this rank. Leave `bc-7fbe0bc1`.

---

### Rank 3 — QA-010 remainder: after SCR-03

| | |
|---|---|
| **Owner** | Work slot C, then A for screen fixes |
| **Existing ID** | **QA-010**. Smallest job, SCR-02, and SCR-03 already on `main`. Remainder is S-A1 on the other implemented screens |
| **Gated on** | Nothing external. Protocol-C4 exit 3 |

QA-011 adopted DoD §6: a11y is a listing blocker. `docs/14-test-plan.md` §6.4 heading is
`可用性与无障碍(上架阻断)`. The smallest job is `pnpm check:a11y` inside `verify` and as a
named L1 step. Host is jsdom, not TikTok WebView. Three committed fixtures:
`scr-13-fallback.html`, `scr-02-home.html`, `scr-03-browse.html`
(`REQUIRED_SCREEN_STEMS`). Dated notes say this still does **not** close protocol-C4
exit 3.

After-lock unique commit `35fa8e8` required SCR-02. W20 next-a11y unique commit
`b557c29` required SCR-03. Both **landed** while this slot wrote (`51ab72f`, then
`c46bbf5`). Rank 3 is now the *other* implemented screens.

**What this task is not.** A docs retake of QA-011. A retake of SCR-13 / SCR-02 / SCR-03.
A `continue-on-error` axe job. A scan of screens that do not exist (`#/recharge`,
`#/vip`). A claim that jsdom is TikTok WebView.

**What a C7 work slot may do.** Re-derive `origin/main` first. Leave `bc-7fbe0bc1`
playback files. Do not retake the three landed stems. Pick the next implemented numbered
screen against the tree at that time — not against this paragraph's guess.

P1 still owes a countersign on `docs/plan/backlog.md` (QA-011 handoff). This slot does
not edit P1's file. Registered in §6.

---

### INF-004 S-C3 — not remaining

Landed at `51ab72f` while the first draft of this file still listed `bc-2c841f7a` as
RUNNING. Unique commit `dea3066` fails CI self-audit on echo-only / `true` / `exit 0`
`run` steps. S-C1 was already on `main`. Dated notes leave S-C4 (required-checks vs
branch protection) as a further slice. Do not retake `audit.ts`. Do not start S-C4 as
"C7 leftover" while D-17 still falsifies GitHub branch protection reads.

---

### Rank 4 — C4-03: T14 / T16 / T15, still do not fake

Same task as `docs/plan/cycle-4-backlog.md` C4-03, `docs/plan/cycle-5-backlog.md` rank 3,
and `docs/plan/cycle-6-backlog.md` rank 4. Same IDs: **T14**, **T16**, **T15**.

`database-url.ts` still refuses `postgres:` and does not rewrite it to a file. No
`drizzle` in workspace `package.json` files. Redis appears only as a refused scheme in
tests. Seven paired sqlite migrations (`0001`…`0007`). Seed floor still 80. No BytePlus
ids.

**Acceptance.** Unchanged: a working `postgres:` scheme with forward-and-back migrations
in CI, **or** a written, dated amendment of T14, **or** deferral with the IDs kept. Do
not mark T14 `[x]` on sqlite.

---

### Rank 5 — C4-07: SCR-11 / D8, still no contract

Same task as C4-07. OpenAPI: 24 paths, none a subscription. No `vip:` in
`app/src/routes/routes.ts`. Profile Subscribe stays disabled. `GET /v1/users/me` has no
`vip` field; tests refuse a `vip.active=false` invention.

**Do not** build `#/vip` against a client-invented `/v1/subscriptions`. Define the
contract or defer the screen. No partner answer is recorded here.

---

## Not remaining (do not retake)

| Item | Why |
|---|---|
| **G2.3** smoke E2E | Job `smoke` is in `l2.yml`. GitHub has not executed it (**D-17**). Do not fold into L1. Do not `continue-on-error` |
| **HOME continue UI** | `data-testid="continue-rail"` on `HomePage.tsx` |
| **PRG-002 drama CTA** | Progress `lastWatched` → Continue. Do not retake `drama-continue-cta.ts` |
| **PRG-001 named conflict case** | `cross-end-conflict.test.ts`. Protocol exit 2 as the HTTP use case. Kill-process / offline ≤ 5 s is still not an E2E |
| **C5-01 / D-20** | G1.9 + G1.10 in `ci.yml` and in `pnpm verify`. G1.7 dated as G2.5 Trivy |
| **C5-02 / D-18** | `GET /v1/wallet/transactions` is 200 empty page, lockstep with OpenAPI |
| **QA-011 / C-12** | Writeback on `main`. Not the gate |
| **QA-010 smallest job / SCR-13** | On `main`. Rank 3 is the other screens after SCR-03. Do not retake `scr-13-fallback.html` |
| **QA-010 SCR-02 home** | On `main` at `51ab72f` / `35fa8e8`. Do not retake `scr-02-home.html` |
| **QA-010 SCR-03 browse** | On `main` at `c46bbf5` / `b557c29`. Do not retake `scr-03-browse.html` |
| **INF-004 S-C1** | On `main`. Do not retake the continue-on-error detector |
| **INF-004 S-C3 echo-only** | On `main` at `51ab72f` / `dea3066`. Do not retake `audit.ts`. S-C4 stays further |
| **PLY-010 swipe / playNext / double-tap** | On `main`. Rank 2 is the rest of the sheet |
| **PLY-010 倍速 / scrub as kept plugins** | On `main`. X-26 still unadjudicated. Do not invent a client ladder |
| **S7 stall** | On `main`. Do not retake `player-stall.ts` |
| **PLY-012** token re-issue | On `main` at `aa8a9e8`. Do not retake `player-fatal.ts` |
| **PLY-011 S6 lock chrome** | On `main` at `9b563b0` / `533433f`. Do not retake `locked-chrome.tsx` |
| **C4-04** splash / `GET /v1/config` | Closed in C4 |
| **C4-01** G1.5 + L1 `workflow_dispatch:` | Closed in C4. `workflow_dispatch:` is on both workflows |

---

## Tier A — buildable today; remediations, not a new epic

Per §4.3 these would be the implement picks. After rank 2's in-flight remaining C4
playback (`bc-7fbe0bc1`) and the blocked C4-03 / C4-07 rows, rank 3 (further a11y
screens after SCR-03) is the unblocked engineering remainder that is not already owned.

### C5-03 — D-19: refresh `wave-protocol.md` §6.2 (P3's file)

| | |
|---|---|
| **Owner** | **P3** |
| **Existing ID** | **D-19** |

§6.2 still describes a tree that is not `c46bbf5` ("no database, no migration, 27 seed
episodes against a floor of 80, no CI L2"). This plan slot does not edit P3's file
(§3.4). Status columns in §5.1 (C3 `[~]`, protocol-C4 `[ ]`) are also stale relative to
the running-count reports; same owner; X-21 stays unadjudicated.

### Leftover branches — integrator, not a rewrite

Drop or archive `cursor/w13-work-c3-remain-72c4` and `cursor/w14-work-c4-subseq-72c4`.
D-18 and C4-08 already landed by other tips. A second transactions route or a second ads
slice is the defect.

Leave `cursor/w18-work-c6-left-72c4`, `cursor/w18-work-c6-after-lock-72c4`, and
`cursor/w20-work-a11y-next-72c4` as ancestors — they landed. Leave `bc-7fbe0bc1` until
that agent is idle. It is a live remainder, not a drop-or-archive leftover.

---

## Tier B — last step still gated; unblocked halves already shipped

No new unblocked halves. Do not retake C4-05 / C4-06 / C4-08.

| ID | Unblocked half | Still gated |
|---|---|---|
| **C4-05** / **C3-08** | Stubbed `POST /v2/oauth/token/` | GATE-1 + GATE-6. No synthesised `open_id` |
| **C4-06** / **C3-09** | Stubbed `trade_order/create` | Q-G-7. Recharge stays disabled. No rate in types |
| **C4-07** | Profile card is the honest stand-in | A contract, then GATE-2 + GATE-4 (**rank 5**) |
| **C4-08** | Call sites + server `isEnded` | GATE-4 unit ids. `adUnlock` stays false |
| **D-21** / **PLY-002** | Contract probe returns `unmeasured` | Devices. Q-G-10. Do not copy C1 research as a C7 measurement |

---

## Tier C — business track. Engineers cannot close these

No new task IDs. `T3-1`…`T3-5`, `GOV-002`, `GOV-005`, `GOV-008`, Q-G-1…Q-G-10. Status:
**unknown**.

D-17 sits here as well as at rank 1: it is the same class of external blocker as GATE-0,
except it already has a defect ID and it currently falsifies R6.

| If someone asks | The answer in this repository |
|---|---|
| When will CI run on `main`? | Unknown. D-17. Billing / spending-limit annotation. **No date** |
| When is EIS done? | Unknown. Q-G-2. **Do not fill a date** |
| When can we ingest to BytePlus? | Unknown. Q-G-3. **Do not fill a date** |
| What is the coin→Beans rate? | Unknown. Q-G-7. **No rate in code** |
| Can we ship EU/US? | Unknown. Q-G-1 |
| Where is the official PDF? | Unknown. Q-G-9 / GATE-0 |

Nine business-track blockers, still zero external evidence. Filing is not answering.

---

## 2. Evidence

Re-derived at `c46bbf5`. Commands to re-run, not to believe.

```
$ git rev-parse --short HEAD
c46bbf5

$ gh api repos/Dawan2/minidrama/check-runs/98721228200/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."

$ rg -n 'playbackRate' app/src/player --glob '!*.test.*'
# (empty — no product caller)

$ ls packages/quality/a11y/screens/
# scr-02-home.html  scr-03-browse.html  scr-13-fallback.html

$ git merge-base --is-ancestor origin/cursor/w18-work-c6-left-72c4 origin/main; echo $?
0

$ git merge-base --is-ancestor origin/cursor/w18-work-c6-after-lock-72c4 origin/main; echo $?
0

$ rg -n 'vip:' app/src/routes/routes.ts || echo "no vip route"
# no vip route

$ rg -c '^  /' contracts/openapi.yaml
24

$ rg -n '^  smoke:' .github/workflows/l2.yml
  smoke:

$ rg -n 'continue-rail' app/src/routes/HomePage.tsx
# section data-testid="continue-rail"

$ rg -n 'locked-chrome' app/src/routes/PlayPage.tsx
# import from '../player/locked-chrome'

$ rg -n 'echo-only' packages/quality/src/audit.ts | head -1
# kind: 'echo-only'

$ rg -n 'no database, no migration, 27 seed' docs/plan/wave-protocol.md
# line 235 — still present (D-19)
```

This plan slot's own `pnpm verify` is the gate for **these two docs**, not a third
product count. W19 recorded 3,542 tests at `eff5eb2`. Do not quote that as this SHA's
count.

---

## 3. Dependency graph

```
Rank 1 — D-17 (ops). Not a branch. Blocks GitHub reverse-verification of every gate.

Rank 2 — protocol-C4 交互验收单 still 1/3.
  Landed: swipe 切集, ended playNext, double-tap favourite, kept 倍速 / scrub
  plugins, S7 stall, PLY-012, PLY-011 S6 lock chrome. Do not retake.
  Not a client product control: 倍速 / scrub (X-26, plugin-owned). Do not invent
  playbackRate. Tap pause is VePlayer-owned (AC-PL-6). Do not compete.
  In flight: `bc-7fbe0bc1` remaining C4 playback. Leave it.

Rank 3 — QA-010 remainder after SCR-03. Smallest job, SCR-02, and SCR-03 on main.
  Do not retake those fixtures. Further implemented screens remain.

INF-004 S-C3 — closed as merge (`51ab72f` / `dea3066`). Do not retake audit.ts.
  S-C4 stays a further slice.

Rank 4 — C4-03 T14/T16/T15. Do not fake; may defer with IDs kept.

Rank 5 — C4-07. A contract, then GATE-2 + GATE-4.

Not remaining: G2.3, HOME continue, C5-01, C5-02, QA-011, QA-010 SCR-13, QA-010
SCR-02, QA-010 SCR-03, INF-004 S-C1, INF-004 S-C3, PRG-001 named case, PRG-002 drama
CTA, C4-01, C4-04, PLY-010 landed slices, PLY-012, PLY-011 S6 lock chrome, S7 stall.

Tier A paper
  C5-03 = D-19 P3 writeback of wave-protocol.md §6.2
  Integrator: drop leftover remain / c4-subseq. Leave in-flight W20 remaining C4
  playback (`bc-7fbe0bc1`).

Tier B — last steps unchanged
  C4-05, C4-06, C4-08, D-21

Tier C — Q-G-1…Q-G-10 unknown. GATE-0…GATE-8 no movement.

Do not open protocol-C5 变现闭环 (§4.3).
Do not open 00-wave-plan W20 阶段验收.
```

**First C7 implement picks.** Re-derive `origin/main` first. Leave `bc-7fbe0bc1`. Do not
pick D-17, G2.3, HOME continue, leftover ads, leftover remain, `#/vip`,
Postgres-as-sqlite, 倍速, PLY-012, PLY-011 `locked-chrome.tsx`, QA-010 SCR-13, QA-010
SCR-02, QA-010 SCR-03, INF-004 S-C1, or INF-004 S-C3. Rank 3 (next implemented a11y
screen after browse) is the unblocked remainder behind the in-flight playback agent.

---

## 4. What is deliberately not in this backlog as an implement assignment

- **Opening protocol-C5 变现闭环.** §4.3. D-17 is still P1 and protocol-C4 is 1/3.
- **Opening protocol-C4 播放体验 as a new epic.** Ranked, split, not scheduled by this
  slot. Named remainders are on `main`. One W20 sibling is already on remaining C4
  playback (`bc-7fbe0bc1`).
- **A 倍速 / `playbackRate` client control.** X-26. Forbidden as a leftover by the C5
  plan, the C5 report, the C6 plan, and the C6 report.
- **A twin of landed QA-010 stems.** SCR-13 / SCR-02 / SCR-03 are on `main`. **A twin
  INF-004 S-C3.** Landed. **A second S6.** Leftover unique files shipped S-C3, not a twin
  chrome.
- **A G2.3 retake.** On `main` as of C4/C5.
- **A HOME continue rail UI retake.** On `main`.
- **A second wallet-transactions route.** D-18 closed.
- **Leftover `c4-subseq` ads.** Duplicate of landed C4-08.
- **Enabling recharge** with a guessed Beans rate.
- **Partner dates, EIS submission, BytePlus ingest day, AM names, D-17 restoration day.**
  Unknown.
- **Rewriting `wave-protocol.md` §2 (X-21) or §6.2 (D-19).** P3.
- **Rewriting `docs/plan/backlog.md` for the QA-011 countersign.** P1.
- **Marking D4–D9 `[x]`** from mock or wired-but-not-on-device work.
- **Calendar estimates.**
- **Search / 分类 / 阶段验收 as W20 theme work.** Fifty-wave map, not this running-count
  plan.

---

## 5. The listing bar, restated as distance

Against `docs/11-official-onboarding-checklist.md` E4 (all six mandatory capabilities):

| # | Capability | Server | Client call site | Blocked on |
|---|---|:---:|:---:|---|
| D4 | Silent login | endpoint exists, real port refuses | wired (boot + recovery) | GATE-1, GATE-6 (`C4-05` / `C3-08`) |
| D5 | Rewarded video ad | `isEnded` check | wired against mock; live flag off | GATE-4 (`C4-08`) |
| D6 | Interstitial ad | same flag | wired against mock; live flag off | GATE-4 (`C4-08`) |
| D7 | Beans one-off | stubbed create; default port refuses | recharge disabled | GATE-2 + GATE-4, observed rate (`C4-06`) |
| D8 | Subscription | **none** | probe + fail-closed card | a contract, then GATE-2 + GATE-4 (`C4-07`) |
| D9 | Nav bar + capsule | n/a | **wired** | **device** to flip the checklist |

Screens: **11 of 13.** Missing numbered: SCR-10 `#/recharge`, SCR-11 `#/vip`. SCR-01 is
an overlay. Hash routes: home, browse, search, drama, play, me, history, favorites,
wallet, settings, fallback.

Panels: **2 of 5** (PNL-01, PNL-02). PNL-03 blocked. PNL-04 off. PNL-05 is in inventory
and is protocol-C4 / X-26; there is no product caller. S6 lock chrome is under PNL-02,
not a fifth panel.

C2 data-layer exit: **sqlite met, Postgres not (C4-03).** C2 L2 exit: **8 of 8 jobs
present, 0 GitHub-green (D-17).** Protocol-C4: **1 of 3.**

---

## 6. Conflict register

Per `docs/plan/wave-protocol.md` §3.4 — found, not fixed.

| # | Conflict | Owner | Recommendation |
|---|---|---|---|
| **X-21** | Two live cycle-numbering schemes. This file is named cycle-7 by the running count; §2 still says W20 ∈ C4 (verify wave) | **P3** | Same as W11/W14/W16/W18: adopt the running count and amend §2 with a §9 row, rather than renaming documents |
| **X-22** | Pointers from P1/media-plane files still *propose* GATE-7/8 instead of pointing at §6.1 | **P1 / media-plane owner** | Pointers, not a third table |
| **X-25** | Unmerged `cursor/w13-work-c3-remain-72c4` vs `main`'s now-live wallet transactions | **Integrator** | D-18 closed by port. Drop or archive the leftover tip. Do not implement a second route |
| **X-26** | `01-product-scope` §4.3 names 倍速 0.75/1/1.25/1.5/2; inventory PNL-05 names 1.0/1.25/1.5/2.0 | **P1 / P2** | Adjudicate before any client constant. Do not pick 0.75. The kept plugin is not that write |
| **X-27** | Leftover C6 (`bc-2c841f7a`) and after-lock (`bc-1a5a2455`) both edited `docs/14-quality-gates.md` while RUNNING | **Those two agents, then C** | Sequential merges absorbed both dated notes (S-C3 then SCR-02). Collision closed by absorb, not by this slot. Do not rewrite C's file |
| **D-19** | `wave-protocol.md` §6.2 stale vs this tree | **P3** | `C5-03`. This slot does not edit that file |
| **QA-011 P1 countersign** | Slot C adopted DoD §6 in `14-test-plan.md` §6.4; `docs/plan/backlog.md` still has the pre-adoption row | **P1** | Countersign on P1's file. This slot does not rewrite `backlog.md` |

---

## 7. Change record

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-28 | W20 · plan | First version. Absorbed `docs/verify/cycle-6-report.md` at `e6926f2` (not passed; protocol-C4 still 1/3; D-17 still billing-red). Cut from `e6926f2`; merged forward onto `c46bbf5`. Leftover C6 `bc-2c841f7a` (INF-004 S-C3), after-lock `bc-1a5a2455` (QA-010 SCR-02), and W20 next-a11y `bc-25aea5c1` (QA-010 SCR-03) **landed while this slot wrote**. Ranked: D-17 (cannot be code-fixed), protocol-C4 交互验收单 still 1/3, QA-010 remainder after SCR-03, C4-03 still open (do not fake), C4-07 still blocked. Remaining C4 playback in flight (`bc-7fbe0bc1`). Did not invent AM answers, Beans, EIS, BytePlus, Postgres, VIP, or a CI-restoration date. Did not implement product code. Did not open protocol-C5 变现闭环 |
