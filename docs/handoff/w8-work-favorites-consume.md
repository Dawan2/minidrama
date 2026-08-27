# Handoff — Wave 8, Work Slot “favorites-consume”: SCR-08 reads the list endpoint

> **Branch:** `cursor/w8-work-favorites-consume-e20d`, cut from `cursor/w7-work-favorites-6ca8`
> (`e0abb51`, the favourites screen).
> **Scope:** the client, and one screen of it. `#/favorites` now reads
> `GET /v1/users/me/favorites` instead of assembling itself from a feed page and one probe per drama.
> **Not in scope:** nothing under `server/`, `packages/`, `contracts/`, `app/tools/` or `.github/`.
> The list endpoint is W8's `favorites-list` slot's and was **not merged** — its wire shapes were
> copied, as W7 copied slot J's (§1.3). The session-viewer unlock work is in flight elsewhere and
> nothing here touches it. No pull request was opened.

---

## 1. What this slot closes

W7 shipped SCR-08 with a compromise at its centre and registered it as that slot's largest gap
(`docs/handoff/w7-work-favorites.md` G-F2). There was no favourites list endpoint, so the screen
took a page of the recommendation feed as a set of *candidate* dramas and asked, one request per
candidate, “do you follow this one?”.

**The cost was never the request count. It was that the list could be wrong.** A drama the viewer
followed that the feed page did not carry was not on their favourites screen at all — and a favourite
that is silently absent is indistinguishable from one the viewer never made. W7 disclosed it in copy,
on every successful read including the empty state, because a sentence was the only honest thing a
client could do about it. This slot deletes the limitation and the sentence together.

### 1.1 What changed, as a shape

| | W7 | Now |
| --- | --- | --- |
| Where the list comes from | a feed page, filtered by up to 20 probes | `GET /v1/users/me/favorites`, paged |
| Requests for the first screenful | 1 + up to 20 | 1, plus one drama read per row (§1.2) |
| Completeness | the feed page's dramas only | the viewer's whole list |
| Order | sorted client-side by `favoritedAt`, tiebroken by drama id | the server's keyset order, rendered as given |
| “Load more” | impossible — it would have paged the candidates | the endpoint's cursor |
| The coverage notice | on every read, including the empty state | deleted |
| “You are not following anything yet” | a claim the screen could not support | a claim the screen can now make |
| `401` vs empty vs not-deployed vs error | `presentSessionReadFailure`, per probe | `presentSessionReadFailure`, once, over the list read |

The last row is the one that did **not** change, and it is the one this slot was most careful with.
The four-way split is still the shared one in `app/src/data/session-read.ts`, still keyed on status
and not on the error code, and still renders `404`/`405`/`501` as the empty state because the endpoint
is not deployed on this branch either. All that moved is where it is applied: over one read instead of
over the first probe to fail.

### 1.2 The half of the problem that is left: rows carry ids, not dramas

The endpoint answers with `{ dramaId, favoritedAt }` rows. It deliberately does not carry
`DramaSummary`, because that is a catalogue view object and a partial copy of it in the discovery
module is how two shapes of one drama start disagreeing about `totalEpisodes`
(`docs/handoff/w8-work-favorites-list.md` decision S60). So a row still needs a title and a cover from
somewhere, and today that is the catalogue's own `GET /v1/dramas/{id}`, one per row, bounded at four
in flight.

That is a fan-out, and it is worth being precise about why it is a different and much smaller thing
than the one that was deleted:

- it asks about **favourites**, not about candidates. Every request is about a row that is already
  known to be on the screen, so none of them can be wasted and none of them can *discover* anything;
- it cannot make the list wrong. Which dramas are on the screen, and in what order, is entirely the
  endpoint's answer. A failed drama read subtracts a **card**, never a **row**;
