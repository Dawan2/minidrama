# Cycle 5 — Backlog

> **Slot:** W16, plan slot.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w16-plan-cycle-5-7348`, cut from `origin/main` at **`5ab02d1`**
> ("Merge cursor/w14-work-g23-72c4: L2 G2.3 Playwright smoke, and a missing binary is red").
> Merged forward onto **`7ecca77`** (HOME continue rail UI landed while this slot wrote).
> **Inputs:** `docs/verify/cycle-4-report.md` at **`8fc8163`** (W15 independent verify; not passed;
> snapshot SHA `3cb724c`, postscript trunk `546dfe6`), `docs/plan/cycle-4-backlog.md` (the
> predecessor this continues), `docs/plan/wave-protocol.md` §4.3 / §5.1 / §7, `docs/gates/open-questions.md`,
> and `main` itself — every claim below was re-derived against `7ecca77` rather than copied from a
> handoff. G2.3 landed on `main` **after** the C4 report (`5ab02d1`); the HOME continue **UI** rail
> landed at `7ecca77`. Those closes are recorded here, not back-written into the report.
> **Predecessor:** `docs/plan/cycle-4-backlog.md`. Unfinished tasks keep their original IDs and
> acceptance criteria (`docs/plan/wave-protocol.md` §7).
> **This slot implemented nothing.** No source file, no test, no gate, no contract was touched. The
> only files added are this one and `docs/handoff/w16-plan.md`. No pull request.

---

## 0. How to read this

### 0.1 A gap list after a not-passed cycle, not a new epic

`docs/verify/cycle-4-report.md` verdict: **not passed** — against protocol-C4 exits (0/3) and as a
C4-backlog close. `docs/plan/wave-protocol.md` §4.3: the next plan wave must schedule remediation as
top priority; implement waves may not open a **new epic** until re-verification passes.

Protocol C4 (W16–W20, 播放体验) is therefore **ranked as remaining distance** and **split into named
tasks**, which is this plan wave's job (`PLN-004`). It is **not** the first implement pick. W14 P-02
and the C4 report both refused to open that epic. This slot does not open it either.

### 0.2 Cycle numbering is still two schemes (X-21, unadjudicated)

`docs/plan/wave-protocol.md` §2 still makes C4 = W16–W20, so this slot is protocol-C4's plan wave.
The running count this repository uses called W14 "C4 plan", W15 "C4 verify", and this slot C5's
plan wave. **Not adjudicated here.** P3 owns §2. Registered again in §6.

### 0.3 Ordering

| Rank | Item | What a work slot may do |
|---|---|---|
| **1** | **D-17** GitHub Actions billing | **Nothing in code.** Account / ops. Cannot be closed from a branch |
| **2** | **Protocol-C4 播放体验 0/3** | Do not open as an implement epic. Named remainder only (§1.2). Two W16 siblings already started playback UX — leave their files |
| **—** | **G2.3** smoke E2E | **Not remaining.** Job `smoke` is on `main` at `5ab02d1`. Do not retake |
| **3** | **C4-03** T14 / T16 / T15 | Still open. Do not fake. May defer with IDs kept |
| **4** | **C4-07** SCR-11 / D8 | Still blocked. No subscription contract. Do not invent `/v1/subscriptions` |
| **—** | **HOME continue UI** | **Not remaining.** Landed at `7ecca77` (`bc-fb69d154`). Was in flight at first draft |

Partner answers are **unknown**. None is invented. The questions stay in
`docs/gates/open-questions.md`.

### 0.4 In-flight and leftover work this slot does not touch

| Who | State at write time | Rule |
|---|---|---|
| `bc-fb69d154` (W14 work HOME continue rail UI) | **Idle. Landed.** `7ecca77` / `cursor/w14-work-continue-ui-72c4`. Home splits the feed mix onto `data-testid="continue-rail"` | Do not add a second HOME continue UI |
| `bc-2fd6c885` (W16 work protocol playback UX) | **RUNNING.** No `cursor/*` branch visible on origin yet | Do not guess its files. Re-derive `origin/main` before picking a player-interaction remainder |
| `bc-3c74c2c9` (W16 work second playback exit) | **RUNNING.** No `cursor/*` branch visible on origin yet | Same rule. Do not start a twin |
| `origin/cursor/w13-work-c3-remain-72c4` | **Not an ancestor of `main`.** Adds `GET /v1/wallet/transactions` (fail-closed empty ledger). **D-18** | Integrator merges or it stays outstanding. Do not implement a second transactions route |
| `origin/cursor/w14-work-c4-subseq-72c4` | Leftover duplicate C4-08 ads. A sibling already landed | Do not retake |

---

## 1. What the C4 report said, and what `main` is now

Verified at `7ecca77`. The report at `8fc8163` is an ancestor of this SHA. Where they disagree, the
tree wins and the report is not edited.

### 1.1 Protocol-C4 exits — still 0/3

Re-derived. Same three rows as `docs/verify/cycle-4-report.md` §0; the continue-watching postscript
at `8fc8163` is included.

| Protocol C4 exit (`wave-protocol.md` §5.1) | Status at `7ecca77` | Why |
|---|---|---|
| 交互验收单全过 (`01-product-scope` §4.3) | **Not met** | No `playbackRate`, swipe, or double-tap in `app/src/player`. PNL-05 has no product caller. 连播 / 切集 exist as **session gates** (`gateAdvance`), not as the interaction sheet. Autoplay-on-ended is not the product 连播 sheet |
| 跨端进度冲突用例通过 | **Not met** | Heartbeats, session `resumePositionSec` → VePlayer `startTime`, HOME **server** rail, and HOME **UI** rail (`continue-rail` from the feed mix) are on `main`. LWW merge unit tests exist (`progress.test.ts`: older report ignored). That is not the protocol exit. No named two-device conflict case |
| a11y 门禁上线且核心屏零 critical/serious | **Not met** | Not scheduled in C4. No axe-core job. `QA-011` / `QA-010` still `[ ]` |

Zero of three. Unchanged by G2.3 landing.

### 1.2 C4 backlog scorecard, re-scored on this tree

W15 scored this table at `3cb724c`. G2.3 and the HOME continue UI are the rows that moved.

| ID | C4 report (`3cb724c` / `8fc8163`) | This tree (`7ecca77`) |
|---|---|---|
| **C4-01** G1.5 + L1 `workflow_dispatch:` + D-07/D-11 table | Closed | **Closed** |
| **C4-02** L2 remainder | Split. 7 of 8 jobs. G2.3 not on `main` | **Closed as YAML.** 8 of 8 jobs, including `smoke` (G2.3). Zero GitHub-executed reverse-verification (**D-17**) |
| **C4-03** T14 / T16 / T15 | Open. Not faked | **Open. Not faked.** `postgres:` still refused. No Drizzle. Redis only in refuse tests |
| **C4-04** SCR-01 / `GET /config` | Closed as contract + overlay | **Closed** |
| **C4-05** = C3-08 real login | Unblocked half closed; last step gated | **Unchanged.** Real port still refuses without a secret |
| **C4-06** = C3-09 + SCR-10 | Unblocked half closed; recharge disabled | **Unchanged.** No rate. Top-up stays disabled |
| **C4-07** SCR-11 / D8 | Open, blocked | **Open, blocked.** No `#/vip`. No OpenAPI subscription path |
| **C4-08** D5 / D6 ads | Unblocked half closed; `adUnlock` false | **Unchanged** |

### 1.3 Defects the C4 report left, re-tested here

| ID | Sev | State at `7ecca77` |
|---|:---:|---|
| **D-17** | P1 | **Open, unchanged.** CI run [33125399122](https://github.com/Dawan2/minidrama/actions/runs/33125399122) on `5ab02d1` (2026-08-27T23:11:54Z): 5s, `steps: []`, annotation "recent account payments have failed or your spending limit needs to be increased." Last successful CI on `main` is still [33112204165](https://github.com/Dawan2/minidrama/actions/runs/33112204165) at PNL-01, 2026-08-27T20:12:42Z |
| **D-18** | P2 | **Open.** `GET /v1/wallet/transactions` is still absent from OpenAPI (23 paths / 26 operations) and from `server/src/modules/wallet/routes.ts`. Client still names `WALLET_TRANSACTIONS_PATH`. Unmerged remain branch has the route |
| **D-19** | P2 | **Open.** `wave-protocol.md` §6.2 still stale. P3 owns that file. This slot does not rewrite it |
| **D-20** | P2 | **Open.** G1.7, G1.9, G1.10 still absent from `ci.yml` |
| **D-21** | P2 | **Open.** PLY-002 probe still `unmeasured`. No device |
| **D-16** | P1 | **Stays closed.** Player still mints `POST /v1/playback/sessions` |

C2's third exit (L2 all green and reverse-verified): **8 of 8 jobs present. 0 of 8 reverse-verified on GitHub.** That is D-17, not a missing YAML job.

---

## Ranked remaining work

### Rank 1 — D-17: GitHub Actions billing (cannot be code-fixed)

| | |
|---|---|
| **Owner** | Account / ops. **Not** a work slot |
| **Existing ID** | **D-17** |
| **Depends on** | A payment or a raised spending limit. Nothing in this repository |

Every `main` push since PNL-01 fails in 4–6 seconds with empty steps. G1.6, G1.8, G2.3, CodeQL,
Trivy, Semgrep, migrate, artifact — all of them are YAML plus local fixtures until a runner starts.

**What this is not.** A workflow bug. There is no `continue-on-error:` key. Adding a skip, a path
filter, or a fake green job would be R1–R5, not a close.

**Acceptance.** A `main` CI run whose `steps` are not empty and whose conclusion is a test result
(pass or fail). Quote the run id. Engineering cannot produce that from a branch.

**Implement waves must not pick this.** There is no patch. Rank it first so nobody pretends a
local `pnpm verify` is R6.

---

### Rank 2 — Protocol-C4 播放体验, still 0/3, not opened

| | |
|---|---|
| **Owner** | This plan wave names the split. Implement waves do **not** start it while §4.3 holds |
| **Carries forward** | `PLY-010`, `PRG-001` remainder, `QA-011`, `PLY-011` remainder, `PLY-012`, `PRG-002` remainder, `QA-010` |
| **Gated on** | Re-verification of running-count C4 / C2 L2 observer, or an explicit P3 amendment of §4.3. Neither has happened |

W16 is protocol-C4's plan wave by arithmetic. Splitting the epic is `PLN-004`. Opening it as
implement work is what §4.3 forbids. The split is recorded so a later wave does not invent IDs.

#### PLY-010 — player interaction sheet (`01-product-scope` §4.3)

Not started as the sheet. Session-gated 连播 / 切集 and PNL-02 are on `main`. Missing: tap
pause/resume, double-tap favourite, scrub with preview, 倍速 0.75/1/1.25/1.5/2, vertical swipe
切集, autoplay-on-ended that stops on a paywall. PNL-05 (inventory: 1.0/1.25/1.5/2.0) has no
caller. Product-scope and inventory disagree on the 0.75 rung — register, do not pick a number.

**Do not pick while this rank is closed.** A gesture slice that ships as "protocol C4 started"
would be the new epic §4.3 named.

#### PRG-001 remainder — cross-end conflict as a product case

LWW merge is tested (`IGNORED_STALE` when the older device arrives second). Heartbeats write
`clientUpdatedAt`. The protocol exit is still **not met**: there is no two-device / two-session
product case that a verifier can run as the §5.1 row. Do not mark `PRG-001` `[x]` on the unit
merge alone.

#### PRG-002 remainder — HOME continue UI (landed; not the protocol exit)

Server rail on `main` (`createProgressContinueWatchingSource`, `546dfe6`). Client rail on `main`
(`splitHomeFeed` → `data-testid="continue-rail"`, `7ecca77`). `FeedCardView` still routes
`CONTINUE_WATCHING` to the episode. Anonymous / empty-progress stays the catalogue mix; a missing
`continueEpisode` is not a rail item; watch-history is not a second source. Kill-process / offline
resume ≤ 5 s is not an E2E. Drama-detail `viewer.lastWatched` is still unused. Do not retake
`HomePage.tsx` / `home-feed.ts`.

#### QA-011 / QA-010 — a11y adjudication, then the gate

Unchanged. Conflict X-12. Slot C, W17 in `docs/plan/backlog.md`. Not started. Do not add an
axe-core job as a drive-by while claiming the epic is still closed — that *is* the third protocol
exit. When the epic opens, reverse-verification is an injected contrast failure that turns the job
red.

#### PLY-011 / PLY-012

PNL-02 exists. Ads call sites exist with `adUnlock: false`. Recharge stays disabled. Token-expiry
silent re-issue is **not** in product source (no play-token refresh path found). Keep the IDs.

**Acceptance for this rank (the plan-wave close, not the epic).** The three protocol exits are
named, the landed halves are not retaken, and implement waves are told not to open the epic. A PR
that lands 倍速 or axe-core as "C5 leftover" fails this rank.

---

### G2.3 — not remaining

L2 job `smoke` is in `.github/workflows/l2.yml` on `5ab02d1`. `pnpm run check:smoke` exists and is
**not** in `pnpm verify`. Missing Playwright binary is red (`docs/handoff/w14-g23.md`). C4-02's
named remainder is closed as a job. GitHub has not executed it (**D-17**). Do not fold into L1. Do
not `continue-on-error`. Do not retake.

---

### Rank 3 — C4-03: T14 / T16 / T15, still do not fake

Same task as `docs/plan/cycle-4-backlog.md` C4-03. Same IDs: **T14**, **T16**, **T15**.

`database-url.ts` still refuses `postgres:` and does not rewrite it to a file. No `drizzle` in
workspace `package.json` files. Redis appears only as a refused scheme in tests.

**Acceptance.** Unchanged: a working `postgres:` scheme with forward-and-back migrations in CI,
**or** a written, dated amendment of T14, **or** deferral with the IDs kept. Do not mark T14 `[x]`
on sqlite.

---

### Rank 4 — C4-07: SCR-11 / D8, still no contract

Same task as C4-07. OpenAPI: 23 paths, none a subscription. No `vip:` in `app/src/routes/routes.ts`.
Profile Subscribe stays disabled. `GET /v1/users/me` has no `vip` field.

**Do not** build `#/vip` against a client-invented `/v1/subscriptions`. Define the contract or
defer the screen. No partner answer is recorded here.

---

### HOME continue UI — not remaining

Landed at `7ecca77` while the first draft of this file still listed `bc-fb69d154` as RUNNING.
`HomePage` projects `CONTINUE_WATCHING` cards that carry `continueEpisode` onto
`data-testid="continue-rail"` and leaves the rest of the mix on `data-testid="feed"`. That is a
HOME presentation of the C4 server rail. It is **not** protocol-C4 exit 2 (跨端进度冲突). Do not
retake. Drama-detail continue CTA stays open and is not this rank.

---

## Tier A — buildable today; remediations, not a new epic

Per §4.3 these are the implement picks. Ordered cheapest-first after D-17 (which is not a pick).

### C5-01 — D-20: the three L1 gates C4 did not add

| | |
|---|---|
| **Owner** | Work slot C |
| **Depends on** | Nothing |
| **Carries forward** | **D-20**, G1.7, G1.9, G1.10 |

L1 is 7 of 10. G1.5 / G1.6 / G1.8 landed. Still absent:

| Gate | What it is | Do not |
|---|---|---|
| **G1.10** skip / empty-test detection | The gate that would notice a future `.skip`. Discipline is clean today (`rg` over `app` `server` `packages` for `.skip(` / `.only(` / `it.todo` was the C4 report's check) | A comment that says "we do not skip" |
| **G1.9** commit convention | Prose subjects remain | Rewriting history |
| **G1.7** dependency audit | Hand-offs said it overlaps G2.5 Trivy. Either an L1 osv-scanner / `npm audit` job, or a committed sentence that G2.5 **is** G1.7 | A grep of `package.json` named "audit" |

**Acceptance.**

1. At least G1.10 is a required L1 step (or a required check inside `verify` that fails on
   `.skip(` / `.only(` in product tests). Quote a fixture that turns it red.
2. G1.7 is either a job or a dated note in `docs/14-quality-gates.md` that G2.5 covers it. Slot C
   owns that file.
3. G1.9 may be a further slice. It is not required to close D-20's skip-detection half.
4. `ci.yml` gains no `continue-on-error`. Test count does not fall.

**Reverse verification.** A committed `.skip` (or an empty `it('…', () => {})`) must fail the new
gate. A document that says skips are forbidden is not G1.10.

---

### C5-02 — D-18: merge or drop `GET /v1/wallet/transactions`

| | |
|---|---|
| **Owner** | Integrator, then B if the route is dropped |
| **Existing ID** | **D-18**, conflict **X-25** |
| **Depends on** | Nothing technical |

`origin/cursor/w13-work-c3-remain-72c4` still implements the path. `main`'s wallet route comment
still says it is deliberately absent. The client still probes it.

**What this task is.** Merge the remain branch **or** record it dropped and stop the client calling
a 404. Lockstep wants the route and the document together.

**What this task is not.** A second transactions implementation on a new C5 branch.

---

### C5-03 — D-19: refresh `wave-protocol.md` §6.2 (P3's file)

| | |
|---|---|
| **Owner** | **P3** |
| **Existing ID** | **D-19** |

§6.2 still describes a tree that is not `7ecca77` ("no database, 27 episodes, no CI L2"). This plan
slot does not edit P3's file (§3.4). Registered in §6. Status columns in §5.1 (C3 `[~]`, protocol-C4
`[ ]`) are also stale relative to the running-count reports; same owner; X-21 stays unadjudicated.

---

## Tier B — last step still gated; unblocked halves already shipped

No new unblocked halves. Do not retake C4-05 / C4-06 / C4-08.

| ID | Unblocked half | Still gated |
|---|---|---|
| **C4-05** / **C3-08** | Stubbed `POST /v2/oauth/token/` | GATE-1 + GATE-6. No synthesised `open_id` |
| **C4-06** / **C3-09** | Stubbed `trade_order/create` | Q-G-7. Recharge stays disabled. No rate in types |
| **C4-07** | Profile card is the honest stand-in | A contract, then GATE-2 + GATE-4 (**rank 4**) |
| **C4-08** | Call sites + server `isEnded` | GATE-4 unit ids. `adUnlock` stays false |
| **D-21** / **PLY-002** | Contract probe returns `unmeasured` | Devices. Q-G-10. Do not copy C1 research as a C5 measurement |

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

---

## 2. Evidence

Re-derived at `7ecca77`. Commands to re-run, not to believe.

```
$ git rev-parse --short HEAD
7ecca77

$ rg -n '^  [a-z].*:$' .github/workflows/l2.yml
  licenses:     # G2.8
  migrate:      # G2.7
  integration:  # G2.2
  artifact:     # G2.6
  sast:         # G2.4 Semgrep
  codeql:       # G2.4 CodeQL
  sca:          # G2.5 Trivy
  smoke:        # G2.3  ← absent in the C4 report; present here

$ gh api repos/Dawan2/minidrama/check-runs/98702220697/annotations
# "The job was not started because recent account payments have failed or your
#  spending limit needs to be increased."

$ rg -n 'playbackRate|swipe|dblclick' app/src/player --glob '*.ts' --glob '*.tsx'
# no product matches

$ rg -n 'vip:' app/src/routes/routes.ts
# no matches

$ rg -c '^  /' contracts/openapi.yaml
23

$ rg -n 'continue-rail' app/src/routes/HomePage.tsx
# section data-testid="continue-rail" from splitHomeFeed

$ git merge-base --is-ancestor origin/cursor/w14-work-continue-ui-72c4 origin/main; echo $?
0
```

Continue-UI handoff recorded 3,270 tests after merging `5ab02d1`. This plan slot's own `pnpm verify`
is the gate for **these two docs**, not a third product count.

---

## 3. Dependency graph

```
Rank 1 — D-17 (ops). Not a branch. Blocks GitHub reverse-verification of every gate.

Rank 2 — protocol-C4 播放体验 0/3. Split, not opened (§4.3).
  PLY-010 交互验收单
  PRG-001 remainder (product cross-end case; LWW unit tests exist)
  QA-011 then QA-010 (a11y)
  PLY-012 token re-issue
  PRG-002 remainder = HOME continue UI → landed (`7ecca77`). Do not retake.
  In flight: `bc-2fd6c885` protocol playback UX; `bc-3c74c2c9` second playback exit. Leave them.

Rank 3 — C4-03 T14/T16/T15. Do not fake; may defer with IDs kept.

Rank 4 — C4-07. A contract, then GATE-2 + GATE-4.

G2.3 — closed as YAML. Do not retake.
HOME continue UI — closed as client rail. Do not retake.

Tier A remediations (first implement picks)
  C5-01 = D-20 G1.10 first, then G1.7/G1.9
  C5-02 = D-18 integrator (remain branch), not a rewrite
  C5-03 = D-19 P3 writeback of wave-protocol.md §6.2

Tier B — last steps unchanged
  C4-05, C4-06, C4-08, D-21

Tier C — Q-G-1…Q-G-10 unknown. GATE-0…GATE-8 no movement.
```

**First C5 implement picks.** `C5-01` (G1.10). Re-derive `origin/main` first: two W16 playback
siblings are running. Do not pick G2.3, HOME continue presentation, leftover ads, `#/vip`, or a
second 播放体验 slice those siblings already own.

---

## 4. What is deliberately not in this backlog as an implement assignment

- **Opening protocol-C4 播放体验.** Ranked, split, not scheduled by this slot. Two W16 siblings
  already started playback UX (`bc-2fd6c885`, `bc-3c74c2c9`) — do not start a third.
- **A G2.3 retake.** On `main` as of `5ab02d1`.
- **A HOME continue rail UI retake.** On `main` as of `7ecca77`.
- **A second wallet-transactions route.** D-18 is merge-or-drop.
- **Leftover `c4-subseq` ads.** Duplicate of landed C4-08.
- **Enabling recharge** with a guessed Beans rate.
- **Partner dates, EIS submission, BytePlus ingest day, AM names, D-17 restoration day.** Unknown.
- **Rewriting `wave-protocol.md` §2 (X-21) or §6.2 (D-19).** P3.
- **Marking D4–D9 `[x]`** from mock or wired-but-not-on-device work.
- **Calendar estimates.**

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
Continue-watching is a server rail plus a HOME `continue-rail` projected from the same mix.

Panels: **2 of 5** (PNL-01, PNL-02). PNL-03 blocked. PNL-04 off. PNL-05 is protocol-C4.

C2 data-layer exit: **sqlite met, Postgres not (C4-03).** C2 L2 exit: **8 of 8 jobs present, 0
GitHub-green (D-17).** Protocol-C4: **0 of 3.**

---

## 6. Conflict register

Per `docs/plan/wave-protocol.md` §3.4 — found, not fixed.

| # | Conflict | Owner | Recommendation |
|---|---|---|---|
| **X-21** | Two live cycle-numbering schemes. This file is named cycle-5 by the running count; §2 still says W16 ∈ C4 | **P3** | Same as W11/W14: adopt the running count and amend §2 with a §9 row, rather than renaming documents |
| **X-22** | Pointers from P1/media-plane files still *propose* GATE-7/8 instead of pointing at §6.1 | **P1 / media-plane owner** | Pointers, not a third table |
| **X-25** | Unmerged `cursor/w13-work-c3-remain-72c4` vs `main`'s deliberate absence of wallet transactions | **Integrator**, then **B** | `C5-02` / D-18. Merge or drop. Do not implement a second route |
| **X-26** | `01-product-scope` §4.3 names 倍速 0.75/1/1.25/1.5/2; inventory PNL-05 names 1.0/1.25/1.5/2.0 | **P1 / P2** | Adjudicate when `PLY-010` opens. Do not pick 0.75 in a client constant before that |
| **D-19** | `wave-protocol.md` §6.2 stale vs this tree | **P3** | `C5-03`. This slot does not edit that file |

---

## 7. Change record

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W16 · plan | First version. Absorbed `docs/verify/cycle-4-report.md` at `8fc8163` (not passed; protocol-C4 0/3; D-17 first). Cut from `5ab02d1`; merged forward onto `7ecca77`. G2.3 **landed after the report**. HOME continue UI **landed while this slot wrote** (`bc-fb69d154` / `7ecca77`) — not remaining. Ranked: D-17 (cannot be code-fixed), protocol-C4 播放体验 0/3 (split, not opened; two W16 playback siblings already running), C4-03 still open (do not fake), C4-07 still blocked. First implement pick: D-20 / G1.10. Did not invent AM answers, Beans, EIS, BytePlus, or a CI-restoration date. Did not implement product code |
