# Handoff — Wave 4, Work Slot Q: the watch-history list

> **Branch:** `cursor/w4-work-q-8f92`, cut from `cursor/w3-work-n-bea1` (`159840f`).
> **Scope:** `GET /v1/users/me/watch-history`. The history screen shipped in W3 slot M calls it and
> gets `404`, because there is no progress module on this branch at all. This slot brings that module
> in from the slot that owns it, gives it a session it can actually resolve, teaches its store to
> list a viewer's rows, and adds the list endpoint on top — with the three answers that screen draws
> three different states from kept strictly apart.
> **Not in scope:** the `catalog` module (asked for through a port instead), the per-drama progress
> read, the continue-watching card, and `DELETE /users/me/watch-history/{dramaId}`. `app/` is
> untouched — the built bundle still hashes `index-B_KnFxaH.js` — as are the CORS policy
> (`server/src/core/`) and `packages/config`. No pull request was opened.

---

## 1. The problem this slot had to solve

`app/src/routes/HistoryPage.tsx` and `app/src/data/history-api.ts` exist on `cursor/w3-work-m-9b99`
and call `GET /v1/users/me/watch-history`. On every branch that has a server, that path reaches the
not-found handler. The client's own docstring says so and says it must not render as a client bug
(`docs/handoff/w3-work-m.md` §5, on that branch).

The endpoint cannot be written by itself, and the reason is worth stating because it shaped most of
this slot. A history row is a **drama** — a cover, a title, "continue episode 12" — and the data that
would produce one is spread across three modules that are each in flight somewhere else:

| Needed | Owner | State on this branch before the slot |
|---|---|---|
| The stored positions | `progress` (W2 slot G) | Absent. No module, no store, no rules |
| A session that resolves to a user | `identity` (W3 slot L) | Present but inert: `createSessionIssuer` minted a random token and forgot it |
| Episode → drama, and the drama's summary | `catalog` (W3 slot M) | Absent |

So the slot had to decide, three times, between waiting and inventing. It waited for none of them and
invented none of them: two are **copied from the slots that own them**, and the third is a port with
a refusing default.

### 1.1 The shape to design against

The obvious failure is a `404` that stays a `404`. The failure that matters is subtler, and it is the
one this endpoint is built around: **answering an empty list to a request that could not be
identified.**

That version passes a naive test suite, renders a clean screen, and tells a viewer who has watched
forty episodes that they have never watched anything. A viewer who believes that stops looking. It is
also indistinguishable, in a log, from the honest empty list — which is why the distinction is
asserted five separate ways below rather than left to a reviewer's attention.

There are three honest answers and they are three different screens in the client:

```
  Authorization header?  ── absent, or not a bearer credential ──▶ 401 AUTH_REQUIRED
          │
     resolves to a user? ── no ──▶ 401     (a token nothing issued)
          │                  ── store is down ──▶ 503
        yes
          │
   query readable? ── no ──▶ 400           (limit=abc, a cursor we did not mint)
          │
   any progress rows for this viewer? ── none ──▶ 200 { items: [], pageInfo: … }
          │                                       ← the catalogue is never asked
        some
          │
   catalogue describes them? ── refuses ──▶ 503
          │
        yes ──▶ 200, one row per drama, newest first, Cache-Control: private, no-store
```

The lazy catalogue call on the second-to-last line is load-bearing, not an optimisation. It is what
makes `401` and `200 []` distinguishable **on a deployment where nothing is wired** — which is every
deployment today, and the state the client's three screens are tested against.

---

## 2. What was delivered

### 2.1 Brought in from the slots that own it

Copied so that the definitions cannot drift and so that a later merge is a no-op rather than a
reconciliation. The four files marked *byte-identical* were not edited at all.

