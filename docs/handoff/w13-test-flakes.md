# Handoff — Wave 13: the remaining two-round paging tests no longer race a clock

> **Slot:** W13, work slot. One branch, no pull request.
> **Branch:** `cursor/w13-work-test-flakes-a44c`, cut from `main` at `d830d1d`. Merged `origin/main`
> at `fb2b967` (CoverImage) before landing; git reported no conflicts.
> **Scope:** `app/src/testing/render.tsx` (`renderSettled` / `settle`) and the ten two-round paging
> tests across `HomePage.test.tsx`, `HistoryPage.test.tsx`, `FavoritesPage.test.tsx`,
> `DramaPage.test.tsx`. No production code. Test count unchanged.
> **Not in scope:** CoverImage product wiring, silent re-login, `cursor/w11-plan-cycle-3-93ab`.
> No skip, no retry, no raised timeout. No pull request.

---

## 1. The defect

`docs/verify/cycle-2-report.md` D-10 (W10, `cursor/w10-verify-cycle-2-7b17`) and Cycle 3 Tier 0
item 1: seven two-round page tests still stacked `findBy*` / `waitFor` after W9 converted an eighth.
W9's diagnosis in `docs/handoff/w9-work-homepage-flake.md` is right and was not redesigned. `findBy*`
and `waitFor` are the same mechanism — a 1,000 ms wall-clock deadline, a 50 ms poll, a
`MutationObserver`. A test that needs two rounds of a stub consumes two independent deadlines back
to back with a synchronous `fireEvent` between them. A vitest worker the OS deschedules spends the
budget without being given CPU. The stub resolves in a microtask, so the update sits outside any
`act` the test controls.

W9's K4 claimed the sibling `feed paging` tests "each need only one round of the stub". They need
two. The stub is `request.cursor === undefined ? ok(page([…], 'cur_2')) : …` — first page, then
append. That is the same shape as the test W9 fixed.

### 1.1 Evidence the class is load-dependent, not a product regression

| Event | Result |
| --- | --- |
| GitHub Actions run 33105322586 on `67cac3b` (the W9 flake merge) | `HistoryPage.test.tsx > history paging > offers a sign-in under the loaded rows when a later page loses the session` — unable to find `history-sign-in-more`. Same commit green at rest |
| W10 local saturation | `HomePage.test.tsx > feed paging > appends the next page…` — expected 2 cards, got 1 |
| W13 CoverImage merge, first `pnpm verify` on `8e3c2aa` (`docs/handoff/w13-merge-cover-image.md` §4.1) | `FavoritesPage.test.tsx > paging the list > asks for a session under the rows when a further page answers 401` — unable to find `favorites-sign-in-more`, 1,025 ms, first page still showing `load-more-favorites`. Retry green. CoverImage's own 27 tests passed in the failing run |

Green-then-red-then-green across adjacent commits is the definition of the flake. Three of the
seven D-10 tests have now failed independently. The list-keeping and append behaviour they assert
is not in doubt — `use-paged-resource.test.ts` covers the same rules at the hook with `act`.

---

## 2. What changed

The helper W9 named and deferred lives in `app/src/testing/render.tsx`:

```tsx
await renderSettled(<HistoryPage />, { historyApi });
await settle(() => {
  fireEvent.click(screen.getByTestId('load-more-history'));
});
expect(screen.getByTestId('history-sign-in-more')).toBeDefined();
```

`renderSettled` is `renderSurface` inside `act`. `settle` is `act` for the click (and for local
wrappers such as `renderFavorites` / `renderDrama`). Each call returns when React has run out of
work: it awaits the callback, drains the microtask queue, and flushes the work loop until nothing
is pending. There is no deadline in that. Assertions after it are synchronous `getBy*`, so a genuine
regression reports immediately instead of after a second of polling.

One-round tests in the same files keep `findBy*`. That idiom reads better and is not this class of
exposure — W9 §6 and C3-02 both say so. The reasoning is stated once per file, on the paging
`describe`, not copied onto every test.

### 2.1 Tests converted

D-10's seven, plus the three structural twins C3-02 counted that the mechanical `findBy*`+`waitFor`
query missed (they used two `findBy*` instead, which is the same two deadlines):

| File | Test | Was |
| --- | --- | --- |
| `HistoryPage.test.tsx` | `offers a sign-in under the loaded rows when a later page loses the session` | failed in CI on `main` |
| `HistoryPage.test.tsx` | `appends the next page and stops offering more when the cursor runs out` | D-10 |
| `HistoryPage.test.tsx` | `keeps the loaded rows when the next page fails` | D-10 |
| `HomePage.test.tsx` | `appends the next page and stops offering more when the cursor runs out` | reproduced by W10 |
| `HomePage.test.tsx` | `drops a drama the feed has already shown` | D-10 |
| `HomePage.test.tsx` | `keeps the loaded cards when the next page fails` | already `act`; moved onto the helper |
| `DramaPage.test.tsx` | `appends a further page of episodes` | D-10 |
| `FavoritesPage.test.tsx` | `appends the next page with the cursor the server handed back` | D-10; named by W12 §6 |
| `FavoritesPage.test.tsx` | `keeps the rows on screen when a further page fails` | two `findBy*`; C3-02 |
| `FavoritesPage.test.tsx` | `asks for a session under the rows when a further page answers 401` | failed CoverImage's first verify |

Ten paging tests, four files. No assertion weakened, removed, or made conditional. No test added or
deleted.

