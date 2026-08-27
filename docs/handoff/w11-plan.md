# W11 — plan slot, executed

> **Slot:** W11, plan slot. Cycle 3 by the running count this repository uses — see §6, `X-21`.
> **Branch:** `cursor/w11-plan-cycle-3-93ab`, cut from `main` at `2b66323` ("Write up the C3
> integration, including the merge git got wrong").
> **Deliverables:** `docs/plan/cycle-3-backlog.md` and this file. Nothing else was added, and no
> existing file was modified.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Sub-agents:** none created. §8 rule 5.
> **Predecessor:** `docs/plan/cycle-2-backlog.md` (W6). Where this and that document name the same
> task, the C2 identifier is authoritative and the task is carried forward unchanged — §7 says an
> unfinished task keeps its original ID and its original acceptance criteria.

---

## 1. What this slot did

Read `docs/handoff/w9-integrate-c3.md`, `docs/verify/cycle-1-report.md` and `main` itself, and
produced one backlog of what stands between the product as it is at `2b66323` and the listing bar.

**It implemented nothing.** No source file, no test, no gate, no contract, no configuration. The
mandate was to write the gap down, and a plan slot that starts fixing what it finds stops being able
to report honestly on what it found.

The method was the one `docs/plan/wave-protocol.md` §4.1 rule 3 requires of a verifier and which is
worth applying to a planner too: **where a handoff document asserts a result, the result was re-run
rather than accepted.** That is what produced §3 below, and it is the reason this document is worth
reading before the backlog.

---

## 2. The eight gaps, and where each is specified

The backlog carries eleven tasks. Eight of them are the gaps this slot was asked to cover; three are
carried defects it found while checking.

| Gap | Task | One-line state on `main` |
|---|---|---|
| TikTok login | `C3-08` | Every piece exists and is honest; exactly one function refuses, and it should |
| Beans | `C3-09` | A missing **business input**, not a deferred engineering task |
| EIS / `GATE-8` | `C3-03` | In no authoritative register, three cycles after both were fully specified |
| Wallet UI | `C3-04` | 1 of 5 panels, 0 of 3 monetisation screens, no wallet route |
| Silent re-login | `C3-01` | Both halves built in C3; nothing connects them |
| Durable stores | `C3-06` | Eight in-memory stores; three of them lose things a viewer paid for |
| Favourites `DramaSummary` | `C3-07` | An N+1 the client absorbs at 20 drama reads per page |
| HomePage flake sibling | `C3-02` | Nine structural twins of the test being fixed |

---

## 3. What re-deriving found that the handoffs do not say

Three findings changed the shape of the backlog. All three are of one kind: something was scheduled,
reported, and is not on `main`.

### 3.1 `SR-5` was acceptance item 2 of a task reported as complete, and it does not exist

`docs/plan/cycle-2-backlog.md` T0-2 had three parts: fix the bundle scan's call-form blindness (D-01),
extend it to all five media elements, and add `setValidateVideoReplaceElement` as a banned identifier
(D-06). The first two landed well — `app/tools/bundle-scan.test.ts` carries 42 tests and the rule is
keyed on the *shape* of the call rather than the callee's name, which is the stronger fix the backlog
argued for. The third did not:

```
$ rg setValidateVideoReplaceElement app/ server/ packages/
```

No matches. Every occurrence in the repository is prose — including, still, in the rule that is meant
to ban it. This is the second time in two cycles that a guardrail has been documented as existing and
found not to. The first was `docs/verify/cycle-1-report.md` §7.1, which is what the whole
reverse-verification practice was created for.

**The lesson is narrower than "check everything".** Both misses were the *guardrail* item inside a
larger task that was otherwise delivered. A task that is 90% code and 10% gate gets reported on its
code. That is why `C3-10` states the reverse verification as a required step with an output to quote,
rather than as an acceptance bullet.

### 3.2 The gate escalation has fired, and nobody has recorded it

`docs/plan/wave-protocol.md` §6 gate discipline rule 3 escalates any gate with no movement across two
consecutive cycles to a risk entry with an alternative. `docs/verify/cycle-1-report.md` §8.1 said the
clock started at C1 and that C2 closing unchanged was the trigger.

Three cycles have closed. Every business gate is still `[ ]`; M0 is still `[!]`. No plan wave has
written back a gate status with evidence since W1, which is itself a violation of discipline rule 1
("gate status may only be written back by a plan wave, with evidence") in the direction that is
easiest to miss: the rule was followed by nobody doing it.

This slot cannot write the register — `docs/plan/wave-protocol.md` is P3's file and §3.4 forbids
writing another slot's file. So the escalation is specified as `C3-03` with the alternatives priced,
and registered as conflict `X-22`.

The alternative that matters most is the cheapest one: **documenting a first launch that excludes the
EU and the US removes `GATE-7` from the critical path entirely.** It is a product decision that costs
a conversation now and a submission slip later.

### 3.3 The flake fix has nine siblings, and two of them guard behaviour that is about to change

`docs/handoff/w9-integrate-c3.md` §4 records the single observed failure and correctly identifies it
as a flake rather than a regression. `cursor/w9-homepage-flake-c44e` fixes it, and its comment states
a general principle — an async utility is a wall-clock budget a descheduled worker can spend without
doing work, where `act` returns when React is idle.

The principle applies to nine other tests with the identical two-round structure (a click whose target
only exists after one server round, then a second wait for the append). Two of the nine —
`HistoryPage.test.tsx:270` and `FavoritesPage.test.tsx:356` — assert the mid-scroll `401` behaviour
that `C3-01` is about to modify. A flake in those two would surface during exactly the change that
needs them to be trustworthy, and would most likely be dismissed as "that test is flaky".

`C3-02` therefore depends on the in-flight branch landing first and does not touch it.

---

## 4. Key decisions

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| P-01 | **Carry C2 task identifiers forward rather than renumbering** | `docs/plan/wave-protocol.md` §7: an unfinished task keeps its ID and its acceptance criteria, so that two waves of deferral are visible as deferral rather than as new work. `C3-05` is T0-3a, three cycles old, and it reads that way on purpose | A find-and-replace, and the loss of the age signal |
| P-02 | **`SR-5` and the cover allowlist are their own task rather than being folded into the tasks that own those files** | Both are guardrail items that were previously folded into larger tasks and were the part that did not ship (§3.1). Giving them a task with a required reverse-verification step is the only change that addresses the pattern rather than the instance | Merging two small tasks into two large ones |
| P-03 | **The backlog states what is *unblocked* inside each gated task** | The C1 report's Tier 3 and the C2 backlog both established this and it held: `C3-08` and `C3-09` are gated on their last step only, and each has real work available before the gate. A task marked "blocked" whole is a task nobody looks at again | Two paragraphs, and a cycle of nothing happening on the login path |
| P-04 | **`W8-a` is recorded as answered, not re-asked** | `docs/handoff/w8-work-favorites-list.md` §5 left three questions for the projection slot. The client slot answered the first one and mutation-tested the answer (F34 — the filter fails 4 tests). Re-asking it in the backlog would invite the projection to drop unresolvable rows, which is the exact hole the fan-out was deleted for | One table row, and a regression in a screen that is currently correct |
| P-05 | **The cycle-numbering drift is registered, not adjudicated** | `docs/plan/wave-protocol.md` §2 is P3's file. §3.4 is explicit: when you need to change another slot's file, you register rather than change. The recommendation is in `X-21` with reasoning, for P3 to accept or reject | Nothing — it is a registration |
| P-06 | **No task in this backlog is a new epic** | §4.3 forbids opening one until re-verification passes, and re-verification is W10's, in flight. Every item is a gap C1 or C2 declared and did not close, or a direct consequence of something C3 landed | Removing items |

---

## 5. Deliberately not done

- **No implementation.** Not the one-line `workflow_dispatch:` addition, not the `SR-5` fixture, not
  the type de-duplication — all of which are small enough to be tempting. A plan slot that fixes what
  it finds cannot report on what it found, and every one of these has an owner slot in the backlog.
- **No rewrite of the W10 verification report.** It is a live sibling slot's work. This document does
  not anticipate its verdict, and `docs/plan/cycle-3-backlog.md` §4 records that the C1
  re-verification belongs to it.
- **No rewrite of `cursor/w9-homepage-flake-c44e`.** `C3-02` depends on it and leaves it alone. §8
  rule 4.
- **No edit to `docs/plan/wave-protocol.md`, `docs/plan/w1-conflict-register.md` or
  `docs/plan/media-plane-decision.md`.** All three need changes; all three belong to other slots; all
  three are in §6 below.
- **No re-scoping of the contract-parity gap.** `docs/12-api-contracts.md` declares 40 endpoints and
  the server serves 20. `C3-11` measures it. Scheduling the closure of an unmeasured 20-endpoint gap
  is how C1 failed on over-commitment.
- **No calendar estimates.** The backlog states dependencies, blocked portions and what changes,
  which is what a scheduling wave can act on.

---

## 6. Conflict register

Per §3.4 — found, not fixed.

| # | Conflict | Owner slot | Recommendation |
|---|---|---|---|
| **X-21** | Two live cycle-numbering schemes. §2's arithmetic makes W9 part of C2; `docs/handoff/w9-integrate-c3.md` calls it C3, and this slot's files follow that count | **P3** — `docs/plan/wave-protocol.md` §2, §9 | Adopt the running count and amend §2, rather than renaming five documents. The arithmetic assumed one integration per five waves; the project integrates more often, which is better behaviour and should not be renumbered away. Append to §9 rather than editing §2 silently — §8 rule 7 |
| **X-22** | `GATE-7` and `GATE-8` are in no authoritative register, and the §6 escalation has fired unrecorded across three cycles | **P3** — §6; **P1** — `docs/plan/w1-conflict-register.md` §7 | `C3-03`. Task IDs `GOV-005` and `GOV-008` already exist in `docs/plan/w2-ready-queue.md` §5 with full acceptance criteria; this is their write-back, not a re-specification |
| **X-23** | The favourites types exist twice on one tree — `packages/shared/src/discovery.ts` and `app/src/data/favorites-api.ts` — with one deliberate divergence in `favoritedAt` nullability | **B**, with **A** | `C3-07` acceptance item 4. Registered as `G-C1` by the slot that created the copies, which named deleting them as the integrator's move. Resolve the nullability as a decision, not as a merge artefact |

---

## 7. Blockers

| Blocker | Owner | Effect on this slot |
|---|---|---|
| M0 — official requirements PDF | User | `[!]` for five cycles. Every statement in the backlog about the listing bar derives from public sources S1–S15 and from `docs/11-official-onboarding-checklist.md`, which derives from the same. If the PDF contradicts them the backlog moves with it |
| M1, M2, M4, M6 | Business | Bound the *last step* of `C3-08` and `C3-09` and nothing before it. Both tasks are written so the unblocked portion is deliverable |
| W10 re-verification | Sibling slot, in flight | `docs/plan/wave-protocol.md` §4.3 — implement waves may not open a new epic until it passes. Nothing in this backlog is a new epic, so it schedules either way |

---

## 8. For the next slots

**For whoever schedules the next implement wave.** `C3-02` first. Not because it is the largest — it
is among the smallest — but because until the paging tests are deterministic, a red `pnpm verify` on
`main` may mean nothing, and every other task in the backlog is validated by that command. It depends
on `cursor/w9-homepage-flake-c44e` landing, so the ordering is: merge that branch, then `C3-02`, then
everything else in parallel.

**For slot A.** `C3-05` (D9 capsule avoidance) has been "do this first" for three cycles and has no
external dependency of any kind. Its cost rises with every screen added, and `C3-04` proposes adding
up to four more. If one thing in Tier A is done, make it this one.

**For slot B.** `C3-06` (durable stores) is the largest single task in the backlog and should not be
split across slots — the eight stores share a migration story and a seed. The three payment stores
are a different severity from the other five: losing an unlock record is a viewer who paid real money
through TikTok Beans and owns nothing, losing the order store means a callback that can be matched to
no order, and losing the event store turns replay protection off while leaving the code that checks
it in place.

**For P3.** `X-21` and `X-22` both land in `docs/plan/wave-protocol.md`, and `X-22` is overdue by two
cycles under the protocol's own discipline rule. §9 needs a change-record row for each.

**For the verifier of this cycle.** Every claim in `docs/plan/cycle-3-backlog.md` is quoted with the
command that produced it. §2.2 of that document has the three one-line commands that establish D-02,
D-06 and D-07 are still open. If any of them now returns a match, the corresponding task is closed
and the backlog is wrong — which is the outcome to hope for.
