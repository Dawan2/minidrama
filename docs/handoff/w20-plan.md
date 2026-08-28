# W20 — plan slot, executed

> **Slot:** W20, plan slot. Cycle 7 by the running count this repository uses — see `X-21`.
> Protocol arithmetic still makes W20 a C4 verify wave (`wave-protocol.md` §2). Not
> adjudicated. Running-count C6 already had its verify wave at W19.
> **Branch:** `cursor/w20-plan-cycle-7-badf`, cut from `origin/main` at `e6926f2`.
> The cut tip *is* `docs/verify/cycle-6-report.md` (W19 independent verify, not passed;
> D-17 still billing-red; protocol-C4 still 1/3). PLY-011 S6 lock chrome is an ancestor
> (`9b563b0`).
> **Deliverables:** `docs/plan/cycle-7-backlog.md` and this file. Nothing else was added,
> and no existing file was modified.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Sub-agents:** none created. §8 rule 5.
> **Predecessor:** `docs/plan/cycle-6-backlog.md` (W18) and `docs/verify/cycle-6-report.md`
> (W19, `e6926f2`). Unfinished tasks keep their C6/C5/C4/C3/C2 IDs.

---

## 1. What this slot did

Read `origin/main` (`e6926f2`), `docs/verify/cycle-6-report.md`,
`docs/plan/cycle-6-backlog.md`, `docs/plan/wave-protocol.md` §4.3 / §5.1 / §7, and
`docs/gates/open-questions.md`, and wrote one ranked gap list of what still stands
between the product and the listing bar.

**It implemented nothing.** No source, test, gate, contract, or partner answer.

Where the C6 report asserted a remainder, the tree was re-checked. That is how
**PLY-011 is recorded as landed** (`9b563b0` / `533433f` / `locked-chrome.tsx`) rather
than still the leftover twin, how **QA-010 smallest job and INF-004 S-C1 are recorded as
on `main`** rather than still the C6 plan's in-flight rows, and how leftover C6
`bc-2c841f7a` is recorded as **INF-004 echo-only remainder in flight** (`dea3066`)
rather than the twin PLY-011 SHA `af1b7ff` named in the report's §13 — that SHA is not
in this clone. After-lock `bc-1a5a2455` is recorded as **QA-010 SCR-02 in flight**
(`35fa8e8`).

---

## 2. Ranked remaining work (one screen)

| Rank | Item | Disposition on `e6926f2` |
|---|---|---|
| **1** | **D-17** CI billing | **Open. Cannot be code-fixed.** Run 33130563770 on `e6926f2`: 5s, empty steps. Annotation on check-run `98718847762` is the spending-limit sentence. Last green CI still PNL-01 |
| **2** | **Protocol-C4 交互验收单** | **Still 1/3.** Swipe / playNext / double-tap / kept 倍速 / scrub plugins / stall / PLY-012 / PLY-011 on `main`. 倍速 / scrub plugin-owned (X-26). Tap pause is VePlayer's. Sheet is not 全过. Do not invent `playbackRate` |
| **3** | **QA-010 remainder** | **In flight** (`bc-1a5a2455` after-lock / `35fa8e8` SCR-02). Smallest job already on `main` (SCR-13 only). Leave it |
| **4** | **INF-004 remainder** | **In flight leftover C6** (`bc-2c841f7a` / `dea3066` echo-only). S-C1 already on `main`. Leave it. Do not merge leftover as a second S6 |
| **5** | **C4-03** T14/T16/T15 | **Still open.** `postgres:` refused. Do not fake |
| **6** | **C4-07** SCR-11 / D8 | **Still blocked.** No subscription path. Do not invent one |

Protocol-C4 exits overall: **1/3** (exit 2 met as the named HTTP case; exits 1 and 3
unmet). C5-01 / C5-02 / QA-011 / QA-010 SCR-13 / INF-004 S-C1 / HOME continue / G2.3 /
PRG-001 remainder / PRG-002 drama CTA / PLY-012 / PLY-011 / S7 stall / kept 倍速 / scrub
are **not remaining**.

