# Handoff — Wave 3, Work Slot O: the search screen

> **Branch:** `cursor/w3-work-o-1f19`, cut from `cursor/w2-work-h-5c79` (the app's feed and
> catalogue surfaces).
> **Scope:** the client half of `U4`. `#/search` against `GET /v1/search`, the search client and its
> response narrowing, and the one entry point that makes the route reachable.
> **Not in scope:** nothing under `server/`, nothing in `app/tools/`, nothing in
> `contracts/openapi.yaml`. No favourites, no watch progress, no unlock, no identity, no CORS. The
> feed and drama screens keep their behaviour; the only edit to either is a link. No `<video>`,
> `<audio>` or `<iframe>` entered the source or the artifact. No pull request was opened.

---

## 1. What this slot closes

The search API shipped in W2 slot J (`docs/handoff/w2-work-j.md`) and nothing called it. The 剧场
tab's search entry has been built-but-hidden since W1 because there was no contract behind it (gap
**G5**); slot J gave it a contract, and this slot gives it a screen.

The rule this slot exists to get right is the one that separates three answers a lazier surface
renders as one empty box:

| The viewer sees | Because | Why it must be its own state |
| --- | --- | --- |
| A prompt, and **no request is made** | The box is empty | An empty box has not been searched. `q=` is a `400 COMMON_VALIDATION_FAILED` by contract, so sending it renders "you have not typed anything yet" as an error screen |
| **"No results for X"**, naming what they typed | `200` with `items: []` | This is a fact about the catalogue. The recovery is a *different query*, not a retry — retrying returns the same nothing |
| **An error**, with a retry or a way out | The request failed | This is a fact about us. Telling the viewer their query matched nothing when the request never arrived sends them off to rewrite a perfectly good query |

There is a fourth, reachable only from a deep link: a query longer than the contract's 64 characters
is declined locally rather than sent, because the only answer it can get is a validation error
(§3, O5).

The three are separately reachable, separately styled and separately asserted. Collapsing them is
not something a reviewer has to catch — §2.3 records the mutation that proves the tests fail when
they are collapsed.

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `packages/shared/src/discovery.ts` | **Taken verbatim from `cursor/w2-work-j-acf5`.** `DramaSearchHit`, `DramaSearchResults`, `FavoriteState`, `DramaSearchMatch` |
| `packages/shared/src/index.ts` | One export line added |
| `app/src/data/search-api.ts` | `SearchApi` (the seam), `classifySearchQuery`, the contract's bounds, and the response narrowing |
| `app/src/data/search-api-context.tsx` | The provider and `useSearchApi`, with no default value |
| `app/src/routes/SearchPage.tsx` | The screen: the box, the four query states, and the result list |
| `app/src/discovery/SearchHitRow.tsx` | One hit — a title, its tags, and the tag-match label |
| `app/src/routes/routes.ts` | `#/search` added; `searchPath`, `SEARCH_QUERY_PARAM` |
| `app/src/components/states.tsx` | `EmptyState` gained an optional `messageParams`, so an empty result set can name what was looked for |
| `app/src/routes/HomePage.tsx` | One `<Link>`. The only edit to an existing screen in this diff |
| `app/src/core/i18n/locales/{en,ar}.json` | 12 new keys in both locales |
| `app/src/styles/app.css` | The search block |
| `app/src/main.tsx` | Builds both API clients over one HTTP client and provides them |
| `app/src/testing/search-fixtures.ts` | The `SearchApi` stub and its fixtures |
| `app/src/testing/render.tsx` | Both clients now default to an unscripted stub |