| File | From | State |
|---|---|---|
| `packages/shared/src/progress.ts` | `w2-work-g-d191` | byte-identical |
| `server/src/modules/progress/progress.ts` | `w2-work-g-d191` | byte-identical |
| `server/src/modules/progress/progress.test.ts` | `w2-work-g-d191` | byte-identical (38 tests) |
| `packages/shared/src/catalog.ts` | `w3-work-m-9b99` | byte-identical |
| `packages/shared/src/catalog.test.ts` | `w3-work-m-9b99` | byte-identical (3 tests) |
| `server/src/modules/identity/session-store.ts` | `w3-work-l-8551` | byte-identical |
| `server/src/modules/identity/session-store.test.ts` | `w3-work-l-8551` | byte-identical (31 tests) |
| `server/src/modules/identity/session-viewer-resolver.ts` | `w3-work-l-8551` | byte-identical |
| `server/src/modules/identity/session-viewer-resolver.test.ts` | `w3-work-l-8551` | byte-identical (14 tests) |
| `server/src/modules/progress/store.ts` | `w2-work-g-d191` | + `list(userId, limit)` |
| `server/src/modules/progress/store.test.ts` | `w2-work-g-d191` | + 6 cases for `list` |
| `server/src/modules/progress/routes.ts` | `w2-work-g-d191` | 30 lines: resolves viewers through the shared seam |
| `server/src/modules/progress/routes.test.ts` | `w2-work-g-d191` | its resolver double, and one regex |
| `server/src/modules/identity/routes.ts` | `w3-work-l-8551` | one comment sentence (see §5) |

### 2.2 New in this slot

| File | Contents |
|---|---|
| `packages/shared/src/watch-history.ts` | `WatchHistoryEntry`, the wire row, and why it carries five fields where the contract lists four |
| `server/src/modules/progress/catalog-port.ts` | `WatchHistoryCatalogPort` + the refusing default |
| `server/src/modules/progress/history.ts` | The projection: grouping, ordering, the cursor codec, query validation. All pure |
| `server/src/modules/progress/history-routes.ts` | The endpoint |
| `server/src/modules/progress/viewer.ts` | `requireViewer` — the narrowing that turns "anonymous" back into a refusal — and one refusal table for the module |
| `server/src/modules/progress/fixtures.ts` | A fixture catalogue built on the *entitlement* fixture world |
| `server/src/modules/progress/test-sessions.ts` | A two-session resolver double for this module's tests |
| `server/src/modules/progress/history.test.ts` | 37 cases on the projection, the cursor and the query |
| `server/src/modules/progress/history-routes.test.ts` | 27 cases over HTTP, grouped by the three answers |
| `server/src/modules/progress/catalog-port.test.ts` | 8 cases: the default refuses, the fixture agrees with the entitlement world |
| `server/src/modules/progress/viewer.test.ts` | 4 cases on the narrowing |
| `server/src/app.ts` | Registers `progressRoutes` and `watchHistoryRoutes`; one session store; one progress store |
| `contracts/openapi.yaml` | The two progress paths, this one, `DramaSummary`/`PageInfo`/`WatchHistoryEntry`, and `bearerSession` |

**Tests: 202 net new** (207 added, 5 deleted with `identity/session.test.ts`). **846 passing, 0
skipped, 0 failing.** Two existing assertions changed, both in other modules and both forced — see
§3.1.

### 2.3 The response

```
GET /v1/users/me/watch-history?limit=20&cursor=<opaque>
Authorization: Bearer <accessToken>
```

```json
{
  "items": [
    {
      "drama": { "id": "drm_fx_revenge", "title": "…", "coverUrl": "…", "totalEpisodes": 20,
                 "freeEpisodes": 5, "category": "REVENGE", "tags": [], "isCompleted": false,
                 "stat": { "playCount": 128400, "favoriteCount": 9120, "score": 8.6 } },
      "lastEpisodeNumber": 11,
      "lastPositionSec": 63,
      "watchedAt": "2026-08-27T12:00:00.000Z",
      "lastEpisodeId": "ep_fx_s2e01"
    }
  ],
  "pageInfo": { "nextCursor": null, "hasMore": false }
}
```

`lastEpisodeId` is the fifth field, and it is the one the client asked for. `docs/12-api-contracts.md`
§4.7 lists four, and none of them can address the player: `#/play/:episodeId` takes an episode id and
an episode *number* is not one (`docs/02-information-architecture.md` §5). Without it the row can
only open the drama, which is not the one-tap resume the screen exists for (`J3`, `J8`). The client
already reads it tolerantly; here it is never absent, because every row in this list is derived from
a progress row and that row is keyed by the episode id.

`lastEpisodeNumber` is the **drama-wide** number. `ep_fx_s2e01` is episode 1 of its season and
episode 11 of its drama, and there is a test that says 11.

---

## 3. Decisions taken in this slot