- it disappears in one line the day the projection lands (S60's `items[].drama`, §6).

**A row whose drama does not resolve stays on the screen, un-followable and marked.** That is this
slot's answer to the question the server slot left open as `W8-a`, and it follows from the same
reasoning as the server's S68: the row is *why* the drama is on the viewer's screen, and a favourite
that is hidden is one they can neither see nor clear. Dropping unresolvable rows here would put back
the exact hole the fan-out was deleted for, one layer further down.

### 1.3 The types were copied, not merged

The instruction was not to mega-merge while an integrator is in flight, so `FavoriteListItem` in
`app/src/data/favorites-api.ts` is a copy of the interface in `packages/shared/src/discovery.ts` on
`cursor/w8-work-favorites-list-a666`, marked as one at the definition — exactly as W7 copied
`FavoriteState` from slot J (that slot's F25, gap G-F1). Nothing else was taken from that branch: the
endpoint's behaviour is consumed as a contract, not as code.

The copy has **one deliberate divergence**, and it is registered as this slot's own gap (§5, G-C1):
the wire shape declares `readonly favoritedAt: string` and the client widens it to `| null`, because
it reads the field tolerantly. `FavoriteList` was not copied at all — W8's `{ items, pageInfo }` is
field-for-field the `Page<T>` envelope this client already shares with the feed, the episodes and the
watch history, down to `nextCursor` being `null` rather than absent on the final page, so it is
expressed as that envelope instead of as a fourth opinion about what a page is.

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `app/src/data/favorites-api.ts` | `FAVORITES_LIST_PATH`, `FavoriteListItem` (the copy), `FavoriteList`, `FavoritesListRequest`, `FavoritesApi.listFavorites`, `narrowFavoriteListItem` |
| `app/src/favorites/favorite-collection.ts` | **rewritten.** `loadFavoritesPage`, `resolveFavoriteEntries`, `FavoritesPageSource`, `FAVORITES_PAGE_LIMIT`, `FAVORITE_RESOLVE_CONCURRENCY`; `FavoriteEntry` now `{ dramaId, drama: DramaSummary \| null, favoritedAt }`. `collectFavorites`, `orderFavorites`, `FavoritesList` and `FAVORITE_PROBE_CONCURRENCY` deleted |
| `app/src/favorites/favorite-candidates.ts` | **deleted**, with its 7 tests. The feed is no longer a favourites data source |
| `app/src/routes/FavoritesPage.tsx` | `usePagedResource` instead of `useResource`; “load more”; the append-failure split; the coverage notice and the partial-read states gone; `data-state` down to seven values |
| `app/src/favorites/FavoriteRow.tsx` | renders a row whose drama did not resolve: no link, no cover, its own note, and the un-follow button intact |
| `app/src/core/i18n/locales/*.json` | `favorites.partial` and `favorites.incomplete` removed; `favorites.unresolvedTitle`, `favorites.unresolved`, `favorites.removeUnresolvedLabel`, `favorites.undoUnresolvedLabel` added, in both locales |
| `app/src/styles/app.css` | `.favorites__notice` removed, `.favorite-row__unresolved` added |
| `app/src/testing/favorites-fixtures.ts` | `favoriteListItem`, `favoritesPage`, `stubFavoritesApi.listFavorites` with `listCalls` |
| `app/src/App.test.tsx` | the routing test's `401` now comes from the list read |

**Nothing outside `app/src/` and this document is in the diff.** 15 files, +1000 / −830, of which two
files are deletions. No file under `server/`, `packages/`, `contracts/`, `app/tools/` or `.github/` was
touched; `app/src/player/`, `app/src/catalog/`, `app/src/history/` and `app/src/auth/` are untouched.
No `<video>`, `<audio>` or `<iframe>` entered the source or the artifact.

`favorite-action.ts`, `FavoriteRow`'s write behaviour, `http.ts`, `session-read.ts` and
`favorites-api-context.tsx` needed no changes, which is the part of W7's structure that held: the row
did not know how the list was assembled, and the failure vocabularies were already in the right
modules.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **796 passing, 0 skipped, 0 failing** — 431 app (was 423), 338 server, 16 config, 11 shared |
| Build | `pnpm build` | pass — `index-u2vYt5o7.js` 280.23 kB (87.81 kB gzipped) + `index-BRa0Nc_q.css` 7.61 kB (1.82 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle moved +0.45 kB raw and **−0.27 kB gzipped**: a paged screen and a nullable row cost about
what a fan-out, a candidate source and a client-side comparator were worth. No lint rule was relaxed
and no test was weakened, skipped or deleted — the 7 tests that went with `favorite-candidates.ts` went
because the module they were about no longer exists.

### 2.2 Where the app's tests moved

| File | Tests | Change | Protects |
| --- | --- | --- | --- |
| `data/favorites-api.test.ts` | 28 | +12 | The list path, the `limit`, the cursor echoed verbatim, the server's order preserved, an empty list as a *value*, a refusal passed through, and `narrowFavoriteListItem`: strict `dramaId`, tolerant `favoritedAt`, and one bad row costing the page |
| `routes/FavoritesPage.test.tsx` | 22 | +1, all rewritten | `401` vs empty vs not-deployed vs error; that the screen no longer reads the feed or probes; the server's order rendered as given; the coverage notice gone from both the list and the empty state; an unresolved row keeping the screen out of the error states; and paging, including a further page that fails and one that answers `401` |
| `favorites/FavoriteRow.test.tsx` | 18 | +5 | The unresolved row: no link, its own note, `data-row-resolved`, an accessible name with no title to use, and that it can still be un-followed |
| `favorites/favorite-collection.test.ts` | 15 | −3, all rewritten | One list read rather than a fan-out; the page size and the cursor; the envelope carried through; the server's order not re-sorted; the list read's failure passed through; a row kept when its drama does not resolve; the resolve concurrency bound; and order preserved when a later read resolves first |
| `favorites/favorite-candidates.test.ts` | — | −7 | Deleted with the module |

Two decisions were probed by mutation rather than asserted once and assumed:

- **Dropping rows whose drama did not resolve** (`resolved.filter((entry) => entry.drama !== null)`)
  fails **4 tests** across `favorite-collection.test.ts` and `FavoritesPage.test.tsx`, including both
  that separate “a card we could not draw” from “a favourite you do not have”. This is the mutation
  that matters most, because the filter is the tempting one-liner: it makes the screen *look* cleaner
  and it silently re-introduces W7's G-F2.
- **Reading the list read's failure as an empty page** fails **12 tests** across three files —
  every test that separates a missing session from an empty list, the trace-id test, the
  not-deployed test and both paging-failure tests. It is the mutation that turns an expired token
  into “you follow nothing”, which is the one thing this screen exists not to say.

### 2.3 Verified against real HTTP, not only against stubs

Fixtures agreeing with each other proves nothing about the wire, so the real `http.ts`, the real
`createFavoritesApi` and the real `loadFavoritesPage` were driven against a socket serving W8's own
documented shapes, and against the live server on this branch.

**Against the live server (`pnpm start`, `:8099`), the state a reviewer can reproduce:**

| Case | Result |
| --- | --- |
| `GET /v1/users/me/favorites`, with and without an `Authorization: Bearer` header | `404 COMMON_RESOURCE_NOT_FOUND` from Fastify's not-found handler, every time. **The endpoint is not merged on this branch** — that is not a client bug and it must not render as one |
| The whole screen's read, through `loadFavoritesPage` | `UNAVAILABLE` → the empty state, in **1 HTTP request**. W7's fan-out reached the same screen in 5 (1 feed + 4 probes) |
| `GET /v1/recommendations/feed?scene=HOME&limit=20` | still `200`. The feed is fine; it is simply no longer this screen's data source |

**Against a socket serving the contract's own shapes**, because the endpoint above cannot yet produce
a row:

| Case | Result |
| --- | --- |
| The handoff's own example body (2 rows, a `nextCursor`) | 2 entries, in the server's order, each resolved to a card; `nextCursor` carried through verbatim. Request: `GET /v1/users/me/favorites?limit=20` |
| A further page | `GET /v1/users/me/favorites?cursor=MTc4NzgzMjAwMDAwMDpkcm1fcmV2ZW5nZV8wMDAx&limit=20` — echoed exactly, never parsed |
| `200 { items: [], pageInfo: { nextCursor: null, hasMore: false } }` | a value, not a failure: the empty state |
| A row with no `favoritedAt` — which the wire shape says cannot happen | the row survives with `favoritedAt: null`. This is the divergence in §1.3, on the wire |
| A row for a drama the catalogue answers `410` about | the row is kept with `drama: null`; the other row is unaffected |
| `401 AUTH_REQUIRED` | `AUTH_REQUIRED`, in **one** request — no automatic retry of an auth failure |
| `400 COMMON_VALIDATION_FAILED` (an unreadable cursor, S65) | `ERROR` — a terminal one, and correctly *not* an empty list |
| `404 COMMON_RESOURCE_NOT_FOUND` | `UNAVAILABLE` → the empty state |
| A row with no `dramaId` | `MALFORMED` for the page, which is `narrowPage`'s rule everywhere in this client |

---

## 3. Decisions taken in this slot

Numbered `F30+`, continuing W7's `F*` because they are decisions about the same screen. Where one of
them retires an earlier decision, that decision is named.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| F30 | **The list endpoint is the list. Retires F1, F2, F3's candidate half, F5, F6 and F9** | The fan-out could not answer the question the screen asks. Everything it needed — a candidate source, a stopping rule, a partial-answer state, a whole-list retry — existed only to make an approximation presentable, and none of it survives the read that answers exactly | Restore two modules from `e0abb51` |
| F31 | **The coverage notice is deleted in the same change that removes the limitation. Retires F4** | F4 was right while the list could be wrong, and it becomes a lie the moment it cannot: a screen that keeps apologising for a limit it no longer has teaches viewers to distrust a list that is now correct. The two must not be separable in the history | Re-add one paragraph and two copy keys |
| F32 | **The order is the server's, rendered as given. Retires F17, F18 and F19** | The endpoint sorts on `(favoritedAt, dramaId)` descending *inside the keyset the cursor pages through* (S61), so a client-side re-sort is not a second opinion about a display detail — it is a second opinion about the boundary the pages were cut along, and two pages sorted independently do not concatenate | Restore one comparator, and lose page-boundary agreement |
| F33 | **A row is resolved through the catalogue, one drama read per row, four in flight** | The rows carry ids by design (S60). Four is F3's other half, unchanged and for the unchanged reason: a WebView holds ~6 connections per host and the 10s timeout starts when a request is *made*, so a whole page at once can time out having never left the device | One constant, or one line when the projection lands (§6) |
| F34 | **A row whose drama did not resolve keeps its place, its `data-row-resolved="false"` and its un-follow button** | This is `W8-a`, answered. The server keeps a delisted favourite in the list so the viewer can clear it (S68); hiding it here would leave a favourite they can neither see nor clear, and would re-create G-F2 inside the client. Mutation-tested: the filter fails 4 tests | One `filter`, and the screen starts lying by omission again |
| F35 | **An unresolved row has no link** | A link to a drama we could not read is a tap that lands on an error screen. What the row can honestly offer is the one action that still means something, which is to stop following it | One ternary |
| F36 | **A drama read that fails is never the page's failure** | Resolving is a rendering step over a list that has already been answered for. Promoting it to a page failure would let a single flaky drama read blank a complete favourites list — and, worse, make a `401` from an unrelated anonymous endpoint look like a session problem | One branch |
| F37 | **`incomplete` now means “every row is here and at least one has no card”, and `unresolved` is gone. Amends F29** | The seven `data-state` values are the screen's testable vocabulary, and `unresolved` described a state — “we do not know whether this list is complete” — that the endpoint made unreachable. Keeping the word with a new meaning would be worse than retiring it | One attribute expression |
| F38 | **A further page that fails keeps the pages already on screen. Deliberately not F6** | F6 discarded rows collected mid-fan-out because they were a fragment of *one* answer, of unknown composition. A page is not that: it is the server's complete answer to “the next N favourites in this order”, so the rows on screen are exactly right and only the tail is missing. Replacing them would cost the viewer their place to tell them something a notice says | One branch |
| F39 | **A `401` while appending is a sign-in prompt under the rows, and it retries the append rather than the screen** | Same fact as a `401` on the first page, so the same recovery — and re-running `loadMore` means an expired session costs one tap instead of a reload back to the top of a list the viewer had scrolled | One callback |
| F40 | **`favoritedAt` is carried on the entry and used for nothing. Keeps F16** | It is the server's sort key and the client has no authority over the server's clock. It is kept on the entry rather than dropped because a row that arrives without it is a signal worth having in a bug report, and because the day a relative date is designed the value is already there | Delete one field |
| F41 | **`narrowFavoriteListItem` is strict about `dramaId` and tolerant about `favoritedAt`** | The id *is* the row: it resolves the card, addresses the un-follow and keys the list, so a row without one is not a field to default. The timestamp drives no decision on this screen, so rejecting a page — and with it the viewer's whole list — over it would protect nothing. The watch-history row reads its `watchedAt` the same way | Two conditions |
| F42 | **`FavoriteList` is the shared `Page<T>` rather than a third copy of the envelope** | W8's shape is field-for-field the envelope this client already pages the feed, the episodes and the history through, including `nextCursor: null` on the final page. A separate interface would be a second definition of “a page” for `narrowPage` and `usePagedResource` to disagree about | One type alias |
| F43 | **`FAVORITES_PAGE_LIMIT` is stated in the client at the endpoint's own default of 20** | The page size a screen reads at is a property of the screen as much as of the endpoint, and the endpoint refuses rather than clamps an out-of-range limit (S69) — so a client that sent nothing and inherited a changed default would page differently without a diff | One constant |
| F44 | **`readFavorite` and `FavoriteState` stay, unused by this screen** | They are a deployed verb of the favourite surface and the natural initial state for the drama-screen toggle (§6). Deleting a tested client of a real endpoint to remove one unused function from the bundle would cost the next slot more than it saves | Delete one method, one interface and 16 tests |

---

## 4. Deliberately not built

- **No client cache and no cross-screen invalidation.** Navigating away and back re-reads the list, as
  every other screen does. A removed row that the viewer returns to still shows as followed until the
  re-read answers (W7's G-F6, unchanged).
- **No optimistic removal from the list.** A removed row still stays in place with an undo (F10),
  even though the list endpoint would now let it be re-fetched. The reason is unchanged: the viewer's
  scroll position must not move under the finger that just touched it.
- **No infinite scroll.** “Load more” is a button, exactly as on the home and history screens. The
  scroll-position restoration an auto-pager needs is an app-wide decision, not this screen's.
- **No batched drama resolution and no `?ids=` request.** There is no such endpoint, and inventing a
  client-side batch over a server that has none is how an N+1 gets hidden rather than fixed. The
  batched lookup is the server's, in the same change as the projection (S60, `W8-b`).
- **No edit mode, no multi-select, no bulk unfollow.** SCR-08's edit mode is now unblocked by the
  stable list, but the server has no bulk verb and one is a destructive operation that wants a
  confirmation design (that slot's §4).
- **No favourite button on the drama or feed screens.** Still `PUT`/`DELETE` wired here only; still
  waiting on `DramaDetail.viewer` (`W8-c`).
- **No `favoritedAt` display, no relative dates** (F40).
- **No real silent login, no `Authorization` header, no token store.** Unchanged from W3-M and W7:
  the seam is `Session` and one value in `main.tsx`.
- **No analytics.** The list carries no tracking ids and the server mints none for it.
- **Nothing on the server, in the contracts, in the shared package or in CI.**

---

## 5. Known gaps in this slot's own work

- **G-C1: `FavoriteListItem` is a copy, and it diverges in one field.**
  `app/src/data/favorites-api.ts` duplicates the interface from `packages/shared/src/discovery.ts` on
  `cursor/w8-work-favorites-list-a666` (§1.3). **For the integrator:** delete the interface and add
  `FavoriteListItem` to the type import from `@minidrama/shared` — but note that the shared type
  declares `favoritedAt: string` and this client's entries hold `string | null` (F41). The narrowing
  is what makes that safe, so keep `narrowFavoriteListItem` and let `FavoriteEntry.favoritedAt` stay
  nullable; the alternative is a page that fails over a field nothing reads. W7's G-F1 (the
  `FavoriteState` copy from slot J) is still open and unchanged.
- **G-C2: one drama read per row.** A page of 20 favourites is 20 catalogue requests before the last
  card appears, five round trips deep at a concurrency of four. It is bounded, it cannot make the list
  wrong, and it is one line to delete (§6) — but until then SCR-08 is still the slowest screen in the
  app, and it is now slow in proportion to how many dramas the viewer *follows* rather than to a fixed
  candidate window.
- **G-C3: the screen's populated state has never run against a real server**, because the endpoint is
  not merged on this branch. It has run against real HTTP with the contract's own shapes (§2.3), which
  is the closest available thing; `narrowFavoriteListItem` and the resolve step are where a real
  payload will surface a difference first.
- **G-C4: a delisted favourite and a failed drama read look identical on screen.** Both are
  `drama: null` and both render the same row. The catalogue's `410` and a timeout are different facts
  and the second is retryable, so a viewer may be shown “we could not load this drama” about a drama
  that is perfectly fine, and offered no retry for it. Splitting them wants the failure carried onto
  the entry, which is additive.
- **G-C5: an unresolved row's cover space is empty rather than a placeholder.** `CoverImage`'s
  labelled placeholder needs a `src` to fail at; a row with no summary has none, so the row is text
  only. It reads as intended at 430×932 and it is not what the rest of the list looks like.
- **G-C6: `hasMore` is not consulted.** `usePagedResource` pages on `nextCursor === null`, which the
  endpoint guarantees is equivalent (S63). If a future server ever disagreed with itself between the
  two fields, this client would silently follow the cursor and not the flag.
- **G-C7: nothing re-reads the list after a write.** Un-following updates the row in place and never
  the page, so a viewer who removes four rows and then presses “load more” pages a list the server has
  since re-cut around the rows they removed. Keyset paging over mutable data makes this benign — a
  shifted boundary can only repeat or skip rows the viewer just changed — and it is written down
  because it is the kind of thing that reads as a bug in a screen recording.
- **No weak-network banner, no `AUTH_TOKEN_EXPIRED` interceptor, no throttle on the per-row sign-in
  prompt.** Unchanged from W2-H, W3-M and W7. The interceptor's second customer now makes one request
  per screen rather than twenty, which makes it cheaper to add and no less necessary.
- **`data-testid` attributes still ship in the production bundle.** Unchanged, deliberate,
  reversible.

---

## 6. For the next slots

**For the integrator.** This branch touches `app/src/` only and is a superset of W7's favourites work:
take this one whole for anything under `app/src/favorites/`, `app/src/routes/FavoritesPage.tsx` and the
`favorites.*` copy keys. Two specific interactions:

- `main.tsx` and `routes.ts` are **not** touched here, so W7's additive changes to them are the only
  ones to merge;
- `app/src/data/favorites-api.ts` gains a method and two types. If slot J's `packages/shared` and
  W8's `discovery.ts` land together, both copies in that file (`FavoriteState`, `FavoriteListItem`)
  become imports — see G-C1 for the one field that is not a straight swap.

**For whoever merges `catalog` and adds the projection.** This is the change that deletes G-C2, and it
is small in the client:

```ts
// favorite-collection.ts, once the response carries items[].drama:
//   - resolveFavoriteEntries and FAVORITE_RESOLVE_CONCURRENCY go;
//   - FavoritesPageSource loses fetchDrama, and FavoritesPage stops needing useCatalogApi;
//   - FavoriteEntry.drama stays nullable, because S68 keeps delisted rows in the list and the
//     server cannot project a drama that no longer exists.
```

Keep `FavoriteEntry.drama` nullable and keep F34: the row that cannot be drawn does not go away when
the projection lands, it only becomes rarer. `FavoriteRow`'s unresolved branch and its 5 tests are
what you want to keep working.

**For whoever wires the drama screen's favourite toggle.** Unchanged from W7 §6, and now with a
second customer for the same seam: `FavoritesApi.readFavorite` is free again (F44) and is the right
call for re-reading one row after a button press. Prefer `DramaDetail.viewer.favorited` for the
*initial* state (`W8-c`) over a second request per card.

**For whoever adds the `Authorization` header.** It still belongs in `createHttpClient`, which all
three clients share. One thing changed for the better: the favourites screen no longer depends on the
anonymous feed to assemble a session-scoped list, so the header is no longer a precondition entangled
with an anonymous read.

**For whoever builds the tab bar and SCR-08's edit mode.** The stable, paged list is the thing edit
mode needed. The row already owns its own action state (F11) and refuses a second write while one is
in flight (F15), which is the invariant a multi-select has to keep; what it does not have is a
selection model or a bulk verb on the server (§4).
