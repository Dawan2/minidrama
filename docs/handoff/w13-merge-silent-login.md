# W13 — silent re-login, merged onto main

> **Slot:** W13, merge slot. One branch, two commits, no conflicts, no pull request.
> **Branch:** `cursor/w12-work-silent-login-97cf`, merged onto `main` as `a6a0404`.
> **Parents:** `ba4bfb3` (`main`, "Merge origin/main: cycle-docs merge handoff filled in; no
> overlap") and `cf80ddb` (the branch tip, "Write up the silent re-login slot: the bound, and why
> it is not a timer").
> **Base:** `main` at `ba4bfb3`, after a fast-forward from the stale local `bcfb015`. The branch
> itself was cut from `d830d1d`.
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Predecessor:** `docs/handoff/w12-work-silent-login.md`, which is the work this merge lands, and
> `docs/handoff/w13-merge-cycle-docs.md`, which is what `main` held when this slot started.
> **Already on `main`:** `ERROR_OUTCOMES` (`9b06c18` / `0a46e77`). This slot did not open
> `paid-trade-orders.ts` or its test.
> **Not merged:** `cursor/w13-work-veplayer-replace-72c4`, which appeared on origin while verify
> ran. Empty overlap; left alone. Cycle-3 next had not published a branch.
> This slot adds this document and nothing else of its own.

---

## 1. Where it got to

**`cursor/w12-work-silent-login-97cf` is an ancestor of `main`.** C3-01 is closed: a `401` on a
request that carried a token still drops that token, and now also starts a bounded silent re-login
so the *next* request can carry a session. The refused request is not replayed. The budget refills
only on a `2xx` that presented a token (`onCredentialAccepted`). Concurrent `401`s fold into one
attempt. `PLATFORM_UNAVAILABLE` gives up for the rest of the visit. Recovery is a required option
on the session transport.

`pnpm verify` exits 0 on `main` after one try, **2,197 tests across 117 files, none skipped**. That
is 30 more tests and one more file than the silent-login work slot added on top of `ba4bfb3`'s app
count (753 → 783, 55 → 56 files), plus the four `ERROR_OUTCOMES` membership tests already on the
`main` this merge started from.

The whole effect of the merge on `main`:

| File | Change |
| --- | --- |
| `app/src/session/session-recovery.ts` | New. The policy: may another login run now, and what happened when it did |
| `app/src/session/session-recovery.test.ts` | New, 18 tests, including the loop this exists to make impossible |
| `app/src/session/silent-login.ts` | A named `SilentLogin` type for the shared login. No behaviour change |
| `app/src/data/http.ts` | `onCredentialAccepted`, the mirror of `onCredentialRefused` |
| `app/src/data/http.test.ts` | Six tests for the accepted-credential hook |
| `app/src/data/transports.ts` | Split into `createLoginTransport` and `createSessionTransport`; `createTransports` is gone; the session transport re-acquires as well as dropping |
| `app/src/data/transports.test.ts` | Rewritten around the two builders; the old "no header after refusal" case replaced |
| `app/src/main.tsx` | Four-call boot wiring, in dependency order: login transport → silent login → recovery → session transport |
| `docs/handoff/w12-work-silent-login.md` | New, the work slot's own record |

Nothing under `packages/`, `server/`, or any other module under `app/src/` changed. The `401`
check still sits above the `204` shortcut (A7 / C3 §3.1). Rule 4 still excludes `POST` from
automatic retry.

---

## 2. Fast-forward was asked for and was not available

The branch was two commits ahead of its fork at `d830d1d`. `main` had since taken CoverImage, the
paging-flake tests, `ERROR_OUTCOMES`, the cycle-2 report and the cycle-3 backlog, and reached
`ba4bfb3`, so the two had diverged and `git merge --ff-only` would have refused.

A merge commit was taken rather than a rebase. Rebasing would have rewritten a branch that is
already on origin and already described by its own handoff document, to save one commit. That is
the same reason W11 §2, W12 §4, and W13 CoverImage §2 gave.

**Git resolved it with no conflicts at all.** That was predicted before running it, by asking what
`main` had done to the branch's nine paths since the merge base:

```
git diff --stat d830d1d origin/main -- \
  app/src/data/http.test.ts \
  app/src/data/http.ts \
  app/src/data/transports.test.ts \
  app/src/data/transports.ts \
  app/src/main.tsx \
  app/src/session/silent-login.ts \
  app/src/session/session-recovery.ts \
  app/src/session/session-recovery.test.ts \
  docs/handoff/w12-work-silent-login.md
```

which is empty. `main`'s work since `d830d1d` is CoverImage, flakes, `ERROR_OUTCOMES`, and two
documents. None of those paths are this branch's. `git diff HEAD^1 HEAD` on the merge is exactly
the union of the two commits — 1,190 insertions, 82 deletions, nine files.

The keep-list this slot was given is therefore the branch as its author wrote it, not a hand
composition. Confirmed on the merged tree:

| Required behaviour | Where it lives |
| --- | --- |
| No replay of refused POSTs | `transports.ts` does not await the login and does not re-`fetch`; `does not repeat the request that was refused` |
| Budget refilled only by 2xx with a token (`onCredentialAccepted`) | `http.ts` fires the hook on `response.ok` after a presented bearer; `credentialAccepted` assigns `attemptsLeft = maxAttempts`; `cannot loop against a server that issues tokens and then refuses them` |
| Concurrent 401s fold | `credentialRefused` returns `ATTEMPT_IN_FLIGHT` while `inFlight !== null`; `folds the refusals that arrive while an attempt is running into that attempt` |
| `PLATFORM_UNAVAILABLE` gives up | `noPlatformLogin` is set once and never unset; `gives up permanently when the platform cannot log in at all` |
| Required recovery on session transport | `SessionTransportOptions.recovery` has no `?` |
| Tests that replaced the old "no header after refusal" case | `sends the re-acquired session on the next request`. The old name is gone |

`createTransports` has no remaining call site under `app/src/`.

---

## 3. In-flight work, left alone

Two other slots were named as things this merge must not overwrite. Neither had changed a
silent-login path on `origin/main`. `origin/main` did not move during this slot.

| Slot | Origin branch | Overlap with silent-login's nine files |
| --- | --- | --- |
| VePlayer replace-element (`bc-f269a2f6`) | `cursor/w13-work-veplayer-replace-72c4` appeared on origin *during* this slot, two commits (`a38710e`, `833cea2`), cut from `ba4bfb3` | empty. It edits `tiktok-bridge.ts`, `video-replace.ts` and its test, `import-hygiene.test.ts`, `bundle-scan.test.ts`, `source-rules.ts` and its test, and `docs/handoff/w13-veplayer-replace.md` |
| Cycle-3 next (`bc-3439f016`) | none published | — |

The VePlayer branch was not merged, rebased, or edited. When that slot (or a later merge slot)
lands it, the compose is theirs: this merge did not touch a line of those eight files, so a merge
of `833cea2` onto this `main` should be as clean as this one was.

If cycle-3 next later lands on paths this merge also touched, keep both behaviours. Silent-login
is the session transport and the recovery policy; VePlayer is the player surface; those are not
the same functions.

`ERROR_OUTCOMES` was already an ancestor of `ba4bfb3`. Untouched, as instructed.

---

## 4. Verification

`pnpm verify` on the merge commit `a6a0404`, first try, exit 0. No retry.

| Gate | Result |
| --- | --- |
| `pnpm format:check` | pass |
| `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm typecheck` | pass, 4 packages |
| `pnpm test` | pass — **2,197 tests, 117 files, 0 skipped, 0 failing** |
| `pnpm build` | pass — `dist/assets/index-DkF6VgNH.js` 308.38 kB (gzip 96.08 kB); CSS 10.23 kB unchanged |
| `pnpm check:guardrails` | pass, against `app/dist` |

| Package | Test files | Tests |
| ---: | ---: | ---: |
| `server` | 54 | 1,318 |
| `app` | 56 | 783 |
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |

App went 753 → 783 (+30) and 55 → 56 files (`session-recovery.test.ts`). Server stayed at the
`ERROR_OUTCOMES` count (1,318 / 54). FavoritesPage paging, including the 401-append case that
failed CoverImage's first verify, passed in this run.

The work slot's own suites on this tree: `session-recovery.test.ts` 18, `transports.test.ts` 13,
`http.test.ts` 53 (six of them the new accepted-credential hook).

---

## 5. What is not merged

One `cursor/*` tip on origin is not an ancestor of `main`, and was left that way:

| Branch | Why it stayed off `main` |
| --- | --- |
| `cursor/w13-work-veplayer-replace-72c4` | In-flight work this slot was told not to overwrite. Two commits, eight files, no silent-login overlap |

Every other `cursor/*` branch on origin is an ancestor of `main`, including
`cursor/w12-work-silent-login-97cf`. Cycle-3 next (`bc-3439f016`) has not published a branch.

```
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/cursor); do
  git merge-base --is-ancestor "$b" main || echo "NOT MERGED: $b"
done
```

prints `NOT MERGED: origin/cursor/w13-work-veplayer-replace-72c4`.

---

## 6. Reading the document this merge brought in

`docs/handoff/w12-work-silent-login.md` is a slot record and is on `main` as its author wrote it.
Two of its statements are about the branch at its fork point and are not claims about `main`
after this merge:

- **"Nothing was merged and no pull request was opened."** True of the work slot. The branch was
  merged later, by this document;
- **"2,167 passing"** on a tree cut from `d830d1d`. `main` now holds more tests than that, because
  CoverImage, flakes, and `ERROR_OUTCOMES` landed in the meantime. The +30 this branch added are
  still the +30.

Neither was edited. Rewriting another slot's record to match the tree it landed in is how a
handoff stops being evidence of anything.

---

## 7. For the next slot

**C3-01 is closed.** `docs/plan/cycle-3-backlog.md` still records it as open against `2b66323`.
That document was not rewritten here. The five acceptance commands in its §C3-01 hold on `main`:

1. A `401` that carried a token drops it and starts at most one silent login; the refused request
   still fails.
2. Concurrent refusals produce one `bridge.login()` call.
3. The sequential case terminates — a token-refusing server gets three logins, then `BUDGET_SPENT`.
4. No `POST` is replayed. Rule 4 tests still pass.
5. `pnpm verify` green.

**The next cycle-3 item is not this merge's.** If `bc-3439f016` is implementing C3-01 against the
pre-merge tree, it will conflict on `transports.ts` / `http.ts` / `main.tsx` / `silent-login.ts`.
Compose: keep the recovery, the accepted-credential hook, and the no-replay rule; keep whatever
else that slot added.

**VePlayer `setValidateVideoReplaceElement` is still open** (`C3-10` SR-5 / D-06). This merge did
not open a player file or a bundle-scan file.

The work slot's own remaining gaps still hold: no replay of GETs either, no observable session, no
weak-network banner, a straggling `401` can still `clear()` a fresher token. See
`docs/handoff/w12-work-silent-login.md` §5 and §8.
