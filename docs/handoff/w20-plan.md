# W20 — plan slot, executed

> **Slot:** W20, plan slot. Cycle 7 by the running count this repository uses — see `X-21`.
> Protocol arithmetic still makes W20 a C4 verify wave (`wave-protocol.md` §2). Not
> adjudicated. Running-count C6 already had its verify wave at W19.
> **Branch:** `cursor/w20-plan-cycle-7-badf`, cut from `origin/main` at `e6926f2`.
> Merged forward onto `25a96b4` (leftover C6 INF-004 S-C3, after-lock QA-010 SCR-02,
> W20 QA-010 SCR-03, then W20 CN-10 start/switch timeout landed while this slot wrote).
> The cut tip *is* `docs/verify/cycle-6-report.md` (W19 independent verify, not passed;
> D-17 still billing-red; protocol-C4 still 1/3). PLY-011 S6 lock chrome is an ancestor
> (`9b563b0`).
> **Deliverables:** `docs/plan/cycle-7-backlog.md` and this file. Nothing else was added,
> and no existing file was modified except to absorb `origin/main` after leftover C6 and
> after-lock landed.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Sub-agents:** none created. §8 rule 5.
> **Predecessor:** `docs/plan/cycle-6-backlog.md` (W18) and `docs/verify/cycle-6-report.md`
> (W19, `e6926f2`). Unfinished tasks keep their C6/C5/C4/C3/C2 IDs.

---

## 1. What this slot did

Read `origin/main` (cut `e6926f2`, then `51ab72f`, then `c46bbf5`), `docs/verify/cycle-6-report.md`,
`docs/plan/cycle-6-backlog.md`, `docs/plan/wave-protocol.md` §4.3 / §5.1 / §7, and
`docs/gates/open-questions.md`, and wrote one ranked gap list of what still stands
between the product and the listing bar.

**It implemented nothing.** No source, test, gate, contract, or partner answer.

Where the C6 report asserted a remainder, the tree was re-checked. That is how
**PLY-011 is recorded as landed** (`9b563b0` / `533433f` / `locked-chrome.tsx`) rather
than still the leftover twin, how **QA-010 smallest job and INF-004 S-C1 are recorded as
on `main`**, and how leftover C6 `bc-2c841f7a` and after-lock `bc-1a5a2455` are recorded
as **landed** (`dea3066` S-C3, `35fa8e8` SCR-02 / `51ab72f`) rather than still in flight
— they were RUNNING at first draft and ancestors of `main` before this file was merged.
The C6 report §13 twin-PLY-011 SHA `af1b7ff` is not in this clone; leftover reset onto
`9b563b0` and shipped S-C3. W20 next-a11y `bc-25aea5c1` landed SCR-03 (`c46bbf5` /
`b557c29`) the same way. Remaining in-flight W20 work: `bc-7fbe0bc1` (remaining C4
playback).

---

## 2. Ranked remaining work (one screen)

| Rank | Item | Disposition on `25a96b4` |
|---|---|---|
| **1** | **D-17** CI billing | **Open. Cannot be code-fixed.** Run 33131517380 on `25a96b4`: 4s, empty steps. Annotation on check-run `98721892434` is the spending-limit sentence. Last green CI still PNL-01 |
| **2** | **Protocol-C4 交互验收单** | **Still 1/3.** Swipe / playNext / double-tap / kept 倍速 / scrub plugins / stall / PLY-012 / PLY-011 / CN-10 on `main`. 倍速 / scrub plugin-owned (X-26). Tap pause is VePlayer's. Sheet is not 全过. Do not invent `playbackRate` |
| **3** | **QA-010 remainder** after SCR-03 | **In flight** (`bc-afae2991` drama, `bc-f6e4b6a7` play). Smallest job, SCR-02, and SCR-03 already on `main`. Leave those files and the in-flight agents |
| **—** | **INF-004 S-C3** | **Not remaining.** Landed at `51ab72f` / `dea3066` (`bc-2c841f7a`). Was in flight leftover C6 at first draft. S-C4 stays further. Do not retake |
| **4** | **C4-03** T14/T16/T15 | **Still open.** `postgres:` refused. Do not fake |
| **5** | **C4-07** SCR-11 / D8 | **Still blocked.** No subscription path. Do not invent one |

Protocol-C4 exits overall: **1/3** (exit 2 met as the named HTTP case; exits 1 and 3
unmet). C5-01 / C5-02 / QA-011 / QA-010 SCR-13 / QA-010 SCR-02 / QA-010 SCR-03 /
INF-004 S-C1 / INF-004 S-C3 / HOME continue / G2.3 / PRG-001 remainder / PRG-002 drama
CTA / PLY-012 / PLY-011 / CN-10 / S7 stall / kept 倍速 / scrub are **not remaining**.