First C7 implement instruction: re-derive `origin/main`. Leave `bc-2c841f7a` and
`bc-1a5a2455`. There is no unblocked engineering pick behind them that is not P3's file
or a leftover-branch drop.

Partner questions Q-G-1…Q-G-10 remain **unknown**.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| P-01 | Keep C6/C5/C4/C3/C2 IDs on unfinished work | Protocol §7 |
| P-02 | Do not open protocol-C5 变现闭环, and do not re-open protocol-C4 as a new epic | C6 verify not passed; D-17 still P1; protocol-C4 still 1/3; `wave-protocol.md` §4.3 |
| P-03 | Rank the 交互验收单 separately from a11y remainder and from INF-004 remainder | C6 lumped the sheet as rank 2 and the axe *job* as rank 3. The job landed; SCR-02 is in flight after-lock; leftover C6 moved onto S-C3. One rank would invite twins |
| P-04 | Record QA-010 smallest job and INF-004 S-C1 as closed on this tree | W19 reverse-verified both. Rank 3 / rank 4 are the remainders, in flight |
| P-05 | Record PLY-011 as landed | `9b563b0` / `533433f`. The C6 report §13 already said so. Do not retake `locked-chrome.tsx` |
| P-06 | Record leftover C6 against the tree, not the report's twin SHA | Unique commit is now INF-004 echo-only (`dea3066`). `af1b7ff` is not in this clone. Do not merge leftover as a second S6 |
| P-07 | Do not invent AM answers or a CI-restoration date | W13 filed the ask. D-17 is billing. Filling dates would be the defect |
| P-08 | Do not rewrite `wave-protocol.md` §6.2 (D-19) or §2 (X-21) | P3's file. Registered, not edited |
| P-09 | Do not rewrite `docs/plan/backlog.md` for the QA-011 P1 countersign | P1's file |
| P-10 | Do not retake leftover `c3-remain` or `c4-subseq` | D-18 and C4-08 already landed by other tips |
| P-11 | Leave the two in-flight C6 tips, including their shared edit of `docs/14-quality-gates.md` | `X-27`. §3.4 |

---

## 4. Deliberately not done

No axe-core second fixture, no INF-004 echo-only detector, no 倍速 control, no `#/vip`,
no Postgres, no D-19 writeback, no merge of leftover branches, no gate-status rewrite of
`wave-protocol.md`, no Beans rate, no `adUnlock: true`. Those have owners in the backlog.
Protocol-C4 exits stay 1/3 in the ranking; they are not this slot's implementation.

---

## 5. For the next slots

**Implement.** Re-derive `origin/main` first: `bc-2c841f7a` (leftover C6 / INF-004 S-C3)
and `bc-1a5a2455` (after-lock / QA-010 SCR-02) are running. Leave their files. Do not
pick D-17, G2.3, HOME continue, leftover ads, leftover remain, `#/vip`,
sqlite-named-as-Postgres, 倍速, PLY-012, PLY-011 `locked-chrome.tsx`, QA-010 SCR-13, or
INF-004 S-C1.

**Ops.** D-17. A red `main` that has empty `steps` is not a test result. Local verify
cannot corroborate R6.

**Do not.** Enable top-up, synthesise `open_id`, put a Beans rate in a type, mark D4–D9
`[x]` off a mock, start protocol-C5 变现闭环, start a twin of either in-flight agent, or
merge leftover C6 as a second S6.

**P3.** `X-21` and `D-19` are still open.

**P1.** QA-011 countersign on `docs/plan/backlog.md` is still open. `X-26` is still open.

**Verifier.** Commands are in `docs/plan/cycle-7-backlog.md` §2. If `smoke:` has
disappeared from `l2.yml`, that is a regression on G2.3. If `continue-rail` has
disappeared from `HomePage.tsx`, that is a regression on the landed UI. If
`locked-chrome.tsx` has disappeared, that is a regression on PLY-011. If
`player-fatal.ts` has disappeared, that is a regression on PLY-012. If a second a11y
fixture has appeared next to SCR-13, rank 3 may have landed — re-derive rather than
retaking. If `audit.ts` now fails echo-only steps, rank 4 may have landed — same rule.
