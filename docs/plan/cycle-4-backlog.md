# Cycle 4 — Backlog

> **Slot:** W14, plan slot.
> **Date:** 2026-08-27.
> **Branch:** `cursor/w14-plan-cycle-4-2e9b`, cut from `origin/main` at `5598aba` ("Record the W13
> merge: search hits persist via catalogue sqlite 0007, and SCR-12 settings had already landed").
> Settings landed at `14276cb`; search sqlite landed on top of that while this slot read the tree.
> **Inputs:** `docs/plan/cycle-3-backlog.md` (the predecessor this continues),
> `docs/plan/wave-protocol.md` §5–§6 (cycle exits and the gate register W13 wrote back),
> `docs/verify/cycle-2-report.md` (C2 still `[!]`), `docs/gates/open-questions.md` (the AM ask),
> and `main` itself — every claim below was re-derived against `5598aba` rather than read out of a
> handoff.
> **Predecessor:** `docs/plan/cycle-3-backlog.md`. Where a task here carries a C3 or C2 identifier,
> it is the *same* task, not a new one: `docs/plan/wave-protocol.md` §7 says an unfinished task
> keeps its original ID and its original acceptance criteria.
> **This slot implemented nothing.** No source file, no test, no gate, no contract was touched. The
> only files added are this one and `docs/handoff/w14-plan.md`. No pull request.

---

## 0. How to read this

### 0.1 A gap list, not a wave assignment, and not a new epic

Everything below is **remaining distance to the listing bar**, measured against `main` after the
C3 implement waves. C2 is still `[!]` (`docs/plan/wave-protocol.md` §5.1). There is no
`docs/verify/cycle-3-report.md`. `docs/plan/wave-protocol.md` §4.3 therefore still forbids opening
a new epic. Protocol C4 (W16–W20, 播放体验) is **not** scheduled here. Playback gestures, PNL-05
quality/speed, and a11y stay off this list until an independent verify wave says C2/C3 exits are
met or names them as P2 carry-forward.

### 0.2 Cycle numbering is still two schemes (X-21, unadjudicated)

`docs/plan/wave-protocol.md` §2 still makes C3 = W11–W15 and C4 = W16–W20, so W14 is C3's third
implement wave. The running count this repository uses called W9 "C3", W11 the C3 plan wave, and
this slot C4's plan wave. **Not adjudicated here.** P3 owns §2. Registered again in §6.

### 0.3 Ordering

| Tier | Contents | Gated on |
|---|---|---|
| **Tier A** | Engineering with **no external dependency**. Buildable today | Nothing |
| **Tier B** | Engineering whose last step needs a credential, a device, a rate, or a contract | GATE-1, GATE-2, GATE-4, GATE-6, GATE-7, GATE-8 |
| **Tier C** | Governance and the business track. No engineer can close these by writing a number | Nothing engineering can do |

Partner answers are **unknown**. None is invented. The questions stay in
`docs/gates/open-questions.md`.

### 0.4 In-flight work this slot does not touch

| Who | State at write time | Rule |
|---|---|---|
| `bc-98ce540a` (W13 sqlite search directory) | **Idle. Landed.** `5598aba` / `081b63b`. Search is a directory over catalogue `0007`, not a second table | Do not add `0008_search` |
| `bc-05cba7a1` (W13 work next client remainder) | **Running.** No `cursor/*` branch visible on origin yet | Do not guess its files. Re-derive `origin/main` before picking a client remainder |
| `origin/cursor/w13-work-c3-remain-72c4` | **Not an ancestor of `main`.** Adds `GET /v1/wallet/transactions` (fail-closed empty ledger) | Do not rewrite it. Integrator merges or it stays outstanding |

---

## 1. What C3 closed vs what is still open

Verified at `5598aba`, not against the handoffs that claim it.

### 1.1 C3 numbered tasks

| C3 task | Claim in W11 | State on `main` at `5598aba` |
|---|---|---|
| **C3-01** silent re-login | open | **Closed.** `app/src/session/session-recovery.ts` is the `401` caller `silent-login.ts` named. Fail-closed drop-then-reacquire; no POST replay |
| **C3-02** paging flakes (D-10) | open, after the homepage branch | **Closed.** `renderSettled` / `act` conversion. Not re-opened here |
| **C3-03** GATE-7 / GATE-8 into one register + rule-3 escalation | open (P3 file) | **Closed as a document task.** W13 wrote `docs/plan/wave-protocol.md` §6.1–§6.4 and `docs/gates/open-questions.md`. The *gates themselves* have not moved — see §1.3 |
| **C3-04** wallet surface | PNL-01 + SCR-09 unblocked; SCR-10/11 gated | **Split.** PNL-01 (`EpisodePicker`) and SCR-09 (`#/wallet`, `GET /v1/wallet`) are on `main`. SCR-10 / PNL-03 and SCR-11 are still open — recharge is a **disabled** control. See `C3-04` remainder / `C4-04` |
| **C3-05** D9 capsule + nav colour | open | **Closed as engineering.** `app/src/chrome/Chrome.tsx` calls `getMenuButtonRect` and `setNavigationBarColor`. D9 stays `[ ]` on the checklist until a device — §8 rule 6. Honesty, not a retake |
| **C3-06** durable stores + seed ≥80 | open; eight in-memory stores | **Closed for the eight named stores and the seed floor.** Migrations `0001`–`0007` roll back. Seed listed-episode floor is 80 and the suite asserts it. Search was the last named gap; sibling `bc-98ce540a` wired `createCatalogDramaDirectory(catalogStore)` over `0007` rather than inventing `0008`. In-memory implementations remain the `DATABASE_URL`-unset path. **Not closed:** T14 PostgreSQL, T16 Drizzle, T15 Redis — see `C4-02` |
| **C3-07** favourites `DramaSummary` | open | **Closed.** List items carry catalogue `DramaSummary`; `FavoriteEntry.drama` stays nullable |
| **C3-08** real TikTok login | last step gated | **Open.** Unchanged. `createTiktokIdentityPort` still refuses every real code |
| **C3-09** Beans rate | missing business input | **Open.** Unchanged. No rate in types. `trade-order-port.ts` still carries `priceCoins` only |
| **C3-10** SR-5 + CoverImage (D-06, D-02) | open | **Closed.** `setValidateVideoReplaceElement` is banned in source-rules and bundle-scan; `CoverImage` renders through `checkCoverUrl` |
| **C3-11** G1.5, L1 `workflow_dispatch:`, D-07 | open | **Open.** Coverage tooling still absent; `ci.yml` still has no `workflow_dispatch:`; doc 12 still contradicts itself on unlock paths |

### 1.2 Screens, panels, contract

| Item | W11 at `2b66323` | `5598aba` |
|---|---|---|
| Routed screens | 7 of 13 | **10 of 13.** Added: SCR-03 `#/browse`, SCR-09 `#/wallet`, SCR-12 `#/settings`. Missing: SCR-01 splash, SCR-10 `#/recharge`, SCR-11 `#/vip` |
| Panels | 1 of 5 (PNL-02) | **2 of 5.** PNL-01 landed. PNL-03 recharge still blocked. PNL-04 comments and PNL-05 quality/speed are protocol-C4 / feature-flag work — not opened here |
| OpenAPI | 17 paths / 20 operations | **19 paths / 22 operations.** Added `GET /v1/wallet` and `GET /v1/progress/dramas/{dramaId}` (plus extra verbs on existing paths). `GET /v1/wallet/transactions` is still absent on `main` (an unmerged remainder branch has it). `GET /config` is still not an OpenAPI path |
| Seed | 8 dramas / ~27 episodes | **Floor met.** `SEED_LISTED_EPISODE_FLOOR = 80`; Sweet Trap is the 80-episode volume drama. Fixture properties (delisted, unpublished, offline season, free window) preserved. No BytePlus ids |

### 1.3 AM-blocked — still unknown, none invented

Nine business-track items, now **four** cycles with no external evidence. W13 filed the questions.
This plan wave does not fill them in.

| Item | Original IDs | What is true in engineering | What is still missing | Status |
|---|---|---|---|---|
| **Beans conversion rate** | `C3-09`, `T3-4`, Q-G-7 | `priceCoins` only. Source scans in app, server wallet routes, and `packages/shared` refuse `beansPerCoin` / `coinToBeans` / `BEANS_RATE` as a product rate. Test fixtures that *mention* the identifier exist to prove it is dropped | One observed (coins, Beans) pair from a real or sandbox trade order | **Unknown. Not `[x]`** |
| **GATE-8** BytePlus / VePlayer media plane | `GOV-008`, Q-G-3, Q-G-4 | Fail-closed `<video>`-replace installer is on `main`. No ingest, moderation, or listing implementation. Catalogue has no `vid` / `albumId` | Written AM/platform answer: pilot membership **or** non-membership plus switchover terms. **No ingest date is known** | `[ ]` **no movement — escalated, §6.4** |
| **GATE-7 EIS** | `GOV-005`, Q-G-1, Q-G-2 | Alternatives priced in §6.4 (exclude EU/US). Not taken | Questionnaire started? Submission date? First-launch region set? **Do not fill a date** | `[ ]` **no movement — escalated, §6.4** |
| **Real TikTok login** | `C3-08`, D4 | Whole path exists and is honest. Mock login behind `testLoginEnabled`. Real port: `PROVIDER_UNCONFIGURED` / `PROVIDER_UNAVAILABLE` | GATE-1 credentials + GATE-6 device. Last HTTP exchange only | **Not `[x]`** |
| **SCR-10 / PNL-03 recharge** | `C3-04` remainder | `#/wallet` shows a **disabled** "Top up" button: *"Top up is not available yet. Prices have not been set."* No `#/recharge` route. No Beans or `$` in that copy. Tests assert the absence | Observed Beans rate (`C3-09`) and `pay()` / trade-order access (GATE-2 + GATE-4) | **Blocked. The disabled control is the honest UI** |
| **SCR-11 VIP** | `C3-04` remainder, D8 | `canIUse('createSubscription')` is a probe feeding the unlock offer, not a subscribe flow. OpenAPI has **no** subscription path | A contract, then GATE-2 + GATE-4. Do not invent the endpoint in the client | **Blocked** |

`docs/11-official-onboarding-checklist.md` D4–D9 remain `[ ]`. That is correct under §8 rule 6.

### 1.4 Cycle-2 foundation leftover

W10 scored C2 exits 1/4. Re-scored at `5598aba` **without** calling C2 passed — there is no new
independent verify report, and L2 is not the set W10 asked for.

| C2 exit (`wave-protocol.md` §5.1) | W10 | `5598aba` | Remainder |
|---|---|---|---|
| Migrations forward **and** roll back | **Not met** (no `server/migrations`) | **Met in tests.** Seven paired `{up,down}.sql` files; runner refuses up-only; reverse-insert tests | **G2.7 is not a CI job.** The next L2 slice, not a retake of sqlite |
| Seed ≥ 2 dramas / ≥ 80 listed episodes | Partial (8 / 27) | **Met.** Floor constant 80; longest-run test prevents 80 one-episode dramas | Do not add BytePlus handles while GATE-8 is unanswered |
| L2 gates green and reverse-verified | **Not met** (no L2) | **Partial.** `.github/workflows/l2.yml` exists; it is **G2.8 licenses only**. L2 has `workflow_dispatch:`; L1 `ci.yml` does not | G2.2, G2.3, G2.4, G2.5, G2.6, G2.7 still absent as jobs |
| `traceId` end to end | **Met** | **Still met**, plus W13 request-id JSON logs and redact (`SRV-006`) | Vendor APM is still refused. Not a gap |

Other C2 IDs that survived C3:

| ID | State |
|---|---|
| **T1-1 / G1.5 coverage** | **Open.** `rg coverage` over workspace `package.json` files → no scripts. Three-plus cycles unmeasured |
| **T0-1 `workflow_dispatch:` on L1** | **Open.** `ci.yml` triggers: `push` `[main, cursor/**]`, `pull_request`. No `workflow_dispatch:` |
| **T1-2 / D-07 / D-11** | **Open.** Doc 12 line 46 still says `POST /episodes/{id}/unlock`; line 214 says `{episodeId}`. Parity vs ~40 declared endpoints is still unmeasured as a table. Live contract: 19 paths / 22 operations |
| **T14 / T16** PostgreSQL / Drizzle | **Open.** `postgres://` is **refused at boot**. sqlite is the CI-durable slice, not the swap. Do not rewrite a postgres URL to a file |
| **T15** Redis | **Open.** Not read. Session comments that promised Redis at W7 were not fulfilled by adding a no-op client — correctly. Do not add one |
| **T0-3c** D5 / D6 ads | **Open.** `showRewardedAd` / `showInterstitialAd` have no product caller outside `platform/` and test fixtures. Last step gated on GATE-4 ad-unit ids |
| **T2-4 remainder** | SCR-03 and SCR-12 **closed**. SCR-01 splash **open** (`GET /config` is not in OpenAPI). SCR-10/11 **blocked** |
| **D-05** file-ownership rule | **Open on paper** (T1-5). Not re-specified here |
| **D-13 / X-21** cycle labels | **Open.** P3 |
| **D-14** bundle-scan residual `o("video",p)` | **Open, P3.** Our build is not exposed. Do not weaken the rule |

### 1.5 Wave-protocol gates

Authoritative table: `docs/plan/wave-protocol.md` §6.1. Ask list: `docs/gates/open-questions.md`.
This plan wave **re-derived** status. It does not edit P3's file (conflict X-22's writeback already
happened). It does not invent a date, a rate, a region set, or an AM name.