First C7 implement instruction: re-derive `origin/main`. Leave `bc-afae2991` and
`bc-f6e4b6a7`. There is no unblocked engineering pick behind them that is not P3's file
or a leftover-branch drop.

Partner questions Q-G-1…Q-G-10 remain **unknown**.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| P-01 | Keep C6/C5/C4/C3/C2 IDs on unfinished work | Protocol §7 |
| P-02 | Do not open protocol-C5 变现闭环, and do not re-open protocol-C4 as a new epic | C6 verify not passed; D-17 still P1; protocol-C4 still 1/3; `wave-protocol.md` §4.3 |
| P-03 | Rank the 交互验收单 separately from a11y remainder | C6 lumped the sheet as rank 2 and the axe *job* as rank 3. The job and SCR-02 landed; the next screen is in flight. One rank would invite a twin |
| P-04 | Record QA-010 smallest job, SCR-02, SCR-03, INF-004 S-C1, and INF-004 S-C3 as closed on this tree | W19 reverse-verified the first two. Leftover C6, after-lock, and W20 next-a11y landed while this slot wrote |
| P-05 | Record PLY-011 as landed | `9b563b0` / `533433f`. The C6 report §13 already said so. Do not retake `locked-chrome.tsx` |
| P-06 | Record leftover C6 against the tree, not the report's twin SHA | Unique commit shipped INF-004 echo-only (`dea3066`). `af1b7ff` is not in this clone. Do not merge leftover as a second S6 |
| P-07 | Do not invent AM answers or a CI-restoration date | W13 filed the ask. D-17 is billing. Filling dates would be the defect |
| P-08 | Do not rewrite `wave-protocol.md` §6.2 (D-19) or §2 (X-21) | P3's file. Registered, not edited |
| P-09 | Do not rewrite `docs/plan/backlog.md` for the QA-011 P1 countersign | P1's file |
| P-10 | Do not retake leftover `c3-remain` or `c4-subseq` | D-18 and C4-08 already landed by other tips |
| P-11 | Leave the in-flight W20 a11y tips | `bc-afae2991` drama; `bc-f6e4b6a7` play. §8 rule 4 |
| P-12 | Record leftover C6, after-lock, next-a11y, and CN-10 as landed | First draft said leftover C6 and after-lock in flight (user-noted `bc-2c841f7a` / `bc-1a5a2455`). The tree moved. Do not retake their files |

---

## 4. Deliberately not done

No third a11y fixture, no INF-004 S-C4, no 倍速 control, no `#/vip`, no Postgres, no
D-19 writeback, no merge of leftover remain/ads branches, no gate-status rewrite of
`wave-protocol.md`, no Beans rate, no `adUnlock: true`. Those have owners in the backlog.
Protocol-C4 exits stay 1/3 in the ranking; they are not this slot's implementation.

---

## 5. For the next slots

**Implement.** Re-derive `origin/main` first: `bc-afae2991` (drama a11y) and
`bc-f6e4b6a7` (play-screen a11y) are running. Leave their files. Do not pick D-17, G2.3,
HOME continue, leftover ads, leftover remain, `#/vip`, sqlite-named-as-Postgres, 倍速,
PLY-012, PLY-011 `locked-chrome.tsx`, CN-10 `player-start.ts`, QA-010 SCR-13, QA-010
SCR-02, QA-010 SCR-03, INF-004 S-C1, or INF-004 S-C3.

**Ops.** D-17. A red `main` that has empty `steps` is not a test result. Local verify
cannot corroborate R6.

**Do not.** Enable top-up, synthesise `open_id`, put a Beans rate in a type, mark D4–D9
`[x]` off a mock, start protocol-C5 变现闭环, start a twin of the in-flight remaining C4
playback agent, or merge leftover C6 as a second S6.

**P3.** `X-21` and `D-19` are still open.

**P1.** QA-011 countersign on `docs/plan/backlog.md` is still open. `X-26` is still open.

**Verifier.** Commands are in `docs/plan/cycle-7-backlog.md` §2. If `smoke:` has
disappeared from `l2.yml`, that is a regression on G2.3. If `continue-rail` has
disappeared from `HomePage.tsx`, that is a regression on the landed UI. If
`locked-chrome.tsx` has disappeared, that is a regression on PLY-011. If
`player-fatal.ts` has disappeared, that is a regression on PLY-012. If `scr-02-home.html`
or `scr-03-browse.html` has disappeared, that is a regression on after-lock / next-a11y.
If `audit.ts` no longer fails echo-only steps, that is a regression on leftover C6 S-C3.
If a fourth a11y fixture has appeared next to SCR-02 / SCR-03 / SCR-13, rank 3 may have
landed — re-derive rather than retaking.
