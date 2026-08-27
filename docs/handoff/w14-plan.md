# W14 — plan slot, executed

> **Slot:** W14, plan slot. Cycle 4 by the running count this repository uses — see `X-21`.
> **Branch:** `cursor/w14-plan-cycle-4-2e9b`, cut from `origin/main` at `5598aba`.
> Settings were on that history at `14276cb`; search-over-catalogue sqlite landed after.
> **Deliverables:** `docs/plan/cycle-4-backlog.md` and this file. Nothing else was added, and no
> existing file was modified.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Sub-agents:** none created. §8 rule 5.
> **Predecessor:** `docs/plan/cycle-3-backlog.md` (W11). Unfinished tasks keep their C3/C2 IDs.

---

## 1. What this slot did

Read `origin/main` at `5598aba`, `docs/plan/cycle-3-backlog.md`, `docs/plan/wave-protocol.md` §5–§6,
`docs/gates/open-questions.md`, and the W13 handoffs, and wrote one backlog of what still stands
between the product and the listing bar.

**It implemented nothing.** No source, test, gate, contract, or partner answer.

Where a handoff claimed a close, the tree was re-checked. That is how search sqlite is recorded as
**landed** (`bc-98ce540a`, idle, `5598aba`) rather than "maybe finishing", and how recharge is
recorded as a **disabled control**, not a missing screen.

---

## 2. C3 closed vs still open (one screen)

| Closed on `main` | Still open |
|---|---|
| C3-01 silent re-login | **C3-08** real TikTok login (GATE-1 + GATE-6) |
| C3-02 paging flakes | **C3-09** Beans rate (Q-G-7). No rate invented |
| C3-03 gate *register* (not the gates) | **GATE-7 EIS, GATE-8 BytePlus** — `[ ]`, escalated, unanswered |
| C3-04 PNL-01 + SCR-09 + `GET /v1/wallet` | **SCR-10 / PNL-03** recharge — disabled until a rate; **SCR-11** VIP — no contract |
| C3-05 D9 chrome (wired; checklist still `[ ]`) | **C3-11** G1.5, L1 `workflow_dispatch:`, D-07 / D-11 |
| C3-06 eight stores + seed ≥80; search is a directory over `0007` | **C2 leftover:** L2 G2.2–G2.7 (G2.8 exists), T14/T16 Postgres/Drizzle, T15 Redis |
| C3-07 favourites `DramaSummary` | **SCR-01** splash — `GET /config` is not in OpenAPI; do not invent it |
| C3-10 SR-5 + `CoverImage` | **T0-3c** D5/D6 ads — no product call site |

Partner questions Q-G-1…Q-G-9 remain **unknown**.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| P-01 | Keep C3/C2 IDs on unfinished work | Protocol §7 |
| P-02 | Do not open protocol-C4 播放体验 | C2 still `[!]`, no C3 verify report, §4.3 |
| P-03 | Do not schedule a search-sqlite retake | Sibling finished; a second table would duplicate `0007` |
| P-04 | Treat disabled recharge as the correct state | Enabling it without Q-G-7 is a commercial decision in the client |
| P-05 | Do not invent AM answers | W13 already filed the ask. Filling dates would be the defect |
| P-06 | Leave `bc-05cba7a1` and unmerged `w13-work-c3-remain-72c4` alone | Live / unmerged siblings. §8 rule 4 |

---

## 4. Deliberately not done

No G1.5, no `workflow_dispatch:` line, no D-07 edit, no `GET /config`, no Beans constant, no
gate-status rewrite of `wave-protocol.md` (P3 owns it; W13 already wrote §6.1). Those have owners
in the backlog.

---

## 5. For the next slots

**Implement.** `C4-01` and `C4-02` (G2.7 first). Re-derive `origin/main` first: a client-remainder
sibling is running.

**Do not.** Enable top-up, add `0008_search`, synthesise `open_id`, put a Beans rate in a type,
or mark D4–D9 `[x]` off a mock.

**P3.** `X-21` is still open.

**Verifier.** Commands are in `docs/plan/cycle-4-backlog.md` §2. If search is no longer the
catalogue directory, or if `workflow_dispatch:` has appeared on L1, the corresponding line is
stale — which is the outcome to hope for.