Not converted, on purpose: retry, sign-in, and unlock-confirm interactions. C3-02: those are a
wider class (23 call sites) and not the structural twins — the click target exists without a first
server round, or the second wait is a different fact. Do not global search-and-replace.

### 2.2 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages |
| Tests | `pnpm test` | **2,137 passing on the branch tip before CoverImage merge; 2,163 after**, 0 skipped, 0 failing |
| Four files × 20 | `vitest run` Home/History/Favorites/Drama | **85/85, twenty times out of twenty** |
| App suite × 6 at oversubscription | 6 concurrent `vitest run` on 4 cores | **727 passing, six times out of six** (pre-CoverImage count) |
| Full gate | `pnpm verify` | pass, including build and `check:guardrails` |

Test count is unchanged by this slot: CoverImage added 26 on `main` after the branch was cut; this
slot rewrites tests, it does not add or remove any. No test was skipped. No timeout was raised.

### 2.3 Proved by mutation, and proved deadline-free

The W9 mutation was re-applied to `use-paged-resource.ts` so an append failure clobbers the list:

```diff
-  : { ...previous, appending: false, appendError: classifyFailure(result.error) },
+  : { ...EMPTY, status: 'failed', error: classifyFailure(result.error) },
```

| Test | Result | Time to fail |
| --- | --- | --- |
| `HomePage.test.tsx > keeps the loaded cards when the next page fails` | **fails** — `Unable to find an element by: [data-testid="feed-card"]` | 54 ms |
| `HistoryPage.test.tsx > keeps the loaded rows when the next page fails` | **fails** — `Unable to find an element by: [data-testid="history-row"]` | 59 ms |

No deadline is waited out. The mutation was reverted before this document was written. This is what
separates a test that was made deterministic from a test that was made to pass.

---

## 3. Decisions

Numbered `L*` to avoid colliding with K* (W9 flake), and the earlier slots' lettered series.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| L1 | **`renderSettled` / `settle` in `src/testing/render.tsx`** | W9 K4 deferred the helper because the idiom was one test. Spreading it across ten tests without a helper would copy `act` ten times and invite the next tidy-up to put `findBy*` back. The location is the one W9 §6 named | Delete the two functions, inline `act` |
| L2 | **Paging two-round tests only** | The structural twin is a click whose target exists only after the first stub round. Retry and sign-in are a different shape; converting them would be the global search-and-replace C3-02 forbids | Convert a retry test the same way |
| L3 | **The two FavoritesPage `findBy*`+`findBy*` paging tests converted too** | D-10's mechanical count required both `findBy*` and `waitFor`. Two `findBy*` is the same two budgets. One of them failed CoverImage's first verify. Leaving them would close D-10 on paper and leave the class open | Restore `findBy*` |
| L4 | **W9's already-fixed HomePage test moved onto the helper** | Leaving it as inline `act` while its two siblings use `renderSettled` is an invitation to "tidy" the helper calls back to `findBy*` | Restore the inline `act` |
| L5 | **Assertions are synchronous `getBy*`** | After `settle` the state is committed. A trailing `findBy*` would be a deadline guarding a condition already true — the construct that caused this, kept as decoration | Swap back |
| L6 | **No skip, no retry, no raised `asyncUtilTimeout`** | W9 K7. A retry would make `main` green while removing the last reason to trust it | Add `retry: 1` |
| L7 | **CoverImage / silent-login / the W11 plan were not touched** | In flight, then CoverImage landed on other files. This slot's paths do not overlap `CoverImage.tsx`, `import-hygiene.test.ts`, `silent-login.ts`, or `transports.ts` | — |

---

## 4. Deliberately not done

- **No production code.** `use-paged-resource.ts` was mutated only to prove the tests still catch
  the regression (§2.3) and restored via `git checkout`.
- **No vitest config change.** Timeouts, pool, and worker count are as they were.
- **Retry, sign-in, and unlock-confirm tests were not converted** (L2).
- **No lint rule.** `eslint-plugin-testing-library` is not installed, and a rule still cannot tell a
  one-round wait from a two-round one. The helper is the mechanical guard.
- **The W11 plan was not edited.**

---

## 5. Known gaps in this slot's own work

- **The wider class is still in the files.** Twenty-one tests still use both `findBy*` and `waitFor`
  in one body. Seven of those were the D-10 floor; the rest are one-round-then-retry or similar.
  They can flake the same way. The next conversion, if wanted, is the same helper, not a timeout.
- **`act` still assumes a synchronously resolving stub.** Every stub in `src/testing/` does. A
  `setTimeout`-based fake would need fake timers or a deferred, not `act`.
- **Nothing prevents a new two-round `waitFor` at review time.** Same gap W9 named. The helper
  exists now; using it is still a convention.
- **The oversubscription run is weak evidence on its own**, as W9 §5 said of its own. The
  determinism argument is §2.3 — no deadline left in the converted tests — not the six green runs.

---

## 6. For the next slots

**For the integrator.** Five test/helper files plus this document, no production change. CoverImage
is already on `main` and does not share a path. Silent re-login (`transports.ts`, `main.tsx`,
`silent-login.ts`) is not touched. Fast-forward may not be available because CoverImage landed after
the fork; a merge is the same shape as W11's flake merge.

**If a converted test goes red.** There is no deadline left in it. Read the assertion. Do not raise
the timeout and do not add a retry.

**If FavoritesPage goes red on `main` before this lands.** `docs/handoff/w13-merge-cover-image.md` §5
and §8 already say it: that is this class, not a CoverImage regression. Merge this branch.
