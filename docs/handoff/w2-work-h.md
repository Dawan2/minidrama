# Handoff — Wave 2, Work Slot H: the app's feed and catalogue surfaces

> **Branch:** `cursor/w2-work-h-5c79`, cut from `cursor/w2-work-d-0d0f` (the catalogue read APIs).
> **Scope:** the client. The recommendation feed (SCR-02), the drama detail screen with its
> flattened episode list (SCR-04), the fallback screen's three variants (SCR-13), and the data layer
> the three of them share — one HTTP client, one failure classification, two resource hooks.
> **Not in scope:** nothing under `server/`, nothing in `app/tools/`. No entitlement, no watch
> progress, no unlock panel, no real playback. No pull request was opened.

---

## 1. What this slot closes

Before this slot the client was a Wave 1 skeleton: `HomePage` rendered a heading, a sentence saying
the catalogue arrives in Wave 2, and a hard-coded link to the player. The catalogue APIs existed and
nothing called them.

Now `GET /v1/recommendations/feed`, `GET /v1/dramas/{dramaId}` and
`GET /v1/dramas/{dramaId}/episodes` are wired, and the five page states the IA makes mandatory
(`docs/02-information-architecture.md` §8.1) exist as real, separately reachable, separately tested
screens rather than as a spinner and a blank.

The rule this slot exists to get right is the one in the brief: **a platform block and a
`NEED_UNLOCK` are not the same screen, and neither of them is an `UNAVAILABLE`.**

"You cannot watch this" is four different products:

| Server says | Screen shows | Why it must be its own state |
| --- | --- | --- |
| `NEED_UNLOCK` | price + "Unlock to watch" | The commercial funnel. This is the one that earns money |
| `NEED_VIP` | "VIP only", no price | A different product, a different rail, a different button |
| `NEED_UNLOCK` / `NEED_VIP` but the client cannot take money | "Not purchasable yet", no price | The block is **ours**. The episode is for sale; this TikTok build has no payment or subscription capability, or the ability is not granted to the app yet (IA §9). A normal buy button here dead-ends inside the bridge |
| `UNAVAILABLE` | "Unavailable", no price, nothing pressable | Not a sale at any price. The content is not serveable, and an unlock sold for it buys access to something that still would not play |

The last row is not a hypothetical. Episode 7 of `drm_revenge_0001` in the seed catalogue is served
as `UNAVAILABLE` **with `priceCoins: 60` still populated** — the price is a property of the episode
and the server does not blank it. A client that keyed the unlock button off the presence of a price
rather than off the reason would put that episode on sale today, and the refund would be ours. That
was verified against the running server, not inferred (§2.2).

---

## 2. What was delivered

| File | Contents |
| --- | --- |
| `app/src/data/failure.ts` | `ApiFailure`, `SurfaceError`, and `classifyFailure` — the retryable/terminal decision, made once |
| `app/src/data/http.ts` | The only module that makes a request: timeout, one automatic retry, envelope parsing, `Result` out |
| `app/src/data/catalog-api.ts` | `CatalogApi` (the seam), the three endpoints, and response narrowing |
| `app/src/data/catalog-api-context.tsx` | The provider and `useCatalogApi`, with no default value |
| `app/src/data/use-resource.ts` | A single keyed read as `loading` / `ready` / `failed` |
| `app/src/data/use-paged-resource.ts` | A cursor-paged list, with first-page and append failures kept apart |
| `app/src/catalog/access-presentation.ts` | `presentEpisodeAccess`: the table above, as code. The only place the client interprets access |
| `app/src/catalog/EpisodeRow.tsx` | One episode row, and the action→copy table |
| `app/src/catalog/FeedCardView.tsx` | One feed card, and `FreeBadge` — the sole permitted use of `freeEpisodes` |
| `app/src/components/states.tsx` | `Skeleton`, `EmptyState`, `RetryableError`, `TerminalError` (CMP-03 to CMP-05) |
| `app/src/components/CoverImage.tsx` | A poster that degrades to a labelled placeholder |
| `app/src/routes/HomePage.tsx` | SCR-02, the feed |
| `app/src/routes/DramaPage.tsx` | SCR-04, detail + episode list, as two independent reads |
| `app/src/routes/FallbackPage.tsx` | SCR-13, now with its three `?reason=` variants |
| `app/src/routes/routes.ts` | `#/drama/:dramaId` added; `dramaPath`, `fallbackPath`, `FALLBACK_REASONS` |
| `app/src/styles/app.css` | The app's only stylesheet. Safe-area padding and the 300ms skeleton delay are behaviour, not decoration |
| `app/src/testing/` | Fixtures, a render helper, and the import-hygiene guard that keeps them out of the bundle |
| `app/src/core/i18n/` | `{n}` interpolation in `translate`, and 30 new keys in both locales |
| `app/src/main.tsx` | Constructs the catalogue client from `VITE_API_BASE_URL` and provides it |

