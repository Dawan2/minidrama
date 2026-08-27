# W13 — cycle docs, merged onto main

> **Slot:** W13, merge slot. Two documentation branches, no source change, no pull request.
> **Parents:** `78505ad` (`main`, "Write up the paging-flake slot…") then the two merges below.
> **Pull request:** none opened. `docs/plan/wave-protocol.md` §8 rule 3.
> **Not touched:** `cursor/w13-work-error-outcomes-72c4` (a different file:
> `server/src/modules/platform-tiktok/paid-trade-orders.test.ts`), and no silent-re-login path.
> This slot adds this document and nothing else of its own.

---

## 1. What landed

Two `cursor/*` tips were not ancestors of `main` at `78505ad`. Both add files `main` has never
held. Fast-forward was not available — each branch diverged from an earlier `main` — so each was
taken as a merge commit, the same reason W11 §2 and W13 CoverImage §2 gave.

| Branch | Merge on `main` | Paths | Conflicts |
| --- | --- | --- | --- |
| `cursor/w10-verify-cycle-2-7b17` (`fdfcd5f`) | `ea6ecae` | `docs/verify/cycle-2-report.md` | none |
| `cursor/w11-plan-cycle-3-93ab` (`93a6213`) | `2249b35` | `docs/plan/cycle-3-backlog.md`, `docs/handoff/w11-plan.md` | none |

Predicted empty compose, then confirmed: `git diff --stat 67cac3b origin/main -- docs/verify/cycle-2-report.md`
and `git diff --stat 2b66323 origin/main -- docs/plan/cycle-3-backlog.md docs/handoff/w11-plan.md`
were both empty before the merges. Git's `ort` strategy created the three files and rewrote nothing
else.

The reports are on `main` as their authors wrote them. This slot did not edit either document to
catch up with later landings — that would be rewriting another slot's file. The two facts a later
slot would otherwise have to rediscover are recorded here instead.

---

## 2. What those documents still say, and what is now true on `main`

**D-10 is closed.** The cycle-2 report names it as the seven two-round paging tests that still
stacked `findBy*` / `waitFor` after W9 converted an eighth, and as the reason `main` was red under
load. W13 flakes (`cursor/w13-work-test-flakes-a44c`, on `main` as `78505ad`) converted those seven
plus the three structural twins onto `renderSettled` / `settle`. Ten tests, four files, no
production change, no skip, no retry, no raised timeout. See `docs/handoff/w13-test-flakes.md`.

**CoverImage is on `main`.** The cycle-3 backlog still records T2-1 / D-02 as open against
`2b66323`: `CoverImage.tsx:56` passing `src` straight to `<img>`. That line is gone. W12's cover-gate
slot landed as `8e3c2aa`; `CoverImage` runs `checkCoverUrl` on its prop, renders the parsed value,
and `import-hygiene.test.ts` asserts that no other non-test source file contains an `<img>`. See
`docs/handoff/w13-merge-cover-image.md`.

Neither fact is a verdict on the rest of those documents. The report's C2 exit conditions, and the
backlog's other open tasks, were not re-derived here.

---

## 3. Left alone

| Branch / area | Why |
| --- | --- |
| `cursor/w13-work-error-outcomes-72c4` | In-flight work. One file, `paid-trade-orders.test.ts`. No overlap with the three docs this slot merged |
| Silent re-login (`silent-login.ts`, `transports.ts`, `session-api.ts`, `main.tsx`) | Already on `main`. This slot did not open those files |
| The text of the W10 report and the W11 plan | Other slots' documents. Composed by leaving them intact |

After these two merges, the only `cursor/*` tip on origin that is not an ancestor of `main` is the
error-outcomes branch.

---

## 4. Verification

Run on `main` after the two merges and this document. Format, lint, types, tests, build, and
guardrails — `pnpm verify`. Retry once if a known paging flake appears; those tests no longer have
a deadline in them, so a failure is a regression, not D-10.