| Gate | Status at `5598aba` | Movement since W13 writeback (`a6c04d3`) |
|---|---|---|
| GATE-0 / M0 official PDF | `[!]` blocking | None. `find` over `*.pdf` is still the operator's check; this slot does not claim a workspace listing |
| GATE-1 / M1 credentials | `[ ]` | None. Real login still refuses |
| GATE-2 / M2 business verification | `[ ]` | None |
| GATE-3 / M3 industry qualification | `[ ]` | None |
| GATE-4 / M4 monetisation | `[ ]` | None. Trade-order port still the refusing default |
| GATE-5 / M5 US + TPRM | `[ ]` | None. Tied to Q-G-1 |
| GATE-6 / M6 POC / device | `[ ]` | None |
| GATE-7 EIS | `[ ]` escalated | None. Q-G-2 unanswered |
| GATE-8 BytePlus / VePlayer | `[ ]` escalated | None. Q-G-3 / Q-G-4 unanswered. Engineering (replace callback) is not a release |

Rule-3 escalations **remain filed** in §6.4. Filing is not answering. Alternatives (exclude EU/US;
price MP-B) are still priced, not taken.

---

## Tier A — buildable today, nothing external required

### C4-01 — Finish the L1 machinery C3-11 named and did not ship

| | |
|---|---|
| **Owner** | Work slot C |
| **Depends on** | Nothing |
| **Carries forward** | **C3-11**, C2 **T1-1**, the omitted half of **T0-1**, **D-07**, **D-11** |