**Nothing outside `app/src/` was touched.** No file under `server/`, `packages/`, `contracts/` or
`app/tools/` is in this diff. The four guardrail modules and their tests are untouched; the new
source-tree check in `app/src/testing/import-hygiene.test.ts` runs in `pnpm test` and deliberately
does not extend `pnpm check:guardrails`.

### 2.1 Verification

| Gate | Command | Result |
| --- | --- | --- |
| Format | `pnpm format:check` | pass |
| Lint | `pnpm lint` | pass, 0 errors, 0 warnings |
| Types | `pnpm typecheck` | pass, 4 packages, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Tests | `pnpm test` | **580 passing, 0 skipped, 0 failing** — 242 app (was 92), 16 config, 11 shared, 338 server |
| Build | `pnpm build` | pass — `index-C_a3wcGH.js` 262.62 kB (84.02 kB gzipped) + `index-CzRTd5os.css` 4.39 kB (1.38 kB) |
| Guardrails | `pnpm check:guardrails` | pass against the real built bundle |

The bundle grew 19.8 kB raw / 6.0 kB gzipped, which is the router's route matching plus this slot's
own code. No `<video>`, `<audio>`, `<iframe>` or third-party player entered the source or the
artifact; the player route still holds the Wave 1 VePlayer facade placeholder and
`app/src/player/` is unmodified. No lint rule was relaxed, no test was weakened, skipped or
deleted. The three pre-existing test files that changed —`App.test.tsx`, `routes.test.ts` and the
locale files' test surface — all gained assertions.

### 2.2 Verified against the running server, not only against fixtures

Fixtures agreeing with each other proves nothing about the wire. The client's real narrowing,
classification and presentation were run against `server/` on `:8099`, and then the surfaces
themselves were rendered in Chrome at a 430×932 viewport against the same server.

What that confirmed, and what it caught:

- The feed narrows, pages on a real cursor, and the second page returns the remaining card.
- `drm_dynasty_0002` — the free-window pin from W2-D decision S21 — arrives with episode 4 as
  `s2e1`, `NEED_UNLOCK`, priced 80. The client renders it locked and does **not** recompute the
  window from `freeEpisodes`.
- `drm_revenge_0001` exercises five access states in one list: `FREE`, `NEED_UNLOCK` (60 coins),
  a content-ops `FREE` override *past* the free window at episode 5, `NEED_VIP`, and the
  `UNAVAILABLE`-with-a-price case at episode 7. Rendered: Play / "60 coins · Unlock to watch" /
  Play / "VIP only" / "Unavailable" with **no price and nothing pressable**.
- `404` and `410` render as visibly different terminal screens — "We could not find this drama."
  versus "This drama is no longer available." — each with a way home and no retry button.
- A tampered cursor answers `400`, which classifies as terminal rather than retryable. Correct: the
  server has already refused the request and repeating it cannot change the answer.
