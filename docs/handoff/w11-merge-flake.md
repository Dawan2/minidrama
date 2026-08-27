# W11 — the flake branch, merged onto main

> **Slot:** W11, merge slot. One branch, one merge.
> **Branch:** `cursor/w9-homepage-flake-c44e`, merged onto `main` as `67cac3b`.
> **Base:** `main` at `2b66323` ("Write up the C3 integration, including the merge git got wrong").
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Predecessor:** `docs/handoff/w9-integrate-c3.md` §4, which named this branch as the one thing
> left unmerged after C3 and said it should be merged next.
> **Not touched:** the W10 report and the W11 plan, both in flight elsewhere. This slot adds this
> document and nothing else of its own.

---

## 1. Where it got to

The branch is on `main`. `pnpm verify` exits 0 there, **2,137 tests passing across 114 files, none
skipped**, which is the same count `main` carried before the merge — the branch rewrites one test
rather than adding or removing any.

`main` no longer has a test whose result depends on the wall clock. That was the reason C3 stopped
short of declaring itself done: the append-failure feed test failed once during that integration,
on a merge that touched only the server, and until it was fixed a red `pnpm verify` on `main` could
mean nothing at all.

---

## 2. Fast-forward was asked for and was not available

The slot's instruction was to fast-forward if possible. It was not, and the reason is worth stating
because it is not a conflict:

- the branch was cut from `main` at `bcfb015`, before the C3 integration;
- `main` has since taken all five C3 merges and reached `2b66323`, 193 commits ahead of the fork
  point;
- so the two had diverged, and `git merge --ff-only` refused, correctly.

A merge commit was taken rather than a rebase. Rebasing would have rewritten a branch that is
already on origin and already described by its own handoff document, to save one commit.

**Git resolved it with no conflicts at all.** That was predicted before running it, by checking
what `main` had done to the branch's two paths since the fork point:

```
git diff --stat bcfb015 origin/main -- app/src/routes/HomePage.test.tsx \
                                       docs/handoff/w9-work-homepage-flake.md
```

which is empty. Neither file moved on `main` during C3, so there was nothing for either side to
disagree about. The whole effect of the merge on `main`:

| File | Change |
|---|---|
| `app/src/routes/HomePage.test.tsx` | 18 added, 7 removed — two waits become two `act` scopes |
| `docs/handoff/w9-work-homepage-flake.md` | new, the branch's own record |

No production code changed. This is the merge C3 §3.2 was not: nothing needed composing, and the
only reason to look closely was to confirm that.

---

## 3. Verification

Run on the merge commit, on `main`.

| Gate | Result |
|---|---|
| `pnpm format:check` | pass |
| `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm typecheck` | pass, 4 packages |
| `pnpm test` | pass — 2,137 tests, 114 files, 0 skipped, 0 failing |
| `pnpm build` | pass |
| `pnpm check:guardrails` | pass, against `app/dist` |

| Package | Test files | Tests |
|---|---:|---:|
| `server` | 53 | 1,314 |
| `app` | 54 | 727 |
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |

Whole run: 33 s.

### 3.1 Two checks beyond the gate

The gate passing is the weaker half of the evidence here, because the old form of the test passed
the gate too. Two things were checked specifically:

**The test still catches the regression it exists for, on the merged tree.** The mutation the
branch used in its §2.2 was re-applied to `main`'s `app/src/data/use-paged-resource.ts`, so that an
append failure clobbers the list the way a first-page failure does:

```diff
-  : { ...previous, appending: false, appendError: classifyFailure(result.error) },
+  : { ...EMPTY, status: 'failed', error: classifyFailure(result.error) },
```

The test fails, at `expect(screen.getAllByTestId('feed-card')).toHaveLength(1)`, in **40 ms** — no
deadline is waited out. The mutation was reverted and the tree confirmed clean before this document
was written. This matters more than a repeat-run count: it is what separates a test that was made
deterministic from a test that was made to pass.

**Eight consecutive runs of the file**, 16 tests passing each time. This reproduces nothing and
proves nothing on its own — the branch's own §1.1 is straight about never having reproduced the
flake idle either, and the same holds here. The argument for this merge is that the test no longer
consults a clock, not that a failing case was made to pass.

---

## 4. What is not merged

**`cursor/w9-work-unlock-grant-5224` is not an ancestor of `main`, and was left that way.** C3 §3.5
merged it, but at `9b308ae`; the branch has since gained two commits that never reached `main`:

| Commit | Contents |
|---|---|
| `da40a4a` | `docs/handoff/w9-work-unlock-grant.md`, the slot's own record — 335 lines |
| `d53a2c0` | "Keep the callback's outcome vocabulary free of what was sold" — `paid-trade-orders.ts`, `payment-sink.ts` and its test, 20 lines |

Out of this slot's scope, which was one branch. Flagging it rather than taking it: the second commit
is production code on the payment path, it arrived after an integrator had already reviewed and
merged the branch once, and it deserves the same attention that merge got rather than being carried
in on the back of a test fix. The handoff document is unambiguously wanted and would be a one-line
merge; the two travel together on the branch.

Every other `cursor/*` branch on origin is an ancestor of `main` — **47 of 48**.

---

## 5. For the next slot

**The flake slot is closed, and the gate on `main` means what it says again.** A red `pnpm verify`
on `main` should now be read as a real failure. If `HomePage.test.tsx > feed paging > keeps the
loaded cards when the next page fails` goes red specifically, the branch's §6 is right that this is
evidence the diagnosis was wrong — there is no timeout left in that test to blame, so read the
assertion instead of reaching for one.

**The pattern the branch fixed still lives in ten other test files**, listed in its §5. Nobody has
been given that work. The rule is narrow enough to hand over as it stands: a test that needs two or
more rounds of a stub should be driven through `act`, because each async utility is an independent
wall-clock deadline and the work it waits on is not on a clock. One round with a `findBy*` reads
better and is fine.

**The unlock-grant tail in §4 needs an owner.** It is the only branch on origin that `main` does not
contain, and the gap is invisible from `main`'s history, which records the branch as merged.