Three small items that have now been "next cycle" twice. Do not fold them into a larger epic.

| Item | Evidence at `5598aba` |
|---|---|
| **G1.5 coverage** | No `coverage` script in any workspace `package.json`. Thresholds already written: `docs/14-quality-gates.md` §3.1 (80% diff, 60% global, 90% core) and the ratchet |
| **L1 `workflow_dispatch:`** | Absent from `.github/workflows/ci.yml`. Present on L2. One line on L1, specified since C2 so a red run can be re-run without an empty commit |
| **D-07 + a parity table (D-11)** | `docs/12-api-contracts.md:46` vs `:214` still disagree on unlock path parameter names. Measure live OpenAPI (19 paths / 22 operations) against doc 12 endpoint-by-endpoint. **Measure, do not schedule closing a 20-endpoint gap in this cycle** — that is how C1 over-committed. Fix the self-contradiction in doc 12 as part of the measurement |

**Acceptance.**

1. G1.5 configured with those thresholds and the ratchet. Thresholds move in one direction only.
2. `workflow_dispatch:` on `.github/workflows/ci.yml`.
3. A committed parity table. D-07 wording in doc 12 no longer names two unlock path shapes.
4. `pnpm verify` green. Test count does not fall.

**Reverse verification (G1.5).** A fixture or a lowered file that is under threshold must turn the
job red. A coverage number with no failing fixture is the D-01 shape again.

