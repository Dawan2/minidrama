# W9 — C3 integration, executed

> **Slot:** W9, integration slot (cycle C3).
> **Branch:** `cursor/integrate-c3-ebb3`, fast-forwarded onto `main`.
> **Base:** `main` at `bcfb015` ("Record the landing: main holds the product and CI is green on it").
> **Pull request:** none opened, at any point. `docs/plan/wave-protocol.md` §8 rule 3.
> **Predecessor:** `docs/handoff/w6-integrate.md` (C2). Where this document and that one describe
> the same file, C2 is the earlier state and this is the current one.

---

## 1. Where it got to

`pnpm verify` exits 0 on `main`. **2,137 tests pass** across 114 files, none skipped:

| Package | Test files | Tests |
|---|---:|---:|
| `server` | 53 | 1,314 |
| `app` | 54 | 727 |
| `packages/shared` | 4 | 51 |
| `packages/config` | 3 | 45 |

The server serves **20 operations**, all documented and all reachable — `contract.test.ts` asserts
both directions, so neither an undocumented route nor a documented one nobody registered can pass.

Three things are true of the product now that were not true at `bcfb015`:

- **Requests carry a session.** The client attaches `Authorization` in one place, drops a token the
  server has refused, and cannot be talked into sending a caller-supplied credential.
- **The favourites screen is end-to-end.** It reads `GET /v1/users/me/favorites` — a real paged
  endpoint — instead of fanning out one per-drama probe per candidate drama.
- **A paid unlock grants the episode.** Before this, an order could be paid and nothing became
  playable.

---

## 2. The merge sequence as executed

`pnpm verify` was required green after every step. Every branch below is an ancestor of `main`.

| # | Merge | Conflicts | Result |
|---|---|---:|---|
| 1 | `w7-work-auth-header-96d6` | 3 | The A7 `http.ts` collision. Composed — §3.1 |
| 2 | `w8-work-favorites-list-a666` | 3 + a bad rename | Redone by hand — §3.2 |
| 3 | `w8-work-session-viewer-bc30` | 5 | Mostly already on `main` — §3.3 |
| 4 | `w8-work-favorites-consume-e20d` | 1 | The client half of step 2 — §3.4 |
| 5 | `w9-work-unlock-grant-5224` | 1 | Arrived mid-run — §3.5 |

