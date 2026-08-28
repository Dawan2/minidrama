# Cycle 6 — Backlog

> **Slot:** W18, plan slot.
> **Date:** 2026-08-28.
> **Branch:** `cursor/w18-plan-cycle-6-c656`, cut from `origin/main` at **`0846582`**
> ("docs(c5): record the QA-011 landing in the W17 postscript; D-17 still billing-red").
> Merged forward onto **`aa8a9e8`** (PLY-012 silent re-issue landed while this slot wrote).
> **Inputs:** `docs/verify/cycle-5-report.md` at **`0846582`** (W17 independent verify; not passed;
> snapshot SHA `a8e1c63`, postscript QA-011 trunk `7ce8620`, this file is the report tip),
> `docs/plan/cycle-5-backlog.md` (the predecessor this continues), `docs/plan/wave-protocol.md`
> §4.3 / §5.1 / §7, `docs/gates/open-questions.md`, and `main` itself — every claim below was
> re-derived against `aa8a9e8` rather than copied from a handoff. QA-011 landed on `main`
> **after** the report's §0–§12 snapshot (`7ce8620`); the report's own §13 already recorded that.
> PLY-012 landed at `aa8a9e8` **after** the report listed it open.
> **Predecessor:** `docs/plan/cycle-5-backlog.md`. Unfinished tasks keep their original IDs and
> acceptance criteria (`docs/plan/wave-protocol.md` §7).
> **This slot implemented nothing.** No source file, no test, no gate, no contract was touched. The
> only files added are this one and `docs/handoff/w18-plan.md`. `origin/main` was absorbed after
> PLY-012 landed; those product files are not this slot's. No pull request.

---

## 0. How to read this

### 0.1 A gap list after a not-passed cycle, not a new epic

`docs/verify/cycle-5-report.md` verdict: **not passed** — against protocol-C4 exits (1/3) and as a
C5-backlog close (D-17 still P1; C5-03 / D-19 still open). `docs/plan/wave-protocol.md` §4.3: the
next plan wave must schedule remediation as top priority; implement waves may not open a **new
epic** until re-verification passes.

Protocol C5 (W21–W25, 变现闭环) is therefore **not scheduled**. Protocol C4 (W16–W20, 播放体验) is
**ranked as remaining distance** and **split into named remainders**. It is not a fresh epic. W16
P-02 refused to open it; W16 work siblings opened the named remainders anyway; W17 re-scored the
tree at 1/3. This slot does not open it a second time, and does not open 变现闭环 to fill the wave.

### 0.2 Cycle numbering is still two schemes (X-21, unadjudicated)

`docs/plan/wave-protocol.md` §2 still makes C4 = W16–W20, so this slot is protocol-C4's second
implement wave. The running count this repository uses called W16 "C5 plan", W17 "C5 verify", and
this slot C6's plan wave. **Not adjudicated here.** P3 owns §2. Registered again in §6.

`docs/00-wave-plan.md` still labels W18 「搜索与分类」. That is the fifty-wave theme map, not this
running-count plan. Search is not opened here.

### 0.3 Ordering

| Rank | Item | What a work slot may do |
|---|---|---|
| **1** | **D-17** GitHub Actions billing | **Nothing in code.** Account / ops. Cannot be closed from a branch |
| **2** | **Protocol-C4 交互验收单** still not met, despite PLY-010 | Do not open as an implement epic. Named remainder only (§1.2). 倍速 / scrub stay X-26. Do not invent `playbackRate` |
| **3** | **QA-010** a11y gate | **In flight** (`bc-b0108787`). Leave its files. Do not start a twin axe-core job |
| **—** | **PLY-012** token re-issue | **Not remaining.** Landed at `aa8a9e8` (`bc-264077b7`). Was in flight at first draft |
| **4** | **C4-03** T14 / T16 / T15 | Still open. **Do not fake.** May defer with IDs kept |
| **5** | **C4-07** SCR-11 / D8 | Still blocked. No subscription contract. Do not invent `/v1/subscriptions` |

Partner answers are **unknown**. None is invented. The questions stay in
`docs/gates/open-questions.md`.

### 0.4 In-flight and leftover work this slot does not touch