---

### C4-02 — C2's remaining L2 jobs, starting with G2.7 (migrations already exist)

| | |
|---|---|
| **Owner** | Work slot C |
| **Depends on** | Nothing technical. G2.7 is now cheap because C3-06 landed the runner |
| **Carries forward** | C2 L2 exit, `INF-007` remainder. G2.8 is **done** (`packages/quality`, `l2.yml` job `licenses`) |

`.github/workflows/l2.yml` is a second workflow on purpose. Do not fold new jobs into `pnpm verify`
or into L1. Do not add `continue-on-error`.

**Order, cheapest first.**

| Gate | Why it is (or is not) next |
|---|---|
| **G2.7** migrate up → down → up as a required L2 job | The scripts and tests exist. W13 CI-L2 named this as the next slice. **Start here** |
| **G2.2** integration against sqlite | Real file, not a fake Redis. Postgres is T14 and must not be stubbed to green this |
| **G2.6** artifact budget | Client ZIP budget is already a number in `docs/03-nonfunctional.md`. Local |
| **G2.3** smoke E2E | Needs Playwright. Larger |
| **G2.4 / G2.5** SAST / SCA | Need Semgrep/CodeQL/trivy. Do not fake them with a grep |

**Acceptance (G2.7 slice, the one this cycle should actually finish).**