- Every cover renders as the labelled placeholder, because `cdn.example.invalid` is not a resolvable
  or trusted origin. That is W2-D's known gap made visible instead of a grid of broken-image icons.
- **Caught by rendering rather than by a test:** with the API on a different port, every read failed
  CORS and the feed showed the retryable error state. Correct behaviour, and a real deployment note
  — see §5.

### 2.3 Where the 150 new app tests go

| Group | Tests | Protects |
| --- | --- | --- |
| `routes/DramaPage.test.tsx` | 22 | The detail screen: two independent section states, 404 versus 410, "watch now" targeting, paging, and the four access states rendering as four different things |
| `data/http.test.ts` | 18 | Timeout versus offline, status survival through an unreadable body, retry exactly once, never rejecting |
| `data/catalog-api.test.ts` | 17 | Endpoint paths and id escaping, and that a `200` in the wrong shape is a failure — especially an episode with no `viewerAccess` |
| `data/failure.test.ts` | 16 | The retryable/terminal split, envelope reading from bodies nobody recognises, and that automatic retry excludes `429` |
| `routes/HomePage.test.tsx` | 15 | The feed's five states, both card destinations, cross-page dedup, and that an append failure keeps the list |
| `catalog/access-presentation.test.ts` | 15 | Every reason under both capability sets, failing closed, and that only `UNLOCK` ever shows a price |
| `data/use-paged-resource.test.ts` | 14 | Paging, dedup, append-versus-first-page failure, in-flight guards, and generation guards |
| `components/states.test.tsx` | 13 | That the four states differ, that terminal has no retry, and the cover fallback |
| `data/use-resource.test.ts` | 7 | Keyed refetch, superseded-result guards, and that a loader identity change does not refetch |
| `testing/import-hygiene.test.ts` | 4 | That test-only code cannot reach the bundle, and that the free-window rule is not reimplemented |
| `routes/routes.test.ts` | 5 new | The drama path, id escaping, and the fallback reasons |
| `routes/FallbackPage.test.tsx` | 3 | Three distinct variants, an unknown reason reading as `NOT_FOUND`, and a way home |
| `App.test.tsx` | 1 new | The drama route, and that an unmatched path carries a reason to the fallback |

Two of these were probed by mutation rather than assumed:

- Making `presentEpisodeAccess` read `episode.priceCoins` to decide whether to offer an unlock fails
  the `UNAVAILABLE` tests. It also cannot be written without changing the signature, because the
  function is not given the episode.
- Keying `useResource` on the loader instead of on `requestKey` does not fail one test — it
  exhausts the heap and kills the worker. That is how the bug was found in the first place (§3, H8).

---

## 3. Decisions taken in this slot

Recorded so the next slot can overturn them deliberately rather than by accident. Numbered `H*` to
avoid colliding with the server slots' `S*`.

