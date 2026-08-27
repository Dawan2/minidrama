# Handoff — Wave 9: the append-failure feed test no longer races a clock

> **Branch:** `cursor/w9-homepage-flake-c44e`, cut from `main` at `bcfb015`.
> **Scope:** one test in `app/src/routes/HomePage.test.tsx` — `feed paging > keeps the loaded cards
> when the next page fails`. 18 lines added, 7 removed, one file. No production code changed.
> **Not in scope:** the C3 mega-merge and the unlock-grant rewrite (both in flight, neither
> touched), `use-paged-resource.ts` and every other module under `app/src/`, `server/`,
> `packages/`, `contracts/`, the vitest config, and the other fifteen tests in the same file.
> The test was **not** skipped, and no timeout was raised anywhere. No pull request was opened.

---

## 1. The defect

Raised by the Wave 9 integrator: the test flakes under parallel load. The form it had was

```tsx
renderSurface(<HomePage />, { api });

fireEvent.click(await screen.findByTestId('load-more'));

await waitFor(() => {
  expect(screen.getByTestId('retryable-error')).toBeDefined();
});
```

Two waits, and both of them are wall-clock budgets. `findBy*` and `waitFor` are the same mechanism
underneath: a deadline (`asyncUtilTimeout`, **1000 ms** by default), a 50 ms poll, and a
`MutationObserver`. Whichever fires first decides the test.

What makes this test the one that flakes rather than one of its fifteen neighbours is that it is
the only assertion in the file that needs **two** rounds of the stub to land: the first page has to
arrive and render the `load-more` button before the click can happen, and then the append has to
fail and render underneath the list. Each round is a separate deadline, and the two are consumed
back to back with a synchronous `fireEvent` wedged between them.

The deadline is measured against the wall clock, and the work is not. A vitest worker that the OS
deschedules — which is the normal condition on a box running one worker per core, and the
condition the integrator was in — spends its budget without being given the CPU to do anything
with it. Nothing in the test observes React's actual progress; it observes whether progress
happened to occur before a timer expired. The stub compounds this by resolving synchronously
(`Promise.resolve(script.feed(...))`), which puts every state update it causes outside any `act`
scope the test controls: the test hands the update to React's scheduler and then waits on a clock
for a render it has no handle on.

That is a test whose result depends on machine load, which is the definition of the flake. The
list-keeping behaviour it asserts is not in doubt — `use-paged-resource.test.ts` covers the same
rule at the hook level with `act`, and that one does not flake.

### 1.1 What was and was not reproduced

Being straight about the evidence, because it changes what this fix can claim:

| Attempt | Result |
| --- | --- |
| The suite at rest, and the file in a loop | Always green. Never reproduced idle |
| Full app suite × 6 under 3× CPU oversubscription (12 spinners on 4 cores, each run ~45 s against 16 s idle) | 662 passing each time. **Not reproduced** |
| Six synthetic starvation shapes injected into the wait window — a 1.4 s event-loop block from a timer, a microtask, a `MessageChannel` message, inline, and eight 200 ms bursts | The old form survived all six |
| The old form with `asyncUtilTimeout` squeezed to **1 ms** | Survived |

So the old form is more robust than the report suggests, and the specific interleaving the
integrator hit is not one I could schedule on demand — reproducing it means controlling when the
OS takes the thread away, which a test process cannot do.

The last two rows are worth reading carefully, because they explain both the robustness and the
residual risk. React 19 lands this update in a microtask, so a single `await` is usually enough and
jsdom's `MutationObserver` (also microtask-based) resolves `waitFor` before the deadline timer is
ever consulted. What is left is a genuine race rather than a certainty: React's default-lane flush
goes through the Scheduler's `MessageChannel`, while the poll and the 1000 ms deadline are
`setTimeout`s, and Node runs due timers before pending channel messages. Starvation that lands so
the deadline comes due in the same timers pass as a poll gives the timeout the win over a render
that is already queued. Low probability per run, and the suite runs this test on every push.

The honest summary: **the old form's outcome was a function of the wall clock, and the new one's
is not.** That is what was fixed and what is demonstrable (§2.2), rather than a specific
interleaving being closed.