Steps 1–4 are the branches this slot was given. Step 5 was given conditionally ("if already on
origin"); it was not on origin when this run started and was by the time step 4 landed, so it was
taken.

---

## 3. The five merges

### 3.1 `w7-work-auth-header-96d6` — compose, do not choose

The predicted collision, and the only one where both sides had moved in the same functions. The
branch forked before `main` grew an idempotent write verb and four more API clients; `main` never
had the session. Both survive:

- **`http.ts`** keeps `send`, `withRetry` and the capability-split interfaces, and gains the
  per-attempt bearer, the caller-`Authorization` strip and the `401` invalidation.
- **One deliberate change to the branch's logic.** The invalidation now sits *above* the `204`
  shortcut rather than below it. `main` added an early return for a write whose success has no body,
  and a refused credential arriving on a favourite write would have returned through it unnoticed —
  a session that expires between opening the app and favouriting a drama would have survived in
  memory as a token every later request kept presenting. There is a test for this ordering.
- **`main.tsx`** builds all five API clients from `transports.http`, so the history and favourites
  reads travel with a session rather than earning an anonymous `401`.
- **The `SessionProvider` seam is filled.** `auth/session.ts` said in a comment that replacing its
  one anonymous value with a stateful session was the whole of the client wiring the identity slot
  needed. This is that slot, so it is wired. `state` reads through to the store rather than being
  snapshotted at boot: a snapshot goes stale the moment the in-place retry in `SignInPrompt`
  succeeds, and the profile screen would keep calling a signed-in viewer a guest.
- **`createSessionApi` narrows to `HttpPoster`.** It was the only client asking for the whole
  `HttpClient`, which is what broke `typecheck` once `send` existed. Every sibling already narrows;
  this follows them rather than widening the test doubles.

### 3.2 `w8-work-favorites-list-a666` — git matched the wrong file

The expensive one, and not because of the conflicts git reported.

The branch forked when favourites lived in `server/src/modules/discovery/`. C2 renamed that whole
module to `search/` and gave the `discovery/` name to a recommendation feed that has nothing to do
with it. Git followed the rename for the files the branch *modified* — `favorites.ts`,
`validation.ts` and their tests all landed correctly in `search/` — but not for `routes.ts`, because
a file already existed at that path on both sides. So it content-merged the favourites routes
against the feed routes and produced a conflict whose two halves were unrelated files.

**A `--ours`/`--theirs` resolution of that conflict would have been wrong either way**, and it would
have compiled: taking `ours` silently drops the endpoint, taking `theirs` silently deletes the feed.
It was redone by hand instead:

- `discovery/routes.ts` restored to the feed;
- the branch's three new files (`favorites-cursor.ts` and its tests, the list route suite) moved to
  `search/`;
- the list handler applied to `search/routes.ts`, rewritten onto the seam A1 settled on —
  `requireViewer` / `sendViewerRefusal` over `entitlement/viewer-resolver` — instead of the branch's
  own `viewerResolver.resolve(...)` plus a local `refuse`;
- the route suite switched to `progress/test-sessions.ts`'s double, which carries the same two
  sessions (`tok_a` → `user_a`, `tok_b` → `user_b`) the branch had written its own double for.

Two more reconciliations, both of the "one schema per name" kind C2 started:

- **`PageInfo`.** The branch defined one in `packages/shared/src/discovery.ts` and said in its own
  comment that the next list endpoint must reuse the shape rather than define a twin agreeing by
  coincidence. `GET /v1/dramas` landed first with `PageInfo` in `catalog.ts`, so the branch's copy
  is dropped and `discovery.ts` imports it. The two were structurally identical; left alone they
  were a `TS2308` ambiguous re-export.
- **The contract.** The branch re-added `/v1/progress/episodes/{episodeId}` from its fork point.
  `main` already had a reconciled version of it, and two blocks under one key is not valid OpenAPI.
  Only the new `/v1/users/me/favorites` block was taken.

### 3.3 `w8-work-session-viewer-bc30` — most of it was already here

Fourteen commits, and every file under `modules/unlock/` and `modules/platform-tiktok/` merged
byte-identically: C2 landed slot K and the session-viewer work as rebased commits with different
SHAs, so `main` had the code without having the history. What was genuinely missing was the
evidence and the record — `session-orders.test.ts` (which is what separates "the route refused a
credential" from "the data layer never saw one"), the app-level test that a presented-but-unissued
token is a `401` rather than a `503`, and the W2-K and W8 handoff documents.

Where the branch's fork-point copies disagreed with `main`, `main` won, because those disagreements
are exactly what C2 reconciled: the contract keeps the `ViewerAccess` that includes `UNAVAILABLE`
over the branch's narrower twin, and `errors.ts` keeps `COMMON_ORIGIN_NOT_ALLOWED` and
`PROGRESS_INVALID_POSITION`, which the branch predates.

One comment was composed rather than chosen. `main` explains why one store both issues and resolves
sessions; the branch explains why one *resolver* matters most for a coin order — an order is
attributed to whatever it resolves to and a payment is later correlated against that same account
id, so a second resolver would not be a wiring inconsistency but a purchase recorded for the wrong
viewer. Both sentences are in `app.ts` now.

### 3.4 `w8-work-favorites-consume-e20d` — the client half

One conflict, in the test's transport import. `favorites-api.ts` keeps `main`'s narrowed
`HttpReader & HttpWriter` — the list read is a `getJson` and needs nothing wider — so the suite's two
`HttpClient['getJson']` annotations follow it. `favorite-candidates.ts` is deleted along with the
fan-out it existed for.

This is the step where the three preceding merges become one feature: the client asks for the path
the server started serving in §3.2, and after §3.1 the request carries the session that endpoint
refuses without.

### 3.5 `w9-work-unlock-grant-5224` — arrived mid-run

One conflict, in `app.ts`, composed. The branch rewrote the facts-port wiring and in doing so
dropped the clause about two things resolving sessions and the four store defaults `main` had added
since it forked. Kept: `main`'s full comment and every import, plus the branch's join of the
configured entitlement facts with the unlock records a verified payment writes.

---

## 4. What is not merged

**`cursor/w9-homepage-flake-c44e`** — one commit, one file, "Take the clock out of the
append-failure feed test". Deliberately left alone: it is a live sibling slot's work rather than a
deferred branch, and it was not in this slot's list.

It should be merged next, and this run has evidence for why. `src/routes/HomePage.test.tsx > feed
paging > keeps the loaded cards when the next page fails` **failed once** here, during the §3.2
verify, on a merge that touched only the server, the contract and `packages/shared`. It passed on
three consecutive re-runs of that file alone and on every later full verify. It is a genuine flake
in a timing-dependent test and not a regression from any merge in this cycle — but until that branch
lands, a red `pnpm verify` on `main` may mean nothing at all, which is the property an integration
gate cannot afford.

Every other `cursor/*` branch on origin — 47 of the 48 — is an ancestor of `main`.

---

## 5. Two things worth carrying forward

**A conflict git reports is not the same as a conflict git found.** §3.2 is the case that matters:
the reported conflicts were resolvable and the real problem was a file pairing that was wrong before
any resolution began. The signal was that the two halves of the conflict were about different
subjects — feed pagination on one side, favourite state on the other. When that happens, check the
rename detection before editing anything, because both mechanical resolutions compile and one of
them silently deletes a feature.

**Composition sometimes has a correct order, not just a correct union.** §3.1's `401` invalidation
is the example: putting both pieces in the same function is not enough, because `main`'s early
return would have swallowed the branch's check for one whole class of request. Merging two changes
to the same function means asking what the *other* side's control flow now does to yours.