Numbering continues from `docs/handoff/w3-work-n.md` §3.

| # | Decision | Reasoning | Cost to reverse |
|---|---|---|---|
| S71 | **A request with no resolvable viewer is `401`, never an empty list** | The empty list is the version of this bug that looks like a finished feature: a clean screen telling a viewer who has watched forty episodes that they have watched none, with no way to sign in. Asserted with rows in the store, so the test fails if the refusal is ever softened for a viewer who has something to lose | One branch; 8 tests |
| S72 | **A viewer with no rows is answered without consulting the catalogue** | This is what keeps `401` and `200 []` apart on a deployment where the catalogue is not wired — which is every deployment today. Consulting it first would make "you have watched nothing" a `503`, collapsing two of the client's three screens into one | Moving three lines; 4 tests |
| S73 | **A viewer with rows and no catalogue is `503`, never an empty list** | An empty list is a claim about the viewer; a `503` is a claim about us. Only one of them is true here, and the false one is the one a viewer acts on by leaving | One branch; 2 tests |
| S74 | **The catalogue is a port whose default refuses** | Same posture as `createUnavailableEntitlementFactsPort`. The alternative default — answering "no facts" — is indistinguishable from "watched nothing", which is precisely the confusion S71–S73 exist to prevent. A port also keeps `progress` out of `catalog`'s tables (`docs/architecture/system-overview.md` §7.1) | One default; 2 tests |
| S75 | **A missing key from the port drops that row; it does not fail the page** | A deleted, unpublished or withdrawn episode has no row worth drawing: playback answers it `410`, so the row would be a cover and a resume button leading nowhere. Failing the whole page would let one withdrawn episode cost a viewer their entire history | One condition; 3 tests |
| S76 | **A dropped row does not take its drama with it** | The list falls back to the newest *describable* episode of that drama. Without this, withdrawing one episode removes a drama the viewer is still watching — and it would look like correct filtering | One loop ordering; 1 test |
| S77 | **The list is one row per drama, not one per episode** | Storage is keyed `(userId, episodeId)`, so eleven episodes of one drama is eleven rows. Serving those buries every other drama behind the one the viewer is already deep into. §4.7 says "追剧列表", a drama-following list, and that is what this is | Two map keys; 2 tests |
| S78 | **The sort key is the server's `updatedAtMs`, never the client's `clientUpdatedAtMs`** | The second is a value a device chooses. A phone set a year ahead would pin its drama to the top of that viewer's history until the row was evicted, and the viewer could not fix it. Enforced in the store *and* in the projection, because either one alone would leave the other free to reintroduce it | Two comparisons; 5 tests |
| S79 | **The cursor's sort key is `(watchedAtMs desc, dramaId asc)`, not the timestamp alone** | Two rows can share a millisecond. A boundary that falls between them repeats one or skips one, and only under a tie — which is how it survives review and reaches a viewer who reports "a drama disappeared from my list" | Three lines; 1 test |
| S80 | **The tie-break compares code units, not `localeCompare`** | A cursor is a promise about an ordering, and `localeCompare` depends on the host's locale. An ordering that differs between two instances of the same service is a promise it cannot keep — and the symptom would be a duplicate row on one pod only | One comparison |
| S81 | **A cursor this server did not mint is `400`, not a silent restart** | Restarting the list is an infinite scroll that never ends and never visibly repeats. The cursor is versioned for the same reason: changing the ordering must not silently reinterpret cursors minted under the old one | One branch; 4 tests |
| S82 | **`nextCursor` is non-null exactly when `hasMore` is true** | It is the invariant the client's page narrowing already checks (`narrowPage`, slot M). A cursor alongside `hasMore: false` is a cursor the client is entitled to follow into an empty page | One condition; 2 tests |
| S83 | **`limit` is clamped above the ceiling and refused when unreadable** | `limit=200` is a client asking for a page size we do not serve, which we can answer; `limit=abc` is a client bug that a silent default would hide until someone wondered why paging never worked. `Number` rather than `parseInt`, because `parseInt('3x')` is 3 | One branch; 7 tests |
| S84 | **The session is checked before the query string** | A stranger learns nothing about which parameters exist or which are valid. It also means no refusal on this endpoint depends on the order two checks happen to be written in | One ordering; 1 test |
| S85 | **`progress` resolves viewers through the one published seam, and its own parallel copy was deleted** | Slot G shipped `progress/viewer.ts` with its own `ViewerResolver`, and its docstring said the seam belongs to `identity` and this file becomes an import "when that lands". It has landed (S86). Two things answering "who is this request?" do not crash — one of them accepts a credential the other rejects, and on this endpoint that reads as one viewer seeing another's list | The file is now a 40-line adapter; 4 tests |
| S86 | **The login route issues from W3 slot L's session store, so a token it mints can be resolved** | Before this, `POST /v1/auth/login` returned a random string nothing could read back: an app issuing credentials it cannot verify is not a half-built feature, it is a contradiction, and no per-viewer endpoint could have worked. Adopted from slot L rather than reinvented, byte-identical where possible | 18 tests fail without the binding |
| S87 | **`SESSION_UNRESOLVABLE` is `503`; the two caller-side failures are `401`** | Slot G mapped all three to `401` on the grounds that the client's next move is identical. It is — but the client is not the only reader of a status code: `401` on a broken session store tells every dashboard that users are signing in wrong, and tells the viewer to re-login, which cannot work. This is also what the three sibling modules on this branch already do | One table entry |
| S88 | **The store's `list` takes a bound, and the endpoint over-reads then groups** | A page of 20 dramas needs an unbounded number of episode rows, so the two counts cannot be the same. `WATCH_HISTORY_SCAN_LIMIT` is a real limit with a real cost, stated in §5 rather than hidden | One constant |
| S89 | **Every answer, including the refusals, is `Cache-Control: private, no-store`** | A history list is the most complete picture of a viewer's behaviour the product holds. A shared cache holding it is a cross-user leak waiting for a misconfigured proxy. The header is set before the answer is known, so a refusal cannot be the one response that omits it | One header; 2 tests |
| S90 | **The fixture catalogue is built on the *entitlement* fixture world, not a new one** | `ep_fx_s2e01` is episode 11 of its drama in both places, so a test asserting `lastEpisodeNumber: 11` asserts against the numbering the free window is measured in. Two fixture worlds would eventually disagree, and episode numbering is the first thing they would disagree about | It is a reuse, not a mechanism |