1. L2 grows a `migrate` job: up, down, up, on the same events L2 already uses.
2. A down that does not drop a table (or an up-only file) fails the job. Quote the output in the
   handoff. The unit tests already cover this; CI is the gate.
3. `ci.yml` stays byte-identical in spirit: no new skip, no path filter, no `continue-on-error`.
4. Remaining G2.2–G2.6 may land as further slices with their own IDs if a slot finishes G2.7
   early. They are not one task.

---

### C4-03 — T14 / T16 / T15: do not fake the data-layer swap

| | |
|---|---|
| **Owner** | Work slot B, when scheduled. **Not** the first C4 pick |
| **Depends on** | Nothing, but sqlite is already the durable path. This is the *named* leftover, not a missing store |
| **Carries forward** | C2 **T2-2** remainder as originally specified (PostgreSQL), **T14**, **T16**, **T15** |

C3-06's acceptance item 1 (migrations both ways, exercised in CI) is met on sqlite. The domain
model's production database is still PostgreSQL (`docs/03-stack-decision.md` T14). `database-url.ts`
is explicit: serving sqlite behind a `postgres://` URL is how a later slot thinks the data layer is
done.

**What this task is.** A real Postgres (or a written, dated amendment of T14). Drizzle (T16) if the
generator can emit reversible SQL; the current runner exists because drizzle-kit migrate is
up-only. Redis (T15) only if a store actually needs it — sessions are sqlite, not a no-op Redis.

**What this task is not.** A second sqlite file, a search table (`0008`), rewriting `DATABASE_URL`,
or adding `ioredis` that talks to nothing.

**Acceptance.** Either:

1. Postgres is a working `DATABASE_URL` scheme, migrations run forward and roll back against it in
   CI, existing store suites pass on that backend, `postgres://` is no longer a hard refuse **or**
   the refuse remains and T14 is amended in the stack decision with a change-record row; **or**
2. The task is deferred in writing to a later cycle with the same IDs.

Do not mark T14 `[x]` on sqlite.

---

### C4-04 — SCR-01 splash: do not invent `GET /config`

| | |
|---|---|
| **Owner** | Work slot B (contract) then A (screen), or defer the screen |
| **Depends on** | A path in `contracts/openapi.yaml`. **There is none today** |
| **Carries forward** | C2 **T2-4** remainder |

Boot already runs `TTMinis.init` and silent login (`app/src/main.tsx`). The inventory's SCR-01 is
the splash over that sequence, driven by `GET /config` (`docs/12-api-contracts.md` §4.10,
`docs/02-screen-inventory.md` SCR-01). That path is **prose in doc 12** and **absent from
OpenAPI**. Comments in `main.tsx` still list it as a continuation.