| # | Decision | Reasoning | Cost to reverse |
| --- | --- | --- | --- |
| H1 | **Retryable versus terminal is decided from the failure, once, in `classifyFailure`** | Otherwise every screen re-derives it and one of them eventually puts a retry button on a `410`. The user then presses a button that cannot work until they give up on the app rather than on the page | One function; every surface already switches on the result |
| H2 | **A `4xx` other than `404`/`410`/`429` is terminal, not retryable** | The server has already refused the request. A stale cursor is the realistic case, and retrying it identically cannot produce a different answer. Offering a retry converts our bug into the user's problem | One branch |
| H3 | **`429` is retryable in the UI but never retried automatically** | It is retryable *by the user, after `retryAfterSec`*. Retrying a throttle immediately and automatically is how a rate limit becomes a self-inflicted outage | One predicate, `isAutoRetryable` |
| H4 | **`presentEpisodeAccess` receives `ViewerAccess` and nothing else** | The free-window rule cannot be reimplemented from data the function cannot see. The domain model forbids the client deriving playability, and a client-side copy is a second, unauthenticated entitlement system that drifts from the first — as it already would have: the window is measured in `globalEpisodeNumber`, not `episodeNumber` (S21) | Widen a signature, and lose the guarantee |
| H5 | **A platform block is a fifth state, `PURCHASE_BLOCKED`, and shows no price** | The episode is for sale and we cannot take the money. Quoting a price the viewer has no way to pay is an invitation to a dead end, and rendering the ordinary unlock button produces a purchase that fails inside the bridge (IA §9) | Merge two branches, and lose the distinction |
| H6 | **Availability is checked before entitlement on the client, mirroring the server** | Reversing the order is precisely what would put a price tag on an unavailable episode. The seed catalogue proves the payload permits it | Reorder two branches |
| H7 | **A `viewerAccess` the server cannot emit renders as `UNAVAILABLE`** | `playable: false` with reason `FREE` is a contradiction, so it must not be guessed at. A wrongly locked episode is a support ticket; a wrongly unlocked one is lost revenue plus a playback failure the viewer blames on us | Change one fallthrough |
| H8 | **The resource hooks take an explicit `requestKey` and read the loader from a ref** | Keying on the loader's identity means an inline arrow — a new function every render — schedules a new read after every completed one. The failure is not a test failure but an out-of-memory crash a long way from its cause, and the fix at each call site is a `useCallback` someone must remember. A key cannot fail that way and states the dependency at the call site | Every call site changes |
| H9 | **A first-page failure is an error screen; an append failure is not** | Once there is content on screen, replacing it because page three timed out costs the user their place to tell them something they can see. So `error` and `appendError` are separate fields rendered in separate places | Merge two fields |
| H10 | **Pages are deduplicated by id on the client** | The feed's cursor is only stable while the ranking is (W2-D §5), so the same drama can arrive twice. A duplicate is a double impression *and* a duplicate React key. First occurrence wins, so nothing already on screen moves | Delete `dedupe` |
| H11 | **Paging is `nextCursor === null`, never `hasMore`** | They are exactly equivalent by contract, and carrying both leaves two things to get wrong instead of one | None |
| H12 | **Paging is a button, not an intersection observer** | Both are legitimate. A button is assertable without faking a scroll viewport, and automatic paging over a ranking that shifts mid-scroll pages a moving list without being asked | Swap one component |
| H13 | **The detail and the episode list are separate reads with separate states** | Either can fail alone. Throwing away a loaded header, cover and synopsis to report that the list is late discards a screen's worth of content to say nothing. A retry under the list refetches only the list | Combine two hooks |
| H14 | **The 300ms anti-flicker delay is CSS, not a timer** | A timer makes the loading state unobservable for its first 300ms, including to a test. A CSS `animation-delay` keeps the element in the DOM from the moment the request starts and still shows the user nothing. `prefers-reduced-motion` reveals it immediately | Move it into a hook, and lose the assertability |
| H15 | **The server's `message` is never rendered; the `traceId` is never displayed** | Server copy is English-only (conflict C9) and the review requirement is that user-facing strings follow the locale, so surfaces render their own translated copy. The trace id is meaningless to the user and essential to support, so it rides in `data-trace-id` | Change two components |
| H16 | **An unmatched route redirects to `#/fallback?reason=NOT_FOUND`, and the fallback has three variants** | A static ZIP cannot answer `404`, and "this link is wrong", "this content was withdrawn" and "we are down" ask the user for three different things. One generic apology asks for nothing | Delete the reason parameter |
| H17 | **The feed renders a terminal state if the server produces one, which the state matrix does not give it** | The matrix (`docs/02-screen-inventory.md` §2) gives SCR-02 a retryable error and no terminal one, because the feed always has a popularity fallback. If it nonetheless answers `410`, a retry button is a lie. The honest state beats the documented one, and this is the deviation | Delete one branch |
| H18 | **`CatalogApi` is the test seam, not `fetch`** | Stubbing `fetch` would make every screen assertion depend on HTTP status codes and would test the transport once per screen. The transport is tested once, against the client | Rewrite the screen tests |
| H19 | **The catalogue client is provided by context with no default value** | A module singleton cannot be swapped without module mocking, and module mocking is how a suite ends up asserting against the mock. No default, because a screen rendered without a provider is a wiring bug and the loud failure is cheaper than an error state in production | Add a default |
| H20 | **A `200` in the wrong shape is a `MALFORMED` failure, not a value** | Caught at the point of use it is a component reading `.map` off `undefined`, which takes a whole screen down in a place with no error copy and no retry. `MALFORMED` classifies as retryable, on the reasoning that a truncated body is far likelier in the field than a server that changed its contract | Delete the narrowers |
| H21 | **An episode with no `viewerAccess` is rejected outright rather than defaulted** | It is the single field standing between a locked episode and a play button. Defaulting it to anything is inventing an entitlement decision on the client | One branch |
| H22 | **`freeEpisodes` renders a badge and is read nowhere else, enforced by a source scan** | It is the "first 3 free" string and nothing more. The scan is the backstop behind H4's signature, and it also forbids the shape of the free-window predicate anywhere in `app/src` | Delete a test |
| H23 | **Covers degrade to a labelled placeholder on `error`** | Every cover in the catalogue points at `.invalid` today (W2-D §5), and the same thing happens in production the first time an image origin is missed in the Portal. The failure mode there is a grid of broken icons with no explanation | Delete one component |
| H24 | **`trackingId` is rendered as `data-tracking-id` and consumed by nothing** | It is the join key between an impression and the click it produced (S34) and the events endpoint does not exist. Dropping it now means re-plumbing every card later; an attribute costs nothing and leaves an observation point | None |
| H25 | **The unlock call to action renders disabled while there is no unlock flow** | PNL-02 belongs to the entitlement slot. An enabled button that does nothing is the worst thing a purchase surface can do, and hiding the offer entirely would make a locked episode indistinguishable from an unavailable one — the exact distinction this slot exists to draw | Pass `onUnlockRequested` |
| H26 | **"Watch now" targets the first *openable* episode, and is absent when there is none** | Episode 1 can be withdrawn or VIP-only. A disabled primary button on top of a list that already explains itself per episode adds only a disabled primary button | One `find` |
| H27 | **`src/testing/` is test-only, enforced by a source scan** | It imports `@testing-library/react`, a devDependency. A screen importing from there would pull the test harness into the artifact the platform scans at upload time | Delete a test |