| Who | State at write time | Rule |
|---|---|---|
| `bc-b0108787` (W16 work QA-010 a11y scan) | **RUNNING.** No `cursor/*` branch visible on origin yet | Do not guess its files. Re-derive `origin/main` before picking an a11y remainder. Do not start a twin |
| `bc-264077b7` (W16 work next C5 after like-gesture) | **Idle. Landed.** `aa8a9e8` / `cursor/w16-work-c5-after-like-72c4`. Unique product commit `271408f` is an ancestor. PLAYER_FATAL re-mints once on VePlayer `error` | Do not retake `PlayPage.tsx` / `player-fatal.ts` / `PlayerSurface.tsx` |
| `origin/cursor/w13-work-c3-remain-72c4` | **Not an ancestor of `main`.** Original `GET /v1/wallet/transactions`. **D-18 closed by port**, not by this tip | Do not implement a second transactions route. Drop or archive |
| `origin/cursor/w14-work-c4-subseq-72c4` | Leftover duplicate C4-08 ads. A sibling already landed | Do not retake |

---

## 1. What the C5 report said, and what `main` is now

Verified at `aa8a9e8`. The report file is an ancestor (`0846582`). Where §§0–12 talk about
`a8e1c63` and §13 talks about `7ce8620`, HEAD is that report plus QA-011 plus PLY-012. Where a
handoff disagrees, the tree wins.

### 1.1 Protocol-C4 exits — still 1/3

Re-derived. Same three rows as `docs/verify/cycle-5-report.md` §0, including the QA-011 postscript.

| Protocol C4 exit (`wave-protocol.md` §5.1) | C5 plan (`7ecca77`) | C5 report (`a8e1c63` / `7ce8620`) | This tree (`aa8a9e8`) |
|---|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met** | **Still not met.** Swipe 切集, `ended` → retained `playNext`, double-tap favourite on `main`. 倍速 / scrub plugin-owned (X-26). PLY-012 absent | **Still not met**, despite PLY-010. Same split, plus PLY-012 now on `main` (`aa8a9e8`). 倍速 / scrub still plugin-owned. That is not the full sheet |
| 跨端进度冲突用例通过 | **Not met** (LWW unit tests only) | **Met as the named product case.** `cross-end-conflict.test.ts` (3) plus the pre-seek heartbeat hold | **Stays met as that case.** Not a two-phone E2E. Do not retake |
| a11y 门禁上线且核心屏零 critical/serious | **Not met** | **Still not met.** QA-011 writeback on `main` at `7ce8620`. QA-010 absent. No axe-core job | **Still not met.** `.github/workflows/` has no `axe` job. QA-010 is in flight, not landed |

One of three. Unchanged by the report landing on `main`. Rank 2 is exit 1. Rank 3 is exit 3. Exit 2
is not remaining.

### 1.2 C5 backlog scorecard, re-scored on this tree

W17 scored this table at `a8e1c63` and amended QA-011 in §13. The rows that moved since the C5
*plan* (`7ecca77`) are the implement closes; D-17 did not.