**Do not** add a client fetch to a path the server does not serve. **Do not** invent feature-flag
defaults (`features.comments`, legal URLs) in the splash. C4/C5 legal URLs are unpublished
(SCR-12 already says so). Comments (PNL-04) stay off until the flag exists.

**Unblocked portion.** Specify the live `/v1/config` (or document that boot config is compile-time
and delete the GET from doc 12). Then the screen. Same rule as wallet: no invented endpoint in the
client.

**Acceptance.** Either the contract and the screen exist and `server/src/contract.test.ts` asserts
both directions, or the screen stays unbuilt and doc 12 stops promising a path the server lacks.
A splash that hard-codes "comments on" is not done.

---

## Tier B — last step gated; unblocked half is still real work

### C4-05 — `C3-08` real TikTok login (unchanged)

| | |
|---|---|
| **Owner** | Work slot B + A | 
| **Gated on** | **GATE-1** credentials, **GATE-6** device |
| **Existing ID** | **C3-08**. Same acceptance criteria as `docs/plan/cycle-3-backlog.md` C3-08 |

`createTiktokIdentityPort` still maps to `PROVIDER_UNCONFIGURED` / `PROVIDER_UNAVAILABLE`. That
refusal is the product. The unblocked portion is still the `POST /v2/oauth/token/` exchange behind
a stubbed HTTP client. No synthesised `open_id`. D4 stays `[ ]` until a device.

If a slot "finishes" this by returning a fake `open_id` when the secret is missing, that is a
regression, not C4 progress.

---

### C4-06 — `C3-09` Beans rate, and the recharge control that must stay disabled until then

| | |
|---|---|
| **Owner** | Business (Q-G-7), then work slot B for the port field, then A for SCR-10 / PNL-03 |
| **Gated on** | **GATE-2 + GATE-4** → trade-order API → **one observed Beans amount** |
| **Existing IDs** | **C3-09**, **C3-04** remainder (SCR-10 / PNL-03) |

**Recharge on `main` today is not "missing UI".** It is a disabled button with an honest sentence.
`WalletPage` has no `<a>` to `#/recharge`. Tests forbid Beans and `$` in that control.

C4 work slots **must not** enable that button with a placeholder rate, a made-up `productId`, or a
`#/recharge` route that quotes fiat. Enabling it is what Q-G-7 unblocks.

**Unblocked portion (same as C3-09).** Implement `POST /v2/minis/trade_order/create/` behind the
existing port, stubbed transport, platform amount as a **new field** populated from configuration
**after** an observation, never from a constant in a type. Refusing default and `503` stay.

**Acceptance.** C3-09's three bullets, plus:

4. While Q-G-7 is unknown, the wallet recharge control remains disabled and Beans-free. A PR that
   enables it without a cited observation fails this task.

---

### C4-07 — SCR-11 VIP / D8: still no contract

| | |
|---|---|
| **Owner** | Work slot B (contract) before any screen |
| **Gated on** | A subscription surface, then GATE-2 + GATE-4 |
| **Existing ID** | **C3-04** remainder, D8, T0-3d |

OpenAPI: 19 paths, none a subscription. `createSubscription` is probed, not used to take money.
`docs/12-api-contracts.md` wallet products mention `productType: "VIP"` in the **unbuilt** recharge
catalog — that is doc-12 debt, not a live endpoint.

**Do not** build `#/vip` against a client-invented `/v1/subscriptions`. Define the contract or
defer the screen. Same rule C3-04 acceptance item 4 already stated.

---

### C4-08 — D5 / D6 ads: call sites without ad-unit ids

| | |
|---|---|
| **Owner** | Work slot A (client) + B (server-side `isEnded` check) |
| **Gated on** | **GATE-4** for real unit ids. Unblocked: the wiring and the reward fraud check |
| **Carries forward** | C2 **T0-3c** |

`rg showRewardedAd|showInterstitialAd` outside `app/src/platform/` and test fixtures still has no
product caller. The unblocked work is the same as C2 wrote: build the call sites against the mock,
verify `isEnded` **server-side** before any reward, never grant from the client event alone.

Do not mark D5/D6 `[x]`. Do not invent ad-unit ids.

---