---

## 4. Deliberately not built

Listed so nobody re-scopes it as an omission.

- **No unlock, no wallet, no VIP purchase.** PNL-02, PNL-03 and SCR-09 to SCR-11 are the entitlement
  slot's. The seam is `EpisodeRow`'s `onUnlockRequested`, which is one prop (§6).
- **No watch progress and no favourites.** `DramaDetail.viewer` is `null` from the server, so there
  is no "continue watching" variant of the primary button and no resume point. Continue-watching
  cards are implemented and tested on the client, and the server's source is empty, so they render
  the moment progress exists.
- **No real playback.** `#/play/:episodeId` is the Wave 1 placeholder: `PlayPage` builds a
  hard-coded descriptor and hands it to the VePlayer facade. It was not touched. There is no lock
  state (SCR-05 S6), no episode panel, no token handling.
- **No browse screen (SCR-03) and no search.** `GET /v1/dramas` with its `category` / `tag` / `sort`
  filters is unused by the client; the feed is the only list. Search has no contract (gap G5).
- **No tab bar and no "me" screen.** There is one Tab-level route, `#/home`.
- **No analytics.** `POST /events/batch` does not exist. Impressions and clicks are not reported;
  `trackingId` is carried and not consumed (H24).
- **No boot sequence beyond Wave 1.** Silent login, `GET /v1/config` and deep-link resolution are
  still the marked continuation in `main.tsx`. The catalogue client therefore sends no
  `Authorization` header, which is correct today — every catalogue read is anonymous-capable and the
  server grants an `Authorization` header nothing anyway (S28).