---

## 2. What changed

The two waits become two `act` scopes. Same assertions, same stub, same order of events:

```tsx
await act(async () => {
  renderSurface(<HomePage />, { api });
});
await act(async () => {
  fireEvent.click(screen.getByTestId('load-more'));
});

expect(screen.getByTestId('retryable-error')).toBeDefined();
expect(screen.getAllByTestId('feed-card')).toHaveLength(1);
expect(screen.getByTestId('load-more')).toBeDefined();
```

`await act(async …)` returns when React has run out of work: it awaits the callback, drains the
microtask queue, and flushes the work loop, repeating until nothing is pending. There is no
deadline in that, and no `getBy*` in this test runs before the state it reads has been committed.
Starvation can delay the flush for as long as it likes; it cannot make the condition false. The
assertions become plain synchronous `getBy*` calls, so a genuine regression now reports the missing
element immediately instead of after a second of polling.

This is the idiom `use-paged-resource.test.ts` and `use-resource.test.ts` already use for exactly
this hook, so the file is not inventing a local convention. The three-line comment above the test
says why this one test departs from the `findBy*` idiom of its neighbours, so the next person to
read the file does not "tidy" it back.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages |
| Tests | `pnpm test` | **1883 passing, 0 skipped, 0 failing** — 662 app (51 files), 1125 server, 45 config, 51 shared |
| Under load | full app suite × 6 at 3× CPU oversubscription | 662 passing, six times out of six |

Test count is unchanged at 662: this rewrites one test, it does not add or remove any. No test was
skipped, no assertion was dropped or weakened — the three `expect`s are the three that were there
before, in the same order. The runtime of the test itself goes from a steady 44–45 ms to 36 ms
(measured three runs each, same filter), because it no longer waits on poll intervals.

### 2.2 Proved by mutation, and proved deadline-free

**It still catches the regression it exists for.** `use-paged-resource.ts` was mutated so an append
failure clobbers the list the way a first-page failure does — the exact defect this test guards:

```diff
-  : { ...previous, appending: false, appendError: classifyFailure(result.error) },
+  : { ...EMPTY, status: 'failed', error: classifyFailure(result.error) },
```

| | Before this change | After |
| --- | --- | --- |
| Result | fails | **fails** — `Unable to find an element by: [data-testid="feed-card"]` |
| Time to fail | ~1 s (waits out the deadline first) | 40 ms |

The mutation was reverted; `git status` is clean apart from this document and the test.

**Its result no longer depends on the clock.** The new form was run against all six starvation
shapes from §1.1 *and* with `asyncUtilTimeout` set to **1 ms** — a squeeze that would break
anything still consulting a deadline. Six for six green, which follows from there being no deadline
left in the test rather than from luck.

---

## 3. Decisions

Numbered `K*` to avoid colliding with the earlier slots' `R*`, `O*`, `H*`, `S*` and `J*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| K1 | **`act` rather than a longer timeout** | Raising `asyncUtilTimeout` to 5 s buys a bigger number to lose against and makes every real failure in the suite five times slower to report. The problem is not that the budget is too small, it is that a budget is being consulted at all | Revert one test |
| K2 | **The render is wrapped too, not just the click** | The first-page wait is a deadline of exactly the same kind. Fixing the second wait and leaving the first would move the flake rather than remove it, and would leave the test half deterministic | Restore `await screen.findByTestId('load-more')` |
| K3 | **The stub is left exactly as it is** | A deferred stub would let the test control resolution explicitly, but it means a bespoke `fetchFeed` that bypasses `stubCatalogApi`'s call recording, and it asserts the appending transition this test is not about. `act` gets determinism without changing what the test is testing | Build a deferred, as `UnlockPanel.test.tsx` does for in-flight assertions |
| K4 | **Only the flagged test changed** | Its two neighbours in `feed paging` share the shape but each need only one round of the stub, so neither is the reported flake. C3 and the unlock-grant rewrite are in flight, and a file-wide idiom change is a merge conflict with no evidence behind it | — |
| K5 | **Assertions are synchronous `getBy*`, not `findBy*`** | After `act` the state is committed, so a `findBy*` would be a deadline guarding a condition already true — the same construct that caused this, kept as decoration | Swap back |
| K6 | **The comment explains the departure from the file's idiom** | Fifteen tests here use `findBy*`. An unexplained sixteenth that does not is an invitation to normalise it back, and the flake returns with the tidy-up | Delete the comment |
| K7 | **No skip, no retry, no `test.retry`** | A retry makes the report green while leaving the nondeterminism in place, and it would mask the next real regression in this behaviour for one run out of two | Add `retry: 1` in the vitest config |

