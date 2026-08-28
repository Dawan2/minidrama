# W18 — plan slot, executed

> **Slot:** W18, plan slot. Cycle 6 by the running count this repository uses — see `X-21`.
> Protocol arithmetic still makes W18 a C4 implement wave (`wave-protocol.md` §2). Not adjudicated.
> **Branch:** `cursor/w18-plan-cycle-6-c656`, cut from `origin/main` at `0846582`.
> That tip *is* `docs/verify/cycle-5-report.md` (W17 independent verify, not passed; D-17 still
> billing-red). QA-011 is an ancestor (`7ce8620`).
> **Deliverables:** `docs/plan/cycle-6-backlog.md` and this file. Nothing else was added, and no
> existing file was modified.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Sub-agents:** none created. §8 rule 5.
> **Predecessor:** `docs/plan/cycle-5-backlog.md` (W16) and `docs/verify/cycle-5-report.md` (W17,
> `0846582`). Unfinished tasks keep their C5/C4/C3/C2 IDs.

---

## 1. What this slot did

Read `origin/main` at `0846582`, `docs/verify/cycle-5-report.md`, `docs/plan/cycle-5-backlog.md`,
`docs/plan/wave-protocol.md` §4.3 / §5.1 / §7, and `docs/gates/open-questions.md`, and wrote one
ranked gap list of what still stands between the product and the listing bar.

**It implemented nothing.** No source, test, gate, contract, or partner answer.

Where the C5 report asserted a remainder, the tree was re-checked. That is how **QA-011 is
recorded as landed** (`7ce8620`) rather than "in flight", how **PLY-010 swipe / playNext /
double-tap are recorded as on `main`** rather than still the sheet, and how **PLY-012 and QA-010
are recorded as in flight** rather than as C6 implement picks.

---

## 2. Ranked remaining work (one screen)

| Rank | Item | Disposition on `0846582` |
|---|---|---|
| **1** | **D-17** CI billing | **Open. Cannot be code-fixed.** Run 33128418756 on `0846582`: 7s, empty steps, spending-limit annotation (check-run `98711991675`). Last green CI still PNL-01 |
| **2** | **Protocol-C4 交互验收单** | **Still not met, despite PLY-010.** Swipe / playNext / double-tap on `main`. 倍速 / scrub plugin-owned (X-26). Tap pause is VePlayer's. Sheet is not 全过. Do not invent `playbackRate` |
| **3** | **QA-010** a11y | **In flight** (`bc-b0108787`). No `cursor/*` branch yet. QA-011 writeback already on `main`. No axe-core job on this SHA. Leave it |
| **4** | **PLY-012** token re-issue | **In flight** (`bc-264077b7` / `cursor/w16-work-c5-after-like-72c4`). Unique commit `271408f` is not an ancestor. Leave it |
| **5** | **C4-03** T14/T16/T15 | **Still open.** `postgres:` refused. Do not fake |
| **6** | **C4-07** SCR-11 / D8 | **Still blocked.** No subscription path. Do not invent one |

Protocol-C4 exits overall: **1/3** (exit 2 met as the named HTTP case; exits 1 and 3 unmet).
C5-01 / C5-02 / QA-011 / HOME continue / G2.3 / PRG-001 remainder / PRG-002 drama CTA are **not
remaining**.

First C6 implement instruction: re-derive `origin/main`. Leave the two running siblings. There is
no unblocked engineering pick behind them that is not P3's file or a leftover-branch drop.

Partner questions Q-G-1…Q-G-10 remain **unknown**.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| P-01 | Keep C5/C4/C3/C2 IDs on unfinished work | Protocol §7 |
| P-02 | Do not open protocol-C5 变现闭环, and do not re-open protocol-C4 as a new epic | C5 verify not passed; D-17 still P1; protocol-C4 1/3; `wave-protocol.md` §4.3 |
| P-03 | Rank the 交互验收单 separately from a11y and from PLY-012 | C5 lumped them as 0/3. The tree now has PLY-010 slices on `main`, QA-010 in flight, PLY-012 in flight. One rank would invite a twin |
| P-04 | Record QA-011 as closed on this tree | `7ce8620` / `可用性与无障碍(上架阻断)`. The C5 report §13 already said so. Not the axe-core job |
| P-05 | Do not invent AM answers or a CI-restoration date | W13 filed the ask. D-17 is billing. Filling dates would be the defect |
| P-06 | Do not rewrite `wave-protocol.md` §6.2 (D-19) or §2 (X-21) | P3's file. Registered, not edited |
| P-07 | Do not rewrite `docs/plan/backlog.md` for the QA-011 P1 countersign | P1's file |
| P-08 | Do not retake leftover `c3-remain` or `c4-subseq` | D-18 and C4-08 already landed by other tips |

---

## 4. Deliberately not done

No axe-core job, no 倍速 control, no `#/vip`, no Postgres, no D-19 writeback, no merge of leftover
branches, no gate-status rewrite of `wave-protocol.md`, no Beans rate, no `adUnlock: true`. Those
have owners in the backlog. Protocol-C4 exits stay 1/3 in the ranking; they are not this slot's
implementation.

---

## 5. For the next slots

**Implement.** Re-derive `origin/main` first: `bc-b0108787` (QA-010) and `bc-264077b7` (PLY-012)
are running. Leave their files. Do not pick D-17, G2.3, HOME continue, leftover ads, leftover
remain, `#/vip`, sqlite-named-as-Postgres, or 倍速.

**Ops.** D-17. A red `main` that has empty `steps` is not a test result. Local verify cannot
corroborate R6.

**Do not.** Enable top-up, synthesise `open_id`, put a Beans rate in a type, mark D4–D9 `[x]` off a
mock, start protocol-C5 变现闭环, or start a twin of either in-flight agent.

**P3.** `X-21` and `D-19` are still open.

**P1.** QA-011 countersign on `docs/plan/backlog.md` is still open.

**Verifier.** Commands are in `docs/plan/cycle-6-backlog.md` §2. If `smoke:` has disappeared from
`l2.yml`, that is a regression on G2.3. If `continue-rail` has disappeared from `HomePage.tsx`,
that is a regression on the landed UI. If an `axe` job has appeared in `.github/workflows/`, rank 3
may have landed — re-derive rather than retaking. If `271408f` is an ancestor of `main`, rank 4 may
have landed — same rule.