### 3.1 The two existing assertions that changed

Both are consequences of S86, both are in other modules, and both are the edit slot L already makes —
applied here with slot L's exact comment text, so the merge is a no-op.

| Test | Was | Is |
|---|---|---|
| `entitlement/routes.test.ts` › `refuses a presented session rather than downgrading it to anonymous` | `503 COMMON_SERVICE_UNAVAILABLE` | `401 AUTH_REQUIRED` |
| `playback/routes.test.ts` › same name | `503` | `401` |

The property under test is unchanged and is what those tests are for: a presented token is never read
as an anonymous viewer. What changed is whose fault it is. While no store existed, "we cannot check
this token" was true and ours; now a store answers, and a token it does not hold is a token nothing
issued.

### 3.2 What was deliberately not changed

`app/` is byte-identical to the base — the built bundle still hashes `index-B_KnFxaH.js`. So are
`server/src/core/` (the CORS policy and origin allowlist from slot N) and `packages/config` (trusted
domains, in flight). Nothing in `unlock`, `platform-tiktok`, `health` or `config` was touched.
`server/src/app.ts` gained two route registrations and two dependency defaults; no existing
registration moved.

---

## 4. Reverse verification

Each rule was reintroduced as a defect and the full server suite re-run, per `SR-1`. A rule nothing
fails for is a rule that is not being enforced. Every run below was a separate run against an
otherwise clean tree.

