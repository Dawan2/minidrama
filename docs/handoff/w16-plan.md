# W16 — plan slot, executed

> **Slot:** W16, plan slot. Cycle 5 by the running count this repository uses — see `X-21`.
> Protocol arithmetic still makes W16 the C4 plan wave (`wave-protocol.md` §2). Not adjudicated.
> **Branch:** `cursor/w16-plan-cycle-5-7348`, cut from `origin/main` at `5ab02d1`.
> G2.3 Playwright smoke was on that history (`5ab02d1`). The C4 verify report is an ancestor at
> `8fc8163`.
> **Deliverables:** `docs/plan/cycle-5-backlog.md` and this file. Nothing else was added, and no
> existing file was modified.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Sub-agents:** none created. §8 rule 5.
> **Predecessor:** `docs/plan/cycle-4-backlog.md` (W14) and `docs/verify/cycle-4-report.md` (W15,
> `8fc8163`). Unfinished tasks keep their C4/C3/C2 IDs.

---

## 1. What this slot did

Read `origin/main` at `5ab02d1`, `docs/verify/cycle-4-report.md` (`8fc8163`),
`docs/plan/cycle-4-backlog.md`, `docs/plan/wave-protocol.md` §4.3 / §5.1, and
`docs/gates/open-questions.md`, and wrote one ranked gap list of what still stands between the
product and the listing bar.

**It implemented nothing.** No source, test, gate, contract, or partner answer.

Where the C4 report asserted a remainder, the tree was re-checked. That is how **G2.3 is recorded
as landed** (`5ab02d1`, job `smoke` in `l2.yml`) rather than "still missing", and how HOME continue
UI is recorded as **in flight** (`bc-fb69d154` / `origin/cursor/w14-work-continue-ui-72c4`) rather
than as a C5 pick.

---

## 2. Ranked remaining work (one screen)

| Rank | Item | Disposition on `5ab02d1` |
|---|---|---|
| **1** | **D-17** CI billing | **Open. Cannot be code-fixed.** Run 33125399122: 5s, empty steps, spending-limit annotation. Last green CI still PNL-01 |
| **2** | **Protocol-C4 播放体验** | **0/3.** Split into named IDs. **Not opened** as an implement epic (`wave-protocol.md` §4.3; W14 P-02; C4 report §0) |
| **—** | **G2.3** | **Not remaining.** On `main` as L2 `smoke`. Do not retake. GitHub has not run it (D-17) |
| **3** | **C4-03** T14/T16/T15 | **Still open.** `postgres:` refused. Do not fake |
| **4** | **C4-07** SCR-11 / D8 | **Still blocked.** No subscription path. Do not invent one |
| **5** | **HOME continue UI** | **In flight** (`bc-fb69d154`). Server rail already on `main`. Leave `HomePage.tsx` |

First implement pick: **C5-01 / D-20** (G1.10 skip detection, then G1.7 / G1.9). Then D-18 as
integrator merge-or-drop, not a rewrite.

Partner questions Q-G-1…Q-G-10 remain **unknown**.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| P-01 | Keep C4/C3/C2 IDs on unfinished work | Protocol §7 |
| P-02 | Do not open protocol-C4 播放体验 as implement work | C4 verify not passed; C2 still `[!]`; §4.3. The split is the plan-wave close (`PLN-004`), not a licence to start 倍速 |
| P-03 | Record G2.3 as closed on this tree | Job `smoke` is in `l2.yml` at `5ab02d1`. The C4 report's "not on main" is true of `3cb724c`, not of HEAD |
| P-04 | Leave `bc-fb69d154` / `w14-work-continue-ui-72c4` alone | Live sibling. §8 rule 4. Dedicated HOME rail is its files |
| P-05 | Do not invent AM answers or a CI-restoration date | W13 filed the ask. D-17 is billing. Filling dates would be the defect |
| P-06 | Do not rewrite `wave-protocol.md` §6.2 (D-19) | P3's file. Registered, not edited |
| P-07 | Do not retake leftover `c4-subseq` ads | Duplicate of landed C4-08 |

---

## 4. Deliberately not done

No G1.10 detector, no axe-core job, no 倍速 control, no `#/vip`, no Postgres, no merge of D-18, no
gate-status rewrite of `wave-protocol.md`. Those have owners in the backlog. Protocol-C4 exits stay
0/3 in the ranking; they are not this slot's implementation.

---

## 5. For the next slots

**Implement.** `C5-01` (G1.10 first). Re-derive `origin/main` first: HOME continue UI is running.
Do not pick G2.3, HOME continue presentation, leftover ads, player gestures, or `#/vip`.

**Ops.** D-17. A red `main` that has empty `steps` is not a test result. Local verify cannot
corroborate R6.

**Do not.** Enable top-up, synthesise `open_id`, put a Beans rate in a type, mark D4–D9 `[x]` off a
mock, or open the 播放体验 epic while §4.3 still holds.

**P3.** `X-21` and `D-19` are still open.

**Verifier.** Commands are in `docs/plan/cycle-5-backlog.md` §2. If `smoke:` has disappeared from
`l2.yml`, or if `w14-work-continue-ui-72c4` has become an ancestor of `main`, the corresponding
line is stale — which is the outcome to hope for on the UI rank, and a regression on G2.3.