| ID | C5 plan (`7ecca77`) | C5 report (`a8e1c63` / §13) | This tree (`aa8a9e8`) |
|---|---|---|---|
| **D-17** rank 1 | Open. Cannot be code-fixed | **Open. Unchanged** | **Open. Unchanged.** CI run [33128549734](https://github.com/Dawan2/minidrama/actions/runs/33128549734) on `aa8a9e8` (2026-08-28T00:05:26Z): 4s, empty `steps`. Same spending-limit class as check-run `98711991675` on `0846582`. Last successful CI on `main` is still [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at PNL-01, 2026-08-27T20:12:42Z |
| **Protocol-C4** rank 2 | 0/3, split, not opened | **1/3.** Exit 2 met as the named case. Exit 1 partial. Exit 3 unmet | **1/3.** Same. PLY-010 named remainders on `main`; sheet still not full |
| **G2.3** | Not remaining (YAML) | Stays a job. GitHub has not run it | **Not remaining.** Job `smoke` still in `l2.yml`. Do not retake |
| **C4-03** | Open. Do not fake | Open. Not faked | **Open. Not faked.** `postgres:` refused. No Drizzle. Redis only in refuse tests |
| **C4-07** | Open, blocked | Open, blocked | **Open, blocked.** No `#/vip`. No OpenAPI subscription path |
| **HOME continue UI** | Not remaining | Stays landed | **Not remaining.** `continue-rail` |
| **C5-01 / D-20** | First implement pick | **Closed.** G1.10 and G1.9 reverse-verified. G1.7 dated as G2.5 | **Closed.** Do not retake |
| **C5-02 / D-18** | Merge or drop | **Closed as merge.** 200 empty page, not 404 | **Closed.** Remain branch is leftover, not a second defect |
| **C5-03 / D-19** | P3 writeback | **Open.** §6.2 stale | **Open.** Line 235 of `wave-protocol.md` is still false on this tree |
| **C4-05 / C4-06 / C4-08 / D-21** | Last steps gated | Unchanged | **Unchanged** |
| **PLY-010 swipe / playNext / double-tap** | Named remainder; do not open as epic | **On `main`.** Full sheet still not met | **On `main`.** Rank 2 is the rest of the sheet, not a retake of these files |
| **PRG-001 remainder** | Product case missing | **Closed as the HTTP use case** | **Closed.** Do not retake `cross-end-conflict.test.ts` |
| **PRG-002 drama CTA** | Open | **Closed** | **Closed.** Do not retake `drama-continue-cta.ts` |
| **QA-011** | Not started | Writeback on `main` (`7ce8620`) | **Closed as writeback.** Heading `可用性与无障碍(上架阻断)`. Not the axe-core job |
| **QA-010** | Not started | Absent. Later agent started after snapshot | **In flight** (`bc-b0108787`). Not on `main`. Rank 3 |
| **PLY-012** | Open | Open. After-like RUNNING, not on `main` | **Closed as merge.** `aa8a9e8` / `271408f`. Do not retake |
| **Tier C / AM** | Unknown | Unknown. No date invented | **Unknown.** No date invented |

The C5 plan's first implement pick (G1.10) landed. Its integrator pick (D-18) landed. Its rank-1
item cannot land from a branch. Protocol-C4 moved from 0/3 to 1/3 and stopped. That is the
scorecard, and it is why C6 is still remediation rather than a new epic.

### 1.3 Defects the C5 report left, re-tested here

| ID | Sev | State at `aa8a9e8` |
|---|:---:|---|
| **D-17** | P1 | **Open, unchanged.** Same billing annotation, now on this SHA. Local `pnpm verify` cannot corroborate R6 |
| **D-18** | P2 | **Stays closed.** OpenAPI 24 paths / 27 operations. Path + router + client agree. Remain branch leftover |
| **D-19** | P2 | **Open.** `wave-protocol.md` §6.2 still stale. P3 owns that file. This slot does not rewrite it |
| **D-20** | P2 | **Stays closed.** G1.9 and G1.10 are L1 steps and are inside `pnpm verify`. G1.7 is the dated G2.5 note |
| **D-21** | P2 | **Open.** `measurePly002EquivalentHost()` still `unmeasured`. No device |
| **D-16** | P1 | **Stays closed.** Player still mints `POST /v1/playback/sessions`. No `demoPlaylist` / `vid_demo_` in product source |
| **D-13** | — | **Open.** X-21 |

C2's third exit (L2 all green and reverse-verified): **8 of 8 jobs present. 0 of 8 reverse-verified
on GitHub.** That is D-17, not a missing YAML job.

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
33128549734  failure  aa8a9e8  CI   4s  2026-08-28T00:05:26Z
33128549589  failure  aa8a9e8  L2   5s  2026-08-28T00:05:26Z

$ gh api repos/Dawan2/minidrama/check-runs/98711991675/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."
```

G1.6, G1.8, G1.9, G1.10, G2.3, CodeQL, Trivy, Semgrep, migrate, artifact — all of them are YAML
plus local fixtures until a runner starts.

**What this is not.** A workflow bug. There is no `continue-on-error:` key. Adding a skip, a path
filter, or a fake green job would be R1–R5, not a close.

**Acceptance.** A `main` CI run whose `steps` are not empty and whose conclusion is a test result
(pass or fail). Quote the run id. Engineering cannot produce that from a branch.

**Implement waves must not pick this.** There is no patch. Rank it first so nobody pretends a
local `pnpm verify` is R6.

---

### Rank 2 — Protocol-C4 交互验收单, still not met despite PLY-010

| | |
|---|---|
| **Owner** | This plan wave names the remainder. Implement waves do **not** start 倍速 / scrub while X-26 is unadjudicated, and do **not** retake swipe / playNext / double-tap |
| **Carries forward** | `PLY-010` (sheet, not the landed slices), `PLY-011` remainder, X-26 |
| **Gated on** | Re-verification of running-count C5 / C2 L2 observer, or an explicit P3 amendment of §4.3. Neither has happened. Token re-issue landed (`aa8a9e8`). a11y is rank 3 (in flight) |

`docs/01-product-scope.md` §4.3 is the sheet. PLY-010's acceptance is that sheet, item by item.
W16 landed three named remainders. That is not a close.

| §4.3 row | State at `aa8a9e8` |
|---|---|
| 竖屏全屏 / session-gated player | On `main`. D-16 stays closed |
| 单击暂停/继续 | **VePlayer-owned** (`AC-PL-6`). Product source does not `preventDefault` a single tap. Do not add a competing pause |
| 双击点赞 | **On `main`** (`episode-double-tap.ts`). Do not retake |
| 进度条拖拽与预览 | **Not in product source.** Plugin-owned. X-26 |
| 倍速 0.75/1/1.25/1.5/2 | **Not in product source.** `rg playbackRate app/src/player` → only a test that forbids inventing it. Inventory PNL-05 names 1.0/1.25/1.5/2.0. **Do not pick 0.75** |
| 上下滑切集 | **On `main`** (`episode-swipe.ts`). Do not retake |
| 自动连播，遇付费墙停 | **On `main`.** `ended` → `gateAdvance` → retained `playNext` or PNL-02. Do not retake |
| 付费墙拦截页 | PNL-02 on `main`. Ads call sites exist with `adUnlock: false`. Recharge stays disabled. Last steps are C4-06 / C4-08, not a new panel |
| 播放令牌过期静默换发 | **On `main`** (`aa8a9e8` / `player-fatal.ts`). VePlayer `error` re-mints the route episode once on the retained instance. Failed mint overlays retry copy on the last frame. Do not retake |
| 导航栏 / 安全区 | Wired (D9). Checklist stays `[ ]` until a device. §8 rule 6 |

**Do not pick 倍速 or scrub as "C6 leftover".** That was already forbidden as a C5 leftover
(`docs/plan/cycle-5-backlog.md` rank 2 close; C5 report §10 item 3). X-26 is P1/P2. A client
constant for 0.75 would be the defect.

**Acceptance for this rank (the plan-wave close, not the epic).** The sheet is named against
`aa8a9e8`, the landed halves (including PLY-012) are not retaken, and implement waves are told
not to invent `playbackRate`. A PR that lands 倍速 as "C6 leftover" fails this rank.

---

### Rank 3 — QA-010: a11y gate, in flight

| | |
|---|---|
| **Owner** | Work slot C, then A for screen fixes. **This wave: `bc-b0108787` already started** |
| **Existing ID** | **QA-010**. Depends on **QA-011** (writeback on `main` at `7ce8620`) |
| **Gated on** | Nothing external. Protocol-C4 exit 3 |

QA-011 adopted DoD §6: a11y is a listing blocker. `docs/14-test-plan.md` §6.4 heading is
`可用性与无障碍(上架阻断)`. That writeback **explicitly did not** add the axe-core job. QA-010's
acceptance is unchanged (`docs/plan/backlog.md`): DoD §6.2 S-A1, S-A2, S-A3, S-A4, S-A6, S-A7,
S-A8 on implemented screens; axe-core critical + serious = 0 and the job is red on failure; inject
one contrast violation as reverse-verification.

**What this task is not.** A docs retake of QA-011. A `continue-on-error` axe job. A scan of
screens that do not exist (`#/recharge`, `#/vip`).

**What a C6 work slot may do.** Nothing until `bc-b0108787` is idle and `origin/main` is
re-derived. If that agent lands the job, this rank is no longer remaining. If it does not, the
next slot picks QA-010 against the tree at that time — not against this paragraph's guess.

P1 still owes a countersign on `docs/plan/backlog.md` (QA-011 handoff). This slot does not edit
P1's file. Registered in §6.

---

### PLY-012 — not remaining

Landed at `aa8a9e8` while the first draft of this file still listed `bc-264077b7` as RUNNING.
`PlayPage` re-mints `POST /v1/playback/sessions` once on VePlayer `error` and applies the fresh
descriptor on the retained instance (`player-fatal.ts` / `reissue`). A failed mint overlays retry
copy on the last frame. That is the named PLY-012 remainder. It is **not** protocol-C4 exit 1
(倍速 / scrub still sit on the sheet). Do not retake.

---

### Rank 4 — C4-03: T14 / T16 / T15, still do not fake

Same task as `docs/plan/cycle-4-backlog.md` C4-03 and `docs/plan/cycle-5-backlog.md` rank 3. Same
IDs: **T14**, **T16**, **T15**.

`database-url.ts` still refuses `postgres:` and does not rewrite it to a file. No `drizzle` in
workspace `package.json` files. Redis appears only as a refused scheme in tests. Seven paired
sqlite migrations. Seed floor still 80. No BytePlus ids.

**Acceptance.** Unchanged: a working `postgres:` scheme with forward-and-back migrations in CI,
**or** a written, dated amendment of T14, **or** deferral with the IDs kept. Do not mark T14 `[x]`
on sqlite.

---

### Rank 5 — C4-07: SCR-11 / D8, still no contract

Same task as C4-07. OpenAPI: 24 paths, none a subscription. No `vip:` in `app/src/routes/routes.ts`.
Profile Subscribe stays disabled. `GET /v1/users/me` has no `vip` field; tests refuse a
`vip.active=false` invention.

**Do not** build `#/vip` against a client-invented `/v1/subscriptions`. Define the contract or
defer the screen. No partner answer is recorded here.

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
| **QA-011 / C-12** | Writeback on `main` at `7ce8620`. Not the gate |
| **PLY-010 swipe / playNext / double-tap** | On `main`. Rank 2 is the rest of the sheet |
| **PLY-012** token re-issue | On `main` at `aa8a9e8`. Do not retake `player-fatal.ts` |
| **C4-04** splash / `GET /v1/config` | Closed in C4 |
| **C4-01** G1.5 + L1 `workflow_dispatch:` | Closed in C4. `workflow_dispatch:` is on both workflows |

---

## Tier A — buildable today; remediations, not a new epic

Per §4.3 these would be the implement picks. After rank 3 (QA-010 in flight) and the blocked
C4-03 / C4-07 rows, there is no unblocked engineering item that is not already owned, gated, or
P3's file.

### C5-03 — D-19: refresh `wave-protocol.md` §6.2 (P3's file)

| | |
|---|---|
| **Owner** | **P3** |
| **Existing ID** | **D-19** |

§6.2 still describes a tree that is not `aa8a9e8` ("no database, no migration, 27 seed episodes
against a floor of 80, no CI L2"). This plan slot does not edit P3's file (§3.4). Status columns
in §5.1 (C3 `[~]`, protocol-C4 `[ ]`) are also stale relative to the running-count reports; same
owner; X-21 stays unadjudicated.

### Leftover branches — integrator, not a rewrite

Drop or archive `cursor/w13-work-c3-remain-72c4` and `cursor/w14-work-c4-subseq-72c4`. D-18 and
C4-08 already landed by other tips. A second transactions route or a second ads slice is the
defect.

---

## Tier B — last step still gated; unblocked halves already shipped

No new unblocked halves. Do not retake C4-05 / C4-06 / C4-08.

| ID | Unblocked half | Still gated |
|---|---|---|
| **C4-05** / **C3-08** | Stubbed `POST /v2/oauth/token/` | GATE-1 + GATE-6. No synthesised `open_id` |
| **C4-06** / **C3-09** | Stubbed `trade_order/create` | Q-G-7. Recharge stays disabled. No rate in types |
| **C4-07** | Profile card is the honest stand-in | A contract, then GATE-2 + GATE-4 (**rank 5**) |
| **C4-08** | Call sites + server `isEnded` | GATE-4 unit ids. `adUnlock` stays false |
| **D-21** / **PLY-002** | Contract probe returns `unmeasured` | Devices. Q-G-10. Do not copy C1 research as a C6 measurement |

---

## Tier C — business track. Engineers cannot close these

No new task IDs. `T3-1`…`T3-5`, `GOV-002`, `GOV-005`, `GOV-008`, Q-G-1…Q-G-10. Status: **unknown**.

D-17 sits here as well as at rank 1: it is the same class of external blocker as GATE-0, except it
already has a defect ID and it currently falsifies R6.

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

Re-derived at `aa8a9e8`. Commands to re-run, not to believe.

```
$ git rev-parse --short HEAD
aa8a9e8

$ gh api repos/Dawan2/minidrama/check-runs/98711991675/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."

$ rg -n 'playbackRate' app/src/player
# episode-double-tap.test.ts forbids inventing it

$ rg -n 'axe' .github/workflows/ || echo "no axe in workflows"
# no axe in workflows

$ git merge-base --is-ancestor origin/cursor/w16-work-c5-after-like-72c4 origin/main; echo $?
0

$ rg -n 'vip:' app/src/routes/routes.ts || echo "no vip route"
# no vip route

$ rg -c '^  /' contracts/openapi.yaml
24

$ rg -n '^  smoke:' .github/workflows/l2.yml
  smoke:

$ rg -n 'continue-rail' app/src/routes/HomePage.tsx
# section data-testid="continue-rail"

$ rg -n 'no database, no migration, 27 seed' docs/plan/wave-protocol.md
# line 235 — still present (D-19)
```

This plan slot's own `pnpm verify` is the gate for **these two docs**, not a third product count.
W17 recorded 3,416 tests at `a8e1c63`. Do not quote that as this SHA's count.

---

## 3. Dependency graph

```
Rank 1 — D-17 (ops). Not a branch. Blocks GitHub reverse-verification of every gate.

Rank 2 — protocol-C4 交互验收单 still not met despite PLY-010.
  Landed: swipe 切集, ended playNext, double-tap favourite. Do not retake.
  Not in product source: 倍速 / scrub (X-26, plugin-owned). Do not invent playbackRate.
  Tap pause is VePlayer-owned (AC-PL-6). Do not compete.

Rank 3 — QA-010 a11y. In flight `bc-b0108787`. Leave it.
  QA-011 writeback already on main. Do not retake 14-test-plan.md §6.4.

PLY-012 — closed as merge (`aa8a9e8` / `271408f`). Do not retake player-fatal.ts.

Rank 4 — C4-03 T14/T16/T15. Do not fake; may defer with IDs kept.

Rank 5 — C4-07. A contract, then GATE-2 + GATE-4.

Not remaining: G2.3, HOME continue UI, C5-01, C5-02, QA-011, PRG-001 named case,
PRG-002 drama CTA, C4-01, C4-04, PLY-010 landed slices, PLY-012.

Tier A paper
  C5-03 = D-19 P3 writeback of wave-protocol.md §6.2
  Integrator: drop leftover remain / c4-subseq

Tier B — last steps unchanged
  C4-05, C4-06, C4-08, D-21

Tier C — Q-G-1…Q-G-10 unknown. GATE-0…GATE-8 no movement.

Do not open protocol-C5 变现闭环 (§4.3).
```

**First C6 implement picks.** Re-derive `origin/main` first. Leave `bc-b0108787`. Do not pick
D-17, G2.3, HOME continue, leftover ads, leftover remain, `#/vip`, Postgres-as-sqlite, 倍速, or
PLY-012. If the QA-010 agent is idle and did not land, pick QA-010 against the tree at that time
— not against a guess written here.

---

## 4. What is deliberately not in this backlog as an implement assignment

- **Opening protocol-C5 变现闭环.** §4.3. D-17 is still P1 and protocol-C4 is 1/3.
- **Opening protocol-C4 播放体验 as a new epic.** Ranked, split, not scheduled by this slot. One
  W16 sibling is already on the remaining a11y row (QA-010). PLY-012 landed while this slot wrote.
- **A 倍速 / `playbackRate` client control.** X-26. Forbidden as a leftover by the C5 plan and the
  C5 report.
- **A twin QA-010.** In flight. **A PLY-012 retake.** Landed at `aa8a9e8`.
- **A G2.3 retake.** On `main` as of C4/C5.
- **A HOME continue rail UI retake.** On `main`.
- **A second wallet-transactions route.** D-18 closed.
- **Leftover `c4-subseq` ads.** Duplicate of landed C4-08.
- **Enabling recharge** with a guessed Beans rate.
- **Partner dates, EIS submission, BytePlus ingest day, AM names, D-17 restoration day.** Unknown.
- **Rewriting `wave-protocol.md` §2 (X-21) or §6.2 (D-19).** P3.
- **Rewriting `docs/plan/backlog.md` for the QA-011 countersign.** P1.
- **Marking D4–D9 `[x]`** from mock or wired-but-not-on-device work.
- **Calendar estimates.**
- **Search / 分类 as W18 theme work.** Fifty-wave map, not this running-count plan.

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

Screens: **11 of 13.** Missing numbered: SCR-10 `#/recharge`, SCR-11 `#/vip`. SCR-01 is an overlay.
Hash routes: home, browse, search, drama, play, me, history, favorites, wallet, settings, fallback.

Panels: **2 of 5** (PNL-01, PNL-02). PNL-03 blocked. PNL-04 off. PNL-05 is in inventory and is
protocol-C4 / X-26; there is no product caller.

C2 data-layer exit: **sqlite met, Postgres not (C4-03).** C2 L2 exit: **8 of 8 jobs present, 0
GitHub-green (D-17).** Protocol-C4: **1 of 3.**

---

## 6. Conflict register

Per `docs/plan/wave-protocol.md` §3.4 — found, not fixed.

| # | Conflict | Owner | Recommendation |
|---|---|---|---|
| **X-21** | Two live cycle-numbering schemes. This file is named cycle-6 by the running count; §2 still says W18 ∈ C4 | **P3** | Same as W11/W14/W16: adopt the running count and amend §2 with a §9 row, rather than renaming documents |
| **X-22** | Pointers from P1/media-plane files still *propose* GATE-7/8 instead of pointing at §6.1 | **P1 / media-plane owner** | Pointers, not a third table |
| **X-25** | Unmerged `cursor/w13-work-c3-remain-72c4` vs `main`'s now-live wallet transactions | **Integrator** | D-18 closed by port. Drop or archive the leftover tip. Do not implement a second route |
| **X-26** | `01-product-scope` §4.3 names 倍速 0.75/1/1.25/1.5/2; inventory PNL-05 names 1.0/1.25/1.5/2.0 | **P1 / P2** | Adjudicate before any client constant. Do not pick 0.75 |
| **D-19** | `wave-protocol.md` §6.2 stale vs this tree | **P3** | `C5-03`. This slot does not edit that file |
| **QA-011 P1 countersign** | Slot C adopted DoD §6 in `14-test-plan.md` §6.4; `docs/plan/backlog.md` still has the pre-adoption row | **P1** | Countersign on P1's file. This slot does not rewrite `backlog.md` |

---

## 7. Change record

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-28 | W18 · plan | First version. Absorbed `docs/verify/cycle-5-report.md` at `0846582` (not passed; protocol-C4 1/3; D-17 first). Cut from `0846582`; merged forward onto `aa8a9e8`. QA-011 **already on `main`**. PLY-012 **landed while this slot wrote** (`bc-264077b7` / `aa8a9e8`) — not remaining. Ranked: D-17 (cannot be code-fixed), protocol-C4 交互验收单 still not met despite PLY-010, QA-010 in flight (`bc-b0108787`), C4-03 still open (do not fake), C4-07 still blocked. Did not invent AM answers, Beans, EIS, BytePlus, or a CI-restoration date. Did not implement product code. Did not open protocol-C5 变现闭环 |