| Defect reintroduced | Failing tests | Representative names |
|---|---|---|
| An unidentified request is answered with an empty list | **8** | `never answers an empty list to a request it could not identify`, `refuses a request that carries no session`, `checks the session before it checks the query, so a stranger learns nothing about either`, + 5 |
| An anonymous request becomes a shared viewer id | **10** | `refuses an anonymous request rather than inventing a viewer`, `refuses a write with no credential, and stores nothing`, `keeps the three failures apart, because they are different operator events`, + 7 |
| The catalogue is consulted even when there is nothing to describe | **4** | `does not consult the catalogue when there is nothing to describe`, `answers an empty list to a session that has watched nothing`, `accepts a session issued by its own login route`, + 1 |
| A refusing catalogue is answered as an empty list | **2** | `answers 503 rather than an empty list when the catalogue refuses`, `answers 503 with the app as deployed today, whose catalogue port refuses` |
| `lastEpisodeId` dropped from the row | **12** | `names the episode to resume, not just its number`, `always carries the episode id, because the row is built from a row keyed by one`, `carries the five fields the history screen renders`, + 9 |
| One row per episode instead of per drama | **2** | `keeps one row per drama, the newest`, `collapses many episodes of one drama into its newest row` |
| The client's clock used as the sort key | **5** | `ignores the client’s clock when ordering` (twice — store and projection), `orders by the server’s clock, newest first`, + 2 |
| The store's `list` ignores the user id | **2** | `never returns another viewer’s rows`, `never serves one viewer’s history to another` |
| The cursor has no tie-break beyond the timestamp | **1** | `does not repeat or skip rows that share a timestamp` |
| A cursor is handed out on the last page | **2** | `hands out no cursor on the last page`, `follows its own cursor to the next page` |
| An unreadable cursor restarts the list | **4** | `refuses a cursor it did not mint`, `refuses the unreadable cursor v2:1:drm_a rather than starting over`, + 2 |
| `limit` ignored | **7** | `serves no more rows than the limit asks for, and says there are more`, `clamps a limit above the ceiling rather than refusing it`, `hands out a cursor exactly when there is more to read`, + 4 |
| An undescribable episode is defaulted rather than dropped | **3** | `drops an episode the catalogue could not describe`, `falls back to the newest describable episode of the same drama`, `leaves out a drama that is no longer on the shelf` |
| A withdrawn drama is described rather than left out | **3** | `leaves out an episode whose drama is no longer on the shelf`, `agrees with the entitlement fixture world it is built from`, `leaves out a drama that is no longer on the shelf` |
| The per-viewer answer is cacheable | **2** | `forbids caching of a per-viewer answer`, `forbids caching of the refusals too` |
| Login mints a token it does not bind to a user | **18** | `accepts a session issued by its own login route`, `resolves a token it issued to the user it was issued for`, `answers an empty page with the app as deployed today, given a session it issued`, + 15 |

Four rows deserve a note.

**The empty-list-for-a-stranger defect fails 8 tests, and one of them is the only one that matters.**
`never answers an empty list to a request it could not identify` puts rows in the store first. Every
other test in that group would still pass if the refusal were softened only for viewers with no
history — which is exactly the shape a well-meaning "friendlier empty state" change would take.

**The cursor tie-break fails exactly one test, which is the honest size of that mistake.** Paging
still works, every page is still full, and the totals still add up. What breaks is one row under a
millisecond collision, and it would be zero tests if the property had not been written down.

**`localeCompare` (S80) has no test, and that is deliberate.** Its failure mode needs two hosts with
different locales, which a single-process suite cannot produce. It is a comment and a code review
item, recorded here so it is not mistaken for a covered property.

**The session-binding defect fails 18 tests, 15 of them slot L's own.** That is the point of copying
those files byte-identically: the property is enforced by the tests that came with it, not by tests
this slot wrote about somebody else's code.

### 4.1 Gates

Every gate was run on this branch, on a clean tree.

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **846 passing, 0 skipped, 0 failing** — 710 server (was 511), 109 app, 16 config, 11 shared |
| Build | `pnpm build` | pass — `assets/index-B_KnFxaH.js` 242.80 kB (78.07 kB gzipped), byte-identical to the base |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |
| Contract | `contract.test.ts` | every documented path still reaches a handler, now including all three new ones |

---

## 5. Registered rather than resolved

**The catalogue adapter is the one thing standing between this endpoint and a real list (`HIST-1`).**
Everything above the port is finished and tested; the port's only implementation is a fixture. When
`catalog` lands, an adapter implements `loadWatchedEpisodeFacts` — episode → `(DramaSummary,
globalEpisodeNumber)`, omitting anything unpublished or withdrawn — and `buildApp` passes it. No route
and no projection changes. Until then a wired deployment answers `503` to a viewer with rows, which
is the honest answer and not a silent empty list.