---

## 4. Deliberately not done

- **No mega-merge of C3, and no touch to the unlock-grant work.** Both in flight elsewhere. This
  branch is cut from `main` and changes one test file.
- **The test was not skipped**, and no `test.retry`, `test.slow` or per-test timeout was added.
- **No production code changed.** `use-paged-resource.ts` was mutated only to prove the test still
  catches the regression (§2.2) and restored via `git checkout`.
- **No vitest config change.** `asyncUtilTimeout`, `testTimeout`, the pool and the worker count are
  all as they were. Lowering suite-wide parallelism would have hidden this instead of fixing it.
- **The sibling paging tests were not converted** (§5, K4).
- **No new test helper.** A `renderSettled` in `src/testing/render.tsx` is the obvious next step if
  this idiom spreads, and that file is shared with the in-flight slots.

---

## 5. Known gaps in this slot's own work

- **The same shape lives in ten other files.** `fireEvent` followed by a `waitFor`, over a
  synchronously resolving stub, is the house idiom — `DramaPage.test.tsx`, `FavoritesPage.test.tsx`,
  `SearchPage.test.tsx`, `HistoryPage.test.tsx` and `UnlockPanel.test.tsx` all page or retry through
  it. Every one of them carries the same class of exposure; this slot fixed the one that was
  reported. The two in `feed paging` are the closest relatives and need one round of the stub
  rather than two, which is the whole reason they are not the reported flake.
- **The original interleaving was never reproduced**, so there is no failing-then-passing pair to
  point at (§1.1). If this test flakes again, that is the strongest possible evidence that the
  diagnosis was wrong, and the next reader should say so rather than reaching for a timeout.
- **`act` is not free of its own assumption.** It flushes React's work loop, so it covers a stub
  that resolves in microtasks or in an already-queued macrotask. A stub that resolved on a real
  timer would still need the timer to fire, and `act` would return before it did. Every stub in
  `src/testing/` resolves immediately, so this holds today — for a `setTimeout`-based fake it would
  not, and the answer there is fake timers or an explicit deferred, not `act`.
- **Nothing prevents the regression at review time.** A new `waitFor` over a two-step stub sequence
  passes lint, and the flake it reintroduces surfaces weeks later on a loaded runner. A lint rule
  is plausible (`eslint-plugin-testing-library` is not installed) but it cannot tell a one-round
  wait from a two-round one, which is the distinction that matters.
- **The 3× oversubscription stress run is weak evidence.** Six green runs of a test that was green
  before the change proves nothing about the flake. The determinism argument rests on §2.2 — no
  deadline in the test — not on the stress run.

---

## 6. For the next slots

**For the integrator.** This is one test file and one test, cut from `main`, with no production
change; it should merge in any order against C3 and the unlock-grant work. The only conflict
surface is `HomePage.test.tsx` itself and its import line, which now takes `act` from
`@testing-library/react`.

**For whoever owns test hygiene next.** The rule worth generalising is narrow enough to apply
mechanically: when a test needs **two or more** rounds of a stub to resolve, drive it through `act`
rather than stacking async utilities, because each one is an independent wall-clock deadline and the
work they are waiting on is not on a clock. One round with a `findBy*` is fine and reads better;
that is why fifteen tests in this file were left alone. Converting the sibling paging tests is a
mechanical follow-up if it is wanted, and `renderSettled` in `src/testing/render.tsx` is where the
idiom would live if it becomes common.

**For whoever sees this test flake again.** Do not raise the timeout and do not add a retry. There
is now no deadline in it, so a failure is a real one: read the assertion, because the append is
either not landing or is clobbering the list.