- **No back-stack synthesis, no panel history entries, no navigation-bar colour, no capsule rect
  probe.** IA §6 rules B3, B5 and B6 are unimplemented; the capsule safe area is a CSS constant
  rather than a measurement (§5).
- **No pull-to-refresh.** The empty and error states offer an explicit retry instead.
- **No locale switching.** Everything renders in `DEFAULT_LOCALE`. Both bundles are at parity and
  Arabic is complete, but nothing reads the device locale or sets `dir` per route.
- **No `i18next`.** `translate` gained `{n}` interpolation and stayed a lookup table. Namespaced
  lazy bundles are tech-stack T10 and remain a later step.
- **No image sizing or format negotiation.** Covers are requested at their natural size.

---

## 5. Known gaps in this slot's own work

Stated plainly rather than left for someone to discover.

- **The API must be same-origin or must send CORS headers, and today it is neither.** Rendering the
  app against the server on another port failed every read at the browser, which surfaced as the
  retryable error state (§2.2). Inside TikTok the bundle is served from the platform's own origin
  and the API is a registered trusted domain, so this is a cross-origin request in production too.
  Nothing in `server/` sets `Access-Control-Allow-Origin`. **Whoever deploys this needs CORS on the
  server or a same-origin path prefix**, and it is not a client-side fix.
- **`VITE_API_BASE_URL` is unvalidated at boot.** An absent value produces relative URLs and a
  wrong one produces a screen full of retry buttons, with the real cause only in the network tab.
  A boot-time check that reports a configuration error distinctly would be better; it was left out
  because a boot that throws is a white screen, which is worse.
- **The capsule safe area is a guess.** `--capsule-safe-area: 96px` is a constant, not a
  measurement. `bridge.getMenuButtonRect()` exists and is unused, so on a device whose capsule is
  wider than 96px the feed heading will sit under it. Wiring the real rect into a CSS variable at
  boot is a small change and belongs with the navigation-bar work (IA §2 P3).
- **The 300ms skeleton delay is not tested as a delay.** The test asserts the skeleton is in the DOM
  and announced; that it is invisible for 300ms is a CSS assertion no unit test here makes.
- **A feed cursor still resumes at the wrong place if the ranking shifts mid-scroll.** Client-side
  dedup (H10) prevents duplicates and does nothing about omissions: a drama that moves *earlier*
  between two requests is skipped entirely. The real fix is a snapshotted or session-seeded ranking
  on the server (W2-D §5).
- **The episode list loads 50 at a time behind a button.** An 80-episode drama therefore needs two
  taps to see the whole grid, and there is no episode-number jump and no 30-episode grouping
  (PNL-01). Fine for the seed catalogue's 7-episode dramas and wrong for the product's stated shape.
- **Nothing is cached.** Navigating home → drama → back refetches the feed from page one and loses
  the scroll position and every page after the first. These are the most cacheable endpoints in the
  product and they carry no `ETag` (W2-D §4).
- **`recReason` is rendered verbatim from the server, in English.** It is the one user-facing string
  on these screens that does not go through `translate`, because the server sends display copy
  (conflict C9). It will need to move behind `Accept-Language` or become an enumeration the client
  translates.
- **The weak-network banner (CMP-06) does not exist.** IA §8.2 wants a banner after two consecutive
  failures; there is no cross-request failure counter, so each surface reports its own failure in
  isolation and a device with no network shows several separate retry cards.
- **No `AUTH_TOKEN_EXPIRED` interceptor.** IA §8.2 puts a silent refresh and one replay in a global
  interceptor. `http.ts` is the right place and does not do it; nothing needs it yet because no
  request is authenticated.