**`WATCH_HISTORY_SCAN_LIMIT` is a real limit, not a formality (`HIST-2`).** One page is built from the
viewer's newest 500 progress rows, and grouping happens after the read. A viewer whose newest 500 rows
all belong to a handful of dramas will not see their older dramas. The fix is not a bigger number: it
is `DISTINCT ON (drama_id)` in SQL, where the grouping happens in the index and the constant
disappears. For W7, alongside the `(user_id, updated_at DESC)` index `list` needs.

**`lastEpisodeId` should be added to `docs/12-api-contracts.md` §4.7 (`CTR-011`).** The contract lists
four fields; this endpoint returns five, and the fifth is the only one that can address the player.
The client registered the gap on `w3-work-m-9b99`; it is answered here and now needs to be written
down in the design doc, not just in `contracts/openapi.yaml`. For slot B at the next contract pass,
alongside the `CTR-009`/`CTR-010` entries from `docs/handoff/w2-work-k.md` §5.

**`DELETE /users/me/watch-history/{dramaId}` is not implemented (`HIST-3`).** §4.7 documents it and
this slot did not add it, because "hidden from history" is not a position: it is a per-drama flag with
no column to live in yet. Inferring it by deleting progress rows would throw away the viewer's resume
positions for every episode of that drama — a destructive write dressed as a list operation. It needs
either a `hidden_at` column or a `watch_history_hidden` row, which is W7's.

**Two entitlement fixtures are unused by this slot and worth a second look.** `drm_fx_withdrawn` has
`freeEpisodes: 5` and one episode, so its own summary claims a free window wider than the drama. It
does not matter here — the drama is filtered out before a summary is read — but a `catalog` store
reconciling counters will trip over it.

---

## 6. Merge notes for the slots this overlaps

Nine files are byte-identical to their source branch and will merge without a conflict. The list
below is everything that will not.

| File | Overlaps | What a merge sees |
|---|---|---|
| `server/src/modules/progress/store.ts` | `w2-work-g-d191` | Add/add. This branch's version is theirs plus `list(userId, limit)` and one docstring paragraph. Take this one |
| `server/src/modules/progress/store.test.ts` | `w2-work-g-d191` | Add/add. Theirs plus a sixth `describe` block. Take this one |
| `server/src/modules/progress/routes.ts` | `w2-work-g-d191` | Add/add, 30 lines: `requireViewer`/`sendViewerRefusal` instead of the module's own resolver, `viewer.value` instead of `viewer.value.userId`, and one docstring paragraph about where the history list went. Take this one — it is the change slot G's own docstring asked for (S85) |
| `server/src/modules/progress/viewer.ts` | `w2-work-g-d191` | Add/add, and the contents are entirely different: theirs is a parallel `ViewerResolver`, this is an adapter over the published one. Take this one, and delete `viewer.test.ts` from theirs |
| `server/src/modules/identity/routes.ts` | `w3-work-l-8551` | One comment sentence: theirs mentions `test-login.ts`, which is slot L's file and is not on this branch. **Take theirs** |
| `server/src/modules/entitlement/routes.test.ts` | `w3-work-l-8551` | Identical edit on both sides (§3.1). Either |
| `server/src/modules/playback/routes.test.ts` | `w3-work-l-8551` | Identical edit on both sides. Either |
| `packages/shared/src/index.ts` | all three | Three added `export *` lines in one place. Union of both sides |
| `packages/shared/src/errors.ts` | `w2-work-g-d191` | This branch adds `PROGRESS_INVALID_POSITION` to the base list; slot G's branch predates the base's other codes and drops several. Take this one |
| `contracts/openapi.yaml` | `w2-work-g-d191` | Both add the two progress paths. This branch's version keeps the base's cross-origin preamble and fuller descriptions, which slot G's branch predates. Take this one |
| `server/src/contract.test.ts` | `w2-work-g-d191` | Both add the progress paths to the expected list; this one also adds the history path. Take this one |
| `server/src/app.ts` | `w2-work-g-d191`, `w3-work-l-8551` | The real one. All three branches change the dependency block and the registrations. This branch's version is a superset of what slot L does there and adds slot G's registration plus this slot's. Resolve by hand, keeping: one `sessionStore`, one `viewerResolver` derived from it, one `watchProgressStore` shared by both progress registrations |

Slot L additionally ships `test-login.ts` and a `MOCK_LOGIN` config gate, which this branch does not
take at all. Nothing here conflicts with them.