## Tier C — business track. Engineers cannot close these

No new task IDs. The IDs already exist: `T3-1` … `T3-5`, `GOV-002`, `GOV-005`, `GOV-008`,
Q-G-1 … Q-G-9. Status: **unknown**.

This plan wave's job is to say that again, with the W13 register as the pointer, not to guess.

| If someone asks | The answer in this repository |
|---|---|
| When is EIS done? | Unknown. Q-G-2. Published duration is 15–30 US business days *after submission*. There is no submission date here |
| When can we ingest to BytePlus? | Unknown. Q-G-3. GATE-8's unfavourable answer **creates** MP-B work. Still not priced in a spreadsheet this slot did not see |
| What is the coin→Beans rate? | Unknown. Q-G-7. **No rate in code** |
| Can we ship EU/US? | Unknown. Q-G-1. Excluding both is a legitimate release of GATE-7 and GATE-5. It is a product decision, not taken |
| Where is the official PDF? | Unknown. Q-G-9 / GATE-0 |

A later plan wave writes **answers** into §6.1 with evidence (mail, ticket, Portal screenshot
path). Until then every row stays `unknown`.

---

## 2. Evidence

Re-derived at `5598aba`. Commands to re-run, not to believe.

```
$ git rev-parse --short HEAD
5598aba

$ ls server/migrations/*.up.sql
0001_unlocks 0002_sessions 0003_webhook_events 0004_unlock_orders
0005_watch_progress 0006_favorites 0007_catalog
# no 0008 — search is not a table

$ rg -n 'createCatalogDramaDirectory' server/src/app.ts
# default search directory is the catalogue store

$ rg -n 'workflow_dispatch' .github/workflows/ci.yml
# no matches

$ rg coverage package.json app/package.json server/package.json packages/*/package.json
# no matches

$ rg -n 'POST /episodes/\{id\}/unlock|POST /episodes/\{episodeId\}/unlock' docs/12-api-contracts.md
# line 46 {id}; line 214 {episodeId}

$ rg -n 'recharge:' app/src/routes/routes.ts
# no matches — no #/recharge

$ rg -n 'wallet.rechargeUnavailable' app/src/core/i18n/locales/en.json
# "Top up is not available yet. Prices have not been set."
```

Search sibling `bc-98ce540a` **did finish** on this tree (`docs/handoff/w13-durable-search.md`).
C3-06's last in-memory **directory** is closed. Remaining `createInMemory*` call sites in
`app.ts` are the unset-`DATABASE_URL` fallback, which is deliberate (C3-06 D4).

---

## 3. Dependency graph

```
Tier A — nothing external
  C4-01 (G1.5 + L1 workflow_dispatch + D-07/D-11 table)
  C4-02 (L2 G2.7 first, then other L2 jobs as slices)
  C4-03 (T14/T16/T15) — do not fake; may defer with IDs kept
  C4-04 (SCR-01) — contract before screen; no invented GET /config

Tier B — last step gated
  C4-05 = C3-08 real login     ← GATE-1 + GATE-6. Unblocked: stubbed token exchange
  C4-06 = C3-09 + SCR-10       ← GATE-2 + GATE-4 + observed Beans. Unblocked: port field, not a rate
  C4-07 = SCR-11 / D8          ← a contract, then GATE-2 + GATE-4
  C4-08 = T0-3c ads            ← GATE-4 ids. Unblocked: call sites + server isEnded

Tier C — still unknown
  GATE-0 … GATE-8, Q-G-1 … Q-G-9 → do not invent answers
  Rule-3 escalations already filed; they fire until an answer exists
```

**First C4 implement picks.** C4-01 and C4-02 (G2.7). They make a red `main` mean something at
merge-level, which C2's own exit still requires. Do not pick search sqlite, settings, browse,
PNL-01, or CoverImage — those are on `main`. Do not pick the running client-remainder sibling's
files.

---

## 4. What is deliberately not in this backlog

- **Protocol C4 (播放体验).** Gestures, PNL-05, a11y baseline, continue-watching polish as a *new
  epic*. §4.3: C2 `[!]`, no C3 verify report. Unfinished C2/C3 IDs stay first.