- **Terminal `REJECTED` copy is vague on purpose and not good enough.** "We could not load this
  drama" is what a `400` from a tampered cursor produces, and it tells the user nothing actionable
  because there is nothing actionable. It should probably route to `#/fallback` instead of
  rendering in place, which would at least be consistent with an unmatched route.
- **`data-testid` attributes ship in the production bundle.** They are the test surface for every
  state assertion here. Stripping them in the build would be tidier and would also silently break
  any future E2E suite that depends on them; leaving them is a deliberate, reversible choice.

---

## 6. For the next slots

**For whoever builds the unlock panel (PNL-02).** There is exactly one prop to fill:
`EpisodeRow`'s `onUnlockRequested?: (episode: EpisodeItem) => void`. Pass it down from `DramaPage`
and the disabled call to action becomes live; the `PURCHASE_BLOCKED` and `UNAVAILABLE` rows will
still refuse to call it, and that is the point — the rows that must never start a purchase cannot,
regardless of what is passed in. Three things must survive. `presentEpisodeAccess` stays the only
interpretation of access, so the panel decides what to *sell* from `unlockPolicy` and `priceCoins`
and never decides *whether* to offer from anything but the action. `UNLOCK_ALREADY_UNLOCKED` is a
success (`docs/02-screen-inventory.md` PNL-02). And after a successful unlock, call `reload` on the
episode list rather than patching the item locally: `viewerAccess` is the server's answer and a
locally patched one is a client-side entitlement decision by another name.

**For whoever implements watch progress.** Two things light up with no client work: the server's
`ContinueWatchingSource` starts returning entries and the feed's `CONTINUE_WATCHING` cards render
and route to the player, and `DramaDetail.viewer.lastWatched` stops being `null`. The second needs
one change here: `DramaHeader` currently derives "Watch now" from the first openable episode (H26),
and it should prefer `viewer.lastWatched` when present, with "Continue episode N" copy. The key
`drama.watchNow` is there; a `drama.continueWatching` key is not.

**For whoever wires real playback.** `PlayPage` is untouched and still fabricates a descriptor.
When it calls `POST /v1/playback/sessions`, the failure classification is already the right shape
for it: `403 EPISODE_LOCKED` and `403 EPISODE_VIP_REQUIRED` classify as `TERMINAL`/`REJECTED` today,
and they are *not* terminal — they are the player's locked state S6, which opens PNL-02 with the
price out of `details`. That is the one place `classifyFailure` will need a branch, and it should be
a branch on the code rather than on the status, because `403` alone does not distinguish "buy this"
from "you may not". `503 EPISODE_ASSET_UNAVAILABLE` already classifies correctly as retryable.

**For whoever builds the browse screen (SCR-03).** `usePagedResource` is the hook, and the filter
state belongs in the route query so back and share restore the view (IA §5). Two notes from here:
the request key must include every filter (`browse:${sort}:${category}:${tag}`) or changing a filter
will not refetch, and `GET /v1/dramas` rejects an out-of-range `limit` rather than clamping it
(S26), so do not send one the contract does not publish.

**For whoever wires analytics.** Every feed card carries `data-tracking-id` and `data-drama-id`, and
`data-card-type`, on its `<li>`. An `IntersectionObserver` over `[data-testid="feed-card"]` at 50%
visibility is the IMPRESSION rule from `docs/02-screen-inventory.md` SCR-02 with no changes to any
component. The trackingId must be echoed rather than regenerated: it is minted per card per
response and it is the only thing joining an impression to its click (S34).

**For whoever registers the API and image origins.** Two entries in
`packages/config/src/domains.ts`, then `pnpm gen:minis-config` and the same origins in the Developer
Portal. Until the image origin is registered every cover on every screen is the placeholder — which
is at least legible, but it is not a product. And see §5 on CORS: registering the domain makes the
request permitted by the platform, not permitted by the browser.
