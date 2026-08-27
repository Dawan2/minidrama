# Handoff — Wave 7, Work Slot “favorites”: SCR-08, the favourites screen

> **Branch:** `cursor/w7-work-favorites-6ca8`, cut from `cursor/w3-work-m-9b99` (history and the
> profile shell).
> **Scope:** the client. `#/favorites` (SCR-08), the favourite verbs as a client, the idempotent
> write on the transport, and the session-scoped read split now shared with SCR-07.
> **Not in scope:** nothing under `server/`, `packages/`, `contracts/` or `app/tools/`; nothing in
> `.github/`. The favourite endpoints are W2 slot J's and were **not merged** — see §1.2. No
> `<video>`, `<audio>` or `<iframe>`. No pull request was opened.

---

## 1. What this slot closes

W5 left `#/favorites` out. The profile has carried a favourites entry since W3-M, and it was a
disabled button reading “Not available yet” (that slot's decision M17) because there was nowhere for
it to go. This slot builds the screen, registers the route and turns the entry into a link, in one
change — W3-M §6 asked for exactly that, on the grounds that doing the first without the second is
how a dead entry ships.

### 1.1 The rule this slot exists to get right

W3-M's rule was “‘you have no history’ is three different answers”. The favourites screen inherits
it rather than re-deciding it, and that inheritance is now literal: the table below lives in
`app/src/data/session-read.ts` and both screens call it.

| Server says | Screen shows | Why it must be its own state |
| --- | --- | --- |
| `200`, and no drama came back followed | “You are not following anything yet” + “Find something to follow” | The viewer is known and follows nothing. The way out is content |
| `401` | “Sign in to see the dramas you follow” + an in-place silent-login retry | The viewer is **not known**. There may well be a list; we are not allowed to see it |
| `404` / `405` / `501` | the empty state, unchanged | The endpoint is not deployed. Our gap, not their data |
| anything else | retryable or terminal, in the vocabulary every other surface uses | Nothing about identity happened |

Three of those four rows are legitimately “a screen with no rows on it”, which is why they have to be
told apart in code rather than by eye. A viewer who follows twelve dramas and is shown “you are not
following anything yet” because a token was missing has been told their list was thrown away.

**What is new here is a fifth answer that the history screen never had to render: a read that
answered for *some* of the dramas it asked about.** That falls out of how the list is assembled
(§1.2) and it is not an error and not an empty list either — it is a list that is known to be
incomplete. It gets its own presentation, and §3 (decision F7) is why it appears under the rows
rather than in place of them.

### 1.2 Where the list comes from, and the compromise at the centre of this screen

**There is no `GET /v1/users/me/favorites`.** Slot J shipped three per-drama verbs and deliberately
left the list out, because a favourites list returns `DramaSummary` pages and that projection belongs
to the catalogue (`docs/handoff/w2-work-j.md` §4, follow-up J-b). The three verbs are:

```
GET    /v1/dramas/{dramaId}/favorite   -> 200 FavoriteState
PUT    /v1/dramas/{dramaId}/favorite   -> 204   idempotent
DELETE /v1/dramas/{dramaId}/favorite   -> 204   idempotent
```

So the only way to build the screen today is to ask, drama by drama, “do you follow this one?” — and
that question needs a set of dramas to ask it about. The set is a page of the recommendation feed,
which is deployed on this branch, is anonymous-capable, and already carries the whole `DramaSummary`
each row renders.

**The honest limit: a drama the viewer follows that is not in the candidate page is not on their
favourites screen.** That is a wrong list, not a slow one. It is disclosed on screen, on every
successful read *including the empty state*, and that notice is the one piece of copy on this page
that is not optional (decision F4). The fix is not a bigger fan-out; it is the list endpoint, and
when it lands `favorite-candidates.ts` is deleted and `collectFavorites` becomes one paged read (§6).

**Slot J's server code was not merged.** The instruction was not to mega-merge while an integrator is
in flight, so the client types were copied instead: `FavoriteState` in `app/src/data/favorites-api.ts`
is a field-for-field copy of the interface in `packages/shared/src/discovery.ts` on
`cursor/w2-work-j-acf5`. It is marked as a copy at the definition, and the integrator's move is one
line (§5, G-F1). Nothing else was taken from that branch — the endpoint behaviour it documents is
consumed as a contract, not as code.

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `app/src/data/http.ts` | `HttpWriter.send` — `PUT` / `DELETE`, `204`, and the split of `HttpClient` into `HttpReader` + `HttpWriter` |
| `app/src/data/session-read.ts` | **new.** `presentSessionReadFailure`, `UNAVAILABLE_STATUSES` — §1.1's table, extracted from the history screen so two screens share one answer |
| `app/src/history/history-presentation.ts` | now a thin re-export over the above. No behaviour change; its 9 tests are untouched and still pass |
| `app/src/data/favorites-api.ts` | **new.** `favoriteEndpoint`, `FavoriteState` (the copy), `FavoritesApi`, `narrowFavoriteState` |
| `app/src/data/favorites-api-context.tsx` | **new.** The provider and `useFavoritesApi`, with no default value |
| `app/src/favorites/favorite-candidates.ts` | **new.** `FAVORITE_CANDIDATE_LIMIT`, `distinctDramas`, `feedCandidateSource` — the seam standing in for the list endpoint, and the limit stated in full |
| `app/src/favorites/favorite-collection.ts` | **new.** `collectFavorites`, `orderFavorites`, `FAVORITE_PROBE_CONCURRENCY` — bounded fan-out, the short-circuit, partial answers, and the order |
| `app/src/favorites/favorite-action.ts` | **new.** `presentFavoriteActionFailure`, `isRetryableAction` — what a failed *write* means, which is not what a failed read means |
| `app/src/favorites/FavoriteRow.tsx` | **new.** One favourite, remove → removed → undo, and per-row failure |
| `app/src/routes/FavoritesPage.tsx` | **new.** SCR-08, with `data-state` naming which of its eight states it is rendering |
| `app/src/routes/routes.ts` | `#/favorites` declared. The comment saying it deliberately is not, deleted |
| `app/src/App.tsx` | one route registered |
| `app/src/routes/ProfilePage.tsx` | the disabled favourites button became a `Link` |
| `app/src/main.tsx` | one transport, three clients, one more provider |
| `app/src/testing/favorites-fixtures.ts` | **new.** `followedState`, `unfollowedState`, `stubFavoritesApi` with call history |
| `app/src/testing/render.tsx` | `favoritesApi` added, defaulting to a stub like every other dependency |
| `app/src/core/i18n/locales/*.json` | 18 new keys in both locales; `profile.notYetAvailable` removed with its only caller |
| `app/src/styles/app.css` | the favourite rows, the removed state, and the coverage notice |

**Nothing outside `app/src/` and this document is in the diff.** 35 files, +2853 / −146. No file under
`server/`, `packages/`, `contracts/`, `app/tools/` or `.github/` was touched — the CI workflow is in
flight elsewhere and is byte-identical here. `app/src/player/` is untouched.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **788 passing, 0 skipped, 0 failing** — 423 app (was 317), 16 config, 11 shared, 338 server |
| Build | `pnpm build` | pass — `index-De-Nsikf.js` 279.78 kB (88.08 kB gzipped) + `index-SG97L036.css` 7.58 kB (1.82 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

`pnpm verify` runs all six and passes end to end. The bundle grew 9.07 kB raw / 2.15 kB gzipped, which
is this slot's own code: one screen, one row, one write client, one collection. No `<video>`,
`<audio>`, `<iframe>` or third-party player entered the source or the artifact — the only `<video>`
anywhere in `app/src/` is a word in a pre-existing comment in `player/mock-veplayer.ts`, which this
slot did not touch. No lint rule was relaxed and no test was weakened, skipped or deleted.

### 2.2 Where the 106 new app tests go

| File | Tests | Protects |
| --- | --- | --- |
| `routes/FavoritesPage.test.tsx` | 21 | `401` versus empty versus not-deployed, in copy *and* in action; the coverage notice on the empty state; a partial read that keeps its rows; that a refused probe gets no retry button; and the `data-state` value for each |
| `favorites/favorite-collection.test.ts` | 18 | The short-circuit on `401` and on each unavailable status, the concurrency bound, a partial answer's shape, the order and its tiebreak, offset timestamps, unreadable timestamps sorting last |
| `data/favorites-api.test.ts` | 16 | The path and its encoding, the three verbs, `204` as a success with no body, strict `favorited`, the `dramaId` agreement check, tolerant `favoritedAt` |
| `favorites/FavoriteRow.test.tsx` | 13 | Remove → removed → undo, the in-flight guard, that a failed remove leaves the row followed, the per-row `401` prompt re-running the original action, and the accessible names |
| `favorites/favorite-action.test.ts` | 12 | `410` versus `404 CONTENT_NOT_FOUND` versus `404 COMMON_RESOURCE_NOT_FOUND`, an unreadable envelope degrading to `UNAVAILABLE` and not to `GONE`, and which of the four is offered a retry |
| `data/http.test.ts` | +8 | The write verbs reaching `fetch`, `204` never calling `json()`, a failed write's envelope surviving, and the single retry applying to a write on transport failure and `5xx` but not on `4xx` |
| `data/session-read.test.ts` | 8 | Every branch of §1.1's table, including a `401` with an unreadable envelope and a `403` that is *not* a missing session |
| `favorites/favorite-candidates.test.ts` | 7 | `HOME` scene and the limit, duplicate cards collapsing to one probe, feed order preserved, a feed failure passing through unchanged |
| `data/favorites-api-context.test.tsx` | 2 | That a missing provider throws instead of silently doing nothing |
| `App.test.tsx` | +1 | `#/favorites` renders the screen instead of the fallback |

`routes/routes.test.ts`, `routes/ProfilePage.test.tsx` and `history/history-presentation.test.ts`
changed without changing count: the first two inverted the assertions that `#/favorites` was absent
and that the profile entry was a disabled button, and the third now exercises
`presentHistoryFailure` as a delegation, unchanged in behaviour.

Two decisions were probed by mutation rather than assumed:

- Removing the `401` short-circuit from `collectFavorites` — letting the fan-out ask about every
  candidate — fails **10 tests across `favorite-collection.test.ts` and `FavoritesPage.test.tsx`**,
  including all four that separate a missing session from an empty list, and turns the live-server run
  in §2.3 from 5 requests into 7. The short-circuit is load-bearing for the *presentation* and not
  only for the request count, because a `401` reaching the page as a partial result renders as a list
  rather than as a prompt.
- Parsing the body of a successful write (dropping the `successBody === 'NONE'` branch) fails 2 tests
  in `http.test.ts` and would have turned **every successful favourite write into a `MALFORMED`
  failure**, because `Response.json()` rejects on the empty body of a `204`. Note that
  `favorites-api.test.ts` stays green under that mutation — it stubs the transport — which is
  precisely why the write is tested at the `http.ts` level and on the wire (§2.3) and not only
  through the favourites client.

### 2.3 Verified against real HTTP, not only against stubs

Fixtures agreeing with each other proves nothing about the wire. The real `http.ts`, the real
narrowing and the real presentation functions were run against a socket, and against the live server
on this branch.

**Against the live server (`pnpm start`, `:8099`), which is the state a reviewer can reproduce:**

| Case | Result |
| --- | --- |
| `GET`, `PUT`, `DELETE /v1/dramas/{id}/favorite`, with and without an `Authorization: Bearer` header | `404 COMMON_RESOURCE_NOT_FOUND` from Fastify's not-found handler, every time. **The endpoints are not deployed on this branch** — that is not a client bug and it must not render as one |
| The whole screen's read, through `collectFavorites` | `UNAVAILABLE` → the empty state, in **5 HTTP requests** (1 feed + 4 probes) rather than 7. The short-circuit stops the fan-out after the first batch instead of collecting six identical `404`s |
| `GET /v1/recommendations/feed?scene=HOME&limit=20` | `200`, 6 cards, 6 distinct dramas. The candidate source is real today, which is why this screen is exercisable end to end and not a component with no data path |

**Against a socket serving the contract's own shapes**, because the endpoints above cannot yet produce
a followed row:

| Case | Result |
| --- | --- |
| `200 { dramaId, favorited: true, favoritedAt }` | narrows, and the row is a value rather than a failure |
| `200 { dramaId, favorited: false }` — no `favoritedAt` | narrows with the field absent, which is what `exactOptionalPropertyTypes` requires and what a stub is least likely to get right |
| `DELETE` → `204` | `ok`, and `json()` is never called. This is the case that fails loudly if the `204` branch is removed |
| `PUT` → `204` | `ok`, same |
| `401` on a read | `AUTH_REQUIRED`, one request — no automatic retry of an auth failure |
| `401` on a write | `AUTH_REQUIRED` at the row, not over the list |
| `404 COMMON_RESOURCE_NOT_FOUND` on a write | `UNAVAILABLE` — “following is not available yet”, not “your drama is gone” |
| `410 CONTENT_OFFLINE` on a write | `GONE`, and no retry button |
| `DELETE` while the drama is withdrawn | `204`. Un-following is never the operation that traps a row on the screen (J's S45) |

**Then the built bundle was rendered in Chrome at 430×932** against a same-origin harness — same
origin deliberately, because cross-origin is a real deployment gap and not this slot's to fix (W2-H
§5):

- **Populated list:** two rows, most recently followed first, the unfollowed candidate absent, the
  coverage notice under them. Covers render as the labelled placeholder because
  `cdn.example.invalid` does not resolve.
- **Empty:** “You are not following anything yet” + “Find something to follow”, **and the coverage
  notice**, which is the whole point of F4 — the sentence qualifies an empty list at least as much
  as a full one.
- **`401`:** the sign-in prompt, and no empty state, no error component and no coverage notice
  anywhere on the screen.
- **`404` (not deployed):** the empty state, visually identical to a genuinely empty list and still
  distinguishable in the DOM by `data-state="unavailable"`.
- **One probe answering `503`:** both rows still on screen, with “Try again” *under* them rather than
  in place of them.

---

## 3. Decisions taken in this slot

Numbered `F*` to avoid colliding with the server slots' `S*`, W2-H's `H*` and W3-M's `M*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| F1 | **The screen is built from per-drama reads over a candidate page, not from a list endpoint** | The list endpoint does not exist and is not this slot's to add (§1.2). The alternative was not building SCR-08 at all, which is what W5 did | Delete two modules when the list endpoint lands (§6) |
| F2 | **The candidate source is the recommendation feed, not the watch history** | Both are seams; only one is deployed. History would also have made a `401` arrive from the candidate source *and* from the probes, giving two code paths to one state | Swap one function |
| F3 | **Twenty candidates, four in flight** | A WebView holds ~6 connections per host, and the client's 10s timeout starts when the request is *made* — so twenty at once means the last fourteen can time out having never left the device. Four leaves connections free for the cover images the rows are about to request | Two constants |
| F4 | **The coverage notice is not optional, and it appears on the empty state too** | An incomplete favourites list is indistinguishable from a drama the viewer never followed, so saying nothing reads as the product having lost something they chose. “You follow nothing” is a claim this screen is not in a position to make | Delete one paragraph, and the screen starts overstating what it knows |
| F5 | **A `401` or an unavailable status ends the whole fan-out at the first probe** | Both answer identically for every remaining candidate: no session, or no endpoint. Nineteen more requests buy nineteen more identical failures and a slower sign-in prompt. Confirmed on the live server: 5 requests instead of 7 (§2.3) | One predicate |
| F6 | **A session that expires mid-fan-out discards the rows already collected** | The opposite of F7, deliberately. Those rows are a *fragment* of the list presented as the list, on the screen whose one job is to keep “your list” apart from “the part of your list we could read”. The reload after a successful sign-in produces the whole thing | One branch |
| F7 | **A probe that merely failed keeps the rows and adds a notice under them** | Once there is content on screen, replacing it because one of twenty requests timed out costs the viewer the list to tell them something a sentence can say (W2-H's H9). A timeout is not a statement about the nineteen dramas that answered | One branch |
| F8 | **A refused probe (`400`) degrades to a sentence with nothing to press; a timeout or `5xx` gets “Try again”** | A retry button that cannot succeed is the mistake `data/failure.ts` exists to prevent, one screen further in. But it cannot be hidden either: the list is still not known to be complete | One ternary |
| F9 | **The retry for a partial read reloads the whole list, not the failed probe** | By the time the viewer presses it, the answers we *did* get are stale too. A per-drama repeat would produce a list assembled from two different moments | One handler |
| F10 | **A removed row stays on screen, un-followed, with an undo** | Deleting it is what most lists do and it is wrong here: the list is assembled by asking about twenty dramas, so a row that disappears cannot come back without redoing that, and the viewer's scroll position moves under the finger that just touched it. Keeping it is also what makes `PUT` reachable from this screen | Delete the row on success, and lose the undo |
| F11 | **The action state is the row's own, not the page's** | One failure state for twenty rows is exactly how “something went wrong” ends up on a screen where nineteen things went right. A viewer un-following three dramas must not have the second attempt cancel the first | Lift one `useState` |
| F12 | **A failed write is presented by *code*, not by status — the only place in the client that is true** | `PUT` answers `404 CONTENT_NOT_FOUND` for a drama that was never published, `410 CONTENT_OFFLINE` for a withdrawn one (J's S46), and Fastify answers `404 COMMON_RESOURCE_NOT_FOUND` when the module is absent, which is the situation on this branch. Only the code separates “your drama is gone” from “we have not shipped this yet” | One predicate, and the two become indistinguishable |
| F13 | **An unreadable envelope on a `404` write degrades to `UNAVAILABLE`, never to `GONE`** | Both leave the row where it is, and only one of them tells a viewer their content was withdrawn on the strength of a body we could not parse. This is F12's exception and the reason reads stay keyed on status (M4) | One default |
| F14 | **A `401` on a row action is a sign-in prompt at the row, and it re-runs the action the viewer asked for** | Nothing failed and nothing is gone — the viewer is simply not known, which is M1 applied one level down. Re-running the original action means a session that expired between opening the screen and pressing a button costs one tap rather than a reload | One callback |
| F15 | **A second write on a row in flight is refused, not merely disabled** | Two writes racing for one row means the loser decides what the viewer ends up following. `disabled` is a rendering detail; the guard is the invariant | One early return |
| F16 | **`favoritedAt` is the sort key and is displayed nowhere** | It is the server's clock. “Following since 3 August” is a value the client has no authority over and cannot keep in step across devices — the same rule that keeps the resume position off the history row (M15) | One element |
| F17 | **The order is recency, then drama id** | The tiebreak is not decoration: without it, two rows followed in the same millisecond — or any two rows whose timestamps were unreadable — are ordered by whichever probe resolved first, which changes between renders and moves a row out from under the viewer's finger | One comparator clause |
| F18 | **A row with no usable timestamp sorts last** | The alternative promotes exactly the rows we know least about to the top of the screen |  One branch |
| F19 | **Timestamps are parsed, not string-compared** | The server sends `Date.toISOString()`, which sorts correctly as text — but a timestamp with an offset (`+03:00`) does not, and a favourites list silently in the wrong order is a bug nobody reports | One function |
| F20 | **`narrowFavoriteState` is strict about `favorited` and checks `dramaId` for *agreement*** | `favorited` is the whole answer, and a missing or non-boolean value defaulted to `false` would make the viewer's row silently vanish from their own list. The `dramaId` check is not a presence check — the client already knows what it asked about — it is the one guard against a mis-keyed cache or a proxy putting **another viewer's favourite on this screen** | Two conditions |
| F21 | **The transport gained `PUT`/`DELETE` and deliberately no `POST`** | The single automatic retry (IA §8.2) is safe on these two because the server publishes both as idempotent (J's S45, S47). `POST` is the verb that is not, so excluding it from the type is what keeps the retry from ever being applied to a non-idempotent write. It is a property of the endpoint, not an assumption about the network | Add one string to a union |
| F22 | **A successful write is never parsed as JSON** | A `204` has no body and `Response.json()` rejects on an empty one, which would turn every successful favourite into a `MALFORMED` failure. Verified on the wire, and mutation-tested (§2.2/§2.3) | One condition, and every write breaks |
| F23 | **`HttpClient` split into `HttpReader` + `HttpWriter`** | “This module cannot mutate anything” becomes a fact a reader checks at the import rather than a claim in a comment; the catalogue and history clients now declare `HttpReader`. It also keeps their test doubles at one method, because one method is all they may be asked for | Merge two interfaces |
| F24 | **The session-read split moved to `data/session-read.ts` rather than being copied** | Two copies of “a `401` is not an empty list” is two chances for one screen to start reading it as one. `presentHistoryFailure` stays as the history's name for it, so that screen's 9 tests are untouched | Inline it back |
| F25 | **`FavoriteState` is copied from slot J, not merged** | An integrator is in flight, and merging a server slot to obtain one interface is not a trade a client screen is allowed to make. The copy is marked at the definition and is one line to delete (§5, G-F1) | Delete an interface, add an import |
| F26 | **`FavoritesApi` is its own interface, not part of `CatalogApi`** | The catalogue reads are anonymous-capable and these are not (M9). Folding a session-scoped *write* into the interface every anonymous surface depends on would grow every catalogue screen's test double a method about identity that no catalogue screen can produce | Merge two interfaces |
| F27 | **The screen requests even when the client believes nobody is signed in** | M6, unchanged and still load-bearing: the session state decides what a screen *says*, the server decides what a viewer may *see*. A client-side skip makes the client an authority on identity and shows a sign-in prompt over a list the server would have returned | One early return |
| F28 | **Every row button carries an accessible name naming the drama** | A list of five buttons all announced as “Remove” is a list a screen-reader user cannot act on. The visible label is disambiguated by the row it sits in; an accessible name is not | Two `aria-label`s |
| F29 | **The eight ways this screen can render stay distinguishable in the DOM via `data-state`** — `loading`, `ready`, `empty`, `auth_required`, `unavailable`, `error`, `incomplete`, `unresolved` | The viewer seeing the same empty state for “not deployed” and for a real empty list is the intended degradation (M2/M3). A test, a bug report or a future analytics event still needing to tell them apart is the reason the attribute exists | Delete one attribute |

---

## 4. Deliberately not built

- **No favourite button on the drama or feed screens.** `PUT`/`DELETE` are wired here only. The
  detail screen's favourite toggle needs `DramaDetail.viewer`, which is `null` on this branch, and a
  toggle whose initial state is a second request per card is a feed decision, not this screen's.
- **No paging.** The candidate page is one feed page and the list is what it yields (F1). A “load
  more” here would page the *candidates*, not the favourites, which is a control that does not mean
  what it says.
- **No caching.** Navigating profile → favourites → back re-reads the feed and re-probes, like every
  other screen in the client.
- **No optimistic *add*.** Un-following is offered optimistically because `DELETE` cannot fail on the
  catalogue's account; re-following is not, because `PUT` can (F12). The undo shows “Restoring…” and
  waits.
- **No bulk edit / select-many.** SCR-08's edit mode (J8) is a list-endpoint feature: there is no
  stable list to select from until the read exists.
- **No withdrawn-item scrim.** Same gap as the history screen's G-M2 — `DramaSummary` carries no
  status field, so a delisted drama in the list looks normal and the failure surfaces one tap later.
- **No `favoritedAt` display, no relative dates.** F16, plus a localised relative date needs a
  formatting policy this slot would have had to invent.
- **No real silent login.** Unchanged from W3-M: no `TTMinis.login()`, no `Authorization` header, no
  token store. The seam is `Session` and one value in `main.tsx`.
- **No analytics.** Favourite rows carry no tracking id; the server mints impression ids per feed
  response and there is no equivalent for this list.
- **No tab bar, no back-stack synthesis, no capsule rect probe.** As W2-H and W3-M left them; the
  screen is reached from the profile.
- **Nothing on the server, nothing in the contracts, nothing in CI.** The favourite endpoints are
  slot J's and the workflow is in flight elsewhere.

---

## 5. Known gaps in this slot's own work

- **G-F1: `FavoriteState` is a copy.** `app/src/data/favorites-api.ts` duplicates the interface from
  `packages/shared/src/discovery.ts` on `cursor/w2-work-j-acf5` (F25). **For the integrator:** delete
  the interface and its doc comment, and add `FavoriteState` to the type import from
  `@minidrama/shared`. Nothing else changes — the field names, the optionality of `favoritedAt` and
  the narrowing all already match. If the merged type differs, `narrowFavoriteState` and its 16 tests
  are where the difference will surface.
- **G-F2: the list can be wrong, not just partial.** This is F1's cost and the largest gap in the
  slot. A viewer who follows a drama outside the candidate page does not see it. The screen says so;
  a sentence is not a fix. **This wants closing with `GET /v1/users/me/favorites`** (§6).
- **G-F3: the screen's content state has never run against a real server**, because the endpoints do
  not exist on this branch (§2.3). It has run against real HTTP with the contract's own shapes, which
  is the closest available thing, and `narrowFavoriteState` is the part most likely to need a fix
  when the real payload lands.
- **G-F4: the fan-out is `candidates / 4` round trips before the first row can be trusted to be the
  first row.** At the seed catalogue that is two; at twenty candidates it is five. The screen shows a
  skeleton throughout rather than streaming rows in, because a list that reorders as answers arrive
  is worse than a list that appears late — but it does mean SCR-08 is the slowest screen in the app.
- **G-F5: `GONE` is only reachable from the undo.** `DELETE` is documented never to fail on the
  catalogue's account, so the `410` path (F12) is exercised by tests and by the socket probe, and in
  the product only by a viewer who un-follows a drama and then presses undo after it was withdrawn.
  It is still the right classification for the day `PUT` is wired to the drama screen.
- **G-F6: a removed row that the viewer navigates away from and back to reappears as followed until
  the re-read answers.** There is no client cache (§4), so the row is correct after the read — but the
  intermediate state is a row that says “Remove” for a drama that is no longer followed.
- **The `favorites.partial` notice is permanent copy for a temporary architecture.** It has to be
  deleted in the same change that adds the list endpoint, or the screen will keep apologising for a
  limitation it no longer has.
- **No weak-network banner, no `AUTH_TOKEN_EXPIRED` interceptor.** Unchanged from W2-H §5, and the
  interceptor now has a second customer with twenty times the request count.
- **The per-row sign-in prompt has no throttle**, the same gap W3-M registered for the page-level one.
- **`data-testid` attributes ship in the production bundle.** Unchanged, deliberate, reversible.

---

## 6. For the next slots

**For the integrator.** This branch touches `app/src/` only, and the two files most likely to
conflict are the ones W3-M also owned: `main.tsx` (one client and one provider added) and
`routes.ts` (one path added). Both are additive. The one *semantic* interaction is G-F1: when slot J's
`packages/shared` lands, `FavoriteState` exists in two places, and the client's copy is the one to
delete. `history-presentation.ts` shrank to a re-export over `session-read.ts` — if a concurrent slot
edited it, take `session-read.ts` as the source of truth and keep the history's name pointing at it
(F24).

**For whoever adds `GET /v1/users/me/favorites`** — and please do; it is G-F2. The client change is a
deletion, not a rewrite: `favorite-candidates.ts` goes, `collectFavorites` becomes one paged read
behind the same `FavoritesList` shape, `usePagedResource` replaces `useResource`, and the
`favorites.partial` notice is removed in the same commit. `FavoriteRow` and `favorite-action.ts` are
unaffected. Return `DramaSummary` plus `favoritedAt` per entry, sorted most-recent-first server-side
(F17 then becomes the server's job, which is where it belongs), with an opaque `nextCursor` and a
`hasMore` that agrees with it. When it exists, the `404` branch of `presentSessionReadFailure` stops
being a degradation for this screen and becomes dead weight worth deleting *deliberately* — a `405`
from a proxy would otherwise render as an empty list rather than as the bug it is (M2).

**For whoever wires the drama screen's favourite toggle.** `FavoritesApi` and
`presentFavoriteActionFailure` are ready and need no changes: the four-way split (`AUTH_REQUIRED`,
`GONE`, `UNAVAILABLE`, `ERROR`) is exactly what a toggle needs, and F12's code-versus-status rule is
the part not to re-derive. What is missing is the *initial* state — `DramaDetail.viewer` is `null`, so
today a toggle would need its own `GET` per drama. Prefer `viewer.favorited` on the detail response
over a second request.

**For whoever implements identity.** Unchanged from W3-M §6, with one addition: the favourite writes
are the client's first session-scoped *writes*, so a token refresh must not lose them. A `401` on a
write currently surfaces at the row as a sign-in prompt that re-runs the action (F14); a real
interceptor should retry the write once after a successful refresh and only then fall back to that
prompt.

**For whoever adds the `Authorization` header.** It belongs in `createHttpClient`, which all three
clients now share (`main.tsx`), so one change covers the catalogue, the history and the favourites.
The catalogue reads must stay anonymous-capable — including the feed, which this screen now depends on
as its candidate source (F2), so a header must not become a precondition for assembling a favourites
list.

**For whoever builds the tab bar.** `#/me`, `#/history` and `#/favorites` are all registered and
reachable from the profile. The player route must stay chrome-free: SCR-05 is immersive.