- **A second search database.** `bc-98ce540a` closed the last named in-memory directory.
- **Enabling recharge** with a guessed Beans rate or a fake product list.
- **Partner dates, EIS submission, BytePlus ingest day, AM names.** Unknown.
- **Rewriting `wave-protocol.md` §2 (X-21)** or taking the EU/US-exclusion alternative. P3 / product.
- **The live sibling `bc-05cba7a1`.** Unknown item. Leave it.
- **`cursor/w13-work-c3-remain-72c4`.** Unmerged wallet-transactions. Integrator, not a C4 rewrite.
- **Marking D4–D9 `[x]`** from mock or wired-but-not-on-device work.
- **Calendar estimates.**

---

## 5. The listing bar, restated as distance

Against `docs/11-official-onboarding-checklist.md` E4 (all six mandatory capabilities):

| # | Capability | Server | Client call site | Blocked on |
|---|---|:---:|:---:|---|
| D4 | Silent login | endpoint exists, real port refuses | wired (boot + recovery) | GATE-1, GATE-6 (`C4-05` / `C3-08`) |
| D5 | Rewarded video ad | none | none | GATE-4 (`C4-08`) |
| D6 | Interstitial ad | none | none | GATE-4 (`C4-08`) |
| D7 | Beans one-off | order endpoint exists, port refuses | none (`pay()` unused) | GATE-2 + GATE-4, observed rate (`C4-06`) |
| D8 | Subscription | **none** | probe only | a contract, then GATE-2 + GATE-4 (`C4-07`) |
| D9 | Nav bar + capsule | n/a | **wired** | **device** to flip the checklist. Engineering closed |

Screens: **10 of 13.** `ROUTES` has home, browse, search, drama, play, me, history, favorites,
wallet, settings, fallback. Search is unnumbered in the inventory. Missing numbered: SCR-01,
SCR-10, SCR-11. Recharge exists only as a disabled wallet control.

Panels: **2 of 5** (PNL-01, PNL-02).

C2 data-layer exit: **sqlite met, Postgres not.** C2 L2 exit: **G2.8 met, G2.7+ not.**

---

## 6. Conflict register

Per `docs/plan/wave-protocol.md` §3.4 — found, not fixed.

| # | Conflict | Owner | Recommendation |
|---|---|---|---|
| **X-21** | Two live cycle-numbering schemes. Unchanged since W11. This file is named cycle-4 by the running count; §2 still says W14 ∈ C3 | **P3** | Same as W11: adopt the running count and amend §2 with a §9 row, rather than renaming documents |
| **X-22** | Was GATE-7/8 unregistered. **Writeback landed (W13).** Remaining: `w1-conflict-register.md` and `media-plane-decision.md` still *propose* the gates instead of pointing at §6.1 | **P1 / media-plane owner** | Pointers, not a third table. Do not copy status into those files |
| **X-24** | `docs/12-api-contracts.md` §4.6 still describes WeChat recharge-orders and `{id}` unlock paths that the live OpenAPI does not serve. Doc 12 is slot B's file | **B** | `C4-01` measures; do not "fix" by adding WeChat in the client |
| **X-25** | Unmerged `cursor/w13-work-c3-remain-72c4` implements `GET /v1/wallet/transactions` while `main`'s wallet route comment says that path is deliberately absent | **Integrator**, then **B** | Merge or record as dropped. Do not implement a second transactions route on a new branch |

---

## 7. Change record

| Date | Wave · slot | Change |
|---|---|---|
| 2026-08-27 | W14 · plan | First version. Re-derived C3 task status against `origin/main` `5598aba` (settings `14276cb` plus search directory over catalogue `0007`). Closed on the tree: C3-01, C3-02, C3-03 (register only), C3-04 PNL-01+SCR-09, C3-05 engineering, C3-06 eight stores+seed, C3-07, C3-10. Still open: C3-08, C3-09, C3-04 SCR-10/11, C3-11, C2 L2 remainder, T14/T15/T16, SCR-01, T0-3c. Recorded AM items as unknown. Did not invent Beans, EIS, or BytePlus answers. Did not implement product code. Search sibling `bc-98ce540a` had finished; did not schedule a retake |