Nothing under `server/`, `contracts/` or `app/tools/` is in this diff. `contracts/openapi.yaml` is
deliberately untouched — see O1.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **671 passing, 0 skipped, 0 failing** — 306 app (was 242), 338 server, 16 config, 11 shared |
| Build | `pnpm build` | pass — `index-CaQR5QG9.js` 268.42 kB (85.63 kB gzipped) + `index-eQtGmQvx.css` 5.64 kB (1.57 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle grew 5.8 kB raw / 1.6 kB gzipped. No existing test was modified to accommodate this
work, weakened, skipped or deleted; the four that changed (`App.test.tsx`, `routes.test.ts`,
`states.test.tsx`, `HomePage.test.tsx`) all gained assertions, and `App.test.tsx` additionally moved
onto the shared render helper rather than keeping a second copy of the provider stack.

### 2.2 Verified against the running search server, not only against fixtures

Fixtures agreeing with each other proves nothing about the wire. `cursor/w2-work-j-acf5` was checked
out in a worktree and its server run on `:8099`, and this branch's **real** `createSearchApi`,
`classifySearchQuery` and `classifyFailure` were driven against it — then the screen itself was
rendered in Chrome at a phone viewport against the same server.

| Probe | What the real client produced |
| --- | --- |
| `  Twin   MOONS ` | `200`, one hit, `matchedOn: TITLE`. The echo comes back `"Twin MOONS"` — normalised for whitespace, **not** for case, exactly as the type documents. That is why the no-results copy renders the echo and not the input box |
| `time-travel` | `200`, the same drama, `matchedOn: TAG`. The two tiers really do arrive distinguished, so the "Matched a tag" label has something to key off |
| `the` | Three hits, including `Mother's Debt` — slot J's documented substring false positive (§6 there), confirmed live rather than assumed |
| `zzzzzz` | `200` with `items: []`. A value, not a failure |
| `   ` and 65 × `a` | **No request issued.** `EMPTY` and `TOO_LONG` are decided before the client touches the network |
| `the` with `limit=1` | One hit and `truncated: true`, so the "narrow your search" line has a real trigger |
| `the` with `limit=500` | `400` → `HTTP`/`COMMON_VALIDATION_FAILED` → surface `TERMINAL` / `REJECTED`. Correct: the server refused the request and repeating it identically cannot change the answer |

Rendered at ~500 × 1000 against the same server, the four states are visibly different screens: the
prompt with no Clear button; one hit card with its tags and no cover; `No results for "zzzzzz". Try
a different title or tag.` with nothing pressable; and — with the server stopped — `Something
interrupted the connection` with a Try again button and the query still in the box.

Two things that rendering confirmed and a test could not: a hit card carries no image element at
all (there is no `coverUrl` on the wire, so there is no broken-image placeholder either, unlike
every catalogue surface today), and the tag-match label appears on the tag query and is absent on
the title query.

**Browser reads only work with CORS disabled.** The server sends no `Access-Control-Allow-Origin`,
so Chrome was run with web security off to isolate this screen from that. This is the same gap
`docs/handoff/w2-work-h.md` §5 records, it is in flight in another slot, and nothing here changes it.

### 2.3 Where the 64 new app tests go, and which of them were probed by mutation

| Group | Tests | Protects |
| --- | --- | --- |
| `data/search-api.test.ts` | 26 | The path and the published bounds, `q` on the wire, empty/over-long/normalised query classification, and that a `200` in the wrong shape is a failure |
| `routes/SearchPage.test.tsx` | 25 | The four query states as four different screens, the term living in the route, and the search box |
| `discovery/SearchHitRow.test.tsx` | 6 | The row's destination and id escaping, the tag label, an unknown tier, and that no image is rendered |
| `routes/routes.test.ts` | 3 new | The search path, the bare path, and term escaping |
| `components/states.test.tsx` | 2 new | That an empty state can name what was looked for, and that an unfilled placeholder stays visible |
| `App.test.tsx`, `routes/HomePage.test.tsx` | 2 new | The search route, and the entry point that reaches it |

Three were probed by mutation rather than assumed:

- Mounting the results section unconditionally — that is, letting an empty box issue a request —
  fails **7** tests, not one.
- Reporting a `MALFORMED` body as an empty result set fails "is not confused with an empty result
  set when the body was unreadable".
- Casting `matchedOn` into the union instead of narrowing it fails "degrades an unrecognised match
  tier to null instead of rejecting the hit".

---

## 3. Decisions taken in this slot

Numbered `O*` to avoid colliding with the server slots' `S*` and slot H's `H*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| O1 | **`contracts/openapi.yaml` is not touched, and the search operation stays on the API branch** | `server/src/contract.test.ts` asserts that every documented operation reaches a running handler. Documenting `/v1/search` here, where no handler exists, breaks that test — and the invariant it protects ("a path in this document always has a running handler") is worth more than a client-side branch having the document early. The contract arrives with the server it describes | None; the operation is already written on `cursor/w2-work-j-acf5` |
| O2 | **`packages/shared/src/discovery.ts` is copied byte-for-byte, including `FavoriteState`, which nothing here uses** | The two branches must merge without a conflict in a file that is pure wire contract. Trimming it to the search half would make the merge a three-way diff over the one file where the client and the server have to agree exactly; an unused interface costs nothing and erases nothing | Delete the unused half |
| O3 | **`SearchApi` is its own seam, not a method on `CatalogApi`** | They are two modules on the server answering two questions — "which drama did the viewer mean" and "what is in this drama". Folded together, every screen test that needs one has to supply the other, and the catalogue interface acquires a method with no cursor while all three of its own have one | Merge two interfaces and one provider |
| O4 | **Both clients are built over one `HttpClient`** | The timeout, the single automatic retry and the envelope parsing are properties of talking to *this API*, not of talking to the catalogue. Two transports is two places to get a timeout wrong | None |
| O5 | **The client declines to send a query it knows the contract refuses — empty, or over 64 characters** | This is the input edge, which is the one place mirroring a server rule is safe: they are `minLength` / `maxLength` in the OpenAPI document, they exist to be enforced by a form, and the round trip they save can only end in `400 COMMON_VALIDATION_FAILED`. Nothing about *what matches* is decided on the client. The empty case is the important one — see §1 | Delete `classifySearchQuery` and let the surface send anything |
| O6 | **The results section is a child component mounted only when there is a query** | It is what makes "no request is made" structural rather than conditional: the hook cannot fire before its component exists, so nobody can reintroduce the empty-query request with an early `return` in the wrong place | Inline it, and guard the loader instead |
| O7 | **The term lives in `?q=`, and submitting `replace`s the history entry rather than pushing one** | The route as the source of truth is IA §5, so back and a shared link both restore the results. `replace` because inside a WebView back is also how the viewer leaves the mini app: one entry per refinement makes leaving take five presses. The cost is that back does not step through previous searches | One flag — but it belongs to whoever owns the back stack (§5) |
| O8 | **Searching happens on submit, not on every keystroke** | Search-as-you-type is the better feel and it is also one request per character against an endpoint that folds every title on every call and has no rate limit today (`docs/handoff/w2-work-j.md` §6). The debounce that makes it safe belongs *with* the rate limit, not ahead of it | Add a debounce hook; the URL plumbing is already right for it |
| O9 | **The no-results state names the server's echoed `query`, never the input box** | The two differ the moment the viewer keeps typing, and only the echo describes the list — or the absence of one — actually on screen. It is also why the wire carries the echo at all | Read `submitted` instead, and lose the guarantee |
| O10 | **The no-results state offers no action button** | The IA makes an empty state's way out mandatory (§8.1) and here it is permanently on screen: the search field directly above, still holding the query being complained about. A retry would re-ask a question already answered, and a link home would leave the screen rather than fix the search | Pass an `action` |
| O11 | **An unrecognised `matchedOn` degrades to `null` instead of rejecting the hit or being cast** | The contract publishes two tiers and the ranking behind it already distinguishes four (title prefix, title substring, exact tag, partial tag), so a third value reaching a shipped bundle is a question of when — and a mini app cannot be redeployed the same afternoon. Casting puts an unhandled value into a `switch`; rejecting takes the whole screen down over a *label*. The row is what the viewer asked for; the label is not | Narrow to the wire type and accept one of those two failures |
| O12 | **The match label is a total `Record<DramaSearchMatch, TranslationKey \| null>`** | O11 makes an unknown tier survivable at runtime; this makes a *known* new tier a compile error, so widening the union cannot ship as a silently blank label | None |
| O13 | **A hit is a title and its tags, with no cover and no episode count** | The wire deliberately omits them: a hit carries what search itself knows, and a second partial copy of `DramaSummary` is how two shapes of one drama start disagreeing about `totalEpisodes`. Fetching a summary per row to fill the gap would be *n* catalogue reads to decorate a list the viewer is about to leave | The field is already named — `items[].drama`, slot J change J-a |
| O14 | **There is no "load more"; `truncated` renders a line asking for a narrower query** | Relevance order is not a keyset, so a next page of a ranking needs a snapshot of that ranking to mean anything. `usePagedResource` would need a cursor the endpoint does not have and cannot have | It is `useResource` today; paging needs the server first |
| O15 | **`TOO_LONG` is a fourth state, reachable only from a deep link** | The field caps typing at 64, so nothing a viewer does produces one — but a link can, and it is neither an empty box nor an empty result set nor a failure. Rendering it as a terminal error would blame us for a link | Delete one branch and let the server answer |
| O16 | **One `<Link>` was added to `HomePage`, and it is the only edit to an existing screen** | There is no tab bar yet (`docs/handoff/w2-work-h.md` §4), so without it the route is reachable only by deep link — which is the state the 剧场 tab's search entry has been in since W1. Kept to a single element on purpose, so a conflict with the in-flight history work is one line | Delete the element |
| O17 | **`EmptyState` gained `messageParams` rather than the search screen growing a bespoke empty block** | The whole reason the four non-content states are shared components is that they must not drift into four shapes with four recovery affordances. "No results for X" is the same state with a filled placeholder, not a new one | Inline a block, and start the drift |
| O18 | **`renderSurface` defaults both API clients to an unscripted stub** | A test supplies only the client its screen calls. Omitting the other entirely would be tidier and would also mean a screen that grew a second read failed at the context guard rather than at the assertion under test | Make both required again |

---

## 4. Deliberately not built

Listed so nobody re-scopes it as an omission.

- **No favourites.** `FavoriteState` rides along in the shared types (O2) and no client code reads
  it. The three endpoints are authenticated and nothing in this client sends an `Authorization`
  header yet.
- **No browse screen (SCR-03's other half).** `GET /v1/dramas` and its `category` / `tag` / `sort`
  filters are still unused. Search and browse are two different lists and this slot built one;
  `docs/handoff/w2-work-h.md` §6 still holds for the other.
- **No search history, no suggestions, no recent queries, no autocomplete.** All of them need
  storage or an endpoint, and the query log deliberately does not exist (slot J, S58).
- **No search analytics.** No impression, no click, no empty-result rate. `POST /events/batch` does
  not exist, and the empty-result rate specifically needs a privacy decision attached (slot J §6).
- **No filters on the search results.** The endpoint takes `q` and `limit` and nothing else.
- **No debounce and no in-flight cancellation beyond `useResource`'s existing superseded-result
  guard.** See O8.
- **No caching.** Leaving and returning to a search re-runs it. The response carries no cache header
  at all today (slot J, S49), so there is nothing to honour even if the client wanted to.
- **No keyboard handling beyond a native form.** No autofocus on arrival, no keyboard-avoidance
  padding, no explicit dismissal on submit — the platform's own behaviour is what runs.
- **No locale switching.** Everything renders in `DEFAULT_LOCALE`; both bundles are at parity and
  the Arabic strings are complete.
- **No `<video>`, no media of any kind.** There is none on this screen and none on the wire it
  reads.

---

## 5. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover.

- **A result row is a title and two tags on a dark card, and it looks it.** The catalogue's own
  lists have covers, episode counts and a completion badge; this one cannot, because the wire does
  not carry them (O13). Until slot J's change J-a lands, search results and browse results are
  visibly two different products. This is the largest single thing wrong with the screen and it is
  fixed on the server, not here.
- **`truncated` is reported in a sentence and there is nothing the viewer can press.** "Narrow your
  search" is advice, not an affordance. Nothing suggests *how* to narrow it, because suggestions
  would need the query log that deliberately does not exist.
- **The client never sends `limit`, so it always takes the server's default of 20.** That is fine
  and it also means `truncated` fires at 20 on a catalogue of eight seed dramas and would fire
  constantly on a real one. Whoever tunes it should tune the copy at the same time.
- **A search reruns on every arrival, including a back navigation from a drama.** `useResource` is
  keyed on the query, and there is no cache anywhere in the client (`docs/handoff/w2-work-h.md` §5).
  Tapping a result and coming back re-issues the request and loses the scroll position.
- **Back does not step through previous searches** (O7). A viewer who refines three times and wants
  their first query has to retype it. If the back-stack slot decides otherwise, the change is one
  flag in `SearchPage`, and it should be decided there rather than here.
- **The substring false positive is visible in the product.** Searching `the` returns
  `Mother's Debt`, confirmed live (§2.2). The ranking limits the damage and the row is still in the
  list; the fix is per-language tokenisation on the server (slot J §6), and there is nothing the
  client can do about it that would not be a second, worse ranking.
- **Nothing announces a result count to a screen reader.** The list swaps under a static heading,
  and an assistive technology user gets no "3 results" and no announcement that the state changed. A
  `role="status"` region is the obvious fix and it was left out rather than guessed at, because it
  interacts with how the skeleton already announces itself.
- **The 64-character cap is enforced by `maxLength`, which silently drops the 65th keystroke.**
  Nothing tells the viewer why. It is the standard behaviour of a capped field and it is still a
  small piece of unexplained UI.
- **`TOO_LONG` and the idle prompt share one paragraph element with two different test ids.** They
  are genuinely different states (O15) rendered by one component, and a third non-network state
  would be the point to split it.
- **Rendering was verified with browser security disabled** (§2.2). The CORS gap is real, it is in
  flight elsewhere, and until it closes this screen fails exactly as every other read does.

---

## 6. For the next slots

**For whoever merges the search API branch** (`cursor/w2-work-j-acf5`). The merge should be quiet.
`packages/shared/src/discovery.ts` is byte-identical on both sides (O2) and
`packages/shared/src/index.ts` gains its export line from whichever lands first. The one file that
will conflict is `contracts/openapi.yaml`, and only because this branch does not touch it (O1) — take
the API branch's version whole. Nothing in `server/` is contested. After the merge,
`server/src/contract.test.ts` covers `/v1/search` and this client is already pointed at it; the
probes in §2.2 are worth re-running once, because they are the only thing that has ever exercised
the two halves together.

**For whoever lands slot J's change J-a** (`DramaSearchHit` gains `drama: DramaSummary`). Three
places change and no logic does. `narrowSearchHit` in `app/src/data/search-api.ts` gains a
`narrowDramaSummary` call — copy the one in `catalog-api.ts` rather than re-deriving it, or lift it
into a shared narrowing module, because two different opinions about what makes a valid summary is
the drift the split shape was avoiding. `SearchHitRow` then renders a `CoverImage` and the meta line
the feed card already has; consider rendering `FeedCardView`'s body directly at that point, since
the two rows become the same row. Keep `matchedOn` and its label — the summary does not carry the
reason a drama matched, and that is the one thing search knows that the catalogue does not.

**For whoever owns the back stack and the tab bar.** Two things here are yours to overturn: O7's
`replace` (search refines in place, back leaves the screen) and O16's single link on the home page,
which is a stand-in for the 剧场 tab's search entry and should be deleted the moment there is a real
tab bar. `searchPath(query)` builds a link to a pre-filled search from anywhere, which is what a
"more like this" or a tag chip would want.

**For whoever wires analytics.** Every result carries `data-drama-id` and `data-matched-on` on its
`<li>`, and the surface carries `data-query-state` and `data-status`. There is no `trackingId` on a
search hit — search does not mint one — so a click here cannot be joined to an impression the way a
feed card's can (S34). If search results need attribution, that is a field on the response and a
server change, not a client one. The empty-result rate is the single most useful signal this screen
could produce and it needs the privacy decision slot J flagged (§6 there) before it produces
anything.

**For whoever adds authenticated reads.** `createSearchApi` takes the same `HttpClient` the
catalogue does (O4), so an `Authorization` header attached inside that client covers search for
free. Search itself is anonymous by contract and must stay callable without a session — browsing has
to work before login, and the Minis client's silent login can fail before the viewer has typed
anything.
